import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, KeyRound, UserPlus, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Permission } from "@/hooks/usePermissions";

const ALL_PERMISSIONS: { value: Permission; label: string }[] = [
  { value: "upload_pay_run", label: "Upload Pay Run" },
  { value: "approve_pay_run", label: "Approve Pay Run" },
  { value: "manage_trainers", label: "Manage Trainers" },
  { value: "view_reports", label: "View Reports" },
  { value: "manage_users", label: "Manage Users" },
];

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", full_name: "" });
  const [newPerms, setNewPerms] = useState<Permission[]>([]);
  const [resetPwDialog, setResetPwDialog] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (!profiles) return [];

      const { data: perms } = await supabase
        .from("user_permissions")
        .select("*");

      return profiles.map((p) => ({
        ...p,
        permissions: (perms || [])
          .filter((perm) => perm.user_id === p.id)
          .map((perm) => perm.permission as Permission),
      }));
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create_user",
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          permissions: newPerms,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("User created successfully");
      setShowAddDialog(false);
      setNewUser({ email: "", password: "", full_name: "" });
      setNewPerms([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePermsMutation = useMutation({
    mutationFn: async ({ user_id, permissions }: { user_id: string; permissions: Permission[] }) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "update_permissions", user_id, permissions },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Permissions updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "delete_user", user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("User deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ user_id, password }: { user_id: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "reset_password", user_id, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Password reset successfully");
      setResetPwDialog(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePermission = (userId: string, currentPerms: Permission[], perm: Permission) => {
    const updated = currentPerms.includes(perm)
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm];
    updatePermsMutation.mutate({ user_id: userId, permissions: updated });
  };

  if (isLoading) return <div className="text-muted-foreground">Loading users...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">User Management</h2>
          <p className="text-sm text-muted-foreground">Add users and manage their permissions.</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser((u) => ({ ...u, full_name: e.target.value }))}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  placeholder="john@dropgym.co.uk"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={newPerms.includes(p.value)}
                        onCheckedChange={(checked) =>
                          setNewPerms((prev) =>
                            checked ? [...prev, p.value] : prev.filter((x) => x !== p.value)
                          )
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{user.full_name || "Unnamed"}</span>
                    {user.is_admin && (
                      <Badge variant="default" className="gap-1">
                        <Shield className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  <Dialog
                    open={resetPwDialog === user.id}
                    onOpenChange={(open) => {
                      setResetPwDialog(open ? user.id : null);
                      setNewPassword("");
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" title="Reset password">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reset Password for {user.email}</DialogTitle>
                      </DialogHeader>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          resetPasswordMutation.mutate({ user_id: user.id, password: newPassword });
                        }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label>New Password</Label>
                          <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                          {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  {!user.is_admin && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete user ${user.email}?`)) {
                          deleteUserMutation.mutate(user.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {!user.is_admin && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={user.permissions.includes(p.value)}
                        onCheckedChange={() => togglePermission(user.id, user.permissions, p.value)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              )}
              {user.is_admin && (
                <p className="mt-3 text-xs text-muted-foreground">Admins have all permissions.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
