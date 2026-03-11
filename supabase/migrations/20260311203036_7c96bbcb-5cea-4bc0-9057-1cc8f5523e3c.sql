
-- Create permission enum
CREATE TYPE public.app_permission AS ENUM ('upload_pay_run', 'approve_pay_run', 'manage_trainers', 'view_reports', 'manage_users');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_permissions table
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission app_permission NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _user_id), false)
$$;

-- Security definer function to check if user has permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission app_permission)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _permission
  )
$$;

-- RLS for profiles: admins can see all, users can see own
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR NOT EXISTS (SELECT 1 FROM public.profiles));

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()) OR id = auth.uid());

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- RLS for user_permissions: admins can manage
CREATE POLICY "Admins can manage permissions" ON public.user_permissions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NOT EXISTS (SELECT 1 FROM public.profiles)
  );
  -- If first user (admin), grant all permissions
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id != NEW.id) THEN
    INSERT INTO public.user_permissions (user_id, permission)
    VALUES
      (NEW.id, 'upload_pay_run'),
      (NEW.id, 'approve_pay_run'),
      (NEW.id, 'manage_trainers'),
      (NEW.id, 'view_reports'),
      (NEW.id, 'manage_users');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert profile for existing user scott@dropgym.io as admin
INSERT INTO public.profiles (id, email, full_name, is_admin)
VALUES ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'scott@dropgym.io', 'Scott', true);

INSERT INTO public.user_permissions (user_id, permission)
VALUES
  ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'upload_pay_run'),
  ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'approve_pay_run'),
  ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'manage_trainers'),
  ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'view_reports'),
  ('a1ce4f8e-580b-43f5-9a3d-e5c88571fa81', 'manage_users');
