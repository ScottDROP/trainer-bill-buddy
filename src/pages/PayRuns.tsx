import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { formatMonth } from "@/lib/currency";

const statusColors: Record<string, string> = {
  uploaded: "bg-muted text-muted-foreground",
  matched: "bg-primary/10 text-primary",
  reviewed: "bg-warning/10 text-warning",
  invoiced: "bg-success/10 text-success",
};

export default function PayRuns() {
  const navigate = useNavigate();

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
