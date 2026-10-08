import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyOrderStatus, asaasFetch, getAdmin, loadSettings, mapAsaasStatus } from "./asaas.server";
import { computeFees, type Method } from "./fees";

export const getCheckoutInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: tt } = await admin
      .from("ticket_types")
      .select("*, events!inner(id, title, slug, category, cover_url, starts_at, city, state, venue, status, producer_id)")
      .eq("id", data.ticketId)
      .single();
    if (!tt || tt.events.status !== "publicado" || !tt.active) throw new Error("Inscrição indisponível");
    const { data: producer } = await admin
      .from("producers")
      .select("fee_percent, fee_fixed, asaas_wallet_id, status")
      .eq("id", tt.events.producer_id)
      .single();
    const s = await loadSettings();
    const methods: Method[] = [];
    if (s.enable_pix) methods.push("PIX");
    if (s.enable_boleto) methods.push("BOLETO");
    if (s.enable_card) methods.push("CREDIT_CARD");
    const quotes = Object.fromEntries(
      methods.map((m) => [m, computeFees(Number(tt.price), m, s as any, producer ?? undefined)]),
    ) as Record<Method, ReturnType<typeof computeFees>>;
    return {
      ticket: { id: tt.id, name: tt.name, description: tt.description, price: Number(tt.price), available: tt.quantity - tt.sold },
      event: tt.events,
      methods,
      quotes,
      maxInstallments: s.max_installments,
      ready: !!s.asaas_api_key && !!producer?.asaas_wallet_id && producer?.status === "aprovado",
    };
  });

const orderSchema = z.object({
  ticketId: z.string().uuid(),
  method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  installments: z.number().int().min(1).max(21).default(1),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const s = await loadSettings();
    const { data: tt } = await admin
      .from("ticket_types")
      .select("*, events!inner(id, title, status, producer_id, starts_at)")
      .eq("id", data.ticketId)
      .single();
    if (!tt || tt.events.status !== "publicado" || !tt.active) throw new Error("Inscrição indisponível");
    const now = Date.now();
    if (tt.sales_start && new Date(tt.sales_start).getTime() > now) throw new Error("Vendas ainda não começaram");
    if (tt.sales_end && new Date(tt.sales_end).getTime() < now) throw new Error("Vendas encerradas para este lote");
    const { count: reserved } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("ticket_type_id", tt.id)
      .in("status", ["pago", "pendente"]);
    if ((reserved ?? 0) >= tt.quantity) throw new Error("Lote esgotado");

    const { data: producer } = await admin.from("producers").select("*").eq("id", tt.events.producer_id).single();
    if (!producer) throw new Error("Produtor não encontrado");

    const price = Number(tt.price);
    const f = computeFees(price, data.method, s as any, producer);
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
      ticket_price: price,
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
      const patch: Record<string, unknown> = {
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
  .middleware([requireSupabaseAuth])
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
