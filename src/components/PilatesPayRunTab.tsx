import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Trash2, Eye, Download, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/currency";
import { downloadCSV } from "@/lib/xero-export";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function esc(v: any) {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildXeroCSV(invoices: any[], instructors: any[]): string {
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
  const rows: string[] = [header.join(",")];

  for (const inv of invoices) {
    const inst = instructors.find((i: any) => i.id === inv.instructor_id);
    const contactName = inst?.company_name?.trim() || inst?.full_name || inv.instructor_name;
    const hasVat = inst?.vat_number && inst.vat_number.trim() !== "";
    const taxType = hasVat ? "20% (VAT on Expenses)" : "No VAT";
    const invDate = new Date(inv.invoice_date);
    const dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

    const row = [
      contactName, inst?.email || "",
      "", "", "", "", "", "", "", "",
      inv.invoice_number || "", fmt(invDate), fmt(dueDate), inv.total_due,
      "", inv.description || "Pilates Sessions", 1, inv.amount,
      "324", taxType, inv.vat_amount || 0,
      inv.location ? "Location" : "", inv.location || "", "", "",
      "GBP",
    ];
    rows.push(row.map(esc).join(","));
  }
  return rows.join("\n");
}

function buildTellerooCSV(invoices: any[], instructors: any[]): string {
  const header = ["amount_pounds", "recipient_name", "account_no", "sort_code", "reference"];
  const rows: string[] = [header.join(",")];

  for (const inv of invoices) {
    const inst = instructors.find((i: any) => i.id === inv.instructor_id);
    if (!inst) continue;
    const row = [
      Number(inv.total_due).toFixed(2),
      inst.full_name,
      (inst.bank_account_number || "").replace(/\s/g, ""),
      (inst.bank_sort_code || "").replace(/[-\s]/g, ""),
      (inv.invoice_number || "").slice(0, 18),
    ];
    rows.push(row.map(esc).join(","));
  }
  return rows.join("\n");
}

function fuzzyMatch(name: string, instructors: any[]): any | null {
  const n = name.toLowerCase().trim();
  // Exact match on full_name or company_name
  let match = instructors.find((i: any) =>
    i.full_name.toLowerCase() === n || i.company_name?.toLowerCase() === n
  );
  if (match) return match;

  // First name match
  const firstName = n.split(/\s+/)[0];
  if (firstName.length >= 3) {
    const candidates = instructors.filter((i: any) =>
      i.full_name.toLowerCase().startsWith(firstName)
    );
    if (candidates.length === 1) return candidates[0];
  }

  // Partial match - name contains or is contained
  match = instructors.find((i: any) =>
    i.full_name.toLowerCase().includes(n) || n.includes(i.full_name.toLowerCase())
  );
  return match || null;
}

export function PilatesPayRunTab() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [year, setYear] = useState(now.getFullYear().toString());
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [instructorDialogOpen, setInstructorDialogOpen] = useState(false);
  const [instForm, setInstForm] = useState({ full_name: "", email: "", company_name: "", bank_account_number: "", bank_sort_code: "", vat_number: "" });

  const selectedMonth = parseInt(month);
  const selectedYear = parseInt(year);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["pilates-invoices", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pilates_invoices")
        .select("*")
        .eq("pay_run_month", selectedMonth)
        .eq("pay_run_year", selectedYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: instructors = [] } = useQuery({
    queryKey: ["pilates-instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pilates_instructors")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const createInstructorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pilates_instructors").insert({
        full_name: instForm.full_name,
        email: instForm.email,
        company_name: instForm.company_name,
        bank_account_number: instForm.bank_account_number,
        bank_sort_code: instForm.bank_sort_code,
        vat_number: instForm.vat_number,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pilates-instructors"] });
      toast.success("Instructor added");
      setInstructorDialogOpen(false);
      setInstForm({ full_name: "", email: "", company_name: "", bank_account_number: "", bank_sort_code: "", vat_number: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (inv: any) => {
      if (inv.file_path) {
        await supabase.storage.from("pilates-invoices").remove([inv.file_path]);
      }
      const { error } = await supabase.from("pilates_invoices").delete().eq("id", inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pilates-invoices"] });
      toast.success("Invoice removed");
    },
  });

  const linkInstructor = useMutation({
    mutationFn: async ({ invoiceId, instructorId }: { invoiceId: string; instructorId: string }) => {
      const { error } = await supabase.from("pilates_invoices")
        .update({ instructor_id: instructorId })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pilates-invoices"] });
      toast.success("Instructor linked");
    },
  });

  const processFiles = async (files: File[]) => {
    setUploading(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Processing ${i + 1}/${files.length}: ${file.name}`);

      try {
        const fileName = `${selectedYear}-${selectedMonth}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("pilates-invoices").upload(fileName, file);
        if (uploadError) throw uploadError;

        let extracted: any = {};
        try {
          const formData = new FormData();
          formData.append("file", file);
          const { data: funcData, error: funcError } = await supabase.functions.invoke("parse-pilates-invoice", { body: formData });
          if (!funcError && funcData?.success) {
            extracted = funcData.data;
          }
        } catch {
          console.warn("AI extraction failed for", file.name);
        }

        // Auto-match instructor
        let instructorId = null;
        if (extracted.instructor_name) {
          const match = fuzzyMatch(extracted.instructor_name, instructors);
          if (match) instructorId = match.id;
        }

        const { error: insertError } = await supabase.from("pilates_invoices").insert({
          instructor_id: instructorId,
          instructor_name: extracted.instructor_name || file.name.replace(/\.[^.]+$/, ""),
          invoice_number: extracted.invoice_number || "",
          invoice_date: extracted.invoice_date || new Date().toISOString().split("T")[0],
          amount: extracted.net_amount || extracted.total_amount || 0,
          vat_amount: extracted.vat_amount || 0,
          total_due: extracted.total_amount || extracted.net_amount || 0,
          description: extracted.description || "",
          location: extracted.location || "",
          file_path: fileName,
          pay_run_month: selectedMonth,
          pay_run_year: selectedYear,
        });
        if (insertError) throw insertError;
        successCount++;
      } catch (e: any) {
        console.error("Error processing", file.name, e);
        toast.error(`Failed: ${file.name} — ${e.message}`);
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["pilates-invoices"] });
      toast.success(`${successCount} invoice${successCount > 1 ? "s" : ""} uploaded`);
    }
    setUploading(false);
    setUploadProgress("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === "application/pdf" || f.name.endsWith(".pdf") ||
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || f.name.endsWith(".docx")
    );
    if (files.length) processFiles(files);
  }, [selectedMonth, selectedYear, instructors]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) processFiles(files);
    e.target.value = "";
  };

  const viewFile = async (filePath: string) => {
    const { data } = await supabase.storage.from("pilates-invoices").createSignedUrl(filePath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const exportXero = () => {
    const csv = buildXeroCSV(invoices, instructors);
    downloadCSV(csv, `pilates-xero-${MONTHS[selectedMonth - 1]}-${selectedYear}.csv`);
    toast.success("Xero CSV downloaded");
  };

  const exportTelleroo = () => {
    const unlinked = invoices.filter((i: any) => !i.instructor_id);
    if (unlinked.length > 0) {
      toast.error(`${unlinked.length} invoice(s) not linked — link them first for bank details`);
      return;
    }
    const csv = buildTellerooCSV(invoices, instructors);
    downloadCSV(csv, `pilates-telleroo-${MONTHS[selectedMonth - 1]}-${selectedYear}.csv`);
    toast.success("Telleroo CSV downloaded");
  };

  const total = invoices.reduce((s: number, i: any) => s + Number(i.total_due), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Card className="px-4 py-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{formatGBP(total)}</p>
          </Card>
        </div>
        <div className="flex gap-2">
          <Dialog open={instructorDialogOpen} onOpenChange={setInstructorDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><UserPlus className="h-4 w-4 mr-1" /> Add Instructor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Pilates Instructor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Full Name *</Label><Input value={instForm.full_name} onChange={e => setInstForm({ ...instForm, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input value={instForm.email} onChange={e => setInstForm({ ...instForm, email: e.target.value })} /></div>
                  <div><Label>Company Name</Label><Input value={instForm.company_name} onChange={e => setInstForm({ ...instForm, company_name: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Account Number</Label><Input value={instForm.bank_account_number} onChange={e => setInstForm({ ...instForm, bank_account_number: e.target.value })} /></div>
                  <div><Label>Sort Code</Label><Input value={instForm.bank_sort_code} onChange={e => setInstForm({ ...instForm, bank_sort_code: e.target.value })} /></div>
                </div>
                <div><Label>VAT Number</Label><Input value={instForm.vat_number} onChange={e => setInstForm({ ...instForm, vat_number: e.target.value })} /></div>
                <Button className="w-full" onClick={() => createInstructorMutation.mutate()} disabled={!instForm.full_name || createInstructorMutation.isPending}>
                  {createInstructorMutation.isPending ? "Saving..." : "Save Instructor"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={exportXero} disabled={invoices.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Xero
          </Button>
          <Button variant="outline" onClick={exportTelleroo} disabled={invoices.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Telleroo
          </Button>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{uploadProgress}</p>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">Drag & drop PDF or Word invoices here, or click to browse</p>
            <label>
              <Input type="file" accept=".pdf,.docx" multiple className="hidden" onChange={handleFileSelect} />
              <Button variant="secondary" asChild><span>Browse Files</span></Button>
            </label>
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No invoices for this period. Upload PDFs above.</TableCell></TableRow>
              ) : (
                invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.instructor_name}</TableCell>
                    <TableCell>{inv.invoice_number || "—"}</TableCell>
                    <TableCell>{new Date(inv.invoice_date).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{inv.description || "—"}</TableCell>
                    <TableCell>{inv.location || "—"}</TableCell>
                    <TableCell className="text-right">{formatGBP(Number(inv.amount))}</TableCell>
                    <TableCell className="text-right">{formatGBP(Number(inv.vat_amount))}</TableCell>
                    <TableCell className="text-right font-medium">{formatGBP(Number(inv.total_due))}</TableCell>
                    <TableCell>
                      {inv.instructor_id ? (
                        <Badge variant="default" className="text-xs">✓</Badge>
                      ) : (
                        <Select onValueChange={(val) => linkInstructor.mutate({ invoiceId: inv.id, instructorId: val })}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue placeholder="Link..." />
                          </SelectTrigger>
                          <SelectContent>
                            {instructors.map((inst: any) => (
                              <SelectItem key={inst.id} value={inst.id}>{inst.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {inv.file_path && (
                          <Button variant="ghost" size="icon" onClick={() => viewFile(inv.file_path)}>
                            <Eye className="h-4 w-4" />
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
