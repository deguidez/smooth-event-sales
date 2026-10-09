import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/components/dash";
import { useQrDataUrl } from "@/components/order-qr";
import { getKitAccess, kitDashboard } from "@/lib/kits.functions";
import { formatAnswer, type CustomField } from "@/lib/custom-fields";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function KitDeliveryPanel({ eventId, title, fields }: { eventId: string; title: string; fields: CustomField[] }) {
  const access = useServerFn(getKitAccess);
  const dash = useServerFn(kitDashboard);
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"todos" | "entregue" | "pendente">("todos");
  const qr = useQrDataUrl(link || "about:blank", 512);

  async function loadLink(rotate = false) {
    const { token } = await access({ data: { eventId, rotate } });
    setLink(`${window.location.origin}/entrega-kit/${token}`);
  }
  useEffect(() => { loadLink().catch((e) => toast.error(e.message)); }, [eventId]);

  const { data } = useQuery({ queryKey: ["kit-dash", eventId], queryFn: () => dash({ data: { eventId } }), refetchInterval: 15000 });
  const byOrder = useMemo(() => new Map((data?.deliveries ?? []).map((d: any) => [d.order_id, d])), [data]);
  const rows = (data?.orders ?? []).filter((o: any) => {
    const d = byOrder.has(o.id);
    if (status === "entregue" && !d) return false;
    if (status === "pendente" && d) return false;
    const f = filter.trim().toLowerCase();
    return !f || o.participant_name.toLowerCase().includes(f) || o.code.toLowerCase().includes(f) || o.participant_cpf.includes(f.replace(/\D/g, "") || "#");
  });
  const total = data?.orders.length ?? 0;
  const delivered = data?.deliveries.length ?? 0;
  const thirds = (data?.deliveries ?? []).filter((d: any) => d.receiver_type === "terceiro").length;
  const shirts = (data?.orders ?? []).reduce((m: Record<string, number>, o: any) => { if (o.shirt_size) m[o.shirt_size] = (m[o.shirt_size] ?? 0) + 1; return m; }, {});
  const itemsText = (o: any) => [o.shirt_size ? `Camiseta ${o.shirt_size}` : "", ...((o.items as any[]) ?? []).map((i) => `${i.qty}x ${i.name}${i.size ? ` (${i.size})` : ""}`)].filter(Boolean).join("; ");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Inscrições pagas", total], ["Kits entregues", delivered], ["Pendentes", total - delivered], ["Retirados por terceiros", thirds]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border bg-card p-4 shadow-card"><p className="text-sm text-muted-foreground">{l}</p><p className="text-3xl font-extrabold">{v}</p></div>
        ))}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${total ? (delivered / total) * 100 : 0}%` }} /></div>
      {Object.keys(shirts).length > 0 && <p className="text-sm text-muted-foreground">Camisetas vendidas: {Object.entries(shirts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}

      <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-card sm:grid-cols-[auto_1fr]">
        {qr && link ? <img src={qr} alt="QR code da página de entrega" className="size-40 rounded-lg border" /> : <div className="size-40 animate-pulse rounded-lg bg-muted" />}
        <div className="min-w-0 space-y-2">
          <p className="font-bold">Página dos operadores</p>
          <p className="text-sm text-muted-foreground">Quem tiver este QR code ou link consegue registrar entregas. Gere um novo link para desativar o anterior.</p>
          <p className="break-all rounded-lg bg-muted p-2 text-xs">{link || "..."}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}><Copy /> Copiar</Button>
            {qr && <Button variant="outline" size="sm" asChild><a href={qr} download={`qrcode-entrega-${title}.png`}><Download /> Baixar QR</a></Button>}
            <Button variant="outline" size="sm" onClick={() => { if (confirm("Gerar novo link? O link atual deixará de funcionar.")) loadLink(true).then(() => toast.success("Novo link gerado")); }}><RefreshCw /> Gerar novo link</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar nome, nº ou CPF" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {(["todos", "pendente", "entregue"] as const).map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s === "todos" ? "Todos" : s === "pendente" ? "Pendentes" : "Entregues"}</Button>)}
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["kit-dash", eventId] })}><RefreshCw /> Atualizar</Button>
        <Button variant="outline" size="sm" onClick={() => toCsv((data?.orders ?? []).map((o: any) => {
          const d: any = byOrder.get(o.id);
          return { inscricao: o.code, nome: o.participant_name, cpf: o.participant_cpf, categoria: o.ticket_types?.name, equipe: o.team, itens: itemsText(o),
            ...Object.fromEntries(fields.map((cf) => [cf.label, formatAnswer(cf, o.custom_answers?.[cf.id])])),
            entregue: d ? "sim" : "não", entregue_em: d ? when(d.delivered_at) : "", operador: d?.operator_name ?? "", retirado_por: d ? (d.receiver_type === "terceiro" ? "terceiro" : "titular") : "",
            terceiro_nome: d?.third_name ?? "", terceiro_cpf: d?.third_cpf ?? "", terceiro_telefone: d?.third_phone ?? "", ip: d?.ip ?? "" };
        }), `entrega-kits-${title}.csv`)}><Download /> Exportar auditoria</Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Inscrição</TableHead><TableHead>Atleta</TableHead><TableHead>Itens</TableHead><TableHead>Campos</TableHead><TableHead>Entrega</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((o: any) => {
              const d: any = byOrder.get(o.id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">#{o.code}</TableCell>
                  <TableCell><p className="font-semibold">{o.participant_name}</p><p className="text-xs text-muted-foreground">{o.ticket_types?.name}{o.team ? ` · ${o.team}` : ""}</p></TableCell>
                  <TableCell className="text-sm">{itemsText(o) || "Kit padrão"}</TableCell>
                  <TableCell className="text-xs">{fields.map((cf) => { const v = formatAnswer(cf, o.custom_answers?.[cf.id]); return v ? <p key={cf.id}><span className="text-muted-foreground">{cf.label}:</span> {v}</p> : null; })}</TableCell>
                  <TableCell>
                    {d ? (
                      <div className="text-xs">
                        <Badge variant="success">Entregue</Badge>
                        <p className="mt-1">{when(d.delivered_at)}</p>
                        <p>por <b>{d.operator_name}</b></p>
                        {d.receiver_type === "terceiro" && (
                          <div className="mt-1 flex items-center gap-2">
                            {d.photo_url && <a href={d.photo_url} target="_blank" rel="noreferrer"><img src={d.photo_url} alt={`Foto de ${d.third_name}`} className="size-10 rounded object-cover" /></a>}
                            <span>Terceiro: {d.third_name}<br />CPF {d.third_cpf} · {d.third_phone}</span>
                          </div>
                        )}
                      </div>
                    ) : <Badge variant="secondary">Pendente</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma inscrição.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
