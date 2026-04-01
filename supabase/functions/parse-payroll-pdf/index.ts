import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "@supabase/supabase-js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const payRunId = formData.get("pay_run_id") as string;

    if (!file || !payRunId) {
      return new Response(JSON.stringify({ error: "Missing file or pay_run_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload PDF to storage
    const filePath = `staff/${payRunId}/${file.name}`;
    const fileBuffer = await file.arrayBuffer();
    await supabase.storage.from("csv-uploads").upload(filePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    // Use AI to extract data from the PDF
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    
    // Convert PDF to base64 for AI processing
    const base64 = btoa(
      new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You extract payroll data from IRIS payroll summary PDFs. Return a JSON array of employees with these exact fields:
- employee_name: string (full name, e.g. "Alis E.F." should become "Alis E.F.")
- employee_number: string (e.g. "FIT0006")
- tax_code: string (e.g. "1285L")
- ni_letter: string (e.g. "A")
- gross_pay: number (Total Payments column)
- net_pay: number (Net Pay column)  
- tax: number (Tax column)
- ni_employee: number (NI Deduction column)
- ni_employer: number (the last numeric column, employer NI/costs including Class 1A)
- pension: number (Employee Pension column)

Do NOT include the "Total this period" or "Total year to date" rows.
Return ONLY a valid JSON array, no markdown or explanation.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`
                }
              },
              {
                type: "text",
                text: "Extract all employee payroll data from this PDF. Return as JSON array."
              }
            ]
          }
        ],
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "AI parsing failed", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Clean markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    
    let employees: any[];
    try {
      employees = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if staff_pay_run already exists for this pay run
    const { data: existing } = await supabase
      .from("staff_pay_runs")
      .select("id")
      .eq("pay_run_id", payRunId)
      .maybeSingle();

    let staffPayRunId: string;

    if (existing) {
      // Delete old rows and update
      await supabase.from("staff_pay_run_rows").delete().eq("staff_pay_run_id", existing.id);
      staffPayRunId = existing.id;
    } else {
      const { data: newRun, error: insertErr } = await supabase
        .from("staff_pay_runs")
        .insert({ pay_run_id: payRunId })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      staffPayRunId = newRun.id;
    }

    // Insert rows
    const rows = employees.map((emp: any) => ({
      staff_pay_run_id: staffPayRunId,
      employee_name: emp.employee_name,
      employee_number: emp.employee_number || null,
      tax_code: emp.tax_code || null,
      ni_letter: emp.ni_letter || null,
      gross_pay: Number(emp.gross_pay) || 0,
      net_pay: Number(emp.net_pay) || 0,
      tax: Number(emp.tax) || 0,
      ni_employee: Number(emp.ni_employee) || 0,
      ni_employer: Number(emp.ni_employer) || 0,
      pension: Number(emp.pension) || 0,
    }));

    if (rows.length > 0) {
      const { error: rowErr } = await supabase.from("staff_pay_run_rows").insert(rows);
      if (rowErr) throw rowErr;
    }

    // Update totals
    const totalGross = rows.reduce((s: number, r: any) => s + r.gross_pay, 0);
    const totalNet = rows.reduce((s: number, r: any) => s + r.net_pay, 0);
    const totalTax = rows.reduce((s: number, r: any) => s + r.tax, 0);
    const totalNi = rows.reduce((s: number, r: any) => s + r.ni_employee + r.ni_employer, 0);
    const totalPension = rows.reduce((s: number, r: any) => s + r.pension, 0);

    await supabase.from("staff_pay_runs").update({
      pdf_file_path: filePath,
      total_gross: totalGross,
      total_net: totalNet,
      total_tax: totalTax,
      total_ni: totalNi,
      total_pension: totalPension,
      employee_count: rows.length,
    }).eq("id", staffPayRunId);

    return new Response(JSON.stringify({
      staff_pay_run_id: staffPayRunId,
      employees: rows,
      totals: { totalGross, totalNet, totalTax, totalNi, totalPension, count: rows.length },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
