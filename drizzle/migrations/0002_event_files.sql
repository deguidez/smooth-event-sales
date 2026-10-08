CREATE POLICY "producer upload event files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'event-files' AND (storage.foldername(name))[1] = public.my_producer_id()::text);
CREATE POLICY "producer read event files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'event-files' AND ((storage.foldername(name))[1] = public.my_producer_id()::text OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY "producer delete event files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'event-files' AND (storage.foldername(name))[1] = public.my_producer_id()::text);

CREATE TABLE public.event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'regulamento',
  url text NOT NULL,
  is_file boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_documents TO authenticated;
GRANT ALL ON public.event_documents TO service_role;
ALTER TABLE public.event_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public docs" ON public.event_documents FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('publicado','encerrado')));
CREATE POLICY "producer docs read" ON public.event_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.producer_id = public.my_producer_id() OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "producer docs write" ON public.event_documents FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.producer_id = public.my_producer_id())) WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.producer_id = public.my_producer_id()));