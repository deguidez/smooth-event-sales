import { brl, fmtDate, METHOD_LABEL } from "@/lib/format";

export type ReceiptOrder = {
  id: string; code: string; status: string; participant_name: string; participant_cpf: string;
  shirt_size: string | null; team: string | null; payment_method: string; total: string | number;
  paid_at: string | null; created_at: string; items: unknown;
  events: { title: string; starts_at: string; venue: string | null; city: string | null; state: string | null } | null;
  ticket_types: { name: string } | null;
};

export async function createReceiptPdf(order: ReceiptOrder, kind: "registration" | "kit", origin: string) {
  if (order.status !== "pago") throw new Error("O comprovante fica disponível após a confirmação do pagamento.");
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF();
  const title = kind === "kit" ? "COMPROVANTE DE RETIRADA DE KIT" : "COMPROVANTE DE INSCRIÇÃO";
  let y = 23;
  const line = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 172) as string[];
    for (const part of lines) {
      if (y > 265) { doc.addPage(); y = 23; }
      doc.text(part, 19, y); y += size * 0.45 + 2;
    }
    y += 3;
  };
  line(title, 15, true);
  line(`Inscrição confirmada · Código ${order.code}`, 11, true);
  doc.line(19, y, 191, y); y += 12;
  line(order.events?.title ?? "Evento", 16, true);
  line(`Data do evento: ${fmtDate(order.events?.starts_at, true)}`);
  line(`Local: ${[order.events?.venue, order.events?.city, order.events?.state].filter(Boolean).join(" · ") || "A confirmar"}`);
  line(`Participante: ${order.participant_name}`, 12, true);
  line(`CPF: ${order.participant_cpf.replace(/^(\d{3})\d{6}(\d{2})$/, "$1.***.***-$2")}`);
  line(`Categoria: ${order.ticket_types?.name ?? "—"}`);
  if (order.team) line(`Equipe: ${order.team}`);
  if (order.shirt_size) line(`Camisa do kit: ${order.shirt_size}`, 12, true);
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (item && typeof item === "object" && "name" in item && "qty" in item) {
        line(`Produto: ${String(item.qty)}x ${String(item.name)}${"size" in item && item.size ? ` (${String(item.size)})` : ""}`);
      }
    }
  }
  line(Number(order.total) <= 0 ? "Pagamento: Inscrição gratuita" : `Pagamento: ${METHOD_LABEL[order.payment_method] ?? order.payment_method} · ${brl(order.total)}`);
  if (order.paid_at) line(`Pagamento confirmado em: ${fmtDate(order.paid_at, true)}`);
  line(`Inscrição realizada em: ${fmtDate(order.created_at, true)}`);
  if (kind === "kit") line("Apresente este comprovante e um documento de identificação na retirada do kit. A organização confere o pagamento e registra a entrega.", 10);
  if (y > 215) { doc.addPage(); y = 23; }
  const qr = await QRCode.toDataURL(`${origin}/pedido/${encodeURIComponent(order.id)}`, { width: 240, margin: 1 });
  doc.addImage(qr, "PNG", 19, y, 35, 35);
  doc.setFontSize(10);
  doc.text(`Código da inscrição: ${order.code}`, 60, y + 11);
  doc.text("Consulte a inscrição na sua conta.", 60, y + 19);
  return doc;
}