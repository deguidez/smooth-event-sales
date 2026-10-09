import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Film, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { myPhotoOrders, photoOrderDownloads, refreshPhotoOrder } from "@/lib/photos.functions";

export const Route = createFileRoute("/_authenticated/minhas-fotos")({
  validateSearch: (s: Record<string, unknown>): { pedido?: string } => (typeof s["pedido"] === "string" ? { pedido: s["pedido"] } : {}),
  head: () => ({ meta: [
    { title: "Minhas fotos — Evenon" }, { name: "description", content: "Pedidos de fotos e vídeos com download em alta qualidade." },
    { property: "og:title", content: "Minhas fotos — Evenon" }, { property: "og:description", content: "Pedidos de fotos e vídeos com download em alta qualidade." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: MyPhotos,
});

function MyPhotos() {
  const load = useServerFn(myPhotoOrders);
  const { data = [] } = useQuery({ queryKey: ["my-photo-orders"], queryFn: () => load(), refetchInterval: 10000 });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">Minhas fotos</h1>
      <div className="mt-6 space-y-4">
        {data.map((o: any) => <OrderCard key={o.id} o={o} />)}
        {data.length === 0 && <p className="text-muted-foreground">Você ainda não comprou fotos.</p>}
      </div>
    </div>
  );
}

function OrderCard({ o }: { o: any }) {
  const refresh = useServerFn(refreshPhotoOrder);
  const dl = useServerFn(photoOrderDownloads);
  const qc = useQueryClient();
  const [files, setFiles] = useState<any[] | null>(null);
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-bold">{o.photo_albums?.events?.title}</p><p className="text-sm text-muted-foreground">#{o.code} · {fmtDate(o.created_at)} · {brl(o.total)}</p>{o.status === "pago" && o.expires_at && <p className="text-xs text-muted-foreground">Disponível para download até {fmtDate(o.expires_at)}</p>}</div>
        <Badge variant={o.status === "pago" ? "success" : o.status === "pendente" ? "warning" : "secondary"}>{o.status}</Badge>
      </div>
      {o.status === "pendente" && (
        <div className="mt-4 space-y-3">
          {o.pix_qr_image && <img src={`data:image/png;base64,${o.pix_qr_image}`} alt="QR Code Pix" className="size-48" />}
          <div className="flex flex-wrap gap-2">
            {o.pix_payload && <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(o.pix_payload); toast.success("Código Pix copiado"); }}><Copy /> Copiar Pix</Button>}
            {o.invoice_url && <Button variant="outline" size="sm" asChild><a href={o.invoice_url} target="_blank" rel="noreferrer">Abrir pagamento</a></Button>}
            <Button variant="outline" size="sm" onClick={async () => { await refresh({ data: { orderId: o.id } }); qc.invalidateQueries({ queryKey: ["my-photo-orders"] }); }}><RefreshCw /> Já paguei</Button>
          </div>
        </div>
      )}
      {o.status === "pago" && (
        <div className="mt-4">
          {!files ? <Button variant="hero" onClick={async () => setFiles(await dl({ data: { orderId: o.id } }))}><Download /> Ver e baixar arquivos</Button> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {files.map((f) => (
                <a key={f.id} href={f.download ?? "#"} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {f.thumb ? <img src={f.thumb} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Film /></div>}
                  <span className="absolute bottom-1 right-1 rounded bg-background/90 p-1"><Download className="size-3" /></span>
                </a>
              ))}
            </div>
          )}
          {files && <p className="mt-2 text-xs text-muted-foreground">Os arquivos baixados são originais, sem marca d'água. Links válidos por 24 horas — volte aqui quando quiser gerar novos.</p>}
        </div>
      )}
    </div>
  );
}
