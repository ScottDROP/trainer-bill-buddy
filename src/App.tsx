import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Locations from "@/pages/Locations";
import Trainers from "@/pages/Trainers";
import UploadPayRun from "@/pages/UploadPayRun";
import PayRuns from "@/pages/PayRuns";
import PayRunReview from "@/pages/PayRunReview";
import InvoicePreview from "@/pages/InvoicePreview";
import TrainerDetail from "@/pages/TrainerDetail";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) return <Auth />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/locations" element={<Locations />} />
              <Route path="/trainers" element={<Trainers />} />
              <Route path="/trainers/:id" element={<TrainerDetail />} />
              <Route path="/upload" element={<UploadPayRun />} />
              <Route path="/pay-runs" element={<PayRuns />} />
              <Route path="/pay-runs/:id/review" element={<PayRunReview />} />
              <Route path="/pay-runs/:id/invoices" element={<InvoicePreview />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
