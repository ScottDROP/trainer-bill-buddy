import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatGBP, formatMonth } from "@/lib/currency";
import { FileText, Download } from "lucide-react";
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
          const subtotal = lineItems.reduce((s: number, li: any) => s + Number(li.amount), 0);
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
                  <p className="font-medium text-sm">{trainer?.full_name || "Unknown"}</p>
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
                <CardContent className="p-8">
                  {/* Invoice Header */}
                  <div className="flex justify-between mb-8">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">INVOICE</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedInv.invoice_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={selectedInv.status === "draft" ? "secondary" : "default"}>
                        {selectedInv.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">From</p>
                      <p className="font-medium">{companySettings?.name || "DropGym"}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {companySettings?.address}
                      </p>
                      {companySettings?.vat_number && (
                        <p className="text-sm text-muted-foreground mt-1">
                          VAT: {companySettings.vat_number}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">To</p>
                      <p className="font-medium">{selectedTrainer.company_name || selectedTrainer.full_name}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {selectedTrainer.invoicing_address}
                      </p>
                      {selectedTrainer.vat_number && (
                        <p className="text-sm text-muted-foreground mt-1">
                          VAT: {selectedTrainer.vat_number}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
                    <div>
                      <p className="text-muted-foreground">Invoice Date</p>
                      <p className="font-medium">
                        {new Date(selectedInv.invoice_date).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Service Period</p>
                      <p className="font-medium">
                        {new Date(selectedInv.service_period_start).toLocaleDateString("en-GB")} –{" "}
                        {new Date(selectedInv.service_period_end).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment Terms</p>
                      <p className="font-medium">{selectedTrainer.payment_terms || "Net 30"}</p>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLineItems.map((li: any) => (
                        <TableRow key={li.id}>
                          <TableCell>{li.location_name}</TableCell>
                          <TableCell className="text-right">{li.sessions}</TableCell>
                          <TableCell className="text-right">{formatGBP(li.rate)}</TableCell>
                          <TableCell className="text-right">{formatGBP(li.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Separator className="my-4" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatGBP(selectedInv.subtotal)}</span>
                    </div>
                    {selectedInv.vat_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT (20%)</span>
                        <span>{formatGBP(selectedInv.vat_amount)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total Due</span>
                      <span>{formatGBP(selectedInv.total_due)}</span>
                    </div>
                  </div>

                  {companySettings?.bank_details && (
                    <div className="mt-8 p-4 bg-muted rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Bank Details</p>
                      <p className="text-sm whitespace-pre-line">{companySettings.bank_details}</p>
                    </div>
                  )}
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
