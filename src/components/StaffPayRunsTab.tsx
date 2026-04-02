import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth, formatGBP } from "@/lib/currency";
import { toast } from "sonner";
import { Trash2, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { StaffPayRunUpload } from "./StaffPayRunUpload";

export function StaffPayRunsTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: staffPayRuns = [], isLoading } = useQuery({
    queryKey: ["all-staff-pay-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_pay_runs")
        .select("*, pay_runs(month, year)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payRuns = [] } = useQuery({
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

  const { data: staffRows = [] } = useQuery({
    queryKey: ["staff-pay-run-rows-expanded", expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const { data } = await supabase
        .from("staff_pay_run_rows")
        .select("*")
        .eq("staff_pay_run_id", expandedId)
        .order("employee_name");
      return data ?? [];
    },
    enabled: !!expandedId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("staff_pay_run_rows").delete().eq("staff_pay_run_id", id);
      const { error } = await supabase.from("staff_pay_runs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-staff-pay-runs"] });
      toast.success("Staff pay run deleted");
      setExpandedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Find pay runs that don't have a staff pay run yet
  const payRunsWithoutStaff = payRuns.filter(
    (pr: any) => !staffPayRuns.some((spr: any) => spr.pay_run_id === pr.id)
  );

  return (
    <div className="space-y-6">
      {/* Upload for a pay run that doesn't have staff data yet */}
      {payRunsWithoutStaff.length > 0 && (
        <UploadForPayRun payRuns={payRunsWithoutStaff} />
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-muted-foreground">Loading...</div>
          ) : staffPayRuns.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No staff pay runs yet. Upload a payroll PDF to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffPayRuns.map((spr: any) => {
                  const isExpanded = expandedId === spr.id;
                  const payRun = spr.pay_runs;
                  return (
                    <>
                      <TableRow
                        key={spr.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isExpanded ? null : spr.id)}
                      >
                        <TableCell className="font-medium">
                          {payRun ? formatMonth(payRun.month, payRun.year) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1">
                            <Users className="h-3 w-3" />
                            {spr.employee_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatGBP(spr.total_gross)}</TableCell>
                        <TableCell className="text-right font-medium">{formatGBP(spr.total_net)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(spr.created_at).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this staff pay run?")) {
                                  deleteMutation.mutate(spr.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${spr.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                                {[
                                  { label: "Gross Pay", value: spr.total_gross },
                                  { label: "Tax", value: spr.total_tax },
                                  { label: "NI (Total)", value: spr.total_ni },
                                  { label: "Pension", value: spr.total_pension },
                                  { label: "Net Pay", value: spr.total_net, highlight: true },
                                ].map((card) => (
                                  <Card key={card.label} className={card.highlight ? "border-primary" : ""}>
                                    <CardContent className="p-3 text-center">
                                      <p className={`text-xs font-semibold uppercase tracking-wider ${card.highlight ? "text-primary" : "text-muted-foreground"}`}>
                                        {card.label}
                                      </p>
                                      <p className={`text-sm font-bold mt-1 ${card.highlight ? "text-primary" : "text-foreground"}`}>
                                        {formatGBP(card.value)}
                                      </p>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Tax Code</TableHead>
                                    <TableHead className="text-right">Gross</TableHead>
                                    <TableHead className="text-right">Tax</TableHead>
                                    <TableHead className="text-right">NI (Emp)</TableHead>
                                    <TableHead className="text-right">NI (Er)</TableHead>
                                    <TableHead className="text-right">Pension</TableHead>
                                    <TableHead className="text-right">Net Pay</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {staffRows.map((row: any) => (
                                    <TableRow key={row.id}>
                                      <TableCell className="font-medium">{row.employee_name}</TableCell>
                                      <TableCell className="text-muted-foreground text-xs">{row.tax_code || "—"}</TableCell>
                                      <TableCell className="text-right">{formatGBP(row.gross_pay)}</TableCell>
                                      <TableCell className="text-right">{formatGBP(row.tax)}</TableCell>
                                      <TableCell className="text-right">{formatGBP(row.ni_employee)}</TableCell>
                                      <TableCell className="text-right">{formatGBP(row.ni_employer)}</TableCell>
                                      <TableCell className="text-right">{formatGBP(row.pension)}</TableCell>
                                      <TableCell className="text-right font-medium">{formatGBP(row.net_pay)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadForPayRun({ payRuns }: { payRuns: any[] }) {
  const [selectedPayRunId, setSelectedPayRunId] = useState<string>(payRuns[0]?.id || "");

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Select Pay Run Period</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            value={selectedPayRunId}
            onChange={(e) => setSelectedPayRunId(e.target.value)}
          >
            {payRuns.map((pr: any) => (
              <option key={pr.id} value={pr.id}>
                {formatMonth(pr.month, pr.year)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectedPayRunId && <StaffPayRunUpload payRunId={selectedPayRunId} />}
    </div>
  );
}
