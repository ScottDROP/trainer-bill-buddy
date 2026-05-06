import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatGBP, formatMonth } from "@/lib/currency";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadTrainerPayParamsJSON } from "@/lib/trainer-pay-params-export";

interface TrainerFees {
  id: string;
  full_name: string;
  aliases?: string[] | null;
  email?: string | null;
  company_name?: string | null;
  guarantee_amount: number | null;
  guarantee_sessions: number | null;
  default_hourly_rate: number | null;
  management_fee: number | null;
  payment_terms?: string | null;
}

interface PayRunSummary {
  id: string;
  month: number;
  year: number;
  status: string;
}

interface PayRunRowWithTrainer {
  id: string;
  trainer_name_csv: string;
  matched_trainer_id: string | null;
  total_sessions: number;
  total_cost: number;
  hourly_rate_csv: number;
  trainer?: TrainerFees;
}

export default function TrainerPaymentsReport() {
  const [trainers, setTrainers] = useState<TrainerFees[]>([]);
  const [payRuns, setPayRuns] = useState<PayRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayRun, setSelectedPayRun] = useState<string | null>(null);
  const [payRunRows, setPayRunRows] = useState<PayRunRowWithTrainer[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("trainers")
        .select("id, full_name, aliases, email, company_name, guarantee_amount, guarantee_sessions, default_hourly_rate, management_fee, payment_terms")
        .order("full_name"),
      supabase
        .from("pay_runs")
        .select("id, month, year, status")
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
    ]).then(([trainerRes, payRunRes]) => {
      setTrainers(trainerRes.data ?? []);
      const runs = payRunRes.data ?? [];
      setPayRuns(runs);
      if (runs.length > 0) {
        setSelectedPayRun(runs[0].id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPayRun || trainers.length === 0) return;
    setLoadingRows(true);
    supabase
      .from("pay_run_rows")
      .select("id, trainer_name_csv, matched_trainer_id, total_sessions, total_cost, hourly_rate_csv")
      .eq("pay_run_id", selectedPayRun)
      .order("trainer_name_csv")
      .then(({ data }) => {
        const rows = (data ?? []).map((row) => ({
          ...row,
          trainer: trainers.find((t) => t.id === row.matched_trainer_id) ?? undefined,
        }));
        setPayRunRows(rows);
        setLoadingRows(false);
      });
  }, [selectedPayRun, trainers]);

  const withGuarantee = trainers.filter(
    (t) => (t.guarantee_amount && t.guarantee_amount > 0) || (t.guarantee_sessions && t.guarantee_sessions > 0)
  );
  const withMgmtFee = trainers.filter((t) => t.management_fee && t.management_fee > 0);

  const totalGuaranteeAmount = withGuarantee.reduce((sum, t) => sum + (t.guarantee_amount ?? 0), 0);
  const totalMgmtFees = withMgmtFee.reduce((sum, t) => sum + (t.management_fee ?? 0), 0);

  const payRunGuaranteeRows = payRunRows.filter(
    (r) => r.trainer && ((r.trainer.guarantee_amount && r.trainer.guarantee_amount > 0) || (r.trainer.guarantee_sessions && r.trainer.guarantee_sessions > 0))
  );
  const payRunMgmtRows = payRunRows.filter(
    (r) => r.trainer && r.trainer.management_fee && r.trainer.management_fee > 0
  );
  const getEffectiveRate = (r: PayRunRowWithTrainer) => Number(r.trainer?.default_hourly_rate) || Number(r.hourly_rate_csv) || 0;
  const getSessionEarnings = (r: PayRunRowWithTrainer) => Number(r.total_sessions) * getEffectiveRate(r);

  const payRunGuaranteeTopUps = payRunGuaranteeRows.map((r) => {
    const t = r.trainer!;
    const sessionEarnings = getSessionEarnings(r);
    let topUp = 0;
    if (t.guarantee_amount && t.guarantee_amount > 0 && sessionEarnings < t.guarantee_amount) {
      topUp = t.guarantee_amount - sessionEarnings;
    }
    if (t.guarantee_sessions && t.guarantee_sessions > 0 && r.total_sessions < t.guarantee_sessions) {
      const sessionTopUp = (t.guarantee_sessions - r.total_sessions) * getEffectiveRate(r);
      topUp = Math.max(topUp, sessionTopUp);
    }
    return { ...r, sessionEarnings, topUp };
  });

  const totalPayRunGuaranteeTopUp = payRunGuaranteeTopUps.reduce((s, r) => s + r.topUp, 0);
  const totalPayRunMgmtFees = payRunMgmtRows.reduce((s, r) => s + (r.trainer!.management_fee ?? 0), 0);

  if (loading) {
    return <p className="text-muted-foreground p-6">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => downloadTrainerPayParamsJSON(trainers)}
          disabled={trainers.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export trainer pay parameters
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {payRuns.map((pr) => (
            <TabsTrigger
              key={pr.id}
              value={pr.id}
              onClick={() => setSelectedPayRun(pr.id)}
            >
              {formatMonth(pr.month, pr.year)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Trainers with Guarantees</CardDescription>
                <CardTitle className="text-3xl">{withGuarantee.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Total monetary: {formatGBP(totalGuaranteeAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Trainers with Management Fee</CardDescription>
                <CardTitle className="text-3xl">{withMgmtFee.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Total fees: {formatGBP(totalMgmtFees)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Combined Monthly Exposure</CardDescription>
                <CardTitle className="text-3xl">{formatGBP(totalGuaranteeAmount + totalMgmtFees)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Max if all guarantees triggered</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Guarantees</CardTitle>
              <CardDescription>Trainers with monetary or session-based guarantees configured.</CardDescription>
            </CardHeader>
            <CardContent>
              {withGuarantee.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guarantees configured.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trainer</TableHead>
                      <TableHead className="text-right">Monetary Guarantee</TableHead>
                      <TableHead className="text-right">Session Guarantee</TableHead>
                      <TableHead className="text-right">Hourly Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withGuarantee.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Link to={`/trainers/${t.id}`} className="text-primary hover:underline font-medium">
                            {t.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.guarantee_amount && t.guarantee_amount > 0 ? (
                            <Badge variant="secondary">{formatGBP(t.guarantee_amount)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.guarantee_sessions && t.guarantee_sessions > 0 ? (
                            <Badge variant="outline">{t.guarantee_sessions} sessions</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.default_hourly_rate ? formatGBP(t.default_hourly_rate) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total ({withGuarantee.length} trainers)</TableCell>
                      <TableCell className="text-right">{formatGBP(totalGuaranteeAmount)}</TableCell>
                      <TableCell className="text-right">{withGuarantee.reduce((s, t) => s + (t.guarantee_sessions ?? 0), 0)} sessions</TableCell>
                      <TableCell className="text-right">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Management Fees</CardTitle>
              <CardDescription>Trainers with a management fee configured on their profile.</CardDescription>
            </CardHeader>
            <CardContent>
              {withMgmtFee.length === 0 ? (
                <p className="text-sm text-muted-foreground">No management fees configured.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trainer</TableHead>
                      <TableHead className="text-right">Management Fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withMgmtFee.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Link to={`/trainers/${t.id}`} className="text-primary hover:underline font-medium">
                            {t.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{formatGBP(t.management_fee!)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total ({withMgmtFee.length} trainers)</TableCell>
                      <TableCell className="text-right">{formatGBP(totalMgmtFees)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {payRuns.map((pr) => (
          <TabsContent key={pr.id} value={pr.id} className="space-y-4">
            {loadingRows && selectedPayRun === pr.id ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Guarantee Top-Ups</CardDescription>
                      <CardTitle className="text-3xl">{formatGBP(totalPayRunGuaranteeTopUp)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{payRunGuaranteeTopUps.filter((r) => r.topUp > 0).length} trainers topped up</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Management Fees</CardDescription>
                      <CardTitle className="text-3xl">{formatGBP(totalPayRunMgmtFees)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{payRunMgmtRows.length} trainers</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Additional Costs</CardDescription>
                      <CardTitle className="text-3xl">{formatGBP(totalPayRunGuaranteeTopUp + totalPayRunMgmtFees)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Above session payments</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Guarantee Breakdown</CardTitle>
                    <CardDescription>Trainers with guarantees and their actual sessions vs guaranteed amounts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {payRunGuaranteeRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No trainers with guarantees in this pay run.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainer</TableHead>
                            <TableHead className="text-right">Sessions</TableHead>
                            <TableHead className="text-right">Earned</TableHead>
                            <TableHead className="text-right">Guarantee</TableHead>
                            <TableHead className="text-right">Top-Up</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payRunGuaranteeTopUps.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <Link to={`/trainers/${r.matched_trainer_id}`} className="text-primary hover:underline font-medium">
                                  {r.trainer_name_csv}
                                </Link>
                              </TableCell>
                              <TableCell className="text-right">{r.total_sessions}</TableCell>
                              <TableCell className="text-right">{formatGBP(r.total_cost)}</TableCell>
                              <TableCell className="text-right">
                                {r.trainer!.guarantee_amount && r.trainer!.guarantee_amount > 0 && (
                                  <Badge variant="secondary">{formatGBP(r.trainer!.guarantee_amount)}</Badge>
                                )}
                                {r.trainer!.guarantee_sessions && r.trainer!.guarantee_sessions > 0 && (
                                  <Badge variant="outline" className="ml-1">{r.trainer!.guarantee_sessions} sess</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {r.topUp > 0 ? (
                                  <span className="text-destructive">{formatGBP(r.topUp)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-semibold bg-muted/50">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{payRunGuaranteeTopUps.reduce((s, r) => s + r.total_sessions, 0)}</TableCell>
                            <TableCell className="text-right">{formatGBP(payRunGuaranteeTopUps.reduce((s, r) => s + r.total_cost, 0))}</TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right">{formatGBP(totalPayRunGuaranteeTopUp)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Management Fees</CardTitle>
                    <CardDescription>Trainers with management fees applied in this pay run.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {payRunMgmtRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No management fees in this pay run.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainer</TableHead>
                            <TableHead className="text-right">Session Earnings</TableHead>
                            <TableHead className="text-right">Management Fee</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payRunMgmtRows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <Link to={`/trainers/${r.matched_trainer_id}`} className="text-primary hover:underline font-medium">
                                  {r.trainer_name_csv}
                                </Link>
                              </TableCell>
                              <TableCell className="text-right">{formatGBP(r.total_cost)}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{formatGBP(r.trainer!.management_fee!)}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-semibold bg-muted/50">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{formatGBP(payRunMgmtRows.reduce((s, r) => s + r.total_cost, 0))}</TableCell>
                            <TableCell className="text-right">{formatGBP(totalPayRunMgmtFees)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
