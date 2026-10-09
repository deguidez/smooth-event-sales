CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.photographers (
  user_id uuid PRIMARY KEY,
  name text NOT NULL,
  document text NOT NULL,
  phone text,
  asaas_wallet_id text,
  bank jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.photographers TO authenticated;
GRANT ALL ON public.photographers TO service_role;
ALTER TABLE public.photographers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photographer own or admin read" ON public.photographers FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.photo_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  owner_percent numeric NOT NULL DEFAULT 10,
  platform_percent numeric NOT NULL DEFAULT 20,
  photographer_percent numeric NOT NULL DEFAULT 70,
  photo_price numeric NOT NULL DEFAULT 15,
  video_price numeric NOT NULL DEFAULT 30,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  pkg_all_photos numeric,
  pkg_all_videos numeric,
  pkg_all numeric,
  watermark_photo_url text,
  watermark_video_url text,
  owner_sees_total boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.photo_albums TO anon, authenticated;
GRANT ALL ON public.photo_albums TO service_role;
ALTER TABLE public.photo_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "albums public active read" ON public.photo_albums FOR SELECT TO anon, authenticated
USING (active OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.album_photographers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'convidado',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, user_id)
);
GRANT SELECT ON public.album_photographers TO authenticated;
GRANT ALL ON public.album_photographers TO service_role;
ALTER TABLE public.album_photographers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album photographer own or admin read" ON public.album_photographers FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'photo',
  original_path text NOT NULL,
  preview_path text NOT NULL,
  width integer,
  height integer,
  faces integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_items_album_idx ON public.media_items(album_id, kind);
GRANT SELECT ON public.media_items TO authenticated;
GRANT ALL ON public.media_items TO service_role;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media own or admin read" ON public.media_items FOR SELECT TO authenticated
USING (photographer_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.media_faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  embedding extensions.vector(128) NOT NULL
);
CREATE INDEX media_faces_album_idx ON public.media_faces(album_id);
GRANT ALL ON public.media_faces TO service_role;
ALTER TABLE public.media_faces ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.match_faces(_album_id uuid, _embedding extensions.vector(128), _threshold float DEFAULT 0.5, _limit int DEFAULT 300)
RETURNS TABLE(media_id uuid, distance float)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT media_id, min(embedding <-> _embedding) AS distance
  FROM public.media_faces
  WHERE album_id = _album_id AND (embedding <-> _embedding) < _threshold
  GROUP BY media_id ORDER BY 2 LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.match_faces(uuid, extensions.vector, float, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_faces(uuid, extensions.vector, float, int) TO service_role;

CREATE TABLE public.photo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  album_id uuid NOT NULL REFERENCES public.photo_albums(id),
  user_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_cpf text NOT NULL,
  customer_phone text,
  package text,
  subtotal numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  coupon_code text,
  total numeric NOT NULL,
  owner_amount numeric NOT NULL DEFAULT 0,
  platform_amount numeric NOT NULL DEFAULT 0,
  photographers_amount numeric NOT NULL DEFAULT 0,
  split jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  asaas_payment_id text,
  invoice_url text,
  pix_qr_image text,
  pix_payload text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photo_orders_album_idx ON public.photo_orders(album_id, status);
GRANT SELECT ON public.photo_orders TO authenticated;
GRANT ALL ON public.photo_orders TO service_role;
ALTER TABLE public.photo_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo orders own or admin read" ON public.photo_orders FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.photo_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.photo_orders(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media_items(id),
  photographer_id uuid NOT NULL,
  kind text NOT NULL,
  price numeric NOT NULL
);
CREATE INDEX photo_order_items_order_idx ON public.photo_order_items(order_id);
CREATE INDEX photo_order_items_ph_idx ON public.photo_order_items(photographer_id);
GRANT SELECT ON public.photo_order_items TO authenticated;
GRANT ALL ON public.photo_order_items TO service_role;
ALTER TABLE public.photo_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo items own or admin read" ON public.photo_order_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR EXISTS (SELECT 1 FROM public.photo_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));