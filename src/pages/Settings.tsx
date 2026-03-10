import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    address: "",
    vat_number: "",
    company_number: "",
    email: "",
    bank_details: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || "",
        address: settings.address || "",
        vat_number: settings.vat_number || "",
        company_number: settings.company_number || "",
        email: settings.email || "",
        bank_details: settings.bank_details || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (settings?.id) {
        const { error } = await supabase
          .from("company_settings")
          .update(form)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Company Settings</h1>
        <p className="text-muted-foreground mt-1">
          DropGym details that appear on all invoices as the sender.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>These details will appear on every generated invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="DropGym Ltd"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Gym Street&#10;London&#10;SW1A 1AA"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vat">VAT Number</Label>
                <Input
                  id="vat"
                  value={form.vat_number}
                  onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))}
                  placeholder="GB123456789"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_number">Company Number</Label>
                <Input
                  id="company_number"
                  value={form.company_number}
                  onChange={(e) => setForm((f) => ({ ...f, company_number: e.target.value }))}
                  placeholder="12345678"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="accounts@dropgym.co.uk"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank">Bank Details</Label>
              <Textarea
                id="bank"
                value={form.bank_details}
                onChange={(e) => setForm((f) => ({ ...f, bank_details: e.target.value }))}
                placeholder="Sort Code: 00-00-00&#10;Account: 12345678&#10;Bank: Example Bank"
                rows={3}
              />
            </div>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
