
-- Create supplier invoices table
CREATE TABLE public.supplier_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.supplier_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_supplier_invoices_updated_at
  BEFORE UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for supplier invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-invoices', 'supplier-invoices', false);

CREATE POLICY "Auth users can upload supplier invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-invoices');

CREATE POLICY "Auth users can view supplier invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-invoices');

CREATE POLICY "Auth users can delete supplier invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-invoices');
