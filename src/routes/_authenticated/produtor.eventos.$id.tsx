import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCsv } from "@/components/dash";
import { supabase } from "@/integrations/supabase/client";
import { brl, CATEGORIES, fmtDate, METHOD_LABEL, ORDER_STATUS } from "@/lib/format";
import { CoverUpload, EventDocsEditor } from "@/components/event-files";
import { ProductsEditor } from "@/components/products-editor";

export const Route = createFileRoute("/_authenticated/produtor/eventos/$id")({
  head: () => ({ meta: [{ title: "Gerenciar evento — Inscreva" }, { name: "robots", content: "noindex" }] }),
  component: ManageEvent,
});

const toLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

function ManageEvent() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: ev } = useQuery({
    queryKey: ["manage-event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*, producers(status, asaas_wallet_id)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (ev) setF({ ...ev, starts_at: toLocal(ev.starts_at), ends_at: toLocal(ev.ends_at) });
  }, [ev]);
  if (!ev || !f) return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Carregando...</div>;

  const canPublish = ev.producers?.status === "aprovado";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(status?: string) {
    const { error } = await supabase
      .from("events")
      .update({
        title: f.title,
        category: f.category,
        short_description: f.short_description,
        description: f.description,
        cover_url: f.cover_url || null,
        shirt_enabled: !!f.shirt_enabled,
        shirt_sizes: f.shirt_sizes?.length ? f.shirt_sizes : ["PP", "P", "M", "G", "GG", "XG"],
        venue: f.venue,
        city: f.city,
        state: f.state,
        starts_at: new Date(f.starts_at).toISOString(),
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
        ...(status ? { status: status as any } : {}),
      })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "publicado" ? "Evento publicado!" : "Salvo");
    qc.invalidateQueries({ queryKey: ["manage-event", id] });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/produtor" className="text-sm text-muted-foreground">← Painel</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold">{ev.title}</h1>
          <Badge variant={ev.status === "publicado" ? "success" : "secondary"}>{ev.status}</Badge>
        </div>
        <div className="flex gap-2">
          {ev.status === "publicado" && (
            <Button variant="outline" asChild><Link to="/eventos/$slug" params={{ slug: ev.slug }}><ExternalLink /> Ver página</Link></Button>
          )}
          {ev.status !== "publicado" ? (
            <Button variant="hero" disabled={!canPublish} onClick={() => save("publicado")} title={canPublish ? "" : "Aguardando aprovação do produtor"}>
              Publicar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => save("encerrado")}>Encerrar vendas</Button>
          )}
        </div>
      </div>
      {!canPublish && <p className="mt-2 text-sm text-muted-foreground">Você poderá publicar assim que seu cadastro de produtor for aprovado.</p>}

      <Tabs defaultValue="dados" className="mt-8">
        <TabsList>
          <TabsTrigger value="dados">Dados do evento</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="lotes">Categorias e lotes</TabsTrigger>
          <TabsTrigger value="produtos">Kit e produtos</TabsTrigger>
          <TabsTrigger value="inscritos">Inscritos</TabsTrigger>
        </TabsList>
        <TabsContent value="dados" className="mt-6">
          <div className="grid gap-4 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-2">
            <F l="Nome" c="sm:col-span-2"><Input value={f.title} onChange={set("title")} /></F>
            <F l="Tipo">
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <CoverUpload producerId={ev.producer_id} value={f.cover_url} onChange={(url) => setF({ ...f, cover_url: url })} />
            <F l="Início"><Input type="datetime-local" value={f.starts_at} onChange={set("starts_at")} /></F>
            <F l="Término"><Input type="datetime-local" value={f.ends_at} onChange={set("ends_at")} /></F>
            <F l="Local"><Input value={f.venue ?? ""} onChange={set("venue")} /></F>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <F l="Cidade"><Input value={f.city ?? ""} onChange={set("city")} /></F>
              <F l="UF"><Input value={f.state ?? ""} onChange={set("state")} maxLength={2} /></F>
            </div>
            <F l="Resumo" c="sm:col-span-2"><Input value={f.short_description ?? ""} onChange={set("short_description")} maxLength={200} /></F>
            <F l="Descrição completa" c="sm:col-span-2"><Textarea rows={8} value={f.description ?? ""} onChange={set("description")} /></F>
            <div><Button variant="hero" onClick={() => save()}>Salvar alterações</Button></div>
          </div>
        </TabsContent>
        <TabsContent value="docs" className="mt-6"><EventDocsEditor eventId={id} producerId={ev.producer_id} /></TabsContent>
        <TabsContent value="produtos" className="mt-6 space-y-6">
          <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
            <label className="flex items-center gap-3"><Switch checked={f.shirt_enabled} onCheckedChange={(v) => setF({ ...f, shirt_enabled: v })} /> <span className="font-semibold">A inscrição inclui kit com camisa</span></label>
            {f.shirt_enabled && (
              <F l="Tamanhos disponíveis (separe por vírgula)"><Input value={(f.shirt_sizes ?? []).join(", ")} onChange={(e) => setF({ ...f, shirt_sizes: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></F>
            )}
            <p className="text-sm text-muted-foreground">O atleta será obrigado a escolher o tamanho ao se inscrever. O tamanho aparece na lista de inscritos e na planilha.</p>
            <Button variant="hero" onClick={() => save()}>Salvar kit</Button>
          </div>
          <ProductsEditor eventId={id} producerId={ev.producer_id} />
        </TabsContent>
        <TabsContent value="lotes" className="mt-6"><Tickets eventId={id} /></TabsContent>
        <TabsContent value="inscritos" className="mt-6"><Attendees eventId={id} title={ev.title} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Tickets({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const key = ["tickets", eventId];
  const { data: tickets = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("ticket_types").select("*").eq("event_id", eventId).order("position")).data ?? [],
  });
  const [n, setN] = useState({ name: "", price: "", quantity: "100", sales_end: "" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("ticket_types").insert({
      event_id: eventId,
      name: n.name.trim(),
      price: Number(n.price) || 0,
      quantity: Number(n.quantity) || 1,
      sales_end: n.sales_end ? new Date(n.sales_end).toISOString() : null,
      position: tickets.length,
    });
    if (error) { toast.error(error.message); return; }
    setN({ name: "", price: "", quantity: "100", sales_end: "" });
    qc.invalidateQueries({ queryKey: key });
  }
  async function patch(id: string, p: any) {
    const { error } = await supabase.from("ticket_types").update(p).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("ticket_types").delete().eq("id", id);
    if (error) toast.error("Não é possível remover: já existem inscrições. Desative o lote.");
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Categoria / lote</TableHead><TableHead>Preço</TableHead><TableHead>Vagas</TableHead><TableHead>Vendidos</TableHead><TableHead>Fim das vendas</TableHead><TableHead>Ativo</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.name}</TableCell>
                <TableCell>{brl(t.price)}</TableCell>
                <TableCell>
                  <Input type="number" className="h-8 w-24" defaultValue={t.quantity} onBlur={(e) => Number(e.target.value) !== t.quantity && patch(t.id, { quantity: Number(e.target.value) })} />
                </TableCell>
                <TableCell>{t.sold}</TableCell>
                <TableCell>{t.sales_end ? fmtDate(t.sales_end, true) : "—"}</TableCell>
                <TableCell><Switch checked={t.active} onCheckedChange={(v) => patch(t.id, { active: v })} /></TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 /></Button></TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Adicione a primeira categoria (ex.: 5 km, 10 km, Pista, VIP).</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <form onSubmit={add} className="grid items-end gap-3 rounded-2xl border bg-card p-5 shadow-card md:grid-cols-5">
        <F l="Nome"><Input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required placeholder="10 km - 1º lote" /></F>
        <F l="Preço (R$)"><Input type="number" step="0.01" min="0" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} required /></F>
        <F l="Vagas"><Input type="number" min="1" value={n.quantity} onChange={(e) => setN({ ...n, quantity: e.target.value })} /></F>
        <F l="Fim das vendas"><Input type="datetime-local" value={n.sales_end} onChange={(e) => setN({ ...n, sales_end: e.target.value })} /></F>
        <Button type="submit" variant="hero"><Plus /> Adicionar</Button>
      </form>
    </div>
  );
}

function Attendees({ eventId, title }: { eventId: string; title: string }) {
  const [filter, setFilter] = useState("todos");
  const { data: rows = [] } = useQuery({
    queryKey: ["attendees", eventId],
    queryFn: async () =>
      (await supabase.from("orders").select("*, ticket_types(name)").eq("event_id", eventId).order("created_at", { ascending: false })).data ?? [],
  });
  const list = filter === "todos" ? rows : rows.filter((r) => r.status === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos ({rows.length})</SelectItem>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() =>
            toCsv(
              list.map((r) => ({
                codigo: r.code, nome: r.participant_name, email: r.participant_email, cpf: r.participant_cpf, telefone: r.participant_phone,
                nascimento: r.participant_birth_date, sexo: r.participant_gender, camiseta: r.shirt_size, equipe: r.team,
                categoria: r.ticket_types?.name, status: r.status, pagamento: r.payment_method, total: r.total, voce_recebe: r.producer_amount, data: r.created_at,
              })),
              `inscritos-${title}.csv`,
            )
          }
        >
          <Download /> Exportar planilha
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Participante</TableHead><TableHead>Categoria</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell><p className="font-medium">{r.participant_name}</p><p className="text-xs text-muted-foreground">{r.participant_email}</p></TableCell>
                <TableCell>{r.ticket_types?.name}{r.shirt_size ? ` · ${r.shirt_size}` : ""}</TableCell>
                <TableCell>{METHOD_LABEL[r.payment_method]}</TableCell>
                <TableCell><Badge variant={ORDER_STATUS[r.status]!.variant}>{ORDER_STATUS[r.status]!.label}</Badge></TableCell>
                <TableCell className="text-right">{brl(r.total)}</TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum inscrito.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function F({ l, c, children }: { l: string; c?: string; children: React.ReactNode }) {
  return <div className={`space-y-1.5 ${c ?? ""}`}><Label>{l}</Label>{children}</div>;
}
