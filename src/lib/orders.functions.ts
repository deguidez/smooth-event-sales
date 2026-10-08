import { auditedAction } from "./activity-middleware";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyOrderStatus, asaasFetch, getAdmin, loadSettings, mapAsaasStatus } from "./asaas.server";
import { computeFees, type Method } from "./fees";
import { cleanAnswers, parseFields } from "./custom-fields";
import { activeTerms } from "./terms";

export const getCheckoutInfo = createServerFn({ method: "GET" })
  .middleware([auditedAction("getCheckoutInfo")])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: tt } = await admin
      .from("ticket_types")
      .select("*, events!inner(id, title, slug, category, cover_url, starts_at, city, state, venue, status, producer_id, shirt_enabled, shirt_sizes, fee_percent, fee_fixed, custom_fields, terms)")
      .eq("id", data.ticketId)
      .single();
    if (!tt || tt.events.status !== "publicado" || !tt.active) throw new Error("Inscrição indisponível");
    const { data: producer } = await admin
      .from("producers")
      .select("fee_percent, fee_fixed, asaas_wallet_id, status")
      .eq("id", tt.events.producer_id)
      .single();
    const { data: products } = await admin
      .from("event_products")
      .select("id, name, description, price, image_url, sizes, stock, sold")
      .eq("event_id", tt.events.id)
      .eq("active", true)
      .order("position");
    const s = await loadSettings();
    const methods: Method[] = [];
    if (s.enable_pix) methods.push("PIX");
    if (s.enable_boleto) methods.push("BOLETO");
    if (s.enable_card) methods.push("CREDIT_CARD");
    return {
      ticket: { id: tt.id, name: tt.name, description: tt.description, price: Number(tt.price), available: tt.quantity - tt.sold },
      event: tt.events,
      products: (products ?? []).map((p) => ({ ...p, price: Number(p.price), available: p.stock == null ? 99 : Math.max(0, p.stock - p.sold) })),
      methods,
      feeSettings: {
        fee_percent: Number(s.fee_percent), fee_fixed: Number(s.fee_fixed), fee_paid_by_buyer: s.fee_paid_by_buyer,
        asaas_fee_pix: Number(s.asaas_fee_pix), asaas_fee_boleto: Number(s.asaas_fee_boleto),
        asaas_fee_card_percent: Number(s.asaas_fee_card_percent), asaas_fee_card_fixed: Number(s.asaas_fee_card_fixed),
        asaas_fee_paid_by: s.asaas_fee_paid_by,
      },
      feeOverride: { fee_percent: tt.events.fee_percent ?? producer?.fee_percent ?? null, fee_fixed: tt.events.fee_fixed ?? producer?.fee_fixed ?? null },
      maxInstallments: s.max_installments,
      ready: !!s.asaas_api_key && !!producer?.asaas_wallet_id && producer?.status === "aprovado",
    };
  });

