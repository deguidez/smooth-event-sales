import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { auditedAction } from "./activity-middleware";
import { writeActivity } from "./activity.server";
import { getAdmin } from "./asaas.server";

const ORDER_COLS =
  "id, code, event_id, participant_name, participant_cpf, participant_phone, participant_birth_date, participant_gender, shirt_size, team, items, custom_answers, total, status, paid_at, ticket_types(name)";

function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** RLS decides: only the event's producer or a super admin can read the event. */
async function assertEventAccess(supabase: any, eventId: string) {
  const { data } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!data) throw new Error("Evento não encontrado");
}

export const getKitAccess = createServerFn({ method: "POST" })
  .middleware([auditedAction("getKitAccess")])
  .inputValidator((d) => z.object({ eventId: z.string().uuid(), rotate: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEventAccess(context.supabase, data.eventId);
    const admin = await getAdmin();
    const { data: ex } = await admin.from("kit_access").select("token").eq("event_id", data.eventId).maybeSingle();
    if (ex && !data.rotate) return { token: ex.token };
    const token = newToken();
    await admin.from("kit_access").upsert({ event_id: data.eventId, token, active: true });
    return { token };
  });

export const kitDashboard = createServerFn({ method: "GET" })
  .middleware([auditedAction("kitDashboard")])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEventAccess(context.supabase, data.eventId);
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await context.supabase.from("orders").select(ORDER_COLS).eq("event_id", data.eventId).eq("status", "pago").order("participant_name").range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const { data: dels } = await context.supabase.from("kit_deliveries").select("*").eq("event_id", data.eventId);
    const admin = await getAdmin();
    const deliveries = await Promise.all(
      (dels ?? []).map(async (d: any) => {
        let photo_url: string | null = null;
        if (d.photo_path) {
          const { data: s } = await admin.storage.from("kit-photos").createSignedUrl(d.photo_path, 60 * 30);
          photo_url = s?.signedUrl ?? null;
        }
        return { ...d, photo_url };
      }),
    );
    return { orders: rows, deliveries };
  });

async function eventFromToken(token: string) {
  const admin = await getAdmin();
  const { data: acc } = await admin.from("kit_access").select("event_id, active").eq("token", token).maybeSingle();
  if (!acc?.active) throw new Error("Link de entrega inválido ou desativado");
  const { data: ev } = await admin.from("events").select("id, title, starts_at, venue, city, custom_fields").eq("id", acc.event_id).single();
  if (!ev) throw new Error("Evento não encontrado");
  return { admin, ev };
}

const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/, "Link inválido");

export const kitOpen = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { admin, ev } = await eventFromToken(data.token);
    const [{ count: total }, { count: delivered }] = await Promise.all([
      admin.from("orders").select("id", { count: "exact", head: true }).eq("event_id", ev.id).eq("status", "pago"),
      admin.from("kit_deliveries").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    ]);
    return { event: ev, total: total ?? 0, delivered: delivered ?? 0 };
  });

export const kitSearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema, q: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, ev } = await eventFromToken(data.token);
    const raw = data.q;
    const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    const digits = raw.replace(/\D/g, "");
    let q = admin.from("orders").select(ORDER_COLS).eq("event_id", ev.id).in("status", ["pago", "pendente"]).limit(10);
    if (uuid) q = q.eq("id", uuid.toLowerCase());
    else if (digits.length === 11 && /^[\d.\-\s]+$/.test(raw)) q = q.eq("participant_cpf", digits);
    else q = q.ilike("code", raw.replace(/^#/, "").replace(/[%_]/g, ""));
    const { data: orders } = await q;
    const ids = (orders ?? []).map((o: any) => o.id);
    const { data: dels } = ids.length ? await admin.from("kit_deliveries").select("order_id, operator_name, receiver_type, third_name, delivered_at").in("order_id", ids) : { data: [] as any[] };
    return { orders: orders ?? [], deliveries: dels ?? [], fields: ev.custom_fields };
  });

export const kitDeliver = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      token: tokenSchema,
      orderId: z.string().uuid(),
      operatorName: z.string().trim().min(2).max(80),
      third: z.object({
        name: z.string().trim().min(3).max(120),
        phone: z.string().trim().min(10).max(20),
        cpf: z.string().regex(/^\d{11}$/, "CPF inválido"),
        photo: z.string().startsWith("data:image/jpeg;base64,").max(3_000_000),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, ev } = await eventFromToken(data.token);
    const { data: order } = await admin.from("orders").select("id, status, items, shirt_size, participant_name").eq("id", data.orderId).eq("event_id", ev.id).maybeSingle();
    if (!order) throw new Error("Inscrição não encontrada neste evento");
    if (order.status !== "pago") throw new Error("Inscrição sem pagamento confirmado — kit não pode ser entregue");
    const { data: ex } = await admin.from("kit_deliveries").select("operator_name, delivered_at").eq("order_id", order.id).maybeSingle();
    if (ex) throw new Error(`Kit já entregue por ${ex.operator_name} em ${new Date(ex.delivered_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);

    let photo_path: string | null = null;
    if (data.third) {
      const bin = Uint8Array.from(atob(data.third.photo.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      photo_path = `${ev.id}/${order.id}-${Date.now()}.jpg`;
      const { error } = await admin.storage.from("kit-photos").upload(photo_path, bin, { contentType: "image/jpeg" });
      if (error) throw new Error("Não foi possível salvar a foto. Tente novamente.");
    }
    const req = getRequest();
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const items = [
      ...(order.shirt_size ? [{ name: "Camiseta", size: order.shirt_size, qty: 1 }] : []),
      ...((order.items as any[]) ?? []),
    ];
    const { data: row, error } = await admin.from("kit_deliveries").insert({
      order_id: order.id, event_id: ev.id, operator_name: data.operatorName,
      receiver_type: data.third ? "terceiro" : "titular",
      third_name: data.third?.name ?? null, third_phone: data.third?.phone ?? null, third_cpf: data.third?.cpf ?? null,
      photo_path, items: items as any, ip, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    }).select("delivered_at").single();
    if (error) {
      if (photo_path) await admin.storage.from("kit-photos").remove([photo_path]);
      throw new Error(error.code === "23505" ? "Kit já entregue para esta inscrição" : "Não foi possível registrar a entrega");
    }
    await writeActivity({ area: "entrega-kit", source: "server", action: "kitDelivered", entityType: "order", entityId: order.id,
      details: { event_id: ev.id, receiver: data.third ? "terceiro" : "titular" } });
    return { delivered_at: row.delivered_at };
  });
