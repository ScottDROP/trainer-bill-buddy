CREATE OR REPLACE FUNCTION public.enforce_pay_run_line_item_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  row_trainer_id uuid;
  row_rate numeric;
BEGIN
  SELECT prr.matched_trainer_id, prr.hourly_rate_csv
  INTO row_trainer_id, row_rate
  FROM public.pay_run_rows prr
  WHERE prr.id = NEW.pay_run_row_id;

  IF row_trainer_id IS NOT NULL THEN
    NEW.rate := COALESCE(public.get_trainer_effective_rate(row_trainer_id, NEW.rate), NEW.rate, row_rate, 0);
  ELSE
    NEW.rate := COALESCE(NULLIF(row_rate, 0), NEW.rate, 0);
  END IF;

  NEW.amount := COALESCE(NEW.sessions, 0) * COALESCE(NEW.rate, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_pay_run_row_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  effective_rate numeric;
BEGIN
  IF NEW.matched_trainer_id IS NULL THEN
    RETURN NEW;
  END IF;

  effective_rate := COALESCE(public.get_trainer_effective_rate(NEW.matched_trainer_id, NEW.hourly_rate_csv), NEW.hourly_rate_csv, 0);

  UPDATE public.pay_run_line_items pli
  SET rate = effective_rate,
      amount = COALESCE(pli.sessions, 0) * COALESCE(effective_rate, 0)
  WHERE pli.pay_run_row_id = NEW.id;

  PERFORM public.sync_pay_run_row_total(NEW.id);
  RETURN NEW;
END;
$$;