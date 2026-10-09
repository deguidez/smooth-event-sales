CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS auto_cancel_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_cancel_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS email_cancelled_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_abandoned_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS abandoned_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS email_event_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_days_before integer NOT NULL DEFAULT 2;

CREATE TABLE public.checkout_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reminded_at timestamptz,
  UNIQUE (event_id, user_id)
);
GRANT ALL ON public.checkout_starts TO service_role;
ALTER TABLE public.checkout_starts ENABLE ROW LEVEL SECURITY;
CREATE INDEX checkout_starts_pending_idx ON public.checkout_starts(created_at) WHERE reminded_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_pending_created_idx ON public.orders(created_at) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS email_log_order_kind_idx ON public.email_log(order_id, kind);