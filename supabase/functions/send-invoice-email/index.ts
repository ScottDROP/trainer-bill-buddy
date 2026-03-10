import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const formatGBP = (value: number | string) => `£${Number(value || 0).toFixed(2)}`;
const formatDate = (value: string) => new Date(value).toLocaleDateString("en-GB");

async function buildFallbackInvoicePdf(params: {
  invoice: any;
  trainer: any;
  companySettings: any;
  lineItems: any[];
}) {
  const { invoice, trainer, companySettings, lineItems } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;

  const drawLine = (text: string, isBold = false, size = 11) => {
    if (y < 70) {
      return;
    }
    page.drawText(text, {
      x: left,
      y,
      size,
      font: isBold ? bold : font,
    });
    y -= size + 6;
  };

  drawLine(`INVOICE ${invoice.invoice_number}`, true, 16);
  y -= 6;

  drawLine(`Invoice Date: ${formatDate(invoice.invoice_date)}`);
  drawLine(`Service Period: ${formatDate(invoice.service_period_start)} - ${formatDate(invoice.service_period_end)}`);
  y -= 6;

  drawLine("Bill To", true);
  drawLine(companySettings?.name || "DropGym");
  if (companySettings?.address) {
    for (const line of String(companySettings.address).split("\n")) {
      drawLine(line);
    }
  }

  y -= 6;
  drawLine("Trainer", true);
  drawLine(trainer.full_name || "-");
  if (trainer.invoicing_address) {
    for (const line of String(trainer.invoicing_address).split("\n")) {
      drawLine(line);
    }
  }

  y -= 8;
  drawLine("Line Items", true);
  for (const item of lineItems.slice(0, 20)) {
    const row = `${item.location_name || "Session"} | ${item.sessions} x ${formatGBP(item.rate)} = ${formatGBP(item.amount)}`;
    drawLine(row);
  }

  y -= 8;
  drawLine(`Subtotal: ${formatGBP(invoice.subtotal)}`, true);
  drawLine(`VAT: ${formatGBP(invoice.vat_amount)}`, true);
  drawLine(`Total Due: ${formatGBP(invoice.total_due)}`, true, 12);

  if (companySettings?.bank_details) {
    y -= 10;
    drawLine("Bank Details", true);
    for (const line of String(companySettings.bank_details).split("\n")) {
      drawLine(line);
    }
  }

  const bytes = await pdfDoc.save();
  return {
    filename: `${invoice.invoice_number}.pdf`,
    content: encodeBase64(bytes),
  };
}

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
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
    const { data: trainers } = await supabase.from("trainers").select("*").in("id", trainerIds);

    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const payRunRowIds = invoices!.map((inv: any) => inv.pay_run_row_id);
    const { data: lineItems } = await supabase
      .from("pay_run_line_items")
      .select("*")
      .in("pay_run_row_id", payRunRowIds);

    const results: {
      invoice_id: string;
      trainer: string;
      email: string;
      success: boolean;
      attached?: boolean;
      error?: string;
    }[] = [];

    for (const invoice of invoices!) {
      const trainer = trainers?.find((t: any) => t.id === invoice.trainer_id);
      if (!trainer) {
        results.push({
          invoice_id: invoice.id,
          trainer: "Unknown",
          email: "",
          success: false,
          error: "Trainer not found",
        });
        continue;
      }

      const recipientEmail = test_email || trainer.email;
      if (!recipientEmail) {
        results.push({
          invoice_id: invoice.id,
          trainer: trainer.full_name,
          email: "",
          success: false,
          error: "No email address",
        });
        continue;
      }

      const invLineItems = lineItems?.filter((li: any) => li.pay_run_row_id === invoice.pay_run_row_id) || [];

      let pdfAttachment: { filename: string; content: string } | null = null;

      if (invoice.pdf_file_path) {
        const { data: pdfData, error: pdfError } = await supabase.storage
          .from("invoices")
          .download(invoice.pdf_file_path);

        if (!pdfError && pdfData) {
          const arrayBuffer = await pdfData.arrayBuffer();
          pdfAttachment = {
            filename: `${invoice.invoice_number}.pdf`,
            content: encodeBase64(new Uint8Array(arrayBuffer)),
          };
        }
      }

      if (!pdfAttachment) {
        pdfAttachment = await buildFallbackInvoicePdf({
          invoice,
          trainer,
          companySettings,
          lineItems: invLineItems,
        });
      }

      const companyName = companySettings?.name || "DropGym";
      const fromEmail = companySettings?.email || "onboarding@resend.dev";

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Invoice ${invoice.invoice_number}</h2>
          <p>Hi ${trainer.full_name.split(" ")[0]},</p>
          <p>Please find your invoice attached for the service period 
            ${formatDate(invoice.service_period_start)} – 
            ${formatDate(invoice.service_period_end)}.</p>
          <p style="margin-top:16px;"><strong>Total Due: ${formatGBP(invoice.total_due)}</strong></p>
          <p style="margin-top:24px;color:#666;font-size:14px;">Thank you,<br/>${companyName}</p>
        </div>
      `;

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: `${companyName} <${fromEmail}>`,
            to: [recipientEmail],
            subject: `Invoice ${invoice.invoice_number} – ${companyName}`,
            html,
            attachments: [pdfAttachment],
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          throw new Error(`Resend API error [${emailRes.status}]: ${errBody}`);
        }
        await emailRes.json();

        results.push({
          invoice_id: invoice.id,
          trainer: trainer.full_name,
          email: recipientEmail,
          success: true,
          attached: true,
        });
      } catch (emailErr: any) {
        results.push({
          invoice_id: invoice.id,
          trainer: trainer.full_name,
          email: recipientEmail,
          success: false,
          error: emailErr.message,
        });
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
