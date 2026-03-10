interface XeroExportRow {
  contactName: string;
  email: string;
  address: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  taxAmount: number;
}

function formatDateXero(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeCSV(val: string | number | null | undefined): string {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseAddress(address: string | null) {
  if (!address) return { line1: "", line2: "", line3: "", line4: "", city: "", region: "", postalCode: "", country: "" };
  const lines = address.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    line1: lines[0] || "",
    line2: lines[1] || "",
    line3: lines[2] || "",
    line4: "",
    city: lines[3] || "",
    region: "",
    postalCode: lines[4] || "",
    country: lines[5] || "United Kingdom",
  };
}

export function buildXeroCSV(
  invoices: any[],
  trainers: any[],
  lineItems: any[],
  rows: any[]
): string {
  const header = [
    "*ContactName", "EmailAddress",
    "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4",
    "POCity", "PORegion", "POPostalCode", "POCountry",
    "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Total",
    "InventoryItemCode", "Description", "*Quantity", "*UnitAmount",
    "*AccountCode", "*TaxType", "TaxAmount",
    "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2",
    "Currency",
  ];

  const csvRows: string[] = [header.join(",")];

  for (const inv of invoices) {
    const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
    if (!trainer) continue;

    const addr = parseAddress(trainer.invoicing_address);
    const contactName = trainer.company_name?.trim() || trainer.full_name;
    const hasVat = trainer.vat_number && trainer.vat_number.trim() !== "";
    const taxType = hasVat ? "20% (VAT on Expenses)" : "No VAT";

    const terms = trainer.payment_terms || "Net 30";
    const days = parseInt(terms.replace(/\D/g, "")) || 30;
    const due = new Date(inv.invoice_date);
    due.setDate(due.getDate() + days);
    const dueDate = formatDateXero(due.toISOString());
    const invoiceDate = formatDateXero(inv.invoice_date);

    const invLineItems = lineItems.filter(
      (li: any) => li.pay_run_row_id === inv.pay_run_row_id
    );

    if (invLineItems.length === 0) {
      // Single row with totals
      const row = [
        contactName, trainer.email || "",
        addr.line1, addr.line2, addr.line3, addr.line4,
        addr.city, addr.region, addr.postalCode, addr.country,
        inv.invoice_number, invoiceDate, dueDate, inv.total_due,
        "", "PT Sessions", 1, inv.subtotal,
        "324", taxType, inv.vat_amount,
        "", "", "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
    } else {
      // One row per line item; total only on first row
      invLineItems.forEach((li: any, idx: number) => {
        const liVat = hasVat ? Number(li.amount) * 0.2 : 0;
        const locationName = mapLocationTracking(li.location_name);
        const row = [
          contactName, trainer.email || "",
          idx === 0 ? addr.line1 : "", idx === 0 ? addr.line2 : "",
          idx === 0 ? addr.line3 : "", idx === 0 ? addr.line4 : "",
          idx === 0 ? addr.city : "", idx === 0 ? addr.region : "",
          idx === 0 ? addr.postalCode : "", idx === 0 ? addr.country : "",
          inv.invoice_number, invoiceDate, dueDate,
          idx === 0 ? inv.total_due : "",
          "", `PT Sessions at ${li.location_name}`, li.sessions, li.rate,
          "324", taxType, liVat,
          "Location", locationName, "", "",
          "GBP",
        ];
        csvRows.push(row.map(escapeCSV).join(","));
      });
    }
  }

  return csvRows.join("\n");
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
