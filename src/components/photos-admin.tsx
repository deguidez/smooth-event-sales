import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Plus, Settings2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/components/dash";
import { brl, fmtDate } from "@/lib/format";
import {
  adminAlbumDashboard, adminPhotoOrderDownloads, adminPhotoOverview, checkVpsStorage, inviteAlbumPhotographer,
  removeAlbumPhotographer, saveAlbum, setPhotographerStatus,
} from "@/lib/photos.functions";

function VpsTest() {
  const run = useServerFn(checkVpsStorage);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const test = async () => {
    setBusy(true);
    try {
      const r: any = await run();
      if (!r.enabled) setResult("Armazenamento da VPS não configurado — usando a nuvem.");
      else if (r.ok) setResult(`Conectado com sucesso ao bucket "${r.bucket}" na VPS.`);
      else setResult(`Falha na conexão (código ${r.status}): ${r.error ?? "verifique endereço e chaves"}`);
    } catch (e: any) { setResult(`Erro: ${e.message}`); }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
      <Button size="sm" variant="outline" disabled={busy} onClick={test}>{busy ? "Testando..." : "Testar armazenamento da VPS"}</Button>
      {result && <span className="text-muted-foreground">{result}</span>}
    </div>
  );
}

const num = (v: any) => (v === "" || v == null ? null : Number(v));

