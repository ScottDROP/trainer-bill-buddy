
-- Staff pay runs table (linked to existing pay runs)
CREATE TABLE public.staff_pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  pdf_file_path text,
  total_gross numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_ni numeric NOT NULL DEFAULT 0,
  total_pension numeric NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pay_run_id)
);

ALTER TABLE public.staff_pay_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.staff_pay_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_staff_pay_runs_updated_at
  BEFORE UPDATE ON public.staff_pay_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staff pay run rows (individual employees)
CREATE TABLE public.staff_pay_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_pay_run_id uuid NOT NULL REFERENCES public.staff_pay_runs(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_number text,
  tax_code text,
  ni_letter text,
  gross_pay numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  ni_employee numeric NOT NULL DEFAULT 0,
  ni_employer numeric NOT NULL DEFAULT 0,
  pension numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_pay_run_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.staff_pay_run_rows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
