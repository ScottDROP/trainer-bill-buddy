import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatGBP } from "@/lib/currency";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface TrainerFees {
  id: string;
  full_name: string;
  guarantee_amount: number | null;
  guarantee_sessions: number | null;
  default_hourly_rate: number | null;
  management_fee: number | null;
}

export default function Reports() {
  const [trainers, setTrainers] = useState<TrainerFees[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("trainers")
      .select("id, full_name, guarantee_amount, guarantee_sessions, default_hourly_rate, management_fee")
      .order("full_name")
      .then(({ data }) => {
        setTrainers(data ?? []);
        setLoading(false);
      });
  }, []);

  const withGuarantee = trainers.filter(
    (t) => (t.guarantee_amount && t.guarantee_amount > 0) || (t.guarantee_sessions && t.guarantee_sessions > 0)
  );
  const withMgmtFee = trainers.filter((t) => t.management_fee && t.management_fee > 0);

  const totalGuaranteeAmount = withGuarantee.reduce((sum, t) => sum + (t.guarantee_amount ?? 0), 0);
  const totalMgmtFees = withMgmtFee.reduce((sum, t) => sum + (t.management_fee ?? 0), 0);

  if (loading) {
    return <p className="text-muted-foreground p-6">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fee & Guarantee Report</h1>
        <p className="text-muted-foreground">Overview of configured guarantees and management fees across all trainers.</p>
      </div>

      {/* Summary cards */}
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

      {/* Guarantees table */}
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
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Management fees table */}
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
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
