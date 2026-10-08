import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { auditedAction } from "./activity-middleware";
import { getAdmin } from "./asaas.server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!data) throw new Error("Acesso restrito ao super admin");
}

export const checkCoupon = createServerFn({ method: "POST" })
  .middleware([auditedAction("checkCoupon")])
  .inputValidator((d) => z.object({ code: z.string().trim().min(1).max(40), eventId: z.string().uuid(), subtotal: z.number().min(0) }).parse(d))
  .handler(async ({ data }) => {
    const { evaluateCoupon } = await import("./coupons.server");
    const c = await evaluateCoupon(data.code, data.eventId, data.subtotal);
    return { code: c.code, percent: c.percent };
  });

export const listCoupons = createServerFn({ method: "GET" })
  .middleware([auditedAction("listCoupons")])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin: any = await getAdmin();
    const { data: coupons } = await admin.from("coupons").select("*, events(title)").order("created_at", { ascending: false });
    const { data: uses } = await admin
      .from("orders")
      .select("id, code, coupon_id, discount, total, status, participant_name, participant_email, created_at, events(title)")
      .not("coupon_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    return { coupons: coupons ?? [], uses: uses ?? [] };
  });

const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use só letras, números, - ou _"),
  event_id: z.string().uuid().nullable(),
  percent: z.number().gt(0).max(100),
  min_amount: z.number().min(0).nullable(),
  valid_until: z.string().max(40).nullable(),
  max_uses: z.number().int().min(1).nullable(),
  active: z.boolean(),
});

export const saveCoupon = createServerFn({ method: "POST" })
  .middleware([auditedAction("saveCoupon")])
  .inputValidator((d) => couponSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin: any = await getAdmin();
    const { id, ...row } = data;
    const payload = { ...row, code: row.code.toUpperCase() };
    const { error } = id ? await admin.from("coupons").update(payload).eq("id", id) : await admin.from("coupons").insert(payload);
    if (error) throw new Error(error.code === "23505" ? "Já existe um cupom com esse código" : error.message);
    return { ok: true };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([auditedAction("deleteCoupon")])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin: any = await getAdmin();
    const { error } = await admin.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
