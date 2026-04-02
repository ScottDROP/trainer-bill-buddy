import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainerPayRunsTab } from "@/components/TrainerPayRunsTab";
import { StaffPayRunsTab } from "@/components/StaffPayRunsTab";
import { SupplierInvoicesTab } from "@/components/SupplierInvoicesTab";

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
          <TabsTrigger value="suppliers">Supplier Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="trainers">
          <TrainerPayRunsTab />
        </TabsContent>
        <TabsContent value="staff">
          <StaffPayRunsTab />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierInvoicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
