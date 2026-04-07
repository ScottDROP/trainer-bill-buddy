import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal ZIP parser to extract files from DOCX (which is a ZIP archive)
async function extractFromZip(bytes: Uint8Array, targetFile: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset < bytes.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Not a local file header

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const fileName = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + fileNameLen));
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (fileName === targetFile) {
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return compressed; // stored
      if (compressionMethod === 8) {
        // deflate - use raw inflate
        try {
          const ds = new DecompressionStream("raw");
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          const wp = writer.write(compressed).then(() => writer.close()).catch(() => {});
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          await wp;
          const total = chunks.reduce((a, c) => a + c.length, 0);
          const result = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) { result.set(c, o); o += c.length; }
          return result;
        } catch {
          return null;
        }
      }
    }

    offset = dataStart + compressedSize;
  }
  return null;
}

// Extract text from DOCX by unzipping and parsing document.xml
async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  const xmlBytes = await extractFromZip(bytes, "word/document.xml");
  if (!xmlBytes) {
    // Fallback: try raw regex on the bytes
    const raw = new TextDecoder().decode(bytes);
    const parts: string[] = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = regex.exec(raw)) !== null) {
      if (m[1]) parts.push(m[1]);
    }
    return parts.join(" ");
  }

  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const parts: string[] = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    if (m[1]) parts.push(m[1]);
  }
  return parts.join(" ");
}

// Decompress a FlateDecode PDF stream
async function inflateStream(compressed: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    const wp = writer.write(compressed).then(() => writer.close()).catch(() => {});
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await wp;
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const result = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { result.set(c, o); o += c.length; }
    return result;
  } catch {
    return new Uint8Array(0);
  }
}

function extractTextFromContent(content: string): string[] {
  const parts: string[] = [];
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let m;
  while ((m = tjRegex.exec(content)) !== null) {
    if (m[1].trim()) parts.push(m[1]);
  }
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

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const allText: string[] = [];

  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamBytes = new Uint8Array(match[1].length);
    for (let i = 0; i < match[1].length; i++) {
      streamBytes[i] = match[1].charCodeAt(i);
    }
    const headerStart = Math.max(0, match.index - 500);
    const header = raw.slice(headerStart, match.index);
    const isFlate = header.includes("FlateDecode");

    let content: string;
    if (isFlate) {
      const decompressed = await inflateStream(streamBytes);
      if (decompressed.length > 0) {
        content = decoder.decode(decompressed);
      } else continue;
    } else {
      content = match[1];
    }
    const texts = extractTextFromContent(content);
    allText.push(...texts);
  }

  if (allText.length < 5) {
    const parenRegex = /\(([A-Za-z0-9£$€@.,\-\/\s:;#&%]{3,100})\)\s*Tj/g;
    while ((match = parenRegex.exec(raw)) !== null) {
      allText.push(match[1]);
    }
  }

  return allText.join(" ")
    .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\s+/g, " ").trim();
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
      text = await extractTextFromDocx(bytes);
    } else {
      text = await extractTextFromPdf(bytes);
    }

    console.log(`Extracted text (${isDocx ? 'DOCX' : 'PDF'}) length: ${text.length}`);
    console.log("Text preview:", text.slice(0, 500));

    if (text.length < 10) {
      throw new Error("Could not extract readable text from this file.");
    }

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
            content: "You extract invoice data. Return structured data via the extract_invoice function. For amounts, use numbers only (no currency symbols). If there's no VAT, set vat_amount to 0 and total_amount equals net_amount.",
          },
          {
            role: "user",
            content: `Extract invoice details from this text:\n\n${text.slice(0, 6000)}`,
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
                instructor_name: { type: "string", description: "Person or company name" },
                invoice_number: { type: "string", description: "Invoice number/reference" },
                invoice_date: { type: "string", description: "Date in YYYY-MM-DD format" },
                net_amount: { type: "number", description: "Net amount before VAT" },
                vat_amount: { type: "number", description: "VAT amount, 0 if none" },
                total_amount: { type: "number", description: "Total amount due" },
                description: { type: "string", description: "Services description" },
                location: { type: "string", description: "Location if mentioned" },
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
