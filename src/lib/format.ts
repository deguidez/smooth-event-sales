import catEsporte from "@/assets/cat-esporte.jpg";
import catShow from "@/assets/cat-show.jpg";
import catCongresso from "@/assets/cat-congresso.jpg";

export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d: string | null | undefined, withTime = false) => {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

export const CATEGORIES = {
  esporte: "Esportes",
  show: "Shows",
  congresso: "Congressos",
  curso: "Cursos",
  outro: "Outros",
} as const;
export type Category = keyof typeof CATEGORIES;

export const categoryCover = (c: string | null | undefined) =>
  c === "show" ? catShow : c === "congresso" || c === "curso" ? catCongresso : catEsporte;

export const ORDER_STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  pago: { label: "Pago", variant: "success" },
  pendente: { label: "Aguardando pagamento", variant: "warning" },
  vencido: { label: "Vencido", variant: "destructive" },
  estornado: { label: "Estornado", variant: "secondary" },
  cancelado: { label: "Cancelado", variant: "secondary" },
};

export const METHOD_LABEL: Record<string, string> = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
};

export const onlyDigits = (s: string) => s.replace(/\D/g, "");
