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

// Extract text from DOCX by unzipping and parsing document.xml
async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  // Find word/document.xml in the ZIP
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset < bytes.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const fileName = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + fileNameLen));
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (fileName === "word/document.xml") {
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);

      let xmlBytes: Uint8Array;
      if (compressionMethod === 0) {
        xmlBytes = compressed;
      } else if (compressionMethod === 8) {
        // Raw deflate — use "deflate-raw" which handles raw deflate without zlib wrapper
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          writer.write(compressed).then(() => writer.close()).catch(() => {});
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((a, c) => a + c.length, 0);
          xmlBytes = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) { xmlBytes.set(c, o); o += c.length; }
        } catch (e) {
          console.error("Decompression error:", e);
          return "";
        }
      } else {
        return "";
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

    // Use actual compressed size, but handle cases where it might be in data descriptor
    let nextOffset = dataStart + compressedSize;
    if (compressedSize === 0 && uncompressedSize === 0) {
      // Data descriptor — scan for next local file header
      let scan = dataStart;
      while (scan < bytes.length - 4) {
        if (view.getUint32(scan, true) === 0x04034b50) break;
        scan++;
      }
      nextOffset = scan;
    }
    offset = nextOffset;
  }
  return "";
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

    console.log(`Processing file: ${file.name}, size: ${bytes.length}, isDocx: ${isDocx}`);

    let messages;

    if (isDocx) {
      // Extract text from DOCX and send as text
      const text = await extractTextFromDocx(bytes);
      console.log(`DOCX extracted text length: ${text.length}`);
      console.log("DOCX text preview:", text.slice(0, 500));

      if (text.length < 10) {
        throw new Error("Could not extract readable text from this DOCX file.");
      }

      messages = [
        {
          role: "system",
          content: "You extract invoice data from documents. Return structured data via the extract_invoice function. For amounts, use numbers only (no currency symbols). If there's no VAT, set vat_amount to 0 and total_amount equals net_amount.",
        },
        {
          role: "user",
          content: `Extract invoice details from this document text:\n\n${text.slice(0, 8000)}`,
        },
      ];
    } else {
      // PDF — send as base64 inline
      const base64 = uint8ToBase64(bytes);
      messages = [
        {
          role: "system",
          content: "You extract invoice data from documents. Return structured data via the extract_invoice function. For amounts, use numbers only (no currency symbols). If there's no VAT, set vat_amount to 0 and total_amount equals net_amount.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract invoice details from this document.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64}`,
              },
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
