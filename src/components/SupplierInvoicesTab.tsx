import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, FileText, Trash2, Eye, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/currency";

export function SupplierInvoicesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    supplier_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    amount: "",
    description: "",
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["supplier-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_invoices")
        .select("*")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let filePath: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("supplier-invoices")
          .upload(fileName, file);
        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      const { error } = await supabase.from("supplier_invoices").insert({
        supplier_name: form.supplier_name,
        invoice_number: form.invoice_number || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        amount: parseFloat(form.amount) || 0,
        description: form.description || null,
        file_path: filePath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
      toast.success("Supplier invoice added");
      setDialogOpen(false);
      setFile(null);
      setForm({ supplier_name: "", invoice_number: "", invoice_date: new Date().toISOString().split("T")[0], due_date: "", amount: "", description: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplier_invoices")
        .update({ status: "paid" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
      toast.success("Marked as paid");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (inv: any) => {
      if (inv.file_path) {
        await supabase.storage.from("supplier-invoices").remove([inv.file_path]);
      }
      const { error } = await supabase.from("supplier_invoices").delete().eq("id", inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
      toast.success("Invoice deleted");
    },
  });

  const viewFile = async (filePath: string) => {
    const { data } = await supabase.storage
      .from("supplier-invoices")
      .createSignedUrl(filePath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const totalPending = invoices.filter((i: any) => i.status === "pending").reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <Card className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-orange-600">{formatGBP(totalPending)}</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-green-600">{formatGBP(totalPaid)}</p>
          </Card>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add Invoice</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Supplier Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Supplier Name *</Label>
                <Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Invoice Number</Label>
                  <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
                </div>
                <div>
                  <Label>Amount *</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Invoice Date</Label>
                  <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>Upload Invoice PDF</Label>
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!form.supplier_name || !form.amount || createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save Invoice"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No supplier invoices yet</TableCell></TableRow>
              ) : (
                invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.supplier_name}</TableCell>
                    <TableCell>{inv.invoice_number || "—"}</TableCell>
                    <TableCell>{new Date(inv.invoice_date).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatGBP(Number(inv.amount))}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {inv.file_path && (
                          <Button variant="ghost" size="icon" onClick={() => viewFile(inv.file_path)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {inv.status === "pending" && (
                          <Button variant="ghost" size="icon" onClick={() => markPaidMutation.mutate(inv.id)}>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(inv)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
