type Log = { actorId?: string | null; area?: string; source: string; level?: string; action: string; entityType?: string; entityId?: string; path?: string; details?: Record<string, unknown> };

/** Never pass request bodies, provider responses, credentials or personal data. */
export async function writeActivity(log: Log) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("activity_logs").insert({
      actor_id: log.actorId ?? null, area: log.area ?? "sistema", source: log.source,
      level: log.level ?? "info", action: log.action, entity_type: log.entityType ?? null,
      entity_id: log.entityId ?? null, path: log.path ?? null, details: (log.details ?? {}) as never,
    });
    if (error) console.warn("Activity log could not be saved", error.code);
  } catch { console.warn("Activity log unavailable"); }
}