import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { formatMonth } from "@/lib/currency";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusColors: Record<string, string> = {
  uploaded: "bg-muted text-muted-foreground",
  matched: "bg-primary/10 text-primary",
  reviewed: "bg-warning/10 text-warning",
  invoiced: "bg-success/10 text-success",
};

export default function PayRuns() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editRun, setEditRun] = useState<any>(null);
  const [editMonth, setEditMonth] = useState("");
  const [editYear, setEditYear] = useState("");

  const { data: payRuns = [], isLoading } = useQuery({
    queryKey: ["pay-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_runs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete related data first
      const { data: rows } = await supabase
        .from("pay_run_rows")
        .select("id")
        .eq("pay_run_id", id);
      const rowIds = (rows || []).map((r: any) => r.id);

      if (rowIds.length > 0) {
        await supabase.from("invoices").delete().in("pay_run_row_id", rowIds);
        await supabase.from("pay_run_line_items").delete().in("pay_run_row_id", rowIds);
        await supabase.from("pay_run_rows").delete().eq("pay_run_id", id);
      }
      const { error } = await supabase.from("pay_runs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-runs"] });
      toast.success("Pay run deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editRun) return;
      const { error } = await supabase
        .from("pay_runs")
        .update({ month: parseInt(editMonth), year: parseInt(editYear) })
        .eq("id", editRun.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-runs"] });
      toast.success("Pay run updated");
      setEditRun(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (run: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditRun(run);
    setEditMonth(run.month.toString());
    setEditYear(run.year.toString());
  };

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pay Runs</h1>
        <p className="text-muted-foreground mt-1">View and manage all uploaded pay runs.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading...</div>
          ) : payRuns.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No pay runs yet. Upload a CSV to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payRuns.map((run: any) => (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/pay-runs/${run.id}/review`)}
                  >
                    <TableCell className="font-medium">
                      {formatMonth(run.month, run.year)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[run.status] || ""}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(run.created_at).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={(e) => openEdit(run, e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this pay run and all its data?")) {
                              deleteMutation.mutate(run.id);
                            }
                          }}
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

      <Dialog open={!!editRun} onOpenChange={(open) => { if (!open) setEditRun(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pay Run Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={editMonth} onValueChange={setEditMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={editYear} onValueChange={setEditYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRun(null)}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
