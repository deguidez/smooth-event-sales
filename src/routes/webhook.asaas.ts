import { createFileRoute } from "@tanstack/react-router";

// Endereço alternativo do webhook do Asaas (evenon.com.br/webhook/asaas).
export const Route = createFileRoute("/webhook/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAsaasWebhook } = await import("@/lib/asaas-webhook.server");
        return handleAsaasWebhook(request);
      },
    },
  },
});
