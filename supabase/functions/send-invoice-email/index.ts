import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { invoice_ids, test_email } = await req.json();

    if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
      throw new Error("invoice_ids array is required");
    }

    const { data: invoices, error: invError } = await supabase
      .from("invoices")
      .select("*")
      .in("id", invoice_ids);
    if (invError) throw invError;

    const trainerIds = [...new Set(invoices!.map((inv: any) => inv.trainer_id))];
    const { data: trainers } = await supabase
      .from("trainers")
      .select("*")
      .in("id", trainerIds);

    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const results: { invoice_id: string; trainer: string; email: string; success: boolean; error?: string }[] = [];

    for (const invoice of invoices!) {
      const trainer = trainers?.find((t: any) => t.id === invoice.trainer_id);
      if (!trainer) {
        results.push({ invoice_id: invoice.id, trainer: "Unknown", email: "", success: false, error: "Trainer not found" });
        continue;
      }

      const recipientEmail = test_email || trainer.email;
      if (!recipientEmail) {
        results.push({ invoice_id: invoice.id, trainer: trainer.full_name, email: "", success: false, error: "No email address" });
        continue;
      }

      // Fetch PDF from storage
      let pdfAttachment: { filename: string; content: string } | null = null;
      if (invoice.pdf_file_path) {
        const { data: pdfData, error: pdfError } = await supabase.storage
          .from("invoices")
          .download(invoice.pdf_file_path);

        if (!pdfError && pdfData) {
          const arrayBuffer = await pdfData.arrayBuffer();
          const base64 = base64Encode(new Uint8Array(arrayBuffer));
          pdfAttachment = {
            filename: `${invoice.invoice_number}.pdf`,
            content: base64,
          };
        }
      }

      const companyName = companySettings?.name || "DropGym";
      const fromEmail = companySettings?.email || "onboarding@resend.dev";

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Invoice ${invoice.invoice_number}</h2>
          <p>Hi ${trainer.full_name.split(" ")[0]},</p>
          <p>Please find your invoice attached for the service period 
            ${new Date(invoice.service_period_start).toLocaleDateString("en-GB")} – 
            ${new Date(invoice.service_period_end).toLocaleDateString("en-GB")}.</p>
          
          <p style="margin-top:16px;"><strong>Total Due: £${Number(invoice.total_due).toFixed(2)}</strong></p>

          ${companySettings?.bank_details ? `<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin-top:20px;"><p style="margin:0 0 8px;font-weight:bold;font-size:14px;">Bank Details</p><p style="margin:0;white-space:pre-line;font-size:14px;">${companySettings.bank_details}</p></div>` : ""}

          <p style="margin-top:24px;color:#666;font-size:14px;">Payment terms: ${trainer.payment_terms || "Net 30"}</p>
          <p style="color:#666;font-size:14px;">Thank you,<br/>${companyName}</p>
        </div>
      `;

      try {
        const emailBody: any = {
          from: `${companyName} <${fromEmail}>`,
          to: [recipientEmail],
          subject: `Invoice ${invoice.invoice_number} – ${companyName}`,
          html,
        };

        if (pdfAttachment) {
          emailBody.attachments = [pdfAttachment];
        }

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify(emailBody),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          throw new Error(`Resend API error [${emailRes.status}]: ${errBody}`);
        }
        await emailRes.json();

        results.push({ invoice_id: invoice.id, trainer: trainer.full_name, email: recipientEmail, success: true });
      } catch (emailErr: any) {
        results.push({ invoice_id: invoice.id, trainer: trainer.full_name, email: recipientEmail, success: false, error: emailErr.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