export function PhotosAdmin() {
  const load = useServerFn(adminPhotoOverview);
  const { data } = useQuery({ queryKey: ["photo-admin"], queryFn: () => load() });
  const [edit, setEdit] = useState<any>(null);
  const [dash, setDash] = useState<string | null>(null);
  if (!data) return <p className="text-muted-foreground">Carregando...</p>;
  if (dash) return <AlbumDashboard albumId={dash} onBack={() => setDash(null)} />;

  return (
    <div className="space-y-8">
      <VpsTest />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Álbuns de fotos</h2>
          <Button variant="hero" onClick={() => setEdit({})}><Plus /> Novo álbum</Button>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <Table>
            <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Comissões (org./plat./fot.)</TableHead><TableHead>Preços</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.albums.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell><p className="font-semibold">{a.events?.title}</p><p className="text-xs text-muted-foreground">{a.events?.producers?.company_name}</p></TableCell>
                  <TableCell>{a.owner_percent}% / {a.platform_percent}% / {a.photographer_percent}%</TableCell>
                  <TableCell className="text-sm">Foto {brl(a.photo_price)} · Vídeo {brl(a.video_price)}</TableCell>
                  <TableCell><Badge variant={a.active ? "success" : "secondary"}>{a.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" onClick={() => setDash(a.id)}>Painel</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(a)}><Settings2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.albums.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Crie o primeiro álbum escolhendo um evento.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>
      <Photographers list={data.photographers} />
      {edit && <AlbumDialog album={edit} events={data.events} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Photographers({ list }: { list: any[] }) {
  const set = useServerFn(setPhotographerStatus);
  const qc = useQueryClient();
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Fotógrafos cadastrados</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Documento</TableHead><TableHead>Telefone</TableHead><TableHead>Carteira Asaas</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((p) => (
              <TableRow key={p.user_id}>
                <TableCell className="font-semibold">{p.name}</TableCell>
                <TableCell>{p.document}</TableCell>
                <TableCell>{p.phone}</TableCell>
                <TableCell className="font-mono text-xs">{p.asaas_wallet_id}</TableCell>
                <TableCell>
                  <Select value={p.status} onValueChange={async (v) => { await set({ data: { userId: p.user_id, status: v as any } }); qc.invalidateQueries({ queryKey: ["photo-admin"] }); toast.success("Atualizado"); }}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="aprovado">Aprovado</SelectItem><SelectItem value="suspenso">Suspenso</SelectItem></SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum fotógrafo. Eles se cadastram em Minha conta → Sou fotógrafo.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

async function fileToDataUrl(f: File) {
  return new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(f); });
}

function AlbumDialog({ album, events, onClose }: { album: any; events: any[]; onClose: () => void }) {
  const save = useServerFn(saveAlbum);
  const qc = useQueryClient();
  const [f, setF] = useState<any>({
    event_id: "", active: false, owner_percent: 10, platform_percent: 20, photographer_percent: 70, photo_price: 15, video_price: 30,
    tiers: [], pkg_all_photos: "", pkg_all_videos: "", pkg_all: "", watermark_photo_url: null, watermark_video_url: null, owner_sees_total: false, ...album,
  });
  const sum = Number(f.owner_percent) + Number(f.platform_percent) + Number(f.photographer_percent);
  async function submit() {
    try {
      await save({ data: {
        ...(f.id ? { id: f.id } : {}), event_id: f.event_id, active: !!f.active,
        owner_percent: Number(f.owner_percent), platform_percent: Number(f.platform_percent), photographer_percent: Number(f.photographer_percent),
        photo_price: Number(f.photo_price), video_price: Number(f.video_price),
        tiers: (f.tiers ?? []).map((t: any) => ({ min_qty: Number(t.min_qty), discount_percent: num(t.discount_percent) })),
        pkg_all_photos: num(f.pkg_all_photos), pkg_all_videos: num(f.pkg_all_videos), pkg_all: num(f.pkg_all),
        watermark_photo_url: f.watermark_photo_url ?? null, watermark_video_url: f.watermark_video_url ?? null, owner_sees_total: !!f.owner_sees_total,
      } });
      toast.success("Álbum salvo");
      qc.invalidateQueries({ queryKey: ["photo-admin"] });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  }
  const setK = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? "Configurar álbum" : "Novo álbum de fotos"}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5"><Label>Evento</Label>
            <Select value={f.event_id} onValueChange={(v) => setF({ ...f, event_id: v })} disabled={!!f.id}>
              <SelectTrigger><SelectValue placeholder="Escolha o evento" /></SelectTrigger>
              <SelectContent>{events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title} — {fmtDate(e.starts_at)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-3"><Switch checked={!!f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Álbum à venda (visível para os clientes)</label>
          <div>
            <Label>Comissões (precisam somar 100%) — soma atual: <b className={sum === 100 ? "" : "text-destructive"}>{sum}%</b></Label>
            <div className="mt-1.5 grid grid-cols-3 gap-3">
              <div><p className="text-xs text-muted-foreground">Organizador do evento</p><Input type="number" value={f.owner_percent} onChange={setK("owner_percent")} /></div>
              <div><p className="text-xs text-muted-foreground">Plataforma (você)</p><Input type="number" value={f.platform_percent} onChange={setK("platform_percent")} /></div>
              <div><p className="text-xs text-muted-foreground">Fotógrafos</p><Input type="number" value={f.photographer_percent} onChange={setK("photographer_percent")} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço por foto (R$)</Label><Input type="number" step="0.01" value={f.photo_price} onChange={setK("photo_price")} /></div>
            <div><Label>Preço por vídeo (R$)</Label><Input type="number" step="0.01" value={f.video_price} onChange={setK("video_price")} /></div>
          </div>
          <div className="space-y-2">
            <Label>Descontos progressivos (porcentagem a partir da quantidade)</Label>
            {(f.tiers ?? []).map((t: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input type="number" placeholder="A partir de (qtd)" value={t.min_qty} onChange={(e) => { const tiers = [...f.tiers]; tiers[i] = { ...t, min_qty: e.target.value }; setF({ ...f, tiers }); }} />
                <Input type="number" step="0.1" placeholder="% de desconto" value={t.discount_percent ?? ""} onChange={(e) => { const tiers = [...f.tiers]; tiers[i] = { ...t, discount_percent: e.target.value }; setF({ ...f, tiers }); }} />
                <Button variant="ghost" size="icon" onClick={() => setF({ ...f, tiers: f.tiers.filter((_: any, k: number) => k !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setF({ ...f, tiers: [...(f.tiers ?? []), { min_qty: 5, discount_percent: "" }] })}><Plus /> Faixa de desconto</Button>
          </div>
          <div>
            <Label>Pacotes (vazio = sem pacote) — incluem tudo em que o cliente aparece</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-3">
              <div><p className="text-xs text-muted-foreground">Todas as fotos</p><Input type="number" step="0.01" value={f.pkg_all_photos ?? ""} onChange={setK("pkg_all_photos")} /></div>
              <div><p className="text-xs text-muted-foreground">Todos os vídeos</p><Input type="number" step="0.01" value={f.pkg_all_videos ?? ""} onChange={setK("pkg_all_videos")} /></div>
              <div><p className="text-xs text-muted-foreground">Fotos + vídeos</p><Input type="number" step="0.01" value={f.pkg_all ?? ""} onChange={setK("pkg_all")} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["watermark_photo_url", "watermark_video_url"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label>Marca d'água {k === "watermark_photo_url" ? "das fotos" : "dos vídeos"} (PNG)</Label>
                {f[k] && <img src={f[k]} alt="Marca d'água" className="h-16 rounded border bg-muted object-contain p-1" />}
                <Input type="file" accept="image/png" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { toast.error("Use um PNG de até 1 MB"); return; } setF({ ...f, [k]: await fileToDataUrl(file) }); }} />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={!!f.owner_sees_total} onCheckedChange={(v) => setF({ ...f, owner_sees_total: v })} /> Organizador vê o faturamento total do álbum (sem nomes de fotógrafos e sem fotos)</label>
          <Button variant="hero" className="w-full" onClick={submit} disabled={!f.event_id}>Salvar álbum</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ l, v }: { l: string; v: React.ReactNode }) {
  return <div><p className="text-2xl font-extrabold">{v}</p><p className="text-xs uppercase text-muted-foreground">{l}</p></div>;
}

function AlbumDashboard({ albumId, onBack }: { albumId: string; onBack: () => void }) {
  const load = useServerFn(adminAlbumDashboard);
  const invite = useServerFn(inviteAlbumPhotographer);
  const remove = useServerFn(removeAlbumPhotographer);
  const downloads = useServerFn(adminPhotoOrderDownloads);
  const qc = useQueryClient();
  const { data: d } = useQuery({ queryKey: ["photo-dash", albumId], queryFn: () => load({ data: { albumId } }) });
  const [pick, setPick] = useState("");
  const [links, setLinks] = useState<{ order: any; items: any[] } | null>(null);
  const [orderFilter, setOrderFilter] = useState("todos");
  useEffect(() => setPick(""), [albumId]);
  if (!d) return <p className="text-muted-foreground">Carregando...</p>;
  const name = (id: string) => d.phList.find((p: any) => p.user_id === id);
  const refresh = () => qc.invalidateQueries({ queryKey: ["photo-dash", albumId] });
  const orders = orderFilter === "todos" ? d.orders : d.orders.filter((o: any) => o.status === orderFilter);

  return (
    <div className="space-y-6">
      <button className="text-sm text-muted-foreground" onClick={onBack}>← Álbuns</button>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-6 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-3">
          <Stat l="Pedidos pagos" v={d.paidCount} /><Stat l="Ticket médio" v={brl(d.ticket)} /><Stat l="Fotos vendidas" v={d.photosSold} />
          <Stat l="Fotos por pedido" v={d.photosPerOrder} /><Stat l="Vídeos vendidos" v={d.videosSold} /><Stat l="Vídeos por pedido" v={d.videosPerOrder} />
          <Stat l="Total de fotos" v={d.totalPhotos} /><Stat l="Total de vídeos" v={d.totalVideos} />
        </div>
        <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-card">
          <p className="text-sm font-semibold uppercase">Faturamento do álbum</p>
          <p className="text-4xl font-extrabold">{brl(d.total)}</p>
          <div className="mt-3 space-y-1 text-sm">
            <p>Sua comissão: <b>{brl(d.platform)}</b></p>
            <p>Organizador: <b>{brl(d.owner)}</b></p>
            <p>Fotógrafos: <b>{brl(d.photographers)}</b></p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-lg font-bold">Equipe de fotógrafos</h3>
          <div className="flex gap-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Escolha um fotógrafo aprovado" /></SelectTrigger>
              <SelectContent>{d.phList.filter((p: any) => p.status === "aprovado" && !d.members.some((m: any) => m.user_id === p.user_id)).map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button disabled={!pick} onClick={async () => { try { await invite({ data: { albumId, userId: pick } }); toast.success("Convite enviado"); setPick(""); refresh(); } catch (e: any) { toast.error(e.message); } }}><UserPlus /> Convidar</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <Table>
            <TableHeader><TableRow><TableHead>Fotógrafo</TableHead><TableHead>Ranking</TableHead><TableHead>Convite</TableHead><TableHead>Fotos enviadas</TableHead><TableHead>Fotos vendidas</TableHead><TableHead>Vídeos enviados</TableHead><TableHead>Vídeos vendidos</TableHead><TableHead>Ganhos</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {d.members.map((m: any) => {
                const r = d.ranking.find((x: any) => x.id === m.user_id);
                const rank = d.ranking.findIndex((x: any) => x.id === m.user_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell><p className="font-semibold">{name(m.user_id)?.name ?? "—"}</p><p className="text-xs text-muted-foreground">{name(m.user_id)?.phone}</p></TableCell>
                    <TableCell>{rank >= 0 ? `${rank + 1}º` : "—"}</TableCell>
                    <TableCell><Badge variant={m.status === "aceito" ? "success" : m.status === "recusado" ? "destructive" : "secondary"}>{m.status}</Badge></TableCell>
                    <TableCell>{r?.photosSent ?? 0}</TableCell><TableCell>{r?.photosSold ?? 0}</TableCell>
                    <TableCell>{r?.videosSent ?? 0}</TableCell><TableCell>{r?.videosSold ?? 0}</TableCell>
                    <TableCell className="font-semibold">{brl(r?.earnings ?? 0)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={async () => { if (!confirm("Remover fotógrafo do álbum?")) return; await remove({ data: { id: m.id } }); refresh(); }}><Trash2 /></Button></TableCell>
                  </TableRow>
                );
              })}
              {d.members.length === 0 && <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Convide os fotógrafos do evento.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Pedidos de fotos</h3>
          <div className="flex gap-2">
            <Select value={orderFilter} onValueChange={setOrderFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pago">Pagos</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="cancelado">Cancelados</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" onClick={() => toCsv(orders.map((o: any) => ({ pedido: o.code, cliente: o.customer_name, email: o.customer_email, cpf: o.customer_cpf, telefone: o.customer_phone, pacote: o.package ?? "", status: o.status, total: o.total, plataforma: o.platform_amount, organizador: o.owner_amount, fotografos: o.photographers_amount, data: o.created_at })), "pedidos-fotos.csv")}><Download /> Exportar</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <Table>
            <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Pacote</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {orders.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">#{o.code}<p className="font-sans text-muted-foreground">{fmtDate(o.created_at)}</p></TableCell>
                  <TableCell><p className="font-semibold">{o.customer_name}</p><p className="text-xs text-muted-foreground">{o.customer_email} · CPF {o.customer_cpf} · {o.customer_phone}</p></TableCell>
                  <TableCell>{o.package ?? "Avulso"}</TableCell>
                  <TableCell><Badge variant={o.status === "pago" ? "success" : "secondary"}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right">{brl(o.total)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={async () => setLinks({ order: o, items: await downloads({ data: { orderId: o.id } }) })}>Links</Button></TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum pedido.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      {links && (
        <Dialog open onOpenChange={(o) => !o && setLinks(null)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Pedido #{links.order.code} — {links.items.length} arquivos</DialogTitle></DialogHeader>
            <ul className="space-y-1 text-sm">{links.items.map((i, k) => <li key={i.id}><a className="text-primary underline" href={i.url ?? "#"} target="_blank" rel="noreferrer">{i.kind === "photo" ? "Foto" : "Vídeo"} {k + 1}</a></li>)}</ul>
            <p className="text-xs text-muted-foreground">Links válidos por 24 horas.</p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
