// Notificações por e-mail das inscrições (envio pelo domínio de e-mail configurado).
export type NotifyKind = "inscricao_criada" | "pagamento_confirmado" | "pagamento_vencido" | "inscricao_cancelada" | "lembrete_evento";

export const SITE_URL = "https://evenon.com.br";

export async function notifyOrder(orderId: string, kind: NotifyKind) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, code, total, participant_name, participant_email, events(title, slug)")
    .eq("id", orderId)
    .single();
  if (!order) return;
  // Inscrição gratuita confirma na hora; evita e-mail "pague" redundante.
  if (kind === "inscricao_criada" && Number(order.total) <= 0) return;
  let status = "enviado";
  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const r = await sendTemplateEmail("order-status", order.participant_email, {
      templateData: {
        kind,
        name: order.participant_name,
        eventTitle: (order as any).events?.title,
        code: order.code,
        total: Number(order.total) > 0 ? Number(order.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Inscrição gratuita",
        url: kind === "inscricao_cancelada" ? `${SITE_URL}/eventos/${(order as any).events?.slug ?? ""}` : `${SITE_URL}/pedido/${order.id}`,
      },
      idempotencyKey: `order-${kind}-${order.id}`,
    });
    if (!r.sent) status = "bloqueado";
  } catch (e) {
    console.error("email send failed", e);
    status = "falhou";
  }
  await supabaseAdmin.from("email_log").insert({ order_id: orderId, kind, recipient: order.participant_email, status });
}
