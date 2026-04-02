import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainerPayRunsTab } from "@/components/TrainerPayRunsTab";
import { StaffPayRunsTab } from "@/components/StaffPayRunsTab";

export default function PayRuns() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pay Runs</h1>
        <p className="text-muted-foreground mt-1">View and manage all uploaded pay runs.</p>
      </div>

      <Tabs defaultValue="trainers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trainers">Trainers</TabsTrigger>
          <TabsTrigger value="staff">Full-Time Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="trainers">
          <TrainerPayRunsTab />
        </TabsContent>
        <TabsContent value="staff">
          <StaffPayRunsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
