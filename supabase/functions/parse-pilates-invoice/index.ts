import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file provided");

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = uint8ToBase64(bytes);

    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    const mimeType = isDocx
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : isPdf
      ? "application/pdf"
      : "application/octet-stream";

    console.log(`Processing file: ${file.name}, type: ${mimeType}, size: ${bytes.length}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You extract invoice data from documents. Return structured data via the extract_invoice function. For amounts, use numbers only (no currency symbols). If there's no VAT, set vat_amount to 0 and total_amount equals net_amount.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract invoice details from this document. Look for instructor/company name, invoice number, date, amounts (net, VAT, total), description of services, and location.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_invoice",
            description: "Extract structured invoice data",
            parameters: {
              type: "object",
              properties: {
                instructor_name: { type: "string", description: "Person or company name on the invoice" },
                invoice_number: { type: "string", description: "Invoice number/reference" },
                invoice_date: { type: "string", description: "Date in YYYY-MM-DD format" },
                net_amount: { type: "number", description: "Net amount before VAT" },
                vat_amount: { type: "number", description: "VAT amount, 0 if none" },
                total_amount: { type: "number", description: "Total amount due" },
                description: { type: "string", description: "Services description" },
                location: { type: "string", description: "Location/venue if mentioned" },
              },
              required: ["instructor_name", "net_amount", "total_amount"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_invoice" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted data:", JSON.stringify(extracted));

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
