import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatGBP } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MonthData {
  label: string;
  month: number;
  year: number;
  totalAmount: number;
  realHours: number;
  guaranteeTopUps: number;
  managementFees: number;
  vat: number;
  totalSessions: number;
  trainerCount: number;
  guaranteeTrainerCount: number;
  mgmtFeeTrainerCount: number;
}

const chartConfig = {
  realHours: { label: "Real Hours", color: "hsl(var(--primary))" },
  guaranteeTopUps: { label: "Guarantee Top-ups", color: "hsl(var(--chart-2))" },
  managementFees: { label: "Management Fees", color: "hsl(var(--chart-3))" },
  vat: { label: "VAT", color: "hsl(var(--chart-4))" },
  totalAmount: { label: "Total", color: "hsl(var(--chart-5))" },
};

export default function Analytics() {
  const { data: monthData = [], isLoading } = useQuery({
    queryKey: ["analytics-month-on-month"],
    queryFn: async () => {
      // Get all pay runs ordered by date
      const { data: payRuns } = await supabase
        .from("pay_runs")
        .select("*")
        .order("year", { ascending: true })
        .order("month", { ascending: true });

      if (!payRuns?.length) return [];

      // Get all rows with trainer info
      const { data: allRows } = await supabase
        .from("pay_run_rows")
        .select("*, trainers(guarantee_amount, guarantee_sessions, default_hourly_rate, management_fee, full_name)")
        .in("pay_run_id", payRuns.map((p) => p.id));

      // Get all invoices for VAT
      const { data: allInvoices } = await supabase
        .from("invoices")
        .select("*, pay_run_rows!inner(pay_run_id)")
        .in("pay_run_rows.pay_run_id", payRuns.map((p) => p.id));

      const months: MonthData[] = payRuns.map((pr) => {
        const rows = (allRows || []).filter((r) => r.pay_run_id === pr.id);
        const invoices = (allInvoices || []).filter(
          (inv: any) => inv.pay_run_rows?.pay_run_id === pr.id
        );

        let realHours = 0;
        let guaranteeTopUps = 0;
        let managementFees = 0;
        let guaranteeTrainerCount = 0;
        let mgmtFeeTrainerCount = 0;

        rows.forEach((row) => {
          const trainer = row.trainers as any;
          if (!trainer) {
            realHours += Number(row.total_cost);
            return;
          }

          const sessions = Number(row.total_sessions);
          const rate = Number(row.hourly_rate_csv) || Number(trainer.default_hourly_rate) || 0;
          const guaranteeSessions = Number(trainer.guarantee_sessions) || 0;
          const guaranteeAmount = Number(trainer.guarantee_amount) || 0;
          const mgmtFee = Number(trainer.management_fee) || 0;

          // Calculate guarantee top-up
          let topUp = 0;
          if (guaranteeSessions > 0 && sessions < guaranteeSessions) {
            topUp = (guaranteeSessions - sessions) * rate;
          } else if (guaranteeAmount > 0) {
            const earned = sessions * rate;
            if (earned < guaranteeAmount) topUp = guaranteeAmount - earned;
          }

          realHours += Number(row.total_cost);
          if (topUp > 0) {
            guaranteeTopUps += topUp;
            guaranteeTrainerCount++;
          }
          if (mgmtFee > 0) {
            managementFees += mgmtFee;
            mgmtFeeTrainerCount++;
          }
        });

        const vat = invoices.reduce((sum: number, inv: any) => sum + Number(inv.vat_amount), 0);
        const totalAmount = realHours + guaranteeTopUps + managementFees + vat;

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        return {
          label: `${monthNames[pr.month - 1]} ${pr.year}`,
          month: pr.month,
          year: pr.year,
          totalAmount,
          realHours,
          guaranteeTopUps,
          managementFees,
          vat,
          totalSessions: rows.reduce((s, r) => s + Number(r.total_sessions), 0),
          trainerCount: rows.length,
          guaranteeTrainerCount,
          mgmtFeeTrainerCount,
        };
      });

      return months;
    },
  });

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const ChangeIndicator = ({ current, previous }: { current: number; previous: number }) => {
    const change = getChange(current, previous);
    if (Math.abs(change) < 0.5) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (change > 0)
      return (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <ArrowUpRight className="h-3 w-3" />
          +{change.toFixed(1)}%
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <ArrowDownRight className="h-3 w-3" />
        {change.toFixed(1)}%
      </span>
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading analytics...</div>;
  }

  if (monthData.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">No pay run data available yet. Upload pay runs to see analytics.</p>
      </div>
    );
  }

  const latest = monthData[monthData.length - 1];
  const prev = monthData.length > 1 ? monthData[monthData.length - 2] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Month-on-month pay run analysis and trends</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spend (Latest)</CardDescription>
            <CardTitle className="text-2xl">{formatGBP(latest.totalAmount)}</CardTitle>
          </CardHeader>
          <CardContent>
            {prev && <ChangeIndicator current={latest.totalAmount} previous={prev.totalAmount} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sessions</CardDescription>
            <CardTitle className="text-2xl">{latest.totalSessions.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            {prev && <ChangeIndicator current={latest.totalSessions} previous={prev.totalSessions} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Guarantee Exposure</CardDescription>
            <CardTitle className="text-2xl">{formatGBP(latest.guaranteeTopUps)}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">{latest.guaranteeTrainerCount} trainers triggered</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Management Fees</CardDescription>
            <CardTitle className="text-2xl">{formatGBP(latest.managementFees)}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">{latest.mgmtFeeTrainerCount} trainers</span>
          </CardContent>
        </Card>
      </div>

      {/* Stacked bar chart - breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cost Breakdown</CardTitle>
          <CardDescription>Stacked view of real hours, guarantee top-ups, management fees, and VAT</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <BarChart data={monthData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" className="text-xs" />
              <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} className="text-xs" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        realHours: "Real Hours",
                        guaranteeTopUps: "Guarantee Top-ups",
                        managementFees: "Management Fees",
                        vat: "VAT",
                      };
                      return (
                        <span>
                          {labels[name as string] || name}: {formatGBP(Number(value))}
                        </span>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="realHours" stackId="a" fill="var(--color-realHours)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="guaranteeTopUps" stackId="a" fill="var(--color-guaranteeTopUps)" />
              <Bar dataKey="managementFees" stackId="a" fill="var(--color-managementFees)" />
              <Bar dataKey="vat" stackId="a" fill="var(--color-vat)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Line chart - totals trend */}
      <Card>
        <CardHeader>
          <CardTitle>Total Spend Trend</CardTitle>
          <CardDescription>Month-on-month total pay run amount</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart data={monthData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" className="text-xs" />
              <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} className="text-xs" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatGBP(Number(value))}
                  />
                }
              />
              <Line type="monotone" dataKey="totalAmount" stroke="var(--color-totalAmount)" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="realHours" stroke="var(--color-realHours)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="guaranteeTopUps" stroke="var(--color-guaranteeTopUps)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle>Month-on-Month Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Trainers</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Real Hours</TableHead>
                <TableHead className="text-right">Guarantees</TableHead>
                <TableHead className="text-right">Mgmt Fees</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">MoM Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthData.map((m, i) => {
                const prevMonth = i > 0 ? monthData[i - 1] : null;
                const change = prevMonth ? getChange(m.totalAmount, prevMonth.totalAmount) : null;
                return (
                  <TableRow key={m.label}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right">{m.trainerCount}</TableCell>
                    <TableCell className="text-right">{m.totalSessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatGBP(m.realHours)}</TableCell>
                    <TableCell className="text-right">{formatGBP(m.guaranteeTopUps)}</TableCell>
                    <TableCell className="text-right">{formatGBP(m.managementFees)}</TableCell>
                    <TableCell className="text-right">{formatGBP(m.vat)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatGBP(m.totalAmount)}</TableCell>
                    <TableCell className="text-right">
                      {change !== null ? (
                        <Badge variant={change > 0 ? "destructive" : change < 0 ? "default" : "secondary"}>
                          {change > 0 ? "+" : ""}
                          {change.toFixed(1)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
