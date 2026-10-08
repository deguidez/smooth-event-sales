import { createFileRoute } from "@tanstack/react-router";
import { applyOrderStatus, loadSettings, mapAsaasStatus } from "@/lib/asaas.server";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
      },
    },
  },
});
