import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatGBP, formatMonth } from "@/lib/currency";
import { AlertTriangle, CheckCircle, HelpCircle, ArrowRight } from "lucide-react";

export default function PayRunReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const matchMutation = useMutation({
    mutationFn: async ({ rowId, trainerId }: { rowId: string; trainerId: string }) => {
      const { error } = await supabase
        .from("pay_run_rows")
        .update({
          matched_trainer_id: trainerId,
          match_status: "manual" as any,
        })
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run-rows", id] });
      toast.success("Trainer matched");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const unmatched = rows.filter((r: any) => !r.matched_trainer_id);
      if (unmatched.length > 0) throw new Error(`${unmatched.length} trainers still unmatched`);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Match & Review
          </h1>
          {payRun && (
            <p className="text-muted-foreground mt-1">
              {formatMonth(payRun.month, payRun.year)} — {rows.length} trainers
            </p>
          )}
        </div>
        <div className="flex gap-2">
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
                  <TableRow key={row.id}>
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
                          <SelectTrigger className="w-48">
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
                        <span className="text-muted-foreground">
                          {trainers.find((t: any) => t.id === row.matched_trainer_id)?.full_name || "—"}
                        </span>
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
    </div>
  );
}
