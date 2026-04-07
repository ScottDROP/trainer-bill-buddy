import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract text from DOCX (ZIP containing XML with <w:t> tags)
function extractTextFromDocx(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  const fullText = decoder.decode(bytes);
  const textParts: string[] = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    if (match[1]) textParts.push(match[1]);
  }
  return textParts.length > 0 
    ? textParts.join(" ") 
    : fullText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

// Extract readable text from PDF binary
function extractTextFromPdf(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const textParts: string[] = [];

  // Method 1: Extract text between BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      if (tjMatch[1].trim()) textParts.push(tjMatch[1]);
    }
    // TJ arrays
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const innerRegex = /\(([^)]*)\)/g;
      let innerMatch;
      while ((innerMatch = innerRegex.exec(arrMatch[1])) !== null) {
        if (innerMatch[1].trim()) textParts.push(innerMatch[1]);
      }
    }
  }

  // Method 2: If BT/ET extraction got nothing, look for stream content
  if (textParts.length < 5) {
    // Try to find any parenthesized text strings
    const parenRegex = /\(([A-Za-z0-9£$€@.,\-\/\s:;#]{3,80})\)/g;
    while ((match = parenRegex.exec(raw)) !== null) {
      const t = match[1].trim();
      if (t.length >= 3) textParts.push(t);
    }
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim();
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
    const isDocx = file.name.toLowerCase().endsWith(".docx") || 
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // Extract text from both PDF and DOCX
    let text: string;
    if (isDocx) {
      text = extractTextFromDocx(bytes);
      console.log("Extracted DOCX text length:", text.length);
    } else {
      text = extractTextFromPdf(bytes);
      console.log("Extracted PDF text length:", text.length);
    }

    if (text.length < 10) {
      console.log("Text extraction produced very little content, raw sample:", new TextDecoder("latin1").decode(bytes.slice(0, 500)));
      throw new Error("Could not extract text from file. Please ensure the document contains readable text.");
    }

    const messages = [
      {
        role: "system",
        content: "You are an invoice data extractor. Extract invoice details from the provided text. Return the data by calling the extract_invoice function.",
      },
      {
        role: "user",
        content: `Extract the invoice details from this document text. Get the instructor/company name, invoice number, invoice date (YYYY-MM-DD format), net amount (before VAT), VAT amount, total amount due, description of services, and location if mentioned.\n\nDocument text:\n${text.slice(0, 6000)}`,
      },
    ];

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
