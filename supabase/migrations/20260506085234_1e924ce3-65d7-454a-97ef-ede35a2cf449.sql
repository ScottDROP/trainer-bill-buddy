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

  effective_rate := public.get_trainer_effective_rate(NEW.matched_trainer_id, NEW.hourly_rate_csv);

  UPDATE public.pay_run_line_items pli
  SET rate = effective_rate,
      amount = COALESCE(pli.sessions, 0) * COALESCE(effective_rate, 0)
  WHERE pli.pay_run_row_id = NEW.id;

  PERFORM public.sync_pay_run_row_total(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_pay_run_row_rate_change_trigger ON public.pay_run_rows;
CREATE TRIGGER after_pay_run_row_rate_change_trigger
AFTER INSERT OR UPDATE OF matched_trainer_id, hourly_rate_csv
ON public.pay_run_rows
FOR EACH ROW
WHEN (NEW.matched_trainer_id IS NOT NULL)
EXECUTE FUNCTION public.after_pay_run_row_rate_change();