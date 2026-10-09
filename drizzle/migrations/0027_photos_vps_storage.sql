ALTER TABLE public.media_items ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'cloud';
ALTER TABLE public.media_items ADD COLUMN IF NOT EXISTS purged_at timestamptz;
ALTER TABLE public.photo_orders ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.photo_orders ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
CREATE TABLE public.photo_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  matches int NOT NULL DEFAULT 0,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, user_id)
);
GRANT ALL ON public.photo_searches TO service_role;
ALTER TABLE public.photo_searches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS media_items_created_idx ON public.media_items(created_at) WHERE purged_at IS NULL;