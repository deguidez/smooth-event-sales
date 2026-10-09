function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Processa notificações do Asaas (verifica o token antes de qualquer alteração). */
export async function handleAsaasWebhook(request: Request) {
  const { applyOrderStatus, loadSettings, mapAsaasStatus } = await import("@/lib/asaas.server");
  const s = await loadSettings();
  const token = request.headers.get("asaas-access-token") ?? "";
  if (!s.asaas_webhook_token || !safeEqual(token, s.asaas_webhook_token)) {
    return new Response("unauthorized", { status: 401 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // Validação de saque (Asaas pede autorização antes de cada transferência)
  if (typeof body?.type === "string" && !body?.event) {
    if (body.type !== "TRANSFER") return Response.json({ status: "APPROVED" });
    const t = body.transfer ?? {};
    const value = Number(t.value);
    const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    for (const table of ["withdrawals", "platform_withdrawals"] as const) {
      const { data } = await a.from(table).select("id, amount, asaas_transfer_id")
        .eq("status", "processando").gte("confirmed_at", since);
      const ok = (data ?? []).some((w: any) =>
        (t.id && w.asaas_transfer_id === t.id) ||
        (!w.asaas_transfer_id && Math.abs(Number(w.amount) - value) < 0.005));
      if (ok) return Response.json({ status: "APPROVED" });
    }
    return Response.json({ status: "REFUSED", refuseReason: "Saque não solicitado pelo sistema" });
  }
  const payment = body?.payment;
  const orderId = typeof payment?.externalReference === "string" ? payment.externalReference : null;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({ ignored: true });

  const eventMap: Record<string, string> = {
    PAYMENT_CONFIRMED: "CONFIRMED",
    PAYMENT_RECEIVED: "RECEIVED",
    PAYMENT_OVERDUE: "OVERDUE",
    PAYMENT_REFUNDED: "REFUNDED",
    PAYMENT_DELETED: "DELETED",
    PAYMENT_CHARGEBACK_REQUESTED: "CHARGEBACK_REQUESTED",
  };
  const asaasStatus = eventMap[body.event] ?? payment.status;
  if (!asaasStatus) return Response.json({ ignored: true });
  await applyOrderStatus(orderId, mapAsaasStatus(asaasStatus), {
    receipt_url: payment.transactionReceiptUrl ?? null,
  });
  return Response.json({ received: true });
}
