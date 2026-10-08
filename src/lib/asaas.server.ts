// Server-only helpers for the Asaas API and platform settings.
export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadSettings() {
  const admin = await getAdmin();
  const { data, error } = await admin.from("platform_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Configurações da plataforma não encontradas");
  return data;
}

export type Settings = Awaited<ReturnType<typeof loadSettings>>;

export function asaasBase(env: string) {
  return env === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export async function asaasFetch<T = any>(
  s: Pick<Settings, "asaas_env" | "asaas_api_key">,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!s.asaas_api_key) throw new Error("Chave da API Asaas não configurada pelo administrador");
  const res = await fetch(asaasBase(s.asaas_env) + path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Inscreva",
      access_token: s.asaas_api_key,
    },
    body: init.body ? JSON.stringify(init.body) : null,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.errors?.map((e: any) => e.description).join("; ") || `Erro Asaas (${res.status})`;
    console.error("Asaas error", path, res.status, text);
    throw new Error(msg);
  }
  return json as T;
}

export function mapAsaasStatus(status: string): "pago" | "pendente" | "vencido" | "estornado" | "cancelado" {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "pago";
    case "OVERDUE":
      return "vencido";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "CHARGEBACK_REQUESTED":
      return "estornado";
    case "DELETED":
      return "cancelado";
    default:
      return "pendente";
  }
}

/** Atualiza o status de um pedido e dispara e-mails quando muda. */
export async function applyOrderStatus(
  orderId: string,
  newStatus: ReturnType<typeof mapAsaasStatus>,
  extra: { receipt_url?: string | null } = {},
) {
  const admin = await getAdmin();
  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (!order) return null;
  if (order.status === newStatus) return order;
  if (order.status === "pago" && newStatus === "vencido") return order;
  const patch: any = { status: newStatus };
  if (newStatus === "pago") {
    patch.paid_at = new Date().toISOString();
    if (extra.receipt_url) patch.receipt_url = extra.receipt_url;
  }
  const { data: updated } = await admin.from("orders").update(patch).eq("id", orderId).select("*").single();
  if (newStatus === "pago") {
    const { data: tt } = await admin.from("ticket_types").select("sold").eq("id", order.ticket_type_id).single();
    await admin.from("ticket_types").update({ sold: (tt?.sold ?? 0) + 1 }).eq("id", order.ticket_type_id);
  }
  const { notifyOrder } = await import("./notify.server");
  if (newStatus === "pago") await notifyOrder(orderId, "pagamento_confirmado");
  if (newStatus === "vencido") await notifyOrder(orderId, "pagamento_vencido");
  return updated;
}