const orderSchema = z.object({
  ticketId: z.string().uuid(),
  method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  answers: z.record(z.string(), z.any()).default({}),
  accepted: z.array(z.string().max(100)).max(50).default([]),
  installments: z.number().int().min(1).max(21).default(1),
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(20), size: z.string().max(10).optional().nullable() })).max(30).default([]),
  participant: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().email().max(200),
    cpf: z.string().trim().regex(/^\d{11}$|^\d{14}$/, "CPF/CNPJ inválido"),
    phone: z.string().trim().max(20).optional().default(""),
    birth_date: z.string().max(10).optional().nullable(),
    gender: z.string().max(20).optional().nullable(),
    shirt_size: z.string().max(10).optional().nullable(),
    team: z.string().max(100).optional().nullable(),
  }),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([auditedAction("createOrder")])
  .inputValidator((d) => orderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const s = await loadSettings();
    const { data: tt } = await admin
      .from("ticket_types")
      .select("*, events!inner(id, title, status, producer_id, starts_at, shirt_enabled, shirt_sizes, fee_percent, fee_fixed, custom_fields, terms, registration_ends_at, registrations_open_at, registration_limit)")
      .eq("id", data.ticketId)
      .single();
    if (!tt || tt.events.status !== "publicado" || !tt.active) throw new Error("Inscrição indisponível");
    const now = Date.now();
    if (tt.sales_start && new Date(tt.sales_start).getTime() > now) throw new Error("Vendas ainda não começaram");
    if (tt.sales_end && new Date(tt.sales_end).getTime() < now) throw new Error("Vendas encerradas para este lote");
    const ev: any = tt.events;
    if (ev.registrations_open_at && new Date(ev.registrations_open_at).getTime() > now) throw new Error("As inscrições ainda não abriram para este evento");
    if (ev.registration_ends_at && new Date(ev.registration_ends_at).getTime() < now) throw new Error("Inscrições encerradas para este evento");
    if (ev.registration_limit != null) {
      const { count: evCount } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("event_id", ev.id).in("status", ["pago", "pendente"]);
      if ((evCount ?? 0) >= ev.registration_limit) throw new Error("Inscrições esgotadas para este evento");
    }
    if (tt.events.shirt_enabled && !tt.events.shirt_sizes.includes(data.participant.shirt_size ?? ""))
      throw new Error("Escolha o tamanho da camisa do kit");
    const terms = activeTerms(tt.events.terms);
    const missingTerm = terms.find((t) => !data.accepted.includes(t.id));
    if (missingTerm) throw new Error(`Aceite o termo "${missingTerm.title}"`);
    const acceptedTerms = terms.map((t) => ({ id: t.id, title: t.title, text: t.text, accepted_at: new Date().toISOString() }));
    const customAnswers = cleanAnswers(parseFields(tt.events.custom_fields), data.answers);
    const { count: reserved } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("ticket_type_id", tt.id)
      .in("status", ["pago", "pendente"]);
    if ((reserved ?? 0) >= tt.quantity) throw new Error("Lote esgotado");

    const { data: producer } = await admin.from("producers").select("*").eq("id", tt.events.producer_id).single();
    if (!producer) throw new Error("Produtor não encontrado");

    // Produtos adicionais: preço sempre vem do banco
    const items: { productId: string; name: string; qty: number; size: string | null; unit_price: number }[] = [];
    if (data.items.length) {
      const { data: prods } = await admin
        .from("event_products")
        .select("id, name, price, sizes, stock, sold, active")
        .eq("event_id", tt.events.id)
        .in("id", data.items.map((i) => i.productId));
      for (const it of data.items) {
        const pr = prods?.find((x) => x.id === it.productId);
        if (!pr || !pr.active) throw new Error("Produto indisponível");
        if (pr.sizes.length && !pr.sizes.includes(it.size ?? "")) throw new Error(`Escolha o tamanho de ${pr.name}`);
        if (pr.stock != null && pr.sold + it.qty > pr.stock) throw new Error(`${pr.name} sem estoque suficiente`);
        items.push({ productId: pr.id, name: pr.name, qty: it.qty, size: pr.sizes.length ? it.size ?? null : null, unit_price: Number(pr.price) });
      }
    }
    const productsTotal = Math.round(items.reduce((s2, i) => s2 + i.unit_price * i.qty, 0) * 100) / 100;

    const price = Number(tt.price) + productsTotal;
    const f = computeFees(price, data.method, s as any, {
      fee_percent: tt.events.fee_percent ?? producer.fee_percent,
      fee_fixed: tt.events.fee_fixed ?? producer.fee_fixed,
    });
    const p = data.participant;
    const base = {
      user_id: context.userId,
      event_id: tt.events.id,
      ticket_type_id: tt.id,
      producer_id: producer.id,
      participant_name: p.name,
      participant_email: p.email,
      participant_cpf: p.cpf,
      participant_phone: p.phone || null,
      participant_birth_date: p.birth_date || null,
      participant_gender: p.gender || null,
      shirt_size: p.shirt_size || null,
      team: p.team || null,
      ticket_price: Number(tt.price),
      products_total: productsTotal,
      items: items as any,
      custom_answers: customAnswers as any,
      accepted_terms: acceptedTerms as any,
      service_fee: f.serviceFee,
      total: f.total,
      producer_amount: f.producerAmount,
      platform_amount: f.platformAmount,
      asaas_fee_estimate: f.asaasFee,
      payment_method: data.method,
    };

    // Inscrição gratuita: confirma direto
    if (price <= 0) {
      const { data: o, error } = await admin.from("orders").insert({ ...base, status: "pendente" }).select("id").single();
      if (error) throw new Error(error.message);
      await applyOrderStatus(o.id, "pago");
      return { orderId: o.id };
    }

    if (!s.asaas_api_key) throw new Error("Pagamentos ainda não configurados pela plataforma");
    if (producer.status !== "aprovado" || !producer.asaas_wallet_id)
      throw new Error("O produtor deste evento ainda não está habilitado para receber pagamentos");

    const { data: order, error } = await admin.from("orders").insert(base).select("id, code").single();
    if (error) throw new Error(error.message);

    try {
      const customer = await asaasFetch<{ id: string }>(s, "/customers", {
        method: "POST",
        body: {
          name: p.name,
          cpfCnpj: p.cpf,
          email: p.email,
          mobilePhone: p.phone?.replace(/\D/g, "") || undefined,
          externalReference: context.userId,
          notificationDisabled: true,
        },
      });
      const due = new Date();
      due.setDate(due.getDate() + (data.method === "BOLETO" ? s.boleto_due_days : 1));
      const installments = data.method === "CREDIT_CARD" ? Math.min(data.installments, s.max_installments) : 1;
      const split =
        f.producerAmount > 0
          ? [
              installments > 1
                ? { walletId: producer.asaas_wallet_id, totalFixedValue: f.producerAmount }
                : { walletId: producer.asaas_wallet_id, fixedValue: f.producerAmount },
            ]
          : undefined;
      let ip: string | undefined;
      try {
        ip = getRequest().headers.get("cf-connecting-ip") ?? undefined;
      } catch {}
      const payment = await asaasFetch<any>(s, "/payments", {
        method: "POST",
        body: {
          customer: customer.id,
          billingType: data.method,
          dueDate: due.toISOString().slice(0, 10),
          description: `${tt.events.title} - ${tt.name} (#${order.code})`,
          externalReference: order.id,
          ...(installments > 1 ? { installmentCount: installments, totalValue: f.total } : { value: f.total }),
          split,
          remoteIp: ip,
        },
      });
      const patch: any = {
        asaas_payment_id: payment.id,
        invoice_url: payment.invoiceUrl,
        bank_slip_url: payment.bankSlipUrl ?? null,
        due_date: payment.dueDate,
      };
      if (data.method === "PIX") {
        const qr = await asaasFetch<{ encodedImage: string; payload: string }>(s, `/payments/${payment.id}/pixQrCode`);
        patch.pix_qr_image = qr.encodedImage;
        patch.pix_payload = qr.payload;
      }
      await admin.from("orders").update(patch).eq("id", order.id);
    } catch (e) {
      await admin.from("orders").update({ status: "cancelado" }).eq("id", order.id);
      throw new Error("Não foi possível gerar a cobrança: " + (e as Error).message);
    }
    const { notifyOrder } = await import("./notify.server");
    await notifyOrder(order.id, "inscricao_criada");
    return { orderId: order.id };
  });

export const refreshOrder = createServerFn({ method: "POST" })
  .middleware([auditedAction("refreshOrder")])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS garante que só o dono, o produtor ou o admin enxergam o pedido
    const { data: order } = await context.supabase
      .from("orders")
      .select("id, status, asaas_payment_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (!order.asaas_payment_id || order.status !== "pendente") return { status: order.status };
    const s = await loadSettings();
    const payment = await asaasFetch<any>(s, `/payments/${order.asaas_payment_id}`);
    const st = mapAsaasStatus(payment.status);
    const updated = await applyOrderStatus(order.id, st, { receipt_url: payment.transactionReceiptUrl });
    return { status: updated?.status ?? st };
  });
