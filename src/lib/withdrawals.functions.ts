import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { auditedAction } from "./activity-middleware";

const ACTIVE = ["aguardando_codigo", "solicitado", "processando", "pago"];

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertSuper(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!data) throw new Error("Acesso restrito ao super admin");
}

async function myProducer(userId: string) {
  const a = await admin();
  const { data } = await a.from("producers").select("id, company_name, email, user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Cadastro de produtor não encontrado");
  return data;
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Saldo do produtor: cartão só libera depois de X dias do pagamento. */
async function computeBalance(producerId: string) {
  const a = await admin();
  const { data: s } = await a.from("platform_settings").select("card_release_days").eq("id", 1).single();
  const days = Number(s?.card_release_days ?? 4);
  const cutoff = Date.now() - days * 86400000;
  const { data: orders } = await a.from("orders").select("producer_amount, payment_method, paid_at, created_at, total")
    .eq("producer_id", producerId).eq("status", "pago").limit(10000);
  let released = 0, pending = 0, month = 0, monthCount = 0;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  for (const o of orders ?? []) {
    const v = Number(o.producer_amount) || 0;
    const paidAt = new Date(o.paid_at ?? o.created_at).getTime();
    if (o.payment_method === "CREDIT_CARD" && paidAt > cutoff) pending += v; else released += v;
    if (paidAt >= monthStart.getTime()) { month += v; monthCount++; }
  }
  const { data: ws } = await a.from("withdrawals").select("amount, status").eq("producer_id", producerId).in("status", ACTIVE.filter((x) => x !== "aguardando_codigo"));
  const withdrawn = (ws ?? []).reduce((t: number, w: any) => t + Number(w.amount), 0);
  const available = Math.max(0, round(released - withdrawn));
  return { available, pending: round(pending), total: round(available + pending), withdrawn: round(withdrawn), month: round(month), monthCount, releaseDays: days };
}

export const getMyFinance = createServerFn({ method: "GET" })
  .middleware([auditedAction("getMyFinance")])
  .handler(async ({ context }) => {
    const p = await myProducer(context.userId);
    const a = await admin();
    const [balance, bank, list] = await Promise.all([
      computeBalance(p.id),
      a.from("producer_bank_accounts").select("*").eq("producer_id", p.id).maybeSingle(),
      a.from("withdrawals").select("id, amount, status, created_at, processed_at, error").eq("producer_id", p.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return { balance, bank: bank.data ?? null, withdrawals: list.data ?? [] };
  });

const bankSchema = z.object({
  bank_code: z.string().regex(/^\d{3}$/, "Escolha o banco"),
  bank_name: z.string().trim().min(2).max(120),
  agency: z.string().regex(/^\d{1,6}$/, "Agência inválida"),
  agency_digit: z.string().regex(/^[0-9xX]{0,2}$/).optional().default(""),
  account: z.string().regex(/^\d{1,15}$/, "Conta inválida"),
  account_digit: z.string().regex(/^[0-9xX]{0,2}$/).optional().default(""),
  account_type: z.enum(["CONTA_CORRENTE", "CONTA_POUPANCA"]),
  owner_name: z.string().trim().min(3).max(120),
  owner_document: z.string().regex(/^(\d{11}|\d{14})$/, "CPF/CNPJ inválido"),
});

export const saveMyBankAccount = createServerFn({ method: "POST" })
  .middleware([auditedAction("saveMyBankAccount")])
  .inputValidator((d) => bankSchema.parse(d))
  .handler(async ({ data, context }) => {
    const p = await myProducer(context.userId);
    const a = await admin();
    const { data: full } = await a.from("producers").select("document").eq("id", p.id).single();
    if (full?.document && full.document !== data.owner_document) throw new Error("A conta precisa ser do mesmo CPF/CNPJ do cadastro de produtor");
    const { error } = await a.from("producer_bank_accounts").upsert({ ...data, producer_id: p.id, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar a conta");
    return { ok: true };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([auditedAction("requestWithdrawal")])
  .inputValidator((d) => z.object({ amount: z.number().positive().max(10_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await myProducer(context.userId);
    const a = await admin();
    const { data: bank } = await a.from("producer_bank_accounts").select("*").eq("producer_id", p.id).maybeSingle();
    if (!bank) throw new Error("Cadastre sua conta bancária antes de sacar");
    const bal = await computeBalance(p.id);
    const amount = round(data.amount);
    if (amount > bal.available) throw new Error("Valor maior que o saldo disponível");
    // cancela pedidos antigos sem código confirmado
    await a.from("withdrawals").update({ status: "cancelado" }).eq("producer_id", p.id).eq("status", "aguardando_codigo");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
    const { data: w, error } = await a.from("withdrawals").insert({
      producer_id: p.id, amount, status: "aguardando_codigo",
      code_hash: await sha256(code), code_expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      bank: { bank_code: bank.bank_code, bank_name: bank.bank_name, agency: bank.agency, agency_digit: bank.agency_digit, account: bank.account, account_digit: bank.account_digit, account_type: bank.account_type, owner_name: bank.owner_name, owner_document: bank.owner_document },
    }).select("id").single();
    if (error || !w) throw new Error("Não foi possível iniciar o saque");
    const { data: prof } = await a.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle();
    const to = prof?.email || p.email;
    try {
      const { sendTemplateEmail } = await import("./email-templates/send-email");
      await sendTemplateEmail("withdrawal-code", to, {
        templateData: { name: prof?.full_name || p.company_name, code, amount: amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        idempotencyKey: `withdrawal-code-${w.id}`,
      });
    } catch (e) {
      console.error("withdrawal code email failed", e);
      await a.from("withdrawals").update({ status: "cancelado", error: "falha no envio do código" }).eq("id", w.id);
      throw new Error("Não foi possível enviar o código por e-mail. Tente novamente mais tarde.");
    }
    const masked = to.replace(/^(.{2}).*(@.*)$/, "$1***$2");
    return { id: w.id, email: masked };
  });

export const confirmWithdrawal = createServerFn({ method: "POST" })
  .middleware([auditedAction("confirmWithdrawal")])
  .inputValidator((d) => z.object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await myProducer(context.userId);
    const a = await admin();
    const { data: w } = await a.from("withdrawals").select("*").eq("id", data.id).eq("producer_id", p.id).maybeSingle();
    if (!w || w.status !== "aguardando_codigo") throw new Error("Pedido de saque não encontrado");
    if (new Date(w.code_expires_at).getTime() < Date.now() || w.attempts >= 5) {
      await a.from("withdrawals").update({ status: "cancelado", error: "código expirado" }).eq("id", w.id);
      throw new Error("Código expirado. Peça o saque novamente.");
    }
    if ((await sha256(data.code)) !== w.code_hash) {
      await a.from("withdrawals").update({ attempts: w.attempts + 1 }).eq("id", w.id);
      throw new Error("Código incorreto");
    }
    const bal = await computeBalance(p.id);
    if (Number(w.amount) > bal.available) {
      await a.from("withdrawals").update({ status: "cancelado", error: "saldo insuficiente" }).eq("id", w.id);
      throw new Error("Saldo insuficiente");
    }
    await a.from("withdrawals").update({ status: "solicitado", code_hash: null, confirmed_at: new Date().toISOString() }).eq("id", w.id);
    return { ok: true };
  });

// ---------- Super admin ----------

export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([auditedAction("listWithdrawals")])
  .handler(async ({ context }) => {
    await assertSuper(context);
    const a = await admin();
    const { data } = await a.from("withdrawals").select("id, amount, status, bank, created_at, confirmed_at, processed_at, error, asaas_transfer_id, producer_id, producers(company_name, email)")
      .neq("status", "aguardando_codigo").neq("status", "cancelado").order("created_at", { ascending: false }).limit(200);
    const { data: secrets } = await a.from("producer_secrets").select("producer_id, asaas_api_key");
    const withKey = new Set((secrets ?? []).filter((s: any) => s.asaas_api_key).map((s: any) => s.producer_id));
    return (data ?? []).map((w: any) => ({ ...w, has_key: withKey.has(w.producer_id) }));
  });

export const setProducerAsaasKey = createServerFn({ method: "POST" })
  .middleware([auditedAction("setProducerAsaasKey")])
  .inputValidator((d) => z.object({ producerId: z.string().uuid(), apiKey: z.string().trim().max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const a = await admin();
    await a.from("producer_secrets").upsert({ producer_id: data.producerId, asaas_api_key: data.apiKey || null, updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const hasProducerAsaasKey = createServerFn({ method: "POST" })
  .middleware([auditedAction("hasProducerAsaasKey")])
  .inputValidator((d) => z.object({ producerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const a = await admin();
    const { data: s } = await a.from("producer_secrets").select("asaas_api_key").eq("producer_id", data.producerId).maybeSingle();
    return { has: !!s?.asaas_api_key };
  });

export const processWithdrawal = createServerFn({ method: "POST" })
  .middleware([auditedAction("processWithdrawal")])
  .inputValidator((d) => z.object({ id: z.string().uuid(), action: z.enum(["asaas", "manual", "recusar"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const a = await admin();
    const { data: w } = await a.from("withdrawals").select("*").eq("id", data.id).single();
    if (!w || w.status !== "solicitado") throw new Error("Este saque não está aguardando pagamento");
    const now = new Date().toISOString();
    if (data.action === "recusar") {
      await a.from("withdrawals").update({ status: "recusado", processed_at: now }).eq("id", w.id);
      return { status: "recusado" };
    }
    if (data.action === "manual") {
      await a.from("withdrawals").update({ status: "pago", processed_at: now }).eq("id", w.id);
      return { status: "pago" };
    }
    const { data: sec } = await a.from("producer_secrets").select("asaas_api_key").eq("producer_id", w.producer_id).maybeSingle();
    if (!sec?.asaas_api_key) throw new Error("Cadastre a chave da API da subconta Asaas deste produtor (aba Produtores)");
    const { data: s } = await a.from("platform_settings").select("asaas_env").eq("id", 1).single();
    const { asaasFetch } = await import("./asaas.server");
    const b = w.bank as any;
    await a.from("withdrawals").update({ status: "processando" }).eq("id", w.id);
    try {
      const t: any = await asaasFetch({ asaas_env: s.asaas_env, asaas_api_key: sec.asaas_api_key }, "/transfers", {
        method: "POST",
        body: {
          value: Number(w.amount),
          operationType: "PIX",
          bankAccount: {
            bank: { code: b.bank_code }, accountName: b.bank_name, ownerName: b.owner_name, cpfCnpj: b.owner_document,
            agency: b.agency, agencyDigit: b.agency_digit || undefined, account: b.account, accountDigit: b.account_digit || "0",
            bankAccountType: b.account_type,
          },
          description: `Saque ${w.id.slice(0, 8)}`,
        },
      });
      const st = t?.status === "DONE" ? "pago" : t?.status === "FAILED" || t?.status === "CANCELLED" ? "falhou" : "processando";
      await a.from("withdrawals").update({ status: st, asaas_transfer_id: t?.id ?? null, processed_at: now, error: null }).eq("id", w.id);
      return { status: st };
    } catch (e) {
      await a.from("withdrawals").update({ status: "solicitado", error: e instanceof Error ? e.message.slice(0, 300) : "erro" }).eq("id", w.id);
      throw e;
    }
  });
