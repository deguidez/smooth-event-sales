// Gerenciador de equipes: convites por CPF, inscrições em lote e cobranças
// (uma cobrança única para o grupo ou uma cobrança por atleta enviada por e-mail).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { auditedAction } from "./activity-middleware";
import { applyOrderStatus, asaasFetch, getAdmin, loadSettings, mapAsaasStatus } from "./asaas.server";
import { computeFees, type Method } from "./fees";
import { cleanAnswers, parseFields } from "./custom-fields";
import { activeTerms } from "./terms";

async function isSuper(ctx: any) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  return !!data;
}

async function assertManager(userId: string) {
  const admin = await getAdmin();
  const { data } = await admin.from("team_managers").select("status, team_name").eq("user_id", userId).maybeSingle();
  if (!data || data.status !== "aprovado") throw new Error("Seu acesso de gerente de equipe ainda não foi liberado");
  return data;
}

const maskCpf = (c: string | null) => (c ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : "");

export const getTeamState = createServerFn({ method: "GET" })
  .middleware([auditedAction("getTeamState")])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: manager } = await admin.from("team_managers").select("*").eq("user_id", context.userId).maybeSingle();
    const { data: members } = await admin.from("team_members").select("*").eq("manager_id", context.userId).order("created_at");
    const { data: invites } = await admin.from("team_members").select("*").eq("athlete_id", context.userId).order("created_at", { ascending: false });
    const ids = [...new Set([...(members ?? []).map((m) => m.athlete_id), ...(invites ?? []).map((i) => i.manager_id)])];
    const { data: profs } = ids.length
      ? await admin.from("profiles").select("id, full_name, email, cpf, phone").in("id", ids)
      : { data: [] as any[] };
    const { data: teams } = (invites ?? []).length
      ? await admin.from("team_managers").select("user_id, team_name").in("user_id", (invites ?? []).map((i) => i.manager_id))
      : { data: [] as any[] };
    const pf = (id: string) => (profs ?? []).find((p: any) => p.id === id);
    return {
      manager,
      members: (members ?? []).map((m) => {
        const p = pf(m.athlete_id);
        const ok = m.status === "aceito";
        return {
          id: m.id, athleteId: m.athlete_id, status: m.status,
          name: p?.full_name ?? "Atleta",
          email: ok ? p?.email ?? "" : "",
          cpf: ok ? p?.cpf ?? "" : maskCpf(p?.cpf ?? null),
          complete: !!(p?.full_name && p?.cpf && p?.email),
        };
      }),
      invites: (invites ?? []).map((i) => ({
        id: i.id, status: i.status,
        managerName: pf(i.manager_id)?.full_name ?? "Gerente",
        teamName: (teams ?? []).find((t: any) => t.user_id === i.manager_id)?.team_name ?? "Equipe",
      })),
    };
  });

export const requestTeamManager = createServerFn({ method: "POST" })
  .middleware([auditedAction("requestTeamManager")])
  .inputValidator((d) => z.object({ teamName: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: ex } = await admin.from("team_managers").select("status").eq("user_id", context.userId).maybeSingle();
    if (ex) {
      await admin.from("team_managers").update({ team_name: data.teamName }).eq("user_id", context.userId);
    } else {
      await admin.from("team_managers").insert({ user_id: context.userId, team_name: data.teamName });
    }
    return { ok: true };
  });

export const inviteByCpf = createServerFn({ method: "POST" })
  .middleware([auditedAction("inviteTeamMember")])
  .inputValidator((d) => z.object({ cpf: z.string().regex(/^\d{11}$/, "CPF inválido") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    const admin = await getAdmin();
    const { data: p } = await admin.from("profiles").select("id, full_name").eq("cpf", data.cpf).maybeSingle();
    if (!p) throw new Error("Nenhum atleta com cadastro ativo encontrado para esse CPF");
    if (p.id === context.userId) throw new Error("Você não pode convidar a si mesmo");
    const { data: ex } = await admin.from("team_members").select("id, status").eq("manager_id", context.userId).eq("athlete_id", p.id).maybeSingle();
    if (ex?.status === "aceito") throw new Error("Esse atleta já está na sua equipe");
    if (ex) await admin.from("team_members").update({ status: "convidado", responded_at: null }).eq("id", ex.id);
    else await admin.from("team_members").insert({ manager_id: context.userId, athlete_id: p.id });
    return { name: p.full_name ?? "Atleta" };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([auditedAction("removeTeamMember")])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    // O gerente remove da equipe; o atleta também pode sair.
    const { data: m } = await admin.from("team_members").select("manager_id, athlete_id").eq("id", data.id).maybeSingle();
    if (!m || (m.manager_id !== context.userId && m.athlete_id !== context.userId)) throw new Error("Não encontrado");
    await admin.from("team_members").delete().eq("id", data.id);
    return { ok: true };
  });

export const respondTeamInvite = createServerFn({ method: "POST" })
  .middleware([auditedAction("respondTeamInvite")])
  .inputValidator((d) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: upd } = await admin.from("team_members")
      .update({ status: data.accept ? "aceito" : "recusado", responded_at: new Date().toISOString() })
      .eq("id", data.id).eq("athlete_id", context.userId).select("id");
    if (!upd?.length) throw new Error("Convite não encontrado");
    return { ok: true };
  });

