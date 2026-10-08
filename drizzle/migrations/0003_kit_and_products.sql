ALTER TABLE public.events ADD COLUMN IF NOT EXISTS shirt_enabled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS shirt_sizes text[] NOT NULL DEFAULT ARRAY['PP','P','M','G','GG','XG'];
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS products_total numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.event_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  image_url text,
  sizes text[] NOT NULL DEFAULT '{}',
  stock integer,
  sold integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_products TO authenticated;
GRANT ALL ON public.event_products TO service_role;
ALTER TABLE public.event_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public products" ON public.event_products FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('publicado','encerrado')));
CREATE POLICY "producer products read" ON public.event_products FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.producer_id = public.my_producer_id() OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "producer products write" ON public.event_products FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.producer_id = public.my_producer_id())) WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.producer_id = public.my_producer_id()));