ALTER TABLE public.events ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb;