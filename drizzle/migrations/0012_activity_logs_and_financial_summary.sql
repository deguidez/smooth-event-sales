CREATE TABLE public.activity_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid,
 area text NOT NULL DEFAULT 'sistema',
 source text NOT NULL DEFAULT 'database',
 level text NOT NULL DEFAULT 'info',
 action text NOT NULL,
 entity_type text,
 entity_id text,
 path text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX activity_logs_created_idx ON public.activity_logs(created_at DESC);
CREATE INDEX activity_logs_actor_idx ON public.activity_logs(actor_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.audit_application_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data jsonb; actor uuid; log_area text; changed text[]; safe_details jsonb;
BEGIN
 row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 actor := auth.uid();
 IF actor IS NULL AND TG_TABLE_NAME = 'orders' AND TG_OP = 'INSERT' THEN actor := (row_data->>'user_id')::uuid; END IF;
 log_area := CASE WHEN actor IS NULL THEN 'sistema' WHEN public.has_role(actor,'super_admin') THEN 'admin' WHEN public.has_role(actor,'producer') THEN 'produtor' ELSE 'atleta' END;
 IF TG_OP = 'UPDATE' THEN
 SELECT array_agg(key ORDER BY key) INTO changed FROM jsonb_each(row_data) WHERE value IS DISTINCT FROM to_jsonb(OLD)->key;
 IF changed IS NULL THEN RETURN NEW; END IF;
 ELSE SELECT array_agg(key ORDER BY key) INTO changed FROM jsonb_each(row_data); END IF;
 safe_details := jsonb_build_object('fields',changed);
 IF TG_TABLE_NAME IN ('orders','events','producers') THEN safe_details := safe_details || jsonb_build_object('status', row_data->>'status'); END IF;
 IF TG_TABLE_NAME = 'orders' AND TG_OP = 'UPDATE' THEN safe_details := safe_details || jsonb_build_object('previous_status', to_jsonb(OLD)->>'status'); END IF;
 INSERT INTO public.activity_logs(actor_id,area,source,level,action,entity_type,entity_id,details)
 VALUES(actor,log_area,'database','info',lower(TG_OP),TG_TABLE_NAME,coalesce(row_data->>'id',row_data->>'user_id'),safe_details);
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_events AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_producers AFTER INSERT OR UPDATE OR DELETE ON public.producers FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_ticket_types AFTER INSERT OR UPDATE OR DELETE ON public.ticket_types FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_event_products AFTER INSERT OR UPDATE OR DELETE ON public.event_products FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_event_documents AFTER INSERT OR UPDATE OR DELETE ON public.event_documents FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE TRIGGER audit_platform_settings AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.audit_application_change();
CREATE OR REPLACE FUNCTION public.financial_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT jsonb_build_object(
 'confirmed',count(*) FILTER (WHERE status='pago'),
 'paid',count(*) FILTER (WHERE status='pago' AND total>0),
 'free',count(*) FILTER (WHERE status='pago' AND total=0),
 'pending',count(*) FILTER (WHERE status='pendente'),
 'total',coalesce(sum(total) FILTER (WHERE status='pago'),0),
 'producer',coalesce(sum(producer_amount) FILTER (WHERE status='pago'),0),
 'platform',coalesce(sum(platform_amount) FILTER (WHERE status='pago'),0),
 'asaas',coalesce(sum(asaas_fee_estimate) FILTER (WHERE status='pago'),0)
 ) FROM public.orders;
$$;
REVOKE ALL ON FUNCTION public.financial_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_summary() TO authenticated, service_role;