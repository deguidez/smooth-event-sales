ALTER TABLE public.events ADD COLUMN IF NOT EXISTS terms jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_terms jsonb NOT NULL DEFAULT '[]'::jsonb;