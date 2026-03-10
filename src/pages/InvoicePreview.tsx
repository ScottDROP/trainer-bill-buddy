import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrainerLink } from "@/components/TrainerLink";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatGBP, formatMonth } from "@/lib/currency";
import { FileText, Download, Send } from "lucide-react";
import { buildXeroCSV, downloadCSV } from "@/lib/xero-export";
import { useState, useEffect } from "react";

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!payRun) throw new Error("No pay run");

      const serviceStart = new Date(payRun.year, payRun.month - 1, 1);
      const serviceEnd = new Date(payRun.year, payRun.month, 0);

      const invoicesToCreate = rows
        .filter((r: any) => r.matched_trainer_id)
        .filter((r: any) => !invoices.find((inv: any) => inv.pay_run_row_id === r.id))
        .map((row: any, idx: number) => {
          const trainer = trainers.find((t: any) => t.id === row.matched_trainer_id);
          const lineItems = allLineItems.filter((li: any) => li.pay_run_row_id === row.id);
          const sessionsSubtotal = lineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
          const guarantee = Number((trainer as any)?.guarantee_amount) || 0;
          const guaranteeTopUp = guarantee > 0 && sessionsSubtotal < guarantee ? guarantee - sessionsSubtotal : 0;
          const subtotal = sessionsSubtotal + guaranteeTopUp;
          const hasVat = trainer?.vat_number && trainer.vat_number.trim() !== "";
          const vatAmount = hasVat ? subtotal * 0.2 : 0;
          const invoiceNum = `DG-${payRun.year}${String(payRun.month).padStart(2, "0")}-${String(idx + 1).padStart(3, "0")}`;

          return {
            pay_run_row_id: row.id,
            trainer_id: row.matched_trainer_id,
            invoice_number: invoiceNum,
            invoice_date: new Date().toISOString().split("T")[0],
            service_period_start: serviceStart.toISOString().split("T")[0],
            service_period_end: serviceEnd.toISOString().split("T")[0],
            subtotal,
            vat_amount: vatAmount,
            total_due: subtotal + vatAmount,
            status: "draft" as const,
          };
        });

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

  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const invoiceIds = invoices.map((inv: any) => inv.id);
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_ids: invoiceIds },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const sent = data.results?.filter((r: any) => r.success).length || 0;
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      if (failed > 0) {
        toast.warning(`${sent} sent, ${failed} failed`);
      } else {
        toast.success(`${sent} invoices emailed successfully`);
      }
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
      if (result?.success) {
        toast.success(`Invoice emailed to ${result.email}`);
      } else {
        toast.error(`Failed: ${result?.error || "Unknown error"}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const selectedInv = invoices.find((inv: any) => inv.id === selectedInvoice);
  const selectedTrainer = selectedInv
    ? trainers.find((t: any) => t.id === selectedInv.trainer_id)
    : null;
  const selectedRow = selectedInv
    ? rows.find((r: any) => r.id === selectedInv.pay_run_row_id)
    : null;
  const selectedLineItems = selectedInv
    ? allLineItems.filter((li: any) => li.pay_run_row_id === selectedInv.pay_run_row_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          {payRun && (
            <p className="text-muted-foreground mt-1">
              {formatMonth(payRun.month, payRun.year)}
            </p>
          )}
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
                onClick={() => {
                  const csv = buildXeroCSV(invoices, trainers, allLineItems, rows);
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
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              {invoices.length} invoices
            </p>
            {invoices.map((inv: any) => {
              const trainer = trainers.find((t: any) => t.id === inv.trainer_id);
              return (
                <div
                  key={inv.id}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedInvoice === inv.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedInvoice(inv.id)}
                >
                  <p className="font-medium text-sm">
                    {trainer ? (
                      <TrainerLink trainerId={trainer.id} name={trainer.full_name} />
                    ) : "Unknown"}
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
              <Card>
                <CardContent className="p-8 font-mono text-sm">
                  {/* Invoice Title */}
                  <h2 className="text-xl font-bold text-foreground mb-6">INVOICE</h2>

                  {/* Bill To + Trainer Address side by side */}
                  <div className="grid grid-cols-2 gap-8 mb-6">
                    <div>
                      <p className="font-bold">Bill To:</p>
                      <p>{companySettings?.name || "DropGym"}</p>
                      {companySettings?.address && (
                        <p className="whitespace-pre-line">{companySettings.address}</p>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        <TrainerLink trainerId={selectedTrainer.id} name={selectedTrainer.full_name} />
                      </p>
                      {selectedTrainer.invoicing_address && (
                        <p className="whitespace-pre-line">{selectedTrainer.invoicing_address}</p>
                      )}
                    </div>
                  </div>

                  {/* Invoice metadata */}
                  <div className="mb-6 space-y-1">
                    <p>Invoice Number: {selectedInv.invoice_number}</p>
                    <p>Invoice Date: {new Date(selectedInv.invoice_date).toLocaleDateString("en-GB")}</p>
                    <p>Due Date: {(() => {
                      const terms = selectedTrainer.payment_terms || "Net 30";
                      const days = parseInt(terms.replace(/\D/g, "")) || 30;
                      const due = new Date(selectedInv.invoice_date);
                      due.setDate(due.getDate() + days);
                      return due.toLocaleDateString("en-GB");
                    })()}</p>
                  </div>

                  {/* Line items table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Qty</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLineItems.map((li: any) => (
                        <TableRow key={li.id}>
                          <TableCell>{li.sessions}</TableCell>
                          <TableCell>PT Sessions at {li.location_name}</TableCell>
                          <TableCell className="text-right">{formatGBP(li.rate)}</TableCell>
                          <TableCell className="text-right">{formatGBP(li.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Separator className="my-4" />

                  {/* Totals */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between font-bold">
                      <span>Subtotal</span>
                      <span>{formatGBP(selectedInv.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VAT @ {selectedInv.vat_amount > 0 ? "20%" : "0%"}</span>
                      <span>{formatGBP(selectedInv.vat_amount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span>{formatGBP(selectedInv.total_due)}</span>
                    </div>
                  </div>

                  {/* Payment details - trainer's bank info */}
                  {(selectedTrainer.bank_account_number || selectedTrainer.bank_sort_code) && (
                    <div className="mt-8">
                      <p className="font-bold">Please pay to:</p>
                      {selectedTrainer.bank_account_number && (
                        <p>Account Number: {selectedTrainer.bank_account_number}</p>
                      )}
                      {selectedTrainer.bank_sort_code && (
                        <p>Sort Code: {selectedTrainer.bank_sort_code}</p>
                      )}
                    </div>
                  )}
                  {/* Send single invoice */}
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
                      {sendSingleMutation.isPending ? "Sending..." : `Send to ${selectedTrainer.email || "Trainer"}`}
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
      )}
    </div>
  );
}
