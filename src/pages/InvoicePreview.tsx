import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrainerLink } from "@/components/TrainerLink";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatGBP, formatMonth } from "@/lib/currency";
import { FileText, Download, Send, Plus, Trash2, Users } from "lucide-react";
import { buildXeroCSV, downloadCSV } from "@/lib/xero-export";
import { buildTellerooCSV } from "@/lib/telleroo-export";
import { StaffPayRunView } from "@/components/StaffPayRunView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: payRun } = useQuery({
    queryKey: ["pay-run", id],
    queryFn: async () => {
      const { data } = await supabase.from("pay_runs").select("*").eq("id", id!).single();
      return data;
    },
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["pay-run-rows", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pay_run_rows")
        .select("*")
        .eq("pay_run_id", id!)
        .order("trainer_name_csv");
      return data ?? [];
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("*");
      return data ?? [];
    },
  });

  const { data: allLineItems = [] } = useQuery({
    queryKey: ["pay-run-line-items", id],
    queryFn: async () => {
      const rowIds = rows.map((r: any) => r.id);
      if (rowIds.length === 0) return [];
      const { data } = await supabase
        .from("pay_run_line_items")
        .select("*")
        .in("pay_run_row_id", rowIds);
      return data ?? [];
    },
    enabled: rows.length > 0,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => {
      const rowIds = rows.map((r: any) => r.id);
      if (rowIds.length === 0) return [];
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .in("pay_run_row_id", rowIds);
      return data ?? [];
    },
    enabled: rows.length > 0,
  });

  // Staff pay run data
  const { data: staffPayRun } = useQuery({
    queryKey: ["staff-pay-run", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_pay_runs")
        .select("*")
        .eq("pay_run_id", id!)
        .maybeSingle();
      return data;
    },
  });

  // Manual invoice line items
  const invoiceIds = invoices.map((inv: any) => inv.id);
  const { data: manualLineItems = [] } = useQuery({
    queryKey: ["invoice-line-items", id],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [];
      const { data } = await supabase
        .from("invoice_line_items")
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("created_at");
      return data ?? [];
    },
    enabled: invoiceIds.length > 0,
  });

  const addManualItemMutation = useMutation({
    mutationFn: async ({ invoiceId, description, quantity, unitPrice }: {
      invoiceId: string; description: string; quantity: number; unitPrice: number;
    }) => {
      const { error } = await supabase.from("invoice_line_items").insert({
        invoice_id: invoiceId,
        description,
        quantity,
        unit_price: unitPrice,
        amount: quantity * unitPrice,
      });
      if (error) throw error;

      // Recalculate invoice totals
      await recalcInvoiceTotals(invoiceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-line-items", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      toast.success("Line item added");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeManualItemMutation = useMutation({
    mutationFn: async ({ itemId, invoiceId }: { itemId: string; invoiceId: string }) => {
      const { error } = await supabase.from("invoice_line_items").delete().eq("id", itemId);
      if (error) throw error;
      await recalcInvoiceTotals(invoiceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-line-items", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      toast.success("Line item removed");
    },
    onError: (e) => toast.error(e.message),
  });

  async function recalcInvoiceTotals(invoiceId: string) {
    const inv = invoices.find((i: any) => i.id === invoiceId);
    if (!inv) return;
    const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
    const payRunLineItems = allLineItems.filter((li: any) => li.pay_run_row_id === inv.pay_run_row_id);
    const sessionsSubtotal = payRunLineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
    const totalSessions = payRunLineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);

    const skipGuarantee = !!rows.find((r: any) => r.id === inv.pay_run_row_id)?.skip_guarantee;
    const guarantee = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_amount) || 0;
    const guaranteeTopUp = guarantee > 0 && sessionsSubtotal < guarantee ? guarantee - sessionsSubtotal : 0;

    const guaranteeSessions = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_sessions) || 0;
    const hourlyRate = Number(trainer?.default_hourly_rate) || 0;
    const sessionTopUp = guaranteeSessions > 0 && totalSessions < guaranteeSessions
      ? (guaranteeSessions - totalSessions) * hourlyRate : 0;

    const managementFee = Number((trainer as any)?.management_fee) || 0;

    // Fetch latest manual items
    const { data: latestManual } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId);
    const manualTotal = (latestManual ?? []).reduce((s: number, li: any) => s + Number(li.amount), 0);

    const subtotal = sessionsSubtotal + guaranteeTopUp + sessionTopUp + managementFee + manualTotal;
    const hasVat = trainer?.vat_number && trainer.vat_number.trim() !== "";
    const vatAmount = hasVat ? subtotal * 0.2 : 0;

    await supabase.from("invoices").update({
      subtotal,
      vat_amount: vatAmount,
      total_due: subtotal + vatAmount,
    }).eq("id", invoiceId);
  }

  // Helper: calculate invoice totals for a row, fetching line items fresh from DB
  async function calcInvoiceTotals(rowId: string, trainerId: string) {
    const trainer = trainers.find((t: any) => t.id === trainerId);
    // Fetch line items directly from DB to avoid stale cache
    const { data: freshLineItems } = await supabase
      .from("pay_run_line_items")
      .select("*")
      .eq("pay_run_row_id", rowId);
    const lineItems = freshLineItems ?? [];
    const sessionsSubtotal = lineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
    const totalSessions = lineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);
    const row = rows.find((r: any) => r.id === rowId);
    const skipGuarantee = !!row?.skip_guarantee;
    const guarantee = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_amount) || 0;
    const guaranteeTopUp = guarantee > 0 && sessionsSubtotal < guarantee ? guarantee - sessionsSubtotal : 0;
    const guaranteeSessions = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_sessions) || 0;
    const hourlyRate = Number(trainer?.default_hourly_rate) || 0;
    const sessionTopUp = guaranteeSessions > 0 && totalSessions < guaranteeSessions
      ? (guaranteeSessions - totalSessions) * hourlyRate : 0;
    const managementFee = Number((trainer as any)?.management_fee) || 0;

    // Include manual line items
    const { data: manualItems } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", "placeholder"); // Will be overridden per-invoice
    
    const subtotal = sessionsSubtotal + guaranteeTopUp + sessionTopUp + managementFee;
    const hasVat = trainer?.vat_number && trainer.vat_number.trim() !== "";
    const vatAmount = hasVat ? subtotal * 0.2 : 0;
    return { subtotal, vatAmount, totalDue: subtotal + vatAmount };
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!payRun) throw new Error("No pay run");
      const serviceStart = new Date(payRun.year, payRun.month - 1, 1);
      const serviceEnd = new Date(payRun.year, payRun.month, 0);

      const matchedRows = rows
        .filter((r: any) => r.matched_trainer_id)
        .filter((r: any) => !invoices.find((inv: any) => inv.pay_run_row_id === r.id));

      const invoicesToCreate = [];
      for (let idx = 0; idx < matchedRows.length; idx++) {
        const row = matchedRows[idx];
        const { subtotal, vatAmount, totalDue } = await calcInvoiceTotals(row.id, row.matched_trainer_id);
        const invoiceNum = `DG-${payRun.year}${String(payRun.month).padStart(2, "0")}-${String(idx + 1).padStart(3, "0")}`;
        invoicesToCreate.push({
          pay_run_row_id: row.id,
          trainer_id: row.matched_trainer_id,
          invoice_number: invoiceNum,
          invoice_date: new Date().toISOString().split("T")[0],
          service_period_start: serviceStart.toISOString().split("T")[0],
          service_period_end: serviceEnd.toISOString().split("T")[0],
          subtotal,
          vat_amount: vatAmount,
          total_due: totalDue,
          status: "draft" as const,
        });
      }

      if (invoicesToCreate.length > 0) {
        const { error } = await supabase.from("invoices").insert(invoicesToCreate);
        if (error) throw error;
      }
      await supabase.from("pay_runs").update({ status: "invoiced" as any }).eq("id", id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["pay-run", id] });
      toast.success("Invoices generated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Recalculate all invoice totals from fresh DB data
  const recalcAllMutation = useMutation({
    mutationFn: async () => {
      for (const inv of invoices) {
        const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
        const { data: freshLineItems } = await supabase
          .from("pay_run_line_items")
          .select("*")
          .eq("pay_run_row_id", inv.pay_run_row_id);
        const lineItems = freshLineItems ?? [];
        const sessionsSubtotal = lineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
        const totalSessions = lineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);

        const skipGuarantee = !!rows.find((r: any) => r.id === inv.pay_run_row_id)?.skip_guarantee;
        const guarantee = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_amount) || 0;
        const guaranteeTopUp = guarantee > 0 && sessionsSubtotal < guarantee ? guarantee - sessionsSubtotal : 0;
        const guaranteeSessions = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_sessions) || 0;
        const hourlyRate = Number(trainer?.default_hourly_rate) || 0;
        const sessionTopUp = guaranteeSessions > 0 && totalSessions < guaranteeSessions
          ? (guaranteeSessions - totalSessions) * hourlyRate : 0;
        const managementFee = Number((trainer as any)?.management_fee) || 0;

        const { data: manualItems } = await supabase
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", inv.id);
        const manualTotal = (manualItems ?? []).reduce((s: number, li: any) => s + Number(li.amount), 0);

        const subtotal = sessionsSubtotal + guaranteeTopUp + sessionTopUp + managementFee + manualTotal;
        const hasVat = trainer?.vat_number && trainer.vat_number.trim() !== "";
        const vatAmount = hasVat ? subtotal * 0.2 : 0;

        await supabase.from("invoices").update({
          subtotal,
          vat_amount: vatAmount,
          total_due: subtotal + vatAmount,
        }).eq("id", inv.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      toast.success("All invoice totals recalculated");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const ids = invoices.map((inv: any) => inv.id);
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_ids: ids },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const sent = data.results?.filter((r: any) => r.success).length || 0;
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      if (failed > 0) toast.warning(`${sent} sent, ${failed} failed`);
      else toast.success(`${sent} invoices emailed successfully`);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendSingleMutation = useMutation({
    mutationFn: async ({ invoiceId, testEmail }: { invoiceId: string; testEmail?: string }) => {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_ids: [invoiceId], ...(testEmail ? { test_email: testEmail } : {}) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const result = data.results?.[0];
      if (result?.success) toast.success(`Invoice emailed to ${result.email}`);
      else toast.error(`Failed: ${result?.error || "Unknown error"}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ description: "", quantity: "1", unitPrice: "" });
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  const selectedInv = invoices.find((inv: any) => inv.id === selectedInvoice);
  const selectedTrainer = selectedInv ? trainers.find((t: any) => t.id === selectedInv.trainer_id) : null;
  const selectedLineItems = selectedInv
    ? allLineItems.filter((li: any) => li.pay_run_row_id === selectedInv.pay_run_row_id)
    : [];
  const selectedManualItems = selectedInv
    ? manualLineItems.filter((li: any) => li.invoice_id === selectedInv.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          {payRun && <p className="text-muted-foreground mt-1">{formatMonth(payRun.month, payRun.year)}</p>}
        </div>
        <div className="flex gap-2">
          {invoices.length === 0 && (
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <FileText className="mr-2 h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate Invoices"}
            </Button>
          )}
          {invoices.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => recalcAllMutation.mutate()}
                disabled={recalcAllMutation.isPending}
              >
                {recalcAllMutation.isPending ? "Recalculating..." : "Recalculate All"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const csv = buildXeroCSV(invoices, trainers, allLineItems, rows, manualLineItems);
                  const filename = payRun
                    ? `xero-bills-${payRun.year}-${String(payRun.month).padStart(2, "0")}.csv`
                    : "xero-bills.csv";
                  downloadCSV(csv, filename);
                  toast.success("Xero CSV downloaded");
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Export for Xero
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const csv = buildTellerooCSV(invoices, trainers, payRun);
                  const filename = payRun
                    ? `telleroo-${payRun.year}-${String(payRun.month).padStart(2, "0")}.csv`
                    : "telleroo.csv";
                  downloadCSV(csv, filename);
                  toast.success("Telleroo CSV downloaded");
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Export for Telleroo
              </Button>
              <Button onClick={() => sendAllMutation.mutate()} disabled={sendAllMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {sendAllMutation.isPending ? "Sending..." : "Send All Invoices"}
              </Button>
            </>
          )}
        </div>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No invoices generated yet. Click "Generate Invoices" to create drafts.</p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Pay Run Totals Summary */}
        {(() => {
          type TrainerBreakdown = { name: string; trainerId: string; realHours: number; guarantee: number; management: number; vat: number; total: number };
          const breakdowns: TrainerBreakdown[] = [];
          let totalRealHours = 0;
          let totalGuarantee = 0;
          let totalManagement = 0;
          let totalVat = 0;

          invoices.forEach((inv: any) => {
            const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
            const lineItems = allLineItems.filter((li: any) => li.pay_run_row_id === inv.pay_run_row_id);
            const sessionsSubtotal = lineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
            const totalSessions = lineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);

            const skipGuarantee = !!rows.find((r: any) => r.id === inv.pay_run_row_id)?.skip_guarantee;
            const guaranteeAmt = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_amount) || 0;
            const guaranteeTopUp = guaranteeAmt > 0 && sessionsSubtotal < guaranteeAmt ? guaranteeAmt - sessionsSubtotal : 0;
            const guaranteeSessions = skipGuarantee ? 0 : Number((trainer as any)?.guarantee_sessions) || 0;
            const hourlyRate = Number(trainer?.default_hourly_rate) || 0;
            const sessionTopUp = guaranteeSessions > 0 && totalSessions < guaranteeSessions
              ? (guaranteeSessions - totalSessions) * hourlyRate : 0;
            const managementFee = Number((trainer as any)?.management_fee) || 0;

            const trainerGuarantee = guaranteeTopUp + sessionTopUp;

            totalRealHours += sessionsSubtotal;
            totalGuarantee += trainerGuarantee;
            totalManagement += managementFee;
            totalVat += Number(inv.vat_amount);

            breakdowns.push({
              name: trainer?.full_name || "Unknown",
              trainerId: inv.trainer_id,
              realHours: sessionsSubtotal,
              guarantee: trainerGuarantee,
              management: managementFee,
              vat: Number(inv.vat_amount),
              total: Number(inv.total_due),
            });
          });

          const grandTotal = invoices.reduce((s: number, inv: any) => s + Number(inv.total_due), 0);
          const staffNetPay = Number(staffPayRun?.total_net) || 0;
          const staffGrossPay = Number(staffPayRun?.total_gross) || 0;
          const combinedTotal = grandTotal + staffNetPay;

          const cards = [
            { key: "hours", label: "Real Hours", value: totalRealHours, highlight: false },
            { key: "guarantee", label: "Guarantee Top-ups", value: totalGuarantee, highlight: false },
            { key: "management", label: "Management Fees", value: totalManagement, highlight: false },
            { key: "vat", label: "VAT", value: totalVat, highlight: false },
            { key: "trainertotal", label: "Trainer Total", value: grandTotal, highlight: false },
            ...(staffPayRun ? [{ key: "staff", label: "Staff Net Pay", value: staffNetPay, highlight: false }] : []),
            { key: "total", label: "Combined Total", value: combinedTotal, highlight: true },
          ];

          const filterKey = expandedSummary;
          const filtered = filterKey
            ? breakdowns.filter((b) => {
                if (filterKey === "hours") return b.realHours > 0;
                if (filterKey === "guarantee") return b.guarantee > 0;
                if (filterKey === "management") return b.management > 0;
                if (filterKey === "vat") return b.vat > 0;
                return true;
              })
            : [];

          const valueForRow = (b: TrainerBreakdown) => {
            if (filterKey === "hours") return b.realHours;
            if (filterKey === "guarantee") return b.guarantee;
            if (filterKey === "management") return b.management;
            if (filterKey === "vat") return b.vat;
            return b.total;
          };

          const cardLabel = cards.find((c) => c.key === filterKey)?.label || "";

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {cards.map((card) => (
                  <Card
                    key={card.key}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      card.highlight ? "border-primary" : ""
                    } ${expandedSummary === card.key ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setExpandedSummary(expandedSummary === card.key ? null : card.key)}
                  >
                    <CardContent className="p-4 text-center">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${card.highlight ? "text-primary" : "text-muted-foreground"}`}>
                        {card.label}
                      </p>
                      <p className={`text-lg font-bold mt-1 ${card.highlight ? "text-primary" : "text-foreground"}`}>
                        {formatGBP(card.value)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {expandedSummary && filtered.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-3 border-b">
                      <p className="text-sm font-semibold text-foreground">{cardLabel} — Breakdown by Trainer</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trainer</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered
                          .sort((a, b) => valueForRow(b) - valueForRow(a))
                          .map((b) => (
                          <TableRow key={b.trainerId}>
                            <TableCell>
                              <TrainerLink trainerId={b.trainerId} name={b.name} />
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatGBP(valueForRow(b))}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right">{formatGBP(filtered.reduce((s, b) => s + valueForRow(b), 0))}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

        <Tabs defaultValue="trainers" className="w-full">
          <TabsList>
            <TabsTrigger value="trainers">Trainer Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="staff" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Full-Time Staff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trainers" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">{invoices.length} invoices</p>
                {invoices.map((inv: any) => {
                  const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
                  return (
                    <div
                      key={inv.id}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedInvoice === inv.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedInvoice(inv.id)}
                    >
                      <p className="font-medium text-sm">
                        {trainer ? <TrainerLink trainerId={trainer.id} name={trainer.full_name} /> : "Unknown"}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">{inv.invoice_number}</span>
                        <span className="text-sm font-medium">{formatGBP(inv.total_due)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="lg:col-span-2">
                {selectedInv && selectedTrainer ? (
                  <Card className="overflow-hidden">
                    <div className="bg-primary px-8 py-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-primary-foreground tracking-wide">INVOICE</h2>
                        <span className="text-primary-foreground/80 text-sm font-medium">{selectedInv.invoice_number}</span>
                      </div>
                    </div>
                    <CardContent className="p-8 text-sm">
                      <div className="grid grid-cols-2 gap-8 mb-8">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bill To</p>
                          <p className="font-semibold text-foreground">{companySettings?.name || "DropGym"}</p>
                          {companySettings?.address && <p className="whitespace-pre-line text-muted-foreground text-xs leading-relaxed">{companySettings.address}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">From</p>
                          <p className="font-semibold text-foreground">
                            <TrainerLink trainerId={selectedTrainer.id} name={selectedTrainer.full_name} />
                          </p>
                          {selectedTrainer.company_name && <p className="text-muted-foreground text-xs">{selectedTrainer.company_name}</p>}
                          {selectedTrainer.invoicing_address && (
                            <p className="whitespace-pre-line text-muted-foreground text-xs leading-relaxed">{selectedTrainer.invoicing_address}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-6 mb-8 p-4 rounded-lg bg-muted/50">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date</p>
                          <p className="font-medium text-foreground mt-0.5">{new Date(selectedInv.invoice_date).toLocaleDateString("en-GB")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</p>
                          <p className="font-medium text-foreground mt-0.5">{(() => {
                            const invDate = new Date(selectedInv.invoice_date);
                            const due = new Date(invDate.getFullYear(), invDate.getMonth(), 5);
                            return due.toLocaleDateString("en-GB");
                          })()}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                          <p className="font-medium text-foreground mt-0.5 capitalize">{selectedInv.status}</p>
                        </div>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Qty</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedLineItems.map((li: any) => (
                            <TableRow key={li.id}>
                              <TableCell>{li.sessions}</TableCell>
                              <TableCell>PT Sessions at {li.location_name}</TableCell>
                              <TableCell className="text-right">{formatGBP(li.rate)}</TableCell>
                              <TableCell className="text-right">{formatGBP(li.amount)}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          ))}
                          {(() => {
                            const sessionsTotal = selectedLineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
                            const totalSessions = selectedLineItems.reduce((s: number, li: any) => s + Number(li.sessions), 0);
                            const guarantee = Number((selectedTrainer as any)?.guarantee_amount) || 0;
                            const amountTopUp = guarantee > 0 && sessionsTotal < guarantee ? guarantee - sessionsTotal : 0;
                            const guaranteeSessions = Number((selectedTrainer as any)?.guarantee_sessions) || 0;
                            const hourlyRate = Number(selectedTrainer?.default_hourly_rate) || 0;
                            const missingSessions = guaranteeSessions > 0 && totalSessions < guaranteeSessions ? guaranteeSessions - totalSessions : 0;
                            const sessionTopUp = missingSessions * hourlyRate;
                            return (
                              <>
                                {amountTopUp > 0 && (
                                  <TableRow>
                                    <TableCell>1</TableCell>
                                    <TableCell>Guarantee Top-Up (Amount)</TableCell>
                                    <TableCell className="text-right">{formatGBP(amountTopUp)}</TableCell>
                                    <TableCell className="text-right">{formatGBP(amountTopUp)}</TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                )}
                                {sessionTopUp > 0 && (
                                  <TableRow>
                                    <TableCell>{missingSessions}</TableCell>
                                    <TableCell>Guarantee Top-Up (Sessions)</TableCell>
                                    <TableCell className="text-right">{formatGBP(hourlyRate)}</TableCell>
                                    <TableCell className="text-right">{formatGBP(sessionTopUp)}</TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                )}
                                {(() => {
                                  const mgmtFee = Number((selectedTrainer as any)?.management_fee) || 0;
                                  if (mgmtFee <= 0) return null;
                                  return (
                                    <TableRow>
                                      <TableCell>1</TableCell>
                                      <TableCell>Management Fee</TableCell>
                                      <TableCell className="text-right">{formatGBP(mgmtFee)}</TableCell>
                                      <TableCell className="text-right">{formatGBP(mgmtFee)}</TableCell>
                                      <TableCell></TableCell>
                                    </TableRow>
                                  );
                                })()}
                              </>
                            );
                          })()}
                          {/* Manual line items */}
                          {selectedManualItems.map((li: any) => (
                            <TableRow key={li.id} className="bg-muted/30">
                              <TableCell>{li.quantity}</TableCell>
                              <TableCell>{li.description}</TableCell>
                              <TableCell className="text-right">{formatGBP(li.unit_price)}</TableCell>
                              <TableCell className="text-right">{formatGBP(li.amount)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => removeManualItemMutation.mutate({ itemId: li.id, invoiceId: selectedInv.id })}
                                  disabled={removeManualItemMutation.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Add new item row */}
                          <TableRow className="border-dashed">
                            <TableCell>
                              <Input
                                className="h-7 w-14 text-xs font-mono"
                                type="number"
                                min="1"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-7 text-xs font-mono"
                                placeholder="Description"
                                value={newItem.description}
                                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                className="h-7 w-24 text-xs font-mono text-right ml-auto"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={newItem.unitPrice}
                                onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {newItem.unitPrice ? formatGBP((parseFloat(newItem.quantity) || 1) * (parseFloat(newItem.unitPrice) || 0)) : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-primary"
                                disabled={!newItem.description || !newItem.unitPrice || addManualItemMutation.isPending}
                                onClick={() => {
                                  const qty = parseFloat(newItem.quantity) || 1;
                                  const price = parseFloat(newItem.unitPrice) || 0;
                                  addManualItemMutation.mutate({
                                    invoiceId: selectedInv.id,
                                    description: newItem.description,
                                    quantity: qty,
                                    unitPrice: price,
                                  });
                                  setNewItem({ description: "", quantity: "1", unitPrice: "" });
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>

                      <div className="mt-6 flex justify-end">
                        <div className="w-64 space-y-2 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span className="font-medium text-foreground">{formatGBP(selectedInv.subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>VAT @ {selectedInv.vat_amount > 0 ? "20%" : "0%"}</span>
                            <span className="font-medium text-foreground">{formatGBP(selectedInv.vat_amount)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-base font-bold text-foreground pt-1">
                            <span>Total Due</span>
                            <span>{formatGBP(selectedInv.total_due)}</span>
                          </div>
                        </div>
                      </div>

                      {(selectedTrainer.bank_account_number || selectedTrainer.bank_sort_code) && (
                        <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Details</p>
                          <div className="flex gap-6 text-sm">
                            {selectedTrainer.bank_sort_code && (
                              <div>
                                <span className="text-muted-foreground">Sort Code: </span>
                                <span className="font-medium text-foreground">{selectedTrainer.bank_sort_code}</span>
                              </div>
                            )}
                            {selectedTrainer.bank_account_number && (
                              <div>
                                <span className="text-muted-foreground">Account: </span>
                                <span className="font-medium text-foreground">{selectedTrainer.bank_account_number}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <Separator className="my-6" />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendSingleMutation.isPending}
                          onClick={() => sendSingleMutation.mutate({ invoiceId: selectedInv.id, testEmail: "scott@dropgym.io" })}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {sendSingleMutation.isPending ? "Sending..." : "Send Test to Me"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={sendSingleMutation.isPending}
                          onClick={() => sendSingleMutation.mutate({ invoiceId: selectedInv.id })}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {sendSingleMutation.isPending ? "Sending..." : "Send to Trainer"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Select an invoice to preview.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <StaffPayRunView payRunId={id!} />
          </TabsContent>
        </Tabs>
        </>
      )}
    </div>
  );
}