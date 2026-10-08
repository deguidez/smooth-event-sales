import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asaasFetch, getAdmin, loadSettings } from "./asaas.server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!data) throw new Error("Acesso restrito ao super admin");
}

function origin() {
  try {
    const req = getRequest();
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadSettings();
    const { asaas_api_key, asaas_webhook_token, ...rest } = s;
    return {
      ...rest,
      hasApiKey: !!asaas_api_key,
      apiKeyPreview: asaas_api_key ? `••••${asaas_api_key.slice(-4)}` : null,
      hasWebhookToken: !!asaas_webhook_token,
      webhookUrl: `${origin()}/api/public/asaas-webhook`,
    };
  });

const settingsSchema = z.object({
  site_name: z.string().trim().min(1).max(80).optional(),
  asaas_env: z.enum(["sandbox", "producao"]).optional(),
  asaas_api_key: z.string().trim().max(400).optional(),
  platform_wallet_id: z.string().trim().max(100).nullable().optional(),
  fee_percent: z.number().min(0).max(50).optional(),
  fee_fixed: z.number().min(0).max(1000).optional(),
  fee_paid_by_buyer: z.boolean().optional(),
  asaas_fee_pix: z.number().min(0).max(100).optional(),
  asaas_fee_boleto: z.number().min(0).max(100).optional(),
  asaas_fee_card_percent: z.number().min(0).max(20).optional(),
  asaas_fee_card_fixed: z.number().min(0).max(100).optional(),
  asaas_fee_paid_by: z.enum(["plataforma", "produtor"]).optional(),
  max_installments: z.number().int().min(1).max(21).optional(),
  boleto_due_days: z.number().int().min(1).max(30).optional(),
  enable_pix: z.boolean().optional(),
  enable_boleto: z.boolean().optional(),
  enable_card: z.boolean().optional(),
  site_domain: z.string().trim().max(200).nullable().optional(),
  email_from_name: z.string().trim().max(100).nullable().optional(),
  email_from_address: z.string().trim().email().max(200).nullable().optional(),
  support_email: z.string().trim().email().max(200).nullable().optional(),
});

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: profiles } = await context.supabase.from("profiles").select("id, full_name, email, phone, cpf, birth_date, gender, city, state, created_at").order("created_at", { ascending: false });
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const { data: orders } = await context.supabase.from("orders").select("user_id, status, total");
    return (profiles ?? []).map((p: any) => {
      const mine = (orders ?? []).filter((o: any) => o.user_id === p.id);
      return {
        ...p,
        roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role as string),
        orders: mine.length,
        spent: mine.filter((o: any) => o.status === "pago").reduce((s: number, o: any) => s + Number(o.total), 0),
      };
    });
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: z.enum(["super_admin", "producer", "athlete"]), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role === "super_admin" && !data.enabled) throw new Error("Você não pode remover seu próprio acesso de super admin");
    const admin = await getAdmin();
    if (data.enabled) {
      const { error } = await admin.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: any = { ...data, updated_at: new Date().toISOString() };
    if (!data.asaas_api_key) delete patch.asaas_api_key;
    const admin = await getAdmin();
    const { error } = await admin.from("platform_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAsaasConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadSettings();
    try {
      const balance = await asaasFetch<{ balance: number }>(s, "/finance/balance");
      const wallets = await asaasFetch<{ data: { id: string }[] }>(s, "/wallets");
      const walletId = wallets?.data?.[0]?.id ?? null;
      if (walletId && !s.platform_wallet_id) {
        const admin = await getAdmin();
        await admin.from("platform_settings").update({ platform_wallet_id: walletId }).eq("id", 1);
      }
      return { ok: true as const, balance: balance.balance, walletId };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const registerAsaasWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadSettings();
    const admin = await getAdmin();
    const token =
      s.asaas_webhook_token ??
      (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 48);
    const { data: u } = await admin.auth.admin.getUserById(context.userId);
    const url = `${origin()}/api/public/asaas-webhook`;
    try {
      await asaasFetch(s, "/webhooks", {
        method: "POST",
        body: {
          name: `${s.site_name} - pagamentos`,
          url,
          email: u.user?.email ?? undefined,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          authToken: token,
          sendType: "SEQUENTIALLY",
          events: [
            "PAYMENT_CONFIRMED",
            "PAYMENT_RECEIVED",
            "PAYMENT_OVERDUE",
            "PAYMENT_REFUNDED",
            "PAYMENT_DELETED",
            "PAYMENT_CHARGEBACK_REQUESTED",
          ],
        },
      });
      await admin.from("platform_settings").update({ asaas_webhook_token: token }).eq("id", 1);
      return { ok: true as const, url };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, url };
    }
  });

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const t0 = Date.now();
    const tables = ["profiles", "producers", "events", "ticket_types", "orders", "email_log"] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    const s = await loadSettings();
    return {
      latencyMs: Date.now() - t0,
      counts,
      asaasConfigured: !!s.asaas_api_key,
      webhookConfigured: !!s.asaas_webhook_token,
      env: s.asaas_env,
    };
  });

