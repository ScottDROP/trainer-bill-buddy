import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Permission = "upload_pay_run" | "approve_pay_run" | "manage_trainers" | "view_reports" | "manage_users";

export function usePermissions() {
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("user_permissions")
        .select("permission")
        .eq("user_id", user.id);
      return (data || []).map((p) => p.permission as Permission);
    },
  });

  const isAdmin = profile?.is_admin ?? false;

  const hasPermission = (perm: Permission) => {
    if (isAdmin) return true;
    return permissions.includes(perm);
  };

  return { profile, permissions, isAdmin, hasPermission };
}