export const listTeamEvents = createServerFn({ method: "GET" })
  .middleware([auditedAction("listTeamEvents")])
  .handler(async ({ context }) => {
    await assertManager(context.userId);
    const admin = await getAdmin();
    const s = await loadSettings();
    const { data: evs } = await admin.from("events")
      .select("id, title, starts_at, city, state, producer_id, shirt_enabled, shirt_sizes, custom_fields, terms, fee_percent, fee_fixed, ticket_types(id, name, price, quantity, sold, active, sales_start, sales_end, position)")
      .eq("status", "publicado").gt("starts_at", new Date().toISOString()).order("starts_at").limit(100);
    const prodIds = [...new Set((evs ?? []).map((e) => e.producer_id))];
    const { data: prods } = prodIds.length ? await admin.from("producers").select("id, fee_percent, fee_fixed").in("id", prodIds) : { data: [] as any[] };
    const methods: Method[] = [];
    if (s.enable_pix) methods.push("PIX");
    if (s.enable_boleto) methods.push("BOLETO");
    if (s.enable_card) methods.push("CREDIT_CARD");
    const now = Date.now();
    return {
      methods,
      feeSettings: {
        fee_percent: Number(s.fee_percent), fee_fixed: Number(s.fee_fixed), fee_paid_by_buyer: s.fee_paid_by_buyer,
        asaas_fee_pix: Number(s.asaas_fee_pix), asaas_fee_boleto: Number(s.asaas_fee_boleto),
        asaas_fee_card_percent: Number(s.asaas_fee_card_percent), asaas_fee_card_fixed: Number(s.asaas_fee_card_fixed),
        asaas_fee_paid_by: s.asaas_fee_paid_by,
      },
      events: (evs ?? []).map((e: any) => {
        const pr = (prods ?? []).find((p: any) => p.id === e.producer_id);
        return {
          id: e.id, title: e.title, starts_at: e.starts_at, city: e.city, state: e.state,
          shirt_enabled: e.shirt_enabled, shirt_sizes: e.shirt_sizes,
          fields: parseFields(e.custom_fields), terms: activeTerms(e.terms),
          feeOverride: { fee_percent: e.fee_percent ?? pr?.fee_percent ?? null, fee_fixed: e.fee_fixed ?? pr?.fee_fixed ?? null },
          tickets: (e.ticket_types ?? [])
            .filter((t: any) => t.active && (!t.sales_start || new Date(t.sales_start).getTime() <= now) && (!t.sales_end || new Date(t.sales_end).getTime() >= now))
            .sort((a: any, b: any) => a.position - b.position)
            .map((t: any) => ({ id: t.id, name: t.name, price: Number(t.price), available: t.quantity - t.sold })),
        };
      }),
    };
  });

const createSchema = z.object({
  ticketId: z.string().uuid(),
  method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  mode: z.enum(["grupo", "individual"]),
  accepted: z.array(z.string().max(100)).max(50).default([]),
  entries: z.array(z.object({
    athleteId: z.string().uuid(),
    shirt_size: z.string().max(10).optional().nullable(),
    answers: z.record(z.string(), z.any()).default({}),
  })).min(1).max(200),
});

