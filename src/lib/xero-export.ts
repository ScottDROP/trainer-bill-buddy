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

const LOCATION_MAP: Record<string, string> = {
  "hq": "0 - HQ",
  "west hampstead": "1 - West Hampstead",
  "queens park": "2 - Queens Park",
  "mill hill": "3 - Mill Hill",
  "kensal rise": "4 - Kensal Rise",
  "kentish town": "5 - Kentish Town",
  "muswell hill": "6 - Muswell Hill",
};

function mapLocationTracking(locationName: string): string {
  const lower = locationName.toLowerCase().replace(/['']/g, "").trim();
  for (const [key, value] of Object.entries(LOCATION_MAP)) {
    if (lower.includes(key)) return value;
  }
  return locationName;
}

export function buildXeroCSV(
  invoices: any[],
  trainers: any[],
  lineItems: any[],
  rows: any[],
  manualLineItems: any[] = []
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

    const invDate = new Date(inv.invoice_date);
    const due = new Date(invDate.getFullYear(), invDate.getMonth(), 5);
    const dueDate = formatDateXero(due.toISOString());
    const invoiceDate = formatDateXero(inv.invoice_date);

    const invLineItems = lineItems.filter(
      (li: any) => li.pay_run_row_id === inv.pay_run_row_id
    );

    // Calculate guarantee top-ups (skip when row has skip_guarantee flag)
    const payRunRow = rows.find((r: any) => r.id === inv.pay_run_row_id);
    const skipGuarantee = !!payRunRow?.skip_guarantee;
    const lineRate = (li: any) => Number(trainer.default_hourly_rate) || Number(li.rate) || 0;
    const lineAmount = (li: any) => Number(li.sessions) * lineRate(li);
    const sessionsTotal = invLineItems.reduce((s: number, li: any) => s + lineAmount(li), 0);
    const totalSessions = invLineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);
    const guarantee = skipGuarantee ? 0 : Number(trainer.guarantee_amount) || 0;
    const guaranteeTopUp = guarantee > 0 && sessionsTotal < guarantee ? guarantee - sessionsTotal : 0;
    const guaranteeSessions = skipGuarantee ? 0 : Number(trainer.guarantee_sessions) || 0;
    const hourlyRate = Number(trainer.default_hourly_rate) || 0;
    const missingSessions = guaranteeSessions > 0 && totalSessions < guaranteeSessions ? guaranteeSessions - totalSessions : 0;
    const sessionTopUp = missingSessions * hourlyRate;

    // Determine primary location for non-session rows (guarantee, mgmt fee, extras)
    const primaryLocation = invLineItems.length > 0
      ? mapLocationTracking(
          invLineItems.reduce((best: any, li: any) =>
            Number(li.sessions) > Number(best.sessions) ? li : best
          ).location_name
        )
      : "HQ";

    let isFirstRow = true;

    if (invLineItems.length === 0) {
      const row = [
        contactName, trainer.email || "",
        addr.line1, addr.line2, addr.line3, addr.line4,
        addr.city, addr.region, addr.postalCode, addr.country,
        inv.invoice_number, invoiceDate, dueDate, inv.total_due,
        "", "PT Sessions", 1, inv.subtotal,
        "324", taxType, inv.vat_amount,
        "Location", primaryLocation, "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
      isFirstRow = false;
    } else {
      invLineItems.forEach((li: any) => {
        const amount = lineAmount(li);
        const rate = lineRate(li);
        const liVat = hasVat ? amount * 0.2 : 0;
        const locationName = mapLocationTracking(li.location_name);
        const row = [
          contactName, trainer.email || "",
          isFirstRow ? addr.line1 : "", isFirstRow ? addr.line2 : "",
          isFirstRow ? addr.line3 : "", isFirstRow ? addr.line4 : "",
          isFirstRow ? addr.city : "", isFirstRow ? addr.region : "",
          isFirstRow ? addr.postalCode : "", isFirstRow ? addr.country : "",
          inv.invoice_number, invoiceDate, dueDate,
          isFirstRow ? inv.total_due : "",
          "", `PT Sessions at ${li.location_name}`, li.sessions, rate,
          "324", taxType, liVat,
          "Location", locationName, "", "",
          "GBP",
        ];
        csvRows.push(row.map(escapeCSV).join(","));
        isFirstRow = false;
      });
    }

    // Add amount guarantee top-up row if applicable
    if (guaranteeTopUp > 0) {
      const topUpVat = hasVat ? guaranteeTopUp * 0.2 : 0;
      const row = [
        contactName, trainer.email || "",
        isFirstRow ? addr.line1 : "", isFirstRow ? addr.line2 : "",
        isFirstRow ? addr.line3 : "", isFirstRow ? addr.line4 : "",
        isFirstRow ? addr.city : "", isFirstRow ? addr.region : "",
        isFirstRow ? addr.postalCode : "", isFirstRow ? addr.country : "",
        inv.invoice_number, invoiceDate, dueDate,
        isFirstRow ? inv.total_due : "",
        "", "Guarantee Top-Up (Amount)", 1, guaranteeTopUp,
        "324", taxType, topUpVat,
        "Location", primaryLocation, "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
      isFirstRow = false;
    }

    // Add session guarantee top-up row if applicable
    if (sessionTopUp > 0) {
      const topUpVat = hasVat ? sessionTopUp * 0.2 : 0;
      const row = [
        contactName, trainer.email || "",
        isFirstRow ? addr.line1 : "", isFirstRow ? addr.line2 : "",
        isFirstRow ? addr.line3 : "", isFirstRow ? addr.line4 : "",
        isFirstRow ? addr.city : "", isFirstRow ? addr.region : "",
        isFirstRow ? addr.postalCode : "", isFirstRow ? addr.country : "",
        inv.invoice_number, invoiceDate, dueDate,
        isFirstRow ? inv.total_due : "",
        "", "Guarantee Top-Up (Sessions)", missingSessions, hourlyRate,
        "324", taxType, topUpVat,
        "Location", primaryLocation, "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
      isFirstRow = false;
    }

    // Add management fee row if applicable
    const managementFee = Number(trainer.management_fee) || 0;
    if (managementFee > 0) {
      const mfVat = hasVat ? managementFee * 0.2 : 0;
      const row = [
        contactName, trainer.email || "",
        isFirstRow ? addr.line1 : "", isFirstRow ? addr.line2 : "",
        isFirstRow ? addr.line3 : "", isFirstRow ? addr.line4 : "",
        isFirstRow ? addr.city : "", isFirstRow ? addr.region : "",
        isFirstRow ? addr.postalCode : "", isFirstRow ? addr.country : "",
        inv.invoice_number, invoiceDate, dueDate,
        isFirstRow ? inv.total_due : "",
        "", "Management Fee", 1, managementFee,
        "324", taxType, mfVat,
        "Location", primaryLocation, "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
      isFirstRow = false;
    }

    // Add manual/additional line items
    const invManualItems = manualLineItems.filter((mi: any) => mi.invoice_id === inv.id);
    for (const mi of invManualItems) {
      const miVat = hasVat ? Number(mi.amount) * 0.2 : 0;
      const row = [
        contactName, trainer.email || "",
        isFirstRow ? addr.line1 : "", isFirstRow ? addr.line2 : "",
        isFirstRow ? addr.line3 : "", isFirstRow ? addr.line4 : "",
        isFirstRow ? addr.city : "", isFirstRow ? addr.region : "",
        isFirstRow ? addr.postalCode : "", isFirstRow ? addr.country : "",
        inv.invoice_number, invoiceDate, dueDate,
        isFirstRow ? inv.total_due : "",
        "", mi.description, mi.quantity, mi.unit_price,
        "324", taxType, miVat,
        "Location", primaryLocation, "", "",
        "GBP",
      ];
      csvRows.push(row.map(escapeCSV).join(","));
      isFirstRow = false;
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
