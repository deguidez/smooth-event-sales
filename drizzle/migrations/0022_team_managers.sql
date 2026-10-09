CREATE TABLE public.team_managers (
  user_id uuid PRIMARY KEY,
  team_name text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','suspenso')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_managers TO authenticated;
GRANT ALL ON public.team_managers TO service_role;
ALTER TABLE public.team_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_managers read own" ON public.team_managers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'convidado' CHECK (status IN ('convidado','aceito','recusado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (manager_id, athlete_id)
);
CREATE INDEX team_members_athlete_idx ON public.team_members(athlete_id);
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members read" ON public.team_members FOR SELECT TO authenticated
  USING (manager_id = auth.uid() OR athlete_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

ALTER TABLE public.orders ADD COLUMN manager_id uuid;
ALTER TABLE public.orders ADD COLUMN payment_group_id uuid;
CREATE INDEX orders_manager_idx ON public.orders(manager_id);
CREATE INDEX orders_payment_group_idx ON public.orders(payment_group_id);