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
  let status = "aguardando_dominio";
  try {
    const mod: any = await import("./email-sender.server").catch(() => null);
    if (mod?.sendOrderEmail) {
      const r = await mod.sendOrderEmail(orderId, kind);
      status = r?.sent ? "enviado" : (r?.reason ?? "nao_enviado");
    }
  } catch (e) {
    console.error("email error", e);
    status = "erro";
  }
  await supabaseAdmin.from("email_log").insert({
    order_id: orderId,
    kind,
    recipient: order.participant_email,
    status,
  });
}