export const createTeamOrders = createServerFn({ method: "POST" })
  .middleware([auditedAction("createTeamOrders")])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mgr = await assertManager(context.userId);
    const admin = await getAdmin();
    const s = await loadSettings();
    const { data: tt } = await admin.from("ticket_types")
      .select("*, events!inner(id, title, status, producer_id, shirt_enabled, shirt_sizes, fee_percent, fee_fixed, custom_fields, terms, registration_ends_at, registrations_open_at, registration_limit, queue_enabled)")
      .eq("id", data.ticketId).single();
    if (!tt || tt.events.status !== "publicado" || !tt.active) throw new Error("Inscrição indisponível");
    const ev: any = tt.events;
    const now = Date.now();
    if (tt.sales_start && new Date(tt.sales_start).getTime() > now) throw new Error("Vendas ainda não começaram");
    if (tt.sales_end && new Date(tt.sales_end).getTime() < now) throw new Error("Vendas encerradas para este lote");
    if (ev.registrations_open_at && new Date(ev.registrations_open_at).getTime() > now) throw new Error("As inscrições ainda não abriram");
    if (ev.registration_ends_at && new Date(ev.registration_ends_at).getTime() < now) throw new Error("Inscrições encerradas");
    if (ev.queue_enabled) {
      const { data: qe } = await admin.from("queue_entries").select("status, expires_at").eq("event_id", ev.id).eq("user_id", context.userId).maybeSingle();
      if (!qe || qe.status !== "admitted" || !qe.expires_at || new Date(qe.expires_at).getTime() < now)
        throw new Error("Este evento tem fila de espera. Entre na fila pela página do evento antes de inscrever a equipe.");
    }
    const terms = activeTerms(ev.terms);
    const missing = terms.find((t) => !data.accepted.includes(t.id));
    if (missing) throw new Error(`Aceite o termo "${missing.title}" em nome dos atletas`);
    const acceptedTerms = terms.map((t) => ({ id: t.id, title: t.title, text: t.text, accepted_at: new Date().toISOString(), accepted_by_manager: context.userId }));

    const ids = [...new Set(data.entries.map((e) => e.athleteId))];
    if (ids.length !== data.entries.length) throw new Error("Atleta repetido na lista");
    const { data: mem } = await admin.from("team_members").select("athlete_id").eq("manager_id", context.userId).eq("status", "aceito").in("athlete_id", ids);
    if ((mem ?? []).length !== ids.length) throw new Error("Algum atleta ainda não aceitou participar da equipe");
    const { data: profs } = await admin.from("profiles").select("*").in("id", ids);
    const { data: dup } = await admin.from("orders").select("user_id").eq("event_id", ev.id).in("status", ["pago", "pendente"]).in("user_id", ids);
    if (dup?.length) {
      const n = (profs ?? []).find((p) => p.id === dup[0]!.user_id)?.full_name;
      throw new Error(`${n ?? "Um atleta"} já tem inscrição neste evento`);
    }
    const { count: reserved } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("ticket_type_id", tt.id).in("status", ["pago", "pendente"]);
    if ((reserved ?? 0) + ids.length > tt.quantity) throw new Error(`Restam só ${Math.max(0, tt.quantity - (reserved ?? 0))} vagas neste lote`);
    if (ev.registration_limit != null) {
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("event_id", ev.id).in("status", ["pago", "pendente"]);
      if ((count ?? 0) + ids.length > ev.registration_limit) throw new Error("Não há vagas suficientes no evento");
    }
    const { data: producer } = await admin.from("producers").select("*").eq("id", ev.producer_id).single();
    if (!producer) throw new Error("Produtor não encontrado");
    const price = Number(tt.price);
    const f = computeFees(price, data.method, s as any, { fee_percent: ev.fee_percent ?? producer.fee_percent, fee_fixed: ev.fee_fixed ?? producer.fee_fixed });
    const fields = parseFields(ev.custom_fields);
    const groupId = data.mode === "grupo" ? crypto.randomUUID() : null;

    const rows = data.entries.map((e) => {
      const p = (profs ?? []).find((x) => x.id === e.athleteId);
      if (!p?.full_name || !p.cpf || !p.email) throw new Error(`${p?.full_name ?? "Atleta"} precisa completar nome, CPF e e-mail no cadastro`);
      if (ev.shirt_enabled && !ev.shirt_sizes.includes(e.shirt_size ?? "")) throw new Error(`Escolha a camisa de ${p.full_name}`);
      let answers: any;
      try { answers = cleanAnswers(fields, e.answers); } catch (err) { throw new Error(`${p.full_name}: ${(err as Error).message}`); }
      return {
        user_id: p.id, manager_id: context.userId, payment_group_id: groupId,
        event_id: ev.id, ticket_type_id: tt.id, producer_id: producer.id,
        participant_name: p.full_name, participant_email: p.email, participant_cpf: p.cpf,
        participant_phone: p.phone || null, participant_birth_date: p.birth_date || null, participant_gender: p.gender || null,
        shirt_size: ev.shirt_enabled ? e.shirt_size ?? null : null, team: mgr.team_name,
        ticket_price: price, products_total: 0, items: [] as any, custom_answers: answers, accepted_terms: acceptedTerms as any,
        service_fee: f.serviceFee, total: f.total, producer_amount: f.producerAmount, platform_amount: f.platformAmount,
        asaas_fee_estimate: f.asaasFee, payment_method: data.method, discount: 0,
      };
    });

    if (price <= 0) {
      const { data: ins, error } = await admin.from("orders").insert(rows.map((r) => ({ ...r, status: "pendente" as const }))).select("id");
      if (error) throw new Error(error.message);
      for (const o of ins ?? []) await applyOrderStatus(o.id, "pago");
      return { count: ins?.length ?? 0, free: true };
    }
    if (!s.asaas_api_key) throw new Error("Pagamentos ainda não configurados pela plataforma");
    if (producer.status !== "aprovado" || !producer.asaas_wallet_id) throw new Error("O produtor deste evento ainda não está habilitado para receber pagamentos");

    const { data: orders, error } = await admin.from("orders").insert(rows).select("id, code, user_id, participant_name, participant_email, participant_cpf, participant_phone");
    if (error || !orders) throw new Error(error?.message ?? "Erro ao criar inscrições");
    const due = new Date();
    due.setDate(due.getDate() + (data.method === "BOLETO" ? s.boleto_due_days : 1));
    const dueDate = due.toISOString().slice(0, 10);

    async function charge(customer: { name: string; cpf: string; email: string; phone?: string | null; ref: string }, value: number, producerValue: number, ref: string, description: string) {
      const c = await asaasFetch<{ id: string }>(s, "/customers", {
        method: "POST",
        body: { name: customer.name, cpfCnpj: customer.cpf, email: customer.email, mobilePhone: customer.phone?.replace(/\D/g, "") || undefined, externalReference: customer.ref, notificationDisabled: true },
      });
      const payment = await asaasFetch<any>(s, "/payments", {
        method: "POST",
        body: {
          customer: c.id, billingType: data.method, dueDate, description, externalReference: ref, value,
          split: producerValue > 0 ? [{ walletId: producer!.asaas_wallet_id, fixedValue: Math.round(producerValue * 100) / 100 }] : undefined,
        },
      });
      const patch: any = { asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl, bank_slip_url: payment.bankSlipUrl ?? null, due_date: payment.dueDate };
      if (data.method === "PIX") {
        const qr = await asaasFetch<{ encodedImage: string; payload: string }>(s, `/payments/${payment.id}/pixQrCode`);
        patch.pix_qr_image = qr.encodedImage;
        patch.pix_payload = qr.payload;
      }
      return patch;
    }

    if (groupId) {
      const { data: me } = await admin.from("profiles").select("full_name, cpf, email, phone").eq("id", context.userId).single();
      if (!me?.cpf || !me.full_name) {
        await admin.from("orders").update({ status: "cancelado" }).eq("payment_group_id", groupId);
        throw new Error("Complete seu nome e CPF em Minha conta → Meus dados para pagar em grupo");
      }
      try {
        const n = orders.length;
        const total = Math.round(f.total * n * 100) / 100;
        const patch = await charge({ name: me.full_name, cpf: me.cpf, email: me.email ?? "", phone: me.phone, ref: context.userId }, total, f.producerAmount * n,
          `grp_${groupId}`, `${ev.title} - ${tt.name} - ${n} inscrições (${mgr.team_name})`);
        await admin.from("orders").update(patch).eq("payment_group_id", groupId);
      } catch (e) {
        await admin.from("orders").update({ status: "cancelado" }).eq("payment_group_id", groupId);
        throw new Error("Não foi possível gerar a cobrança: " + (e as Error).message);
      }
      return { count: orders.length, groupId };
    }

    const { notifyOrder } = await import("./notify.server");
    const failed: string[] = [];
    for (const o of orders) {
      try {
        const patch = await charge({ name: o.participant_name, cpf: o.participant_cpf, email: o.participant_email, phone: o.participant_phone, ref: o.user_id }, f.total, f.producerAmount,
          o.id, `${ev.title} - ${tt.name} (#${o.code})`);
        await admin.from("orders").update(patch).eq("id", o.id);
        await notifyOrder(o.id, "inscricao_criada");
      } catch {
        await admin.from("orders").update({ status: "cancelado" }).eq("id", o.id);
        failed.push(o.participant_name);
      }
    }
    if (failed.length === orders.length) throw new Error("Não foi possível gerar as cobranças");
    return { count: orders.length - failed.length, failed };
  });

