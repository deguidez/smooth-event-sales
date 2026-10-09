import { createFileRoute } from "@tanstack/react-router";

// Chamado a cada 5 minutos pelo agendador do banco. As rotinas são idempotentes
// e só agem sobre prazos já vencidos, então chamadas extras não causam efeito a mais.
export const Route = createFileRoute("/api/public/cron/automations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !key || token !== key) return new Response("Unauthorized", { status: 401 });
        const { runAutomations } = await import("@/lib/automations.server");
        const r = await runAutomations();
        return Response.json({ ok: true, ...r });
      },
    },
  },
});
