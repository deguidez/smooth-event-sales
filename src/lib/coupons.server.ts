import { getAdmin } from "./asaas.server";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Valida um cupom para um evento e subtotal; retorna o desconto. Fonte única de regra de cupom. */
export async function evaluateCoupon(code: string, eventId: string, subtotal: number) {
  const admin = await getAdmin();
  const { data: c } = await (admin as any).from("coupons").select("*").eq("code", code.trim().toUpperCase()).maybeSingle();
  if (!c || !c.active) throw new Error("Cupom inválido");
  if (c.event_id && c.event_id !== eventId) throw new Error("Este cupom não vale para este evento");
  if (c.valid_until && new Date(c.valid_until).getTime() < Date.now()) throw new Error("Cupom expirado");
  if (c.min_amount != null && subtotal < Number(c.min_amount)) throw new Error(`Cupom válido para compras a partir de R$ ${Number(c.min_amount).toFixed(2).replace(".", ",")}`);
  if (c.max_uses != null) {
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("coupon_id" as any, c.id).in("status", ["pago", "pendente"]);
    if ((count ?? 0) >= c.max_uses) throw new Error("Cupom esgotado");
  }
  const discount = Math.min(subtotal, r2((subtotal * Number(c.percent)) / 100));
  return { id: c.id as string, code: c.code as string, percent: Number(c.percent), discount };
}