export const listTeamOrders = createServerFn({ method: "GET" })
  .middleware([auditedAction("listTeamOrders")])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data } = await admin.from("orders")
      .select("id, code, status, total, created_at, payment_method, participant_name, participant_email, payment_group_id, invoice_url, pix_payload, pix_qr_image, shirt_size, event_id, events(title, starts_at), ticket_types(name)")
      .eq("manager_id", context.userId).order("created_at", { ascending: false }).limit(1000);
    return data ?? [];
  });

async function ownedPending(userId: string, orderIds: string[]) {
  const admin = await getAdmin();
  const { data } = await admin.from("orders").select("id, status, asaas_payment_id, payment_group_id").eq("manager_id", userId).in("id", orderIds);
  return data ?? [];
}

export const refreshTeamOrders = createServerFn({ method: "POST" })
  .middleware([auditedAction("refreshTeamOrders")])
  .inputValidator((d) => z.object({ orderIds: z.array(z.string().uuid()).min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = (await ownedPending(context.userId, data.orderIds)).filter((o) => o.status === "pendente" && o.asaas_payment_id);
    const s = await loadSettings();
    const byPay = new Map<string, string[]>();
    rows.forEach((o) => byPay.set(o.asaas_payment_id!, [...(byPay.get(o.asaas_payment_id!) ?? []), o.id]));
    let paid = 0;
    for (const [pid, oids] of byPay) {
      const p = await asaasFetch<any>(s, `/payments/${pid}`).catch(() => null);
      if (!p?.status) continue;
      const st = mapAsaasStatus(p.status);
      for (const id of oids) await applyOrderStatus(id, st, { receipt_url: p.transactionReceiptUrl });
      if (st === "pago") paid += oids.length;
    }
    return { paid };
  });

export const cancelTeamOrders = createServerFn({ method: "POST" })
  .middleware([auditedAction("cancelTeamOrders")])
  .inputValidator((d) => z.object({ orderIds: z.array(z.string().uuid()).min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    let rows = (await ownedPending(context.userId, data.orderIds)).filter((o) => o.status === "pendente");
    // Cobrança em grupo é única: cancelar uma cancela o grupo todo.
    const groups = [...new Set(rows.map((r) => r.payment_group_id).filter(Boolean))] as string[];
    if (groups.length) {
      const { data: g } = await admin.from("orders").select("id, status, asaas_payment_id, payment_group_id").eq("manager_id", context.userId).eq("status", "pendente").in("payment_group_id", groups);
      const seen = new Set(rows.map((r) => r.id));
      rows = [...rows, ...(g ?? []).filter((x) => !seen.has(x.id))];
    }
    const s = await loadSettings();
    const pays = new Set(rows.map((r) => r.asaas_payment_id).filter(Boolean) as string[]);
    for (const pid of pays) {
      const p = await asaasFetch<any>(s, `/payments/${pid}`).catch(() => null);
      if (p?.status && mapAsaasStatus(p.status) === "pago") {
        for (const r of rows.filter((x) => x.asaas_payment_id === pid)) await applyOrderStatus(r.id, "pago");
        rows = rows.filter((x) => x.asaas_payment_id !== pid);
        continue;
      }
      await asaasFetch(s, `/payments/${pid}`, { method: "DELETE" }).catch(() => null);
    }
    if (rows.length) await admin.from("orders").update({ status: "cancelado" }).in("id", rows.map((r) => r.id)).eq("status", "pendente");
    return { cancelled: rows.length };
  });

// ---- Super admin ----
export const listTeamManagers = createServerFn({ method: "GET" })
  .middleware([auditedAction("listTeamManagers")])
  .handler(async ({ context }) => {
    if (!(await isSuper(context))) throw new Error("Acesso restrito ao super admin");
    const admin = await getAdmin();
    const { data: ms } = await admin.from("team_managers").select("*").order("created_at", { ascending: false });
    const ids = (ms ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length ? await admin.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] as any[] };
    const { data: mem } = ids.length ? await admin.from("team_members").select("manager_id").eq("status", "aceito").in("manager_id", ids) : { data: [] as any[] };
    return (ms ?? []).map((m) => {
      const p = (profs ?? []).find((x: any) => x.id === m.user_id);
      return { ...m, name: p?.full_name ?? "", email: p?.email ?? "", members: (mem ?? []).filter((x: any) => x.manager_id === m.user_id).length };
    });
  });

export const setTeamManagerStatus = createServerFn({ method: "POST" })
  .middleware([auditedAction("setTeamManagerStatus")])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), status: z.enum(["pendente", "aprovado", "suspenso"]) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isSuper(context))) throw new Error("Acesso restrito ao super admin");
    const admin = await getAdmin();
    await admin.from("team_managers").update({ status: data.status }).eq("user_id", data.userId);
    return { ok: true };
  });
