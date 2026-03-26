import { downloadCSV } from "./xero-export";

function escapeCSV(val: string | number | null | undefined): string {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTellerooCSV(
  invoices: any[],
  trainers: any[],
  payRun: { month: number; year: number } | null
): string {
  const header = ["amount_pounds", "recipient_name", "account_no", "sort_code", "reference"];
  const csvRows: string[] = [header.join(",")];

  const monthLabel = payRun
    ? new Date(payRun.year, payRun.month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" })
    : "Pay Run";

  for (const inv of invoices) {
    const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
    if (!trainer) continue;

    // Telleroo reference max 18 chars
    const ref = inv.invoice_number.slice(0, 18);

    const row = [
      Number(inv.total_due).toFixed(2),
      trainer.full_name,
      (trainer.bank_account_number || "").replace(/\s/g, ""),
      (trainer.bank_sort_code || "").replace(/[-\s]/g, ""),
      ref,
    ];
    csvRows.push(row.map(escapeCSV).join(","));
  }

  return csvRows.join("\n");
}

export { downloadCSV };
