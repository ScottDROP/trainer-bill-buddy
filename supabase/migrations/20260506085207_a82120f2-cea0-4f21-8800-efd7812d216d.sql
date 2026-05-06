CREATE OR REPLACE FUNCTION public.get_trainer_effective_rate(_trainer_id uuid, _fallback_rate numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(t.default_hourly_rate, 0), _fallback_rate, 0)
  FROM public.trainers t
  WHERE t.id = _trainer_id
$$;

CREATE OR REPLACE FUNCTION public.enforce_pay_run_row_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  effective_rate numeric;
BEGIN
  IF NEW.matched_trainer_id IS NOT NULL THEN
    effective_rate := public.get_trainer_effective_rate(NEW.matched_trainer_id, NEW.hourly_rate_csv);
    NEW.hourly_rate_csv := COALESCE(effective_rate, NEW.hourly_rate_csv, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pay_run_row_rate_trigger ON public.pay_run_rows;
CREATE TRIGGER enforce_pay_run_row_rate_trigger
BEFORE INSERT OR UPDATE OF matched_trainer_id, hourly_rate_csv
ON public.pay_run_rows
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pay_run_row_rate();

CREATE OR REPLACE FUNCTION public.sync_pay_run_row_total(_pay_run_row_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.pay_run_rows prr
  SET total_cost = COALESCE((
    SELECT SUM(pli.amount)
    FROM public.pay_run_line_items pli
    WHERE pli.pay_run_row_id = _pay_run_row_id
  ), 0)
  WHERE prr.id = _pay_run_row_id;
END;
$$;

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
    NEW.rate := public.get_trainer_effective_rate(row_trainer_id, NEW.rate);
  ELSE
    NEW.rate := COALESCE(NULLIF(row_rate, 0), NEW.rate, 0);
  END IF;

  NEW.amount := COALESCE(NEW.sessions, 0) * COALESCE(NEW.rate, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pay_run_line_item_rate_trigger ON public.pay_run_line_items;
CREATE TRIGGER enforce_pay_run_line_item_rate_trigger
BEFORE INSERT OR UPDATE OF pay_run_row_id, sessions, rate
ON public.pay_run_line_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pay_run_line_item_rate();

CREATE OR REPLACE FUNCTION public.after_pay_run_line_item_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_pay_run_row_total(OLD.pay_run_row_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_pay_run_row_total(NEW.pay_run_row_id);
  IF TG_OP = 'UPDATE' AND OLD.pay_run_row_id <> NEW.pay_run_row_id THEN
    PERFORM public.sync_pay_run_row_total(OLD.pay_run_row_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_pay_run_line_item_change_trigger ON public.pay_run_line_items;
CREATE TRIGGER after_pay_run_line_item_change_trigger
AFTER INSERT OR UPDATE OR DELETE
ON public.pay_run_line_items
FOR EACH ROW
EXECUTE FUNCTION public.after_pay_run_line_item_change();