import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple DOCX text extractor - pulls text from the XML inside the zip
async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  // DOCX is a ZIP containing word/document.xml
  // We'll find the XML content and strip tags
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  
  // Search for word/document.xml content in the zip
  // Look for XML content between common markers
  const fullText = decoder.decode(bytes);
  
  // Find all <w:t> tag contents (Word text runs)
  const textParts: string[] = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    if (match[1]) textParts.push(match[1]);
  }
  
  if (textParts.length > 0) {
    return textParts.join(" ");
  }
  
  // Fallback: try to get any readable text
  return fullText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
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
    const isDocx = file.name.toLowerCase().endsWith(".docx") || 
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let messages: any[];

    if (isDocx) {
      // For DOCX: extract text and send as plain text
      const text = await extractTextFromDocx(arrayBuffer);
      console.log("Extracted DOCX text length:", text.length);
      messages = [
        {
          role: "system",
          content: "You are an invoice data extractor. Extract invoice details from the provided text. Return the data by calling the extract_invoice function.",
        },
        {
          role: "user",
          content: `Extract the invoice details from this document text. Get the instructor/company name, invoice number, invoice date (YYYY-MM-DD format), net amount (before VAT), VAT amount, total amount, description of services, and location if mentioned.\n\nDocument text:\n${text}`,
        },
      ];
    } else {
      // For PDF: send as base64 image_url
      const base64 = base64Encode(new Uint8Array(arrayBuffer));
      messages = [
        {
          role: "system",
          content: "You are an invoice data extractor. Extract invoice details from the provided document. Return the data by calling the extract_invoice function.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the invoice details from this document. Get the instructor/company name, invoice number, invoice date (YYYY-MM-DD format), net amount (before VAT), VAT amount, total amount, description of services, and location if mentioned.",
            },
            {
              type: "image_url",
              image_url: { url: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice",
              description: "Extract structured invoice data",
              parameters: {
                type: "object",
                properties: {
                  instructor_name: { type: "string", description: "Name of the person or company on the invoice" },
                  invoice_number: { type: "string", description: "Invoice number/reference" },
                  invoice_date: { type: "string", description: "Invoice date in YYYY-MM-DD format" },
                  net_amount: { type: "number", description: "Net amount before VAT" },
                  vat_amount: { type: "number", description: "VAT amount (0 if no VAT)" },
                  total_amount: { type: "number", description: "Total amount including VAT" },
                  description: { type: "string", description: "Description of services" },
                  location: { type: "string", description: "Location/site mentioned" },
                },
                required: ["instructor_name", "total_amount"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-pilates-invoice error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
