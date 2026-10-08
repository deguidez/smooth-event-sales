ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS card_release_days integer NOT NULL DEFAULT 4;

CREATE TABLE public.producer_secrets (
  producer_id uuid PRIMARY KEY REFERENCES public.producers(id) ON DELETE CASCADE,
  asaas_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.producer_secrets TO service_role;
ALTER TABLE public.producer_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.producer_bank_accounts (
  producer_id uuid PRIMARY KEY REFERENCES public.producers(id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  agency text NOT NULL,
  agency_digit text,
  account text NOT NULL,
  account_digit text,
  account_type text NOT NULL DEFAULT 'CONTA_CORRENTE' CHECK (account_type IN ('CONTA_CORRENTE','CONTA_POUPANCA')),
  owner_name text NOT NULL,
  owner_document text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.producer_bank_accounts TO authenticated;
GRANT ALL ON public.producer_bank_accounts TO service_role;
ALTER TABLE public.producer_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank owner read" ON public.producer_bank_accounts FOR SELECT TO authenticated
  USING (producer_id = public.my_producer_id() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'aguardando_codigo',
  code_hash text,
  code_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  bank jsonb NOT NULL DEFAULT '{}'::jsonb,
  asaas_transfer_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  processed_at timestamptz
);
CREATE INDEX withdrawals_producer_idx ON public.withdrawals(producer_id, created_at DESC);
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals owner read" ON public.withdrawals FOR SELECT TO authenticated
  USING (producer_id = public.my_producer_id() OR public.has_role(auth.uid(),'super_admin'));
REVOKE SELECT (code_hash) ON public.withdrawals FROM authenticated;

CREATE TRIGGER audit_withdrawals AFTER INSERT OR UPDATE OR DELETE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_bank_accounts AFTER INSERT OR UPDATE OR DELETE ON public.producer_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();