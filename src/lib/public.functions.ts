import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const EVENT_COLS =
  "id, title, slug, category, short_description, cover_url, venue, city, state, starts_at, status, featured, ticket_types(price, active)";

export const listPublicEvents = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ category: z.string().max(20).optional(), q: z.string().max(80).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    let q = publicClient().from("events").select(EVENT_COLS).eq("status", "publicado").order("starts_at");
    if (data.category) q = q.eq("category", data.category as any);
    if (data.q) q = q.ilike("title", `%${data.q.replace(/[%_]/g, "")}%`);
    const { data: rows, error } = await q.limit(60);
    if (error) {
      console.error(error);
      return [];
    }
    return rows ?? [];
  });

export const getPublicEvent = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: ev } = await publicClient()
      .from("events")
      .select(
        "id, title, slug, category, short_description, description, route_map_url, cover_url, venue, city, state, starts_at, ends_at, registration_ends_at, registrations_open_at, status, producers(company_name), ticket_types(id, name, description, price, quantity, sold, sales_start, sales_end, active, position), event_documents(id, title, kind, url, is_file, position)",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    return ev ?? null;
  });

export const getBranding = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdmin } = await import("@/lib/asaas.server");
  const admin = await getAdmin();
  const { data } = await admin.from("platform_settings").select("site_name, site_logo, site_favicon, home_images").eq("id", 1).maybeSingle();
  const raw = data?.home_images;
  const images: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const key of ["banner", "esporte", "show", "congresso"]) {
      const value = raw[key];
      if (typeof value === "string" && value.startsWith("https://")) images[key] = value;
    }
  }
  return { name: data?.site_name ?? "Inscreva", logo: data?.site_logo ?? null, favicon: data?.site_favicon ?? null, images };
});
