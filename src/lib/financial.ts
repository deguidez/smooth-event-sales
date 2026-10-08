import { supabase } from "@/integrations/supabase/client";
export type FinancialSummary = { confirmed: number; paid: number; free: number; pending: number; total: number; producer: number; platform: number; asaas: number };
export async function loadFinancialSummary(): Promise<FinancialSummary> {
  const { data, error } = await supabase.rpc("financial_summary");
  if (error) throw error;
  return data as unknown as FinancialSummary;
}
export async function loadFinancialOrders(producerId?: string) {
  const rows = [];
  for (let page = 0; ; page++) {
    let query = supabase.from("orders").select("id, code, status, total, platform_amount, producer_amount, asaas_fee_estimate, payment_method, paid_at, created_at, participant_name, participant_email, events(title), producers(company_name)")
      .order("created_at", { ascending: false }).order("id").range(page * 500, page * 500 + 499);
    if (producerId) query = query.eq("producer_id", producerId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}