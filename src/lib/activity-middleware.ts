import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeActivity } from "./activity.server";

export function auditedAction(action: string) {
  return createMiddleware({ type: "function" }).middleware([requireSupabaseAuth]).server(async ({ next, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const area = roles?.some((r) => r.role === "super_admin") ? "admin" : roles?.some((r) => r.role === "producer") ? "produtor" : "atleta";
    const started = Date.now();
    try {
      const result = await next();
      const failed = result.result && typeof result.result === "object" && "ok" in result.result && result.result.ok === false;
      await writeActivity({ actorId: context.userId, area, source: "server", action, level: failed ? "error" : "info",
        details: { outcome: failed ? "falha" : "sucesso", duration_ms: Date.now() - started } });
      return result;
    } catch (error) {
      await writeActivity({ actorId: context.userId, area, source: "server", action, level: "error",
        details: { outcome: "falha", duration_ms: Date.now() - started, error_type: error instanceof Error ? error.name : "Error" } });
      throw error;
    }
  });
}