import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrainerLink } from "@/components/TrainerLink";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Trash2, Pencil, Search, X } from "lucide-react";
import { formatGBP } from "@/lib/currency";

const emptyForm = {
  full_name: "",
  aliases: "",
  email: "",
  default_hourly_rate: "",
  payment_terms: "Net 30",
  bank_account_number: "",
  bank_sort_code: "",
};

export default function Trainers() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);

  const { data: trainers = [], isLoading } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = trainers.filter(
    (t: any) =>
      t.full_name.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase()) ||
      t.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name,
        aliases: form.aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        email: form.email,
        default_hourly_rate: parseFloat(form.default_hourly_rate) || 0,
        payment_terms: form.payment_terms,
        bank_account_number: form.bank_account_number,
        bank_sort_code: form.bank_sort_code,
      };
      if (editId) {
        const { error } = await supabase.from("trainers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("trainers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success(editId ? "Trainer updated" : "Trainer added");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trainers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Trainer deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
    setDialogOpen(false);
  };

  const openEdit = (t: any) => {
    setForm({
      full_name: t.full_name,
      aliases: (t.aliases || []).join(", "),
      email: t.email || "",
      default_hourly_rate: t.default_hourly_rate?.toString() || "",
      payment_terms: t.payment_terms || "Net 30",
      bank_account_number: t.bank_account_number || "",
      bank_sort_code: t.bank_sort_code || "",
    });
    setEditId(t.id);
    setDialogOpen(true);
  };

  const isProfileComplete = (t: any) =>
    t.full_name && t.email && t.bank_account_number;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trainers</h1>
          <p className="text-muted-foreground mt-1">
            Manage trainer profiles and invoicing details.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Trainer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Trainer" : "Add Trainer"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Aliases</Label>
                <Input
                  value={form.aliases}
                  onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                  placeholder="J. Smith, Johnny Smith"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated alternative names for CSV matching.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Hourly Rate (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.default_hourly_rate}
                    onChange={(e) => setForm((f) => ({ ...f, default_hourly_rate: e.target.value }))}
                    placeholder="25.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Input
                    value={form.payment_terms}
                    onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
                    placeholder="Net 30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input
                    value={form.bank_account_number}
                    onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value }))}
                    placeholder="12345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Code</Label>
                  <Input
                    value={form.bank_sort_code}
                    onChange={(e) => setForm((f) => ({ ...f, bank_sort_code: e.target.value }))}
                    placeholder="00-00-00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trainers..."
          className="pl-10"
        />
        {search && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => setSearch("")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              {search ? "No trainers match your search." : "No trainers yet. Add your first trainer."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>Name</TableHead>
                   <TableHead>Email</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          <TrainerLink trainerId={t.id} name={t.full_name} />
                        </p>
                        {t.aliases && t.aliases.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            aka: {t.aliases.join(", ")}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.email || "—"}
                    </TableCell>
                    <TableCell>{formatGBP(t.default_hourly_rate || 0)}/hr</TableCell>
                    <TableCell>
                      {isProfileComplete(t) ? (
                        <Badge variant="default" className="bg-success text-success-foreground">
                          Complete
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-warning">
                          Incomplete
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
