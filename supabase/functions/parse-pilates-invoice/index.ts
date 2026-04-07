import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract text from DOCX
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

// Decompress a FlateDecode stream
async function inflateStream(compressed: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    
    const chunks: Uint8Array[] = [];
    const writePromise = writer.write(compressed).then(() => writer.close()).catch(() => {});
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await writePromise;
    
    const totalLength = chunks.reduce((a, c) => a + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    return new Uint8Array(0);
  }
}

// Extract text from decompressed PDF content
function extractTextFromContent(content: string): string[] {
  const parts: string[] = [];
  
  // Tj operator: (text) Tj
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let m;
  while ((m = tjRegex.exec(content)) !== null) {
    if (m[1].trim()) parts.push(m[1]);
  }
  
  // TJ operator: [(text) kern (text)] TJ  
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/gi;
  while ((m = tjArrayRegex.exec(content)) !== null) {
    const innerRegex = /\(([^)]*)\)/g;
    let im;
    let segment = "";
    while ((im = innerRegex.exec(m[1])) !== null) {
      segment += im[1];
    }
    if (segment.trim()) parts.push(segment);
  }
  
  return parts;
}

// Full PDF text extraction with decompression
async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const allText: string[] = [];
  
  // Find all stream...endstream blocks
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  const streamPositions: { start: number; end: number }[] = [];
  
  while ((match = streamRegex.exec(raw)) !== null) {
    streamPositions.push({ start: match.index, end: match.index + match[0].length });
    
    const streamBytes = new Uint8Array(match[1].length);
    for (let i = 0; i < match[1].length; i++) {
      streamBytes[i] = match[1].charCodeAt(i);
    }
    
    // Check if FlateDecode by looking at the object header before the stream
    const headerStart = Math.max(0, match.index - 500);
    const header = raw.slice(headerStart, match.index);
    const isFlate = header.includes("FlateDecode");
    
    let content: string;
    if (isFlate) {
      const decompressed = await inflateStream(streamBytes);
      if (decompressed.length > 0) {
        content = decoder.decode(decompressed);
      } else {
        continue;
      }
    } else {
      content = match[1];
    }
    
    // Extract text operators
    const texts = extractTextFromContent(content);
    allText.push(...texts);
  }
  
  // Also try uncompressed text outside streams
  if (allText.length < 5) {
    const parenRegex = /\(([A-Za-z0-9£$€@.,\-\/\s:;#&%]{3,100})\)\s*Tj/g;
    while ((match = parenRegex.exec(raw)) !== null) {
      allText.push(match[1]);
    }
  }
  
  const result = allText.join(" ")
    // Decode PDF escape sequences
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r") 
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\s+/g, " ")
    .trim();
  
  return result;
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

    let text: string;
    if (isDocx) {
      text = extractTextFromDocx(bytes);
      console.log("Extracted DOCX text length:", text.length);
    } else {
      text = await extractTextFromPdf(bytes);
      console.log("Extracted PDF text length:", text.length);
      console.log("PDF text preview:", text.slice(0, 300));
    }

    if (text.length < 10) {
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
