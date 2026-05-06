import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrainerLink } from "@/components/TrainerLink";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatGBP, formatMonth } from "@/lib/currency";
import { AlertTriangle, CheckCircle, HelpCircle, ArrowRight, FileText } from "lucide-react";
import { useState } from "react";

export default function PayRunReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const { data: payRun } = useQuery({
    queryKey: ["pay-run", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_runs")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["pay-run-rows", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_run_rows")
        .select("*")
        .eq("pay_run_id", id!)
        .order("trainer_name_csv");
      if (error) throw error;
      return data;
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("*").order("full_name");
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

  const matchMutation = useMutation({
    mutationFn: async ({ rowId, trainerId }: { rowId: string; trainerId: string }) => {
      const row = rows.find((r: any) => r.id === rowId);
      const trainer = trainers.find((t: any) => t.id === trainerId);
      const effectiveRate = Number((trainer as any)?.default_hourly_rate) || Number(row?.hourly_rate_csv) || 0;
      const rowLineItems = allLineItems.filter((li: any) => li.pay_run_row_id === rowId);
      const correctedTotal = rowLineItems.reduce((sum: number, li: any) => sum + Number(li.sessions) * effectiveRate, 0);

      for (const li of rowLineItems) {
        const { error: liError } = await supabase
          .from("pay_run_line_items")
          .update({ rate: effectiveRate, amount: Number(li.sessions) * effectiveRate })
          .eq("id", li.id);
        if (liError) throw liError;
      }

      const { error } = await supabase
        .from("pay_run_rows")
        .update({
          matched_trainer_id: trainerId,
          match_status: "manual" as any,
          hourly_rate_csv: effectiveRate,
          total_cost: correctedTotal,
        })
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run-rows", id] });
      queryClient.invalidateQueries({ queryKey: ["pay-run-line-items", id] });
      toast.success("Trainer matched");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const unmatched = rows.filter((r: any) => !r.matched_trainer_id);
      if (unmatched.length > 0) throw new Error(`${unmatched.length} trainers still unmatched`);

      for (const row of rows) {
        const trainer = trainers.find((t: any) => t.id === row.matched_trainer_id);
        const effectiveRate = Number((trainer as any)?.default_hourly_rate) || Number(row.hourly_rate_csv) || 0;
        const { data: freshLineItems, error: fetchError } = await supabase
          .from("pay_run_line_items")
          .select("*")
          .eq("pay_run_row_id", row.id);
        if (fetchError) throw fetchError;

        const correctedTotal = (freshLineItems ?? []).reduce((sum: number, li: any) => sum + Number(li.sessions) * effectiveRate, 0);
        for (const li of freshLineItems ?? []) {
          const { error: liError } = await supabase
            .from("pay_run_line_items")
            .update({ rate: effectiveRate, amount: Number(li.sessions) * effectiveRate })
            .eq("id", li.id);
          if (liError) throw liError;
        }

        const { error: rowError } = await supabase
          .from("pay_run_rows")
          .update({ hourly_rate_csv: effectiveRate, total_cost: correctedTotal })
          .eq("id", row.id);
        if (rowError) throw rowError;
      }

      const { error } = await supabase
        .from("pay_runs")
        .update({ status: "reviewed" as any })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run", id] });
      toast.success("Pay run approved");
      navigate(`/pay-runs/${id}/invoices`);
    },
    onError: (e) => toast.error(e.message),
  });

  const matchIcon = (status: string) => {
    switch (status) {
      case "auto_matched":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "alias_matched":
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case "manual":
        return <CheckCircle className="h-4 w-4 text-warning" />;
      default:
        return <HelpCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const allMatched = rows.every((r: any) => r.matched_trainer_id);

  // Selected row detail
  const selectedRow = rows.find((r: any) => r.id === selectedRowId);
  const selectedTrainer = selectedRow
    ? trainers.find((t: any) => t.id === selectedRow.matched_trainer_id)
    : null;
  const selectedLineItems = selectedRow
    ? allLineItems.filter((li: any) => li.pay_run_row_id === selectedRow.id)
    : [];

  const getEffectiveRate = (row: any) => {
    const trainer = trainers.find((t: any) => t.id === row?.matched_trainer_id);
    return Number(trainer?.default_hourly_rate) || Number(row?.hourly_rate_csv) || 0;
  };

  const getEffectiveTotal = (row: any) => Number(row?.total_sessions || 0) * getEffectiveRate(row);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Match & Review</h1>
          {payRun && (
            <p className="text-muted-foreground mt-1">
              {formatMonth(payRun.month, payRun.year)} — {rows.length} trainers
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {payRun?.status === "invoiced" || payRun?.status === "reviewed" ? (
            <Button onClick={() => navigate(`/pay-runs/${id}/invoices`)}>
              <FileText className="mr-2 h-4 w-4" />
              View Invoices
            </Button>
          ) : null}
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={!allMatched || approveMutation.isPending}
          >
            Approve & Generate Invoices
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="h-3 w-3 text-success" /> Auto
        </Badge>
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="h-3 w-3 text-primary" /> Alias
        </Badge>
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="h-3 w-3 text-warning" /> Manual
        </Badge>
        <Badge variant="outline" className="gap-1">
          <HelpCircle className="h-3 w-3 text-destructive" /> Unmatched
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>CSV Name</TableHead>
                  <TableHead>Matched Trainer</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    <TableCell>{matchIcon(row.match_status)}</TableCell>
                    <TableCell className="font-medium">{row.trainer_name_csv}</TableCell>
                    <TableCell>
                      {row.match_status === "unmatched" || !row.matched_trainer_id ? (
                        <Select
                          value={row.matched_trainer_id || ""}
                          onValueChange={(val) =>
                            matchMutation.mutate({ rowId: row.id, trainerId: val })
                          }
                        >
                          <SelectTrigger
                            className="w-48"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue placeholder="Select trainer..." />
                          </SelectTrigger>
                          <SelectContent>
                            {trainers.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <TrainerLink
                          trainerId={row.matched_trainer_id}
                          name={trainers.find((t: any) => t.id === row.matched_trainer_id)?.full_name || "—"}
                        />
                      )}
                    </TableCell>
                    <TableCell>{formatGBP(row.hourly_rate_csv)}/hr</TableCell>
                    <TableCell>{row.total_sessions}</TableCell>
                    <TableCell>{formatGBP(row.total_cost)}</TableCell>
                    <TableCell>
                      {row.validation_warnings && row.validation_warnings.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {row.validation_warnings.map((w: string, i: number) => (
                            <span key={i} className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRowId} onOpenChange={(open) => { if (!open) setSelectedRowId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedRow?.trainer_name_csv} — Breakdown
            </DialogTitle>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-4">
              {selectedTrainer && (
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Matched to:</span> <TrainerLink trainerId={selectedTrainer.id} name={selectedTrainer.full_name} /></p>
                  <p><span className="text-muted-foreground">Email:</span> {selectedTrainer.email || "—"}</p>
                  <p><span className="text-muted-foreground">Default rate:</span> {formatGBP(selectedTrainer.default_hourly_rate || 0)}/hr</p>
                </div>
              )}

              <Separator />

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

              <Separator />

              <div className="flex justify-between text-sm font-medium">
                <span>Total: {selectedRow.total_sessions} sessions</span>
                <span>{formatGBP(selectedRow.total_cost)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
