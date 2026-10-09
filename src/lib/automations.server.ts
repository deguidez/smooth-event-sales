// Rotinas automáticas (chamadas a cada 5 min): cancelamento de inscrições não pagas,
// lembrete de inscrição não finalizada e lembrete antes do evento.
// Tudo é idempotente: rodar de novo não duplica cancelamentos nem e-mails.
import { applyOrderStatus, asaasFetch, getAdmin, loadSettings, mapAsaasStatus } from "./asaas.server";
import { notifyOrder, SITE_URL } from "./notify.server";

const BATCH = 40;

export async function runAutomations() {
  const admin = await getAdmin();
  const s: any = await loadSettings();
  const result = { cancelled: 0, paidFound: 0, abandoned: 0, reminders: 0 };

  // 1) Cancelamento automático (Pix e cartão; boleto respeita o vencimento próprio).
  if (s.auto_cancel_enabled) {
    const cutoff = new Date(Date.now() - (s.auto_cancel_minutes ?? 30) * 60_000).toISOString();
    const { data: pend } = await admin
      .from("orders")
      .select("id, asaas_payment_id")
      .eq("status", "pendente")
      .in("payment_method", ["PIX", "CREDIT_CARD"])
      .lt("created_at", cutoff)
      .gt("total", 0)
      .order("created_at")
      .limit(BATCH);
    for (const o of pend ?? []) {
      try {
        if (o.asaas_payment_id && s.asaas_api_key) {
          const p = await asaasFetch(s, `/payments/${o.asaas_payment_id}`).catch(() => null);
          const st = p?.status ? mapAsaasStatus(p.status) : null;
          if (st === "pago") { await applyOrderStatus(o.id, "pago"); result.paidFound++; continue; }
          await asaasFetch(s, `/payments/${o.asaas_payment_id}`, { method: "DELETE" }).catch(() => null);
        }
        const { data: upd } = await admin.from("orders").update({ status: "cancelado" }).eq("id", o.id).eq("status", "pendente").select("id");
        if (!upd?.length) continue;
        result.cancelled++;
        if (s.email_cancelled_enabled) await notifyOrder(o.id, "inscricao_cancelada");
      } catch (e) {
        console.error("auto-cancel failed", o.id, e);
      }
    }
  }

  // 2) Começou a inscrição e não finalizou.
  {
    const cutoff = new Date(Date.now() - (s.abandoned_minutes ?? 30) * 60_000).toISOString();
    const { data: starts } = await admin
      .from("checkout_starts")
      .select("id, event_id, ticket_type_id, user_id, email, events(title, status)")
      .is("reminded_at", null)
      .lt("created_at", cutoff)
      .gt("created_at", new Date(Date.now() - 3 * 86400_000).toISOString())
      .limit(BATCH);
    for (const c of starts ?? []) {
      await admin.from("checkout_starts").update({ reminded_at: new Date().toISOString() }).eq("id", c.id);
      if (!s.email_abandoned_enabled || (c as any).events?.status !== "publicado") continue;
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("event_id", c.event_id).eq("user_id", c.user_id);
      if ((count ?? 0) > 0) continue;
      try {
        const { sendTemplateEmail } = await import("./email-templates/send-email");
        await sendTemplateEmail("order-status", c.email, {
          templateData: { kind: "checkout_abandonado", name: "Atleta", eventTitle: (c as any).events?.title, url: `${SITE_URL}/checkout/${c.ticket_type_id}` },
          idempotencyKey: `abandoned-${c.id}`,
        });
        result.abandoned++;
      } catch (e) {
        console.error("abandoned email failed", e);
      }
    }
  }

  // 3) Lembrete antes do evento para inscritos confirmados.
  if (s.email_event_reminder_enabled) {
    const until = new Date(Date.now() + (s.reminder_days_before ?? 2) * 86400_000).toISOString();
    const { data: evs } = await admin.from("events").select("id").eq("status", "publicado").gt("starts_at", new Date().toISOString()).lte("starts_at", until).limit(50);
    for (const ev of evs ?? []) {
      const { data: orders } = await admin.from("orders").select("id").eq("event_id", ev.id).eq("status", "pago").limit(2000);
      const ids = (orders ?? []).map((o) => o.id);
      if (!ids.length) continue;
      const sent = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: logs } = await admin.from("email_log").select("order_id").eq("kind", "lembrete_evento").in("order_id", ids.slice(i, i + 200));
        (logs ?? []).forEach((l) => l.order_id && sent.add(l.order_id));
      }
      for (const id of ids.filter((x) => !sent.has(x)).slice(0, BATCH - result.reminders)) {
        await notifyOrder(id, "lembrete_evento");
        result.reminders++;
      }
      if (result.reminders >= BATCH) break;
    }
  }
  return result;
}
