CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  percent numeric NOT NULL CHECK (percent > 0 AND percent <= 100),
  min_amount numeric,
  valid_until timestamptz,
  max_uses integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN coupon_code text;
ALTER TABLE public.orders ADD COLUMN discount numeric NOT NULL DEFAULT 0;
CREATE TRIGGER audit_coupons AFTER INSERT OR UPDATE OR DELETE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();