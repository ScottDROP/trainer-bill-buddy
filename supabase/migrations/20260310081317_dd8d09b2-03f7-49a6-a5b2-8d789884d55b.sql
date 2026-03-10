
-- Create pay_run_status enum
CREATE TYPE public.pay_run_status AS ENUM ('uploaded', 'matched', 'reviewed', 'invoiced');

-- Create match_status enum
CREATE TYPE public.match_status AS ENUM ('auto_matched', 'alias_matched', 'manual', 'unmatched');

-- Create invoice_status enum
CREATE TYPE public.invoice_status AS ENUM ('draft', 'final');

-- Company settings (singleton for DropGym details)
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  vat_number TEXT DEFAULT '',
  company_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  bank_details TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Locations
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trainers
CREATE TABLE public.trainers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  email TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  invoicing_address TEXT DEFAULT '',
  vat_number TEXT DEFAULT '',
  company_number TEXT DEFAULT '',
  default_hourly_rate NUMERIC(10,2) DEFAULT 0,
  payment_terms TEXT DEFAULT 'Net 30',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pay runs
CREATE TABLE public.pay_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status public.pay_run_status NOT NULL DEFAULT 'uploaded',
  csv_file_path TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pay run rows
CREATE TABLE public.pay_run_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_run_id UUID NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  trainer_name_csv TEXT NOT NULL,
  matched_trainer_id UUID REFERENCES public.trainers(id) ON DELETE SET NULL,
  hourly_rate_csv NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_sessions NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  match_status public.match_status NOT NULL DEFAULT 'unmatched',
  validation_warnings JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pay run line items
CREATE TABLE public.pay_run_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_run_row_id UUID NOT NULL REFERENCES public.pay_run_rows(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  sessions NUMERIC(10,2) NOT NULL DEFAULT 0,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_run_row_id UUID NOT NULL REFERENCES public.pay_run_rows(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_period_start DATE NOT NULL,
  service_period_end DATE NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_due NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  pdf_file_path TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_run_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_run_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies - internal admin tool, all authenticated users have full access
CREATE POLICY "Authenticated users full access" ON public.company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.trainers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.pay_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.pay_run_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.pay_run_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Updated_at triggers
CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trainers_updated_at BEFORE UPDATE ON public.trainers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pay_runs_updated_at BEFORE UPDATE ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('csv-uploads', 'csv-uploads', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false);

-- Storage policies for authenticated users
CREATE POLICY "Authenticated users can upload CSVs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'csv-uploads');
CREATE POLICY "Authenticated users can read CSVs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'csv-uploads');
CREATE POLICY "Authenticated users can upload invoices" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "Authenticated users can read invoices" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoices');
