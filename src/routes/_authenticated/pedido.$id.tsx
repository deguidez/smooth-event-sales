import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Copy, Download, ExternalLink, FileText, PackageCheck, Printer, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createReceiptPdf } from "@/lib/receipt-pdf";
import { supabase } from "@/integrations/supabase/client";
import { refreshOrder } from "@/lib/orders.functions";
import { brl, fmtDate, METHOD_LABEL, ORDER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pedido/$id")({
  head: () => ({ meta: [{ title: "Minha inscrição — Inscreva" }, { name: "description", content: "Consulte sua inscrição, pagamento e comprovantes da Inscreva." }, { property: "og:title", content: "Minha inscrição — Inscreva" }, { property: "og:description", content: "Consulte sua inscrição, pagamento e comprovantes da Inscreva." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const refresh = useServerFn(refreshOrder);
  const [pdf, setPdf] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  const { data: o, refetch } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, events(title, starts_at, venue, city, state, shirt_enabled), ticket_types(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.status === "pendente" ? 8000 : false),
  });

  // Checa o status diretamente no Asaas enquanto pendente
  useEffect(() => {
    if (o?.status !== "pendente" || !o.asaas_payment_id) return;
    const t = setInterval(() => refresh({ data: { orderId: id } }).then(() => refetch()).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [o?.status, o?.asaas_payment_id, id, refresh, refetch]);

  if (!o) return <div className="mx-auto max-w-3xl px-4 py-20 text-muted-foreground">Carregando...</div>;
  const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: "secondary" as const };
  async function receipt(kind: "registration" | "kit", download: boolean) {
    if (!o) return;
    setPdfBusy(true);
    try {
      const doc = await createReceiptPdf(o, kind, window.location.origin);
      if (download) doc.save(`${kind === "kit" ? "retirada-kit" : "inscricao"}-${o.code}.pdf`);
      else setPdf(URL.createObjectURL(doc.output("blob")));
    } catch (error) { toast.error((error as Error).message); }
    finally { setPdfBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/minha-conta" className="text-sm text-muted-foreground">← Minhas inscrições</Link>
        {o.status === "pago" && (
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir comprovante</Button>
        )}
      </div>
      {o.status === "pago" && <div className="no-print mb-6 flex flex-wrap gap-2">
        <Button variant="outline" disabled={pdfBusy} onClick={() => receipt("registration", false)}><FileText /> Ver comprovante PDF</Button>
        <Button variant="outline" disabled={pdfBusy} onClick={() => receipt("registration", true)}><Download /> Baixar inscrição PDF</Button>
        <Button variant="hero" disabled={pdfBusy} onClick={() => receipt("kit", true)}><PackageCheck /> Comprovante de retirada de kit</Button>
      </div>}
      <Dialog open={!!pdf} onOpenChange={(open) => { if (!open) setPdf(null); }}>
        <DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Comprovante de inscrição</DialogTitle></DialogHeader>
          {pdf && <iframe title="Comprovante de inscrição PDF" src={pdf} className="h-[65vh] w-full rounded border" />}
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-3xl border bg-card shadow-card">
        <div className={o.status === "pago" ? "bg-success p-6 text-success-foreground" : "bg-ink p-6 text-ink-foreground"}>
          <div className="flex items-center gap-3">
            {o.status === "pago" ? <CheckCircle2 className="h-8 w-8" /> : o.status === "pendente" ? <Clock className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
            <div>
              <p className="text-sm opacity-80">{o.status === "pago" ? "Comprovante de inscrição" : "Inscrição"} #{o.code}</p>
              <h1 className="text-2xl font-extrabold">{o.status === "pago" ? "Inscrição confirmada!" : st.label}</h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {o.status === "pendente" && o.payment_method === "PIX" && o.pix_qr_image && (
            <div className="no-print flex flex-col items-center gap-4 rounded-2xl bg-muted p-6 text-center">
              <p className="font-semibold">Escaneie o QR Code para pagar com Pix</p>
              <img src={`data:image/png;base64,${o.pix_qr_image}`} alt="QR Code Pix" className="h-56 w-56 rounded-xl bg-card p-2" />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(o.pix_payload ?? "");
                  toast.success("Código Pix copiado");
                }}
              >
                <Copy /> Copiar código Pix
              </Button>
              <p className="text-xs text-muted-foreground">A confirmação aparece aqui automaticamente.</p>
            </div>
          )}
          {o.status === "pendente" && o.payment_method === "BOLETO" && (
            <div className="no-print flex flex-wrap gap-2">
              {o.bank_slip_url && <Button variant="hero" asChild><a href={o.bank_slip_url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir boleto</a></Button>}
              {o.invoice_url && <Button variant="outline" asChild><a href={o.invoice_url} target="_blank" rel="noreferrer">Ver fatura</a></Button>}
            </div>
          )}
          {o.status === "pendente" && o.payment_method === "CREDIT_CARD" && o.invoice_url && (
            <div className="no-print rounded-2xl bg-muted p-6 text-center">
              <p className="mb-3 font-semibold">Pague com cartão na página segura do Asaas</p>
              <Button variant="hero" size="lg" asChild><a href={o.invoice_url} target="_blank" rel="noreferrer"><ExternalLink /> Pagar com cartão</a></Button>
            </div>
          )}
          {o.status === "pendente" && (
            <Button
              variant="ghost"
              size="sm"
              className="no-print"
              onClick={() => refresh({ data: { orderId: id } }).then(() => refetch()).catch((e) => toast.error(e.message))}
            >
              <RefreshCw /> Já paguei, verificar
            </Button>
          )}

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item l="Evento" v={o.events?.title} />
            <Item l="Data" v={fmtDate(o.events?.starts_at, true)} />
            <Item l="Local" v={[o.events?.venue, o.events?.city, o.events?.state].filter(Boolean).join(" · ") || "—"} />
            <Item l="Categoria" v={o.ticket_types?.name} />
            <Item l="Participante" v={o.participant_name} />
            <Item l="CPF" v={o.participant_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} />
            {o.shirt_size && <Item l="Camisa do kit" v={o.shirt_size} />}
            {Array.isArray((o as any).items) && (o as any).items.length > 0 && (
              <Item l="Produtos" v={(o as any).items.map((i: any) => `${i.qty}x ${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ")} />
            )}
            {o.team && <Item l="Equipe" v={o.team} />}
            <Item l="Pagamento" v={METHOD_LABEL[o.payment_method]} />
            <Item l="Status" v={<Badge variant={st.variant}>{st.label}</Badge>} />
            {o.paid_at && <Item l="Pago em" v={fmtDate(o.paid_at, true)} />}
            <Item l="Valor total" v={<span className="text-lg font-extrabold">{brl(o.total)}</span>} />
          </dl>
          {o.receipt_url && (
            <a href={o.receipt_url} target="_blank" rel="noreferrer" className="no-print inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Comprovante bancário do Asaas <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="border-t pt-4 text-xs text-muted-foreground">Inscrição feita em {fmtDate(o.created_at, true)} · Código {o.code}</p>
        </div>
      </div>
    </div>
  );
}

function Item({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{l}</dt>
      <dd className="mt-0.5 font-medium">{v}</dd>
    </div>
  );
}
