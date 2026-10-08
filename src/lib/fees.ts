export type FeeSettings = {
  fee_percent: number;
  fee_fixed: number;
  fee_paid_by_buyer: boolean;
  asaas_fee_pix: number;
  asaas_fee_boleto: number;
  asaas_fee_card_percent: number;
  asaas_fee_card_fixed: number;
  asaas_fee_paid_by: string; // 'plataforma' | 'produtor'
};

export type Method = "PIX" | "BOLETO" | "CREDIT_CARD";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Calcula a divisão de valores de uma inscrição. */
export function computeFees(
  price: number,
  method: Method,
  s: FeeSettings,
  override?: { fee_percent?: number | null; fee_fixed?: number | null },
) {
  const pct = Number(override?.fee_percent ?? s.fee_percent);
  const fixed = Number(override?.fee_fixed ?? s.fee_fixed);
  if (price <= 0) {
    return { serviceFee: 0, total: 0, producerAmount: 0, platformAmount: 0, asaasFee: 0 };
  }
  // Taxa fixa (R$) é paga pelo comprador, somada ao total; a comissão (%) sai do valor do produtor.
  const serviceFee = r2(fixed);
  const commission = r2((price * pct) / 100);
  const total = r2(price + serviceFee);
  const asaasFee = r2(
    method === "PIX"
      ? Number(s.asaas_fee_pix)
      : method === "BOLETO"
        ? Number(s.asaas_fee_boleto)
        : (total * Number(s.asaas_fee_card_percent)) / 100 + Number(s.asaas_fee_card_fixed),
  );
  const producerPaysAsaas = s.asaas_fee_paid_by === "produtor";
  const producerAmount = Math.max(0, r2(price - commission - (producerPaysAsaas ? asaasFee : 0)));
  const platformAmount = r2(total - producerAmount - (producerPaysAsaas ? 0 : asaasFee));
  return { serviceFee, total, producerAmount, platformAmount, asaasFee };
}
