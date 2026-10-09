CREATE TABLE public.kit_access (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.kit_access TO service_role;
ALTER TABLE public.kit_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kit_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  operator_name text NOT NULL,
  receiver_type text NOT NULL DEFAULT 'titular',
  third_name text,
  third_phone text,
  third_cpf text,
  photo_path text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip text,
  user_agent text,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kit_deliveries_event_idx ON public.kit_deliveries(event_id);
GRANT SELECT ON public.kit_deliveries TO authenticated;
GRANT ALL ON public.kit_deliveries TO service_role;
ALTER TABLE public.kit_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producer or admin read kit deliveries" ON public.kit_deliveries FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.producer_id = public.my_producer_id()));