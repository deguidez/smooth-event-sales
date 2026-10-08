ALTER TABLE public.events ADD COLUMN fee_percent numeric, ADD COLUMN fee_fixed numeric;
CREATE OR REPLACE FUNCTION public.protect_event_fees() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.fee_percent := NULL; NEW.fee_fixed := NULL;
    ELSE
      NEW.fee_percent := OLD.fee_percent; NEW.fee_fixed := OLD.fee_fixed;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER events_protect_fees BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.protect_event_fees();