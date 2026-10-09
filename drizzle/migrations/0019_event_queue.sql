ALTER TABLE public.events ADD COLUMN IF NOT EXISTS queue_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS queue_capacity integer NOT NULL DEFAULT 200;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS queue_window_minutes integer NOT NULL DEFAULT 10;

CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  admitted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
GRANT SELECT ON public.queue_entries TO authenticated;
GRANT ALL ON public.queue_entries TO service_role;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own queue entry" ON public.queue_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX queue_entries_event_status_idx ON public.queue_entries(event_id, status, created_at);
CREATE INDEX IF NOT EXISTS orders_event_status_idx ON public.orders(event_id, status);
CREATE INDEX IF NOT EXISTS orders_ticket_status_idx ON public.orders(ticket_type_id, status);

CREATE OR REPLACE FUNCTION public.queue_enter(_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); ev record; me record; active_count int; free_slots int; pos int; total_waiting int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id, queue_enabled, queue_capacity, queue_window_minutes INTO ev FROM events WHERE id = _event_id;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'event not found'; END IF;
  IF NOT ev.queue_enabled THEN RETURN jsonb_build_object('status','admitted','enabled',false); END IF;

  INSERT INTO queue_entries(event_id,user_id) VALUES (_event_id, uid) ON CONFLICT (event_id,user_id) DO NOTHING;

  PERFORM pg_advisory_xact_lock(hashtext(_event_id::text));
  UPDATE queue_entries SET status='expired' WHERE event_id=_event_id AND status='admitted' AND expires_at < now();
  -- expired users can rejoin at the end of the line
  UPDATE queue_entries SET status='waiting', created_at=now(), admitted_at=NULL, expires_at=NULL
    WHERE event_id=_event_id AND user_id=uid AND status='expired';
  SELECT count(*) INTO active_count FROM queue_entries WHERE event_id=_event_id AND status='admitted';
  free_slots := greatest(ev.queue_capacity - active_count, 0);
  IF free_slots > 0 THEN
    UPDATE queue_entries SET status='admitted', admitted_at=now(), expires_at=now() + make_interval(mins => ev.queue_window_minutes)
    WHERE id IN (SELECT id FROM queue_entries WHERE event_id=_event_id AND status='waiting' ORDER BY created_at, id LIMIT free_slots);
  END IF;

  SELECT * INTO me FROM queue_entries WHERE event_id=_event_id AND user_id=uid;
  IF me.status = 'waiting' THEN
    SELECT count(*) INTO pos FROM queue_entries WHERE event_id=_event_id AND status='waiting' AND (created_at, id) <= (me.created_at, me.id);
  END IF;
  SELECT count(*) INTO total_waiting FROM queue_entries WHERE event_id=_event_id AND status='waiting';
  RETURN jsonb_build_object('status', me.status, 'enabled', true, 'position', pos, 'waiting', total_waiting, 'expires_at', me.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.queue_enter(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.queue_enter(uuid) TO authenticated;