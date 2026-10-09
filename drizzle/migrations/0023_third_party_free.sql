ALTER TABLE public.events ADD COLUMN allow_third_party_free boolean NOT NULL DEFAULT false;
CREATE INDEX orders_event_cpf_idx ON public.orders(event_id, participant_cpf);