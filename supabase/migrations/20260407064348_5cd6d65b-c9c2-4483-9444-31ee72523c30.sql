
-- Create pilates_instructors table
CREATE TABLE public.pilates_instructors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  invoicing_address TEXT DEFAULT '',
  vat_number TEXT DEFAULT '',
  bank_account_number TEXT DEFAULT '',
  bank_sort_code TEXT DEFAULT '',
  default_hourly_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pilates_instructors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.pilates_instructors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_pilates_instructors_updated_at
  BEFORE UPDATE ON public.pilates_instructors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create pilates_invoices table
CREATE TABLE public.pilates_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID REFERENCES public.pilates_instructors(id) ON DELETE SET NULL,
  instructor_name TEXT NOT NULL DEFAULT '',
  invoice_number TEXT DEFAULT '',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total_due NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  pay_run_month INTEGER NOT NULL,
  pay_run_year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pilates_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.pilates_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_pilates_invoices_updated_at
  BEFORE UPDATE ON public.pilates_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for pilates invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('pilates-invoices', 'pilates-invoices', false);

CREATE POLICY "Authenticated users can upload pilates invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pilates-invoices');

CREATE POLICY "Authenticated users can view pilates invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pilates-invoices');

CREATE POLICY "Authenticated users can delete pilates invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pilates-invoices');
