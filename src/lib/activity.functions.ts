import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeActivity } from "./activity.server";

export const recordBrowserActivity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ action: z.enum(["page_view", "browser_error", "query_error", "mutation_error", "session_started"]),
    path: z.string().startsWith("/").max(300), category: z.enum(["runtime", "network", "application"]).optional() }))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const area = data.path.startsWith("/admin") ? "admin" : data.path.startsWith("/produtor") ? "produtor" : "atleta";
    // Area is a navigation label, not a permission. Roles are validated server-side.
    const allowedArea = area === "admin" && !roles?.some((r) => r.role === "super_admin") ? "atleta" : area === "produtor" && !roles?.some((r) => r.role === "producer" || r.role === "super_admin") ? "atleta" : area;
    await writeActivity({ actorId: context.userId, area: allowedArea, source: "browser", action: data.action,
      level: data.action.endsWith("error") ? "error" : "info", path: data.path.split(/[?#]/)[0], details: { category: data.category ?? "application" } });
    return { ok: true };
  });

export const listActivityLogs = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ area: z.enum(["todos", "admin", "produtor", "atleta", "sistema"]).default("todos"),
    level: z.enum(["todos", "info", "error"]).default("todos"), page: z.number().int().min(0).default(0) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (roleError || !admin) throw new Error("Acesso restrito ao super admin");
    let query = context.supabase.from("activity_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(data.page * 50, data.page * 50 + 49);
    if (data.area !== "todos") query = query.eq("area", data.area);
    if (data.level !== "todos") query = query.eq("level", data.level);
    const { data: logs, count, error } = await query;
    if (error) throw error;
    const ids = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => !!id))];
    const { data: profiles } = ids.length ? await context.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    return { logs: (logs ?? []).map((l) => ({ ...l, actor_name: profiles?.find((p) => p.id === l.actor_id)?.full_name ?? (l.actor_id ? "Usuário" : "Sistema") })), count: count ?? 0 };
  });