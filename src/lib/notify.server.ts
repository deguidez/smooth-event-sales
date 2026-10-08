// Notificações por e-mail das inscrições.
// O envio real é ligado quando o domínio de e-mail estiver configurado;
// até lá, cada notificação fica registrada no histórico com status "aguardando_dominio".
export type NotifyKind = "inscricao_criada" | "pagamento_confirmado" | "pagamento_vencido";

export async function notifyOrder(orderId: string, kind: NotifyKind) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, participant_email")
    .eq("id", orderId)
    .single();
  if (!order) return;
  const status = "aguardando_dominio";
  await supabaseAdmin.from("email_log").insert({
    order_id: orderId,
    kind,
    recipient: order.participant_email,
    status,
  });
}
