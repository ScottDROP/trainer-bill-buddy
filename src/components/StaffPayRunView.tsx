import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatGBP } from "@/lib/currency";
import { Users } from "lucide-react";
import { StaffPayRunUpload } from "./StaffPayRunUpload";

interface StaffPayRunViewProps {
  payRunId: string;
}

export function StaffPayRunView({ payRunId }: StaffPayRunViewProps) {
  const { data: staffPayRun, isLoading } = useQuery({
    queryKey: ["staff-pay-run", payRunId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_pay_runs")
        .select("*")
        .eq("pay_run_id", payRunId)
        .maybeSingle();
      return data;
    },
  });

  const { data: staffRows = [] } = useQuery({
    queryKey: ["staff-pay-run-rows", staffPayRun?.id],
    queryFn: async () => {
      if (!staffPayRun?.id) return [];
      const { data } = await supabase
        .from("staff_pay_run_rows")
        .select("*")
        .eq("staff_pay_run_id", staffPayRun.id)
        .order("employee_name");
      return data ?? [];
    },
    enabled: !!staffPayRun?.id,
  });

  if (isLoading) {
    return <div className="text-muted-foreground p-4">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <StaffPayRunUpload payRunId={payRunId} />

      {staffPayRun && staffRows.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Gross Pay", value: staffPayRun.total_gross },
              { label: "Tax", value: staffPayRun.total_tax },
              { label: "NI (Total)", value: staffPayRun.total_ni },
              { label: "Pension", value: staffPayRun.total_pension },
              { label: "Net Pay", value: staffPayRun.total_net, highlight: true },
            ].map((card) => (
              <Card key={card.label} className={card.highlight ? "border-primary" : ""}>
                <CardContent className="p-4 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${card.highlight ? "text-primary" : "text-muted-foreground"}`}>
                    {card.label}
                  </p>
                  <p className={`text-lg font-bold mt-1 ${card.highlight ? "text-primary" : "text-foreground"}`}>
                    {formatGBP(card.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Employee Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                {staffPayRun.employee_count} Full-Time Staff
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Ref</TableHead>
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
                      <TableCell className="text-muted-foreground text-xs">{row.employee_number || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.tax_code || "—"}</TableCell>
                      <TableCell className="text-right">{formatGBP(row.gross_pay)}</TableCell>
                      <TableCell className="text-right">{formatGBP(row.tax)}</TableCell>
                      <TableCell className="text-right">{formatGBP(row.ni_employee)}</TableCell>
                      <TableCell className="text-right">{formatGBP(row.ni_employer)}</TableCell>
                      <TableCell className="text-right">{formatGBP(row.pension)}</TableCell>
                      <TableCell className="text-right font-medium">{formatGBP(row.net_pay)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{formatGBP(staffPayRun.total_gross)}</TableCell>
                    <TableCell className="text-right">{formatGBP(staffPayRun.total_tax)}</TableCell>
                    <TableCell className="text-right">
                      {formatGBP(staffRows.reduce((s: number, r: any) => s + Number(r.ni_employee), 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatGBP(staffRows.reduce((s: number, r: any) => s + Number(r.ni_employer), 0))}
                    </TableCell>
                    <TableCell className="text-right">{formatGBP(staffPayRun.total_pension)}</TableCell>
                    <TableCell className="text-right">{formatGBP(staffPayRun.total_net)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
