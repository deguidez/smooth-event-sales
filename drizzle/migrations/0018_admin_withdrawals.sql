CREATE TABLE public.admin_bank_accounts (
  user_id uuid PRIMARY KEY,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  agency text NOT NULL,
  agency_digit text,
  account text NOT NULL,
  account_digit text,
  account_type text NOT NULL,
  owner_name text NOT NULL,
  owner_document text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_bank_accounts TO service_role;
ALTER TABLE public.admin_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'aguardando_codigo',
  code_hash text,
  code_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  bank jsonb NOT NULL,
  asaas_transfer_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  processed_at timestamptz
);
GRANT ALL ON public.platform_withdrawals TO service_role;
ALTER TABLE public.platform_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER audit_admin_bank_accounts AFTER INSERT OR UPDATE OR DELETE ON public.admin_bank_accounts FOR EACH ROW EXECUTE FUNCTION audit_application_change();
CREATE TRIGGER audit_platform_withdrawals AFTER INSERT OR UPDATE OR DELETE ON public.platform_withdrawals FOR EACH ROW EXECUTE FUNCTION audit_application_change();