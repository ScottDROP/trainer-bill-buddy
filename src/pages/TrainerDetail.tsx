import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import { ArrowLeft, Pencil, Save, X } from "lucide-react";
import { formatGBP, formatMonth } from "@/lib/currency";

export default function TrainerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);

  const { data: trainer, isLoading } = useQuery({
    queryKey: ["trainer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: payRunRows = [] } = useQuery({
    queryKey: ["trainer-pay-runs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pay_run_rows")
        .select("*, pay_runs(*)")
        .eq("matched_trainer_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["trainer-invoices", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("trainer_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("trainers")
        .update({
          full_name: form.full_name,
          email: form.email,
          aliases: form.aliases_str.split(",").map((a: string) => a.trim()).filter(Boolean),
          default_hourly_rate: parseFloat(form.default_hourly_rate) || 0,
          guarantee_amount: parseFloat(form.guarantee_amount) || 0,
          guarantee_sessions: parseFloat(form.guarantee_sessions) || 0,
          management_fee: parseFloat(form.management_fee) || 0,
          payment_terms: form.payment_terms,
          bank_account_number: form.bank_account_number,
          bank_sort_code: form.bank_sort_code,
          company_name: form.company_name,
          company_number: form.company_number,
          vat_number: form.vat_number,
          invoicing_address: form.invoicing_address,
        })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer", id] });
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Trainer updated");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = () => {
    if (!trainer) return;
    setForm({
      full_name: trainer.full_name,
      email: trainer.email || "",
      aliases_str: (trainer.aliases || []).join(", "),
      default_hourly_rate: trainer.default_hourly_rate?.toString() || "",
      guarantee_amount: (trainer as any).guarantee_amount?.toString() || "",
      guarantee_sessions: (trainer as any).guarantee_sessions?.toString() || "",
      management_fee: (trainer as any).management_fee?.toString() || "",
      payment_terms: trainer.payment_terms || "Net 30",
      bank_account_number: trainer.bank_account_number || "",
      bank_sort_code: trainer.bank_sort_code || "",
      company_name: trainer.company_name || "",
      company_number: trainer.company_number || "",
      vat_number: trainer.vat_number || "",
      invoicing_address: trainer.invoicing_address || "",
    });
    setEditing(true);
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!trainer) return <div className="p-6 text-muted-foreground">Trainer not found.</div>;

  const isComplete = trainer.full_name && trainer.email && trainer.bank_account_number;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{trainer.full_name}</h1>
          <p className="text-muted-foreground mt-1">
            {trainer.company_name || "Freelance Trainer"}
          </p>
        </div>
        <Badge variant={isComplete ? "default" : "secondary"} className={isComplete ? "bg-success text-success-foreground" : "text-warning"}>
          {isComplete ? "Complete" : "Incomplete"}
        </Badge>
        {!editing ? (
          <Button variant="outline" onClick={startEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Profile Info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Personal Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Aliases (comma-separated)</Label>
                  <Input value={form.aliases_str} onChange={(e) => setForm({ ...form, aliases_str: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Hourly Rate (£)</Label>
                    <Input type="number" step="0.01" value={form.default_hourly_rate} onChange={(e) => setForm({ ...form, default_hourly_rate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Terms</Label>
                    <Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Monthly Guarantee (£)</Label>
                    <Input type="number" step="0.01" value={form.guarantee_amount} onChange={(e) => setForm({ ...form, guarantee_amount: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Guaranteed Sessions</Label>
                    <Input type="number" step="1" value={form.guarantee_sessions} onChange={(e) => setForm({ ...form, guarantee_sessions: e.target.value })} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Management Fee (£)</Label>
                    <Input type="number" step="0.01" value={form.management_fee} onChange={(e) => setForm({ ...form, management_fee: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{trainer.email || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>{formatGBP(trainer.default_hourly_rate || 0)}/hr</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{trainer.payment_terms || "Net 30"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Guarantee (£)</span><span>{trainer.guarantee_amount ? formatGBP(trainer.guarantee_amount) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Guaranteed Sessions</span><span>{(trainer as any).guarantee_sessions ? (trainer as any).guarantee_sessions : "—"}</span></div>
                {trainer.aliases && trainer.aliases.length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Aliases</span><span>{trainer.aliases.join(", ")}</span></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Company & Banking</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Number</Label>
                    <Input value={form.company_number} onChange={(e) => setForm({ ...form, company_number: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>VAT Number</Label>
                    <Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Invoicing Address</Label>
                  <Input value={form.invoicing_address} onChange={(e) => setForm({ ...form, invoicing_address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sort Code</Label>
                    <Input value={form.bank_sort_code} onChange={(e) => setForm({ ...form, bank_sort_code: e.target.value })} />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Company</span><span>{trainer.company_name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Company No.</span><span>{trainer.company_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{trainer.vat_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{trainer.invoicing_address || "—"}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span>{trainer.bank_account_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sort Code</span><span>{trainer.bank_sort_code || "—"}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pay Run History */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Pay Run History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payRunRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No pay runs yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payRunRows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/pay-runs/${row.pay_run_id}/review`)}
                  >
                    <TableCell className="font-medium">
                      {row.pay_runs ? formatMonth(row.pay_runs.month, row.pay_runs.year) : "—"}
                    </TableCell>
                    <TableCell>{row.total_sessions}</TableCell>
                    <TableCell>{formatGBP(row.hourly_rate_csv)}/hr</TableCell>
                    <TableCell>{formatGBP(row.total_cost)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{row.pay_runs?.status || "—"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Invoice History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No invoices yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Total Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{new Date(inv.invoice_date).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell>{formatGBP(inv.subtotal)}</TableCell>
                    <TableCell>{formatGBP(inv.vat_amount)}</TableCell>
                    <TableCell className="font-medium">{formatGBP(inv.total_due)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "draft" ? "secondary" : "default"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
