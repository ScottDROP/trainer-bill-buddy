import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, MapPin, FileText, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatMonth } from "@/lib/currency";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TrainerPaymentsReport from "@/components/TrainerPaymentsReport";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: trainerCount = 0 } = useQuery({
    queryKey: ["trainers-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("trainers")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: locationCount = 0 } = useQuery({
    queryKey: ["locations-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("locations")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: recentPayRuns = [] } = useQuery({
    queryKey: ["recent-pay-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pay_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: invoiceCount = 0 } = useQuery({
    queryKey: ["invoices-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const stats = [
    { label: "Trainers", value: trainerCount, icon: Users, color: "text-primary" },
    { label: "Locations", value: locationCount, icon: MapPin, color: "text-primary" },
    { label: "Pay Runs", value: recentPayRuns.length, icon: FileText, color: "text-primary" },
    { label: "Invoices", value: invoiceCount, icon: FileText, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">DropGym invoicing overview</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trainer-payments">Trainer Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button onClick={() => navigate("/upload")} className="justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Pay Run
                </Button>
                <Button variant="outline" onClick={() => navigate("/trainers")} className="justify-start">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Trainers
                </Button>
                <Button variant="outline" onClick={() => navigate("/locations")} className="justify-start">
                  <MapPin className="mr-2 h-4 w-4" />
                  Manage Locations
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Pay Runs</CardTitle>
              </CardHeader>
              <CardContent>
                {recentPayRuns.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No pay runs yet. Upload a CSV to get started.</p>
                ) : (
                  <div className="space-y-3">
                    {recentPayRuns.map((run: any) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/pay-runs/${run.id}/review`)}
                      >
                        <div>
                          <p className="font-medium text-sm">{formatMonth(run.month, run.year)}</p>
                          <p className="text-xs text-muted-foreground capitalize">{run.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trainer-payments">
          <TrainerPaymentsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