export const updateProducer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pendente", "aprovado", "suspenso"]).optional(),
        fee_percent: z.number().min(0).max(50).nullable().optional(),
        fee_fixed: z.number().min(0).max(1000).nullable().optional(),
        asaas_wallet_id: z.string().trim().max(100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const { id, ...patch } = data;
    const { data: p, error } = await admin.from("producers").update(patch as any).eq("id", id).select("user_id, status").single();
    if (error) throw new Error(error.message);
    if (p.status === "aprovado") {
      await admin.from("user_roles").upsert({ user_id: p.user_id, role: "producer" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

/** Cria a subconta (carteira) do produtor no Asaas. Pode ser chamada pelo admin ou pelo próprio produtor. */
export const createProducerWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ producerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: p } = await admin.from("producers").select("*").eq("id", data.producerId).single();
    if (!p) throw new Error("Produtor não encontrado");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isAdmin && p.user_id !== context.userId) throw new Error("Sem permissão");
    if (p.asaas_wallet_id) return { ok: true as const, walletId: p.asaas_wallet_id };
    const s = await loadSettings();
    const doc = p.document.replace(/\D/g, "");
    try {
      const acc = await asaasFetch<{ id: string; walletId: string }>(s, "/accounts", {
        method: "POST",
        body: {
          name: p.company_name,
          email: p.email,
          cpfCnpj: doc,
          birthDate: doc.length === 11 ? p.birth_date : undefined,
          companyType: doc.length === 14 ? (p.company_type ?? "LIMITED") : undefined,
          mobilePhone: p.phone?.replace(/\D/g, ""),
          incomeValue: Number(p.income_value ?? 5000),
          address: p.address,
          addressNumber: p.address_number,
          province: p.province,
          postalCode: p.postal_code?.replace(/\D/g, ""),
        },
      });
      await admin
        .from("producers")
        .update({ asaas_account_id: acc.id, asaas_wallet_id: acc.walletId })
        .eq("id", p.id);
      return { ok: true as const, walletId: acc.walletId };
    } catch (e) {
      let msg = (e as Error).message;
      if (/url informada/i.test(msg))
        msg = "O Asaas recusou criar a subconta (\"A url informada é inválida\"). Isso é uma configuração da sua conta Asaas: peça ao suporte do Asaas para liberar a criação de subcontas via API. Enquanto isso, informe o walletId de uma conta Asaas do produtor.";
      if (/já está em uso/i.test(msg)) msg += " Use outro e-mail no cadastro do produtor ou informe o walletId da conta Asaas dele.";
      return { ok: false as const, error: msg };
    }
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        full_name: z.string().trim().max(150).nullable(),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(30).nullable(),
        cpf: z.string().trim().max(20).nullable(),
        birth_date: z.string().max(10).nullable(),
        gender: z.string().trim().max(30).nullable(),
        city: z.string().trim().max(100).nullable(),
        state: z.string().trim().max(2).nullable(),
        password: z.string().min(6).max(72).optional(),
        roles: z.array(z.enum(["super_admin", "producer", "athlete"])),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && !data.roles.includes("super_admin"))
      throw new Error("Você não pode remover seu próprio acesso de super admin");
    const admin = await getAdmin();
    const authPatch: any = { email: data.email, email_confirm: true, user_metadata: { full_name: data.full_name } };
    if (data.password) authPatch.password = data.password;
    const { error: aErr } = await admin.auth.admin.updateUserById(data.userId, authPatch);
    if (aErr) throw new Error(aErr.message);
    const { userId, password, roles, ...profile } = data;
    const { error: pErr } = await admin.from("profiles").upsert({ id: userId, ...profile, birth_date: profile.birth_date || null, updated_at: new Date().toISOString() });
    if (pErr) throw new Error(pErr.message);
    let del = admin.from("user_roles").delete().eq("user_id", userId);
    if (roles.length) del = del.not("role", "in", `(${roles.join(",")})`);
    await del;
    if (roles.length) await admin.from("user_roles").upsert(roles.map((role) => ({ user_id: userId, role })), { onConflict: "user_id,role" });
    return { ok: true };
  });
