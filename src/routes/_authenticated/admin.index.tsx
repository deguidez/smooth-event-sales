import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, CalendarDays, DollarSign, Landmark, Settings, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesChart, StatCard, toCsv } from "@/components/dash";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin-gate";
import { createProducerWallet, updateProducer } from "@/lib/admin.functions";
import { brl, fmtDate, METHOD_LABEL, ORDER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Super admin — Inscreva" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <AdminGate>
      <AdminDashboard />
    </AdminGate>
  );
}

function AdminDashboard() {
  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () =>
      (await supabase
        .from("orders")
        .select("id, code, status, total, platform_amount, producer_amount, asaas_fee_estimate, payment_method, created_at, participant_name, participant_email, events(title), producers(company_name)")
        .order("created_at", { ascending: false })
        .limit(1000)).data ?? [],
  });
  const { data: producers = [] } = useQuery({
    queryKey: ["admin-producers"],
    queryFn: async () => (await supabase.from("producers").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: events = [] } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => (await supabase.from("events").select("id, title, slug, status, featured, starts_at, producers(company_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const paid = orders.filter((o) => o.status === "pago");
  const sum = (k: "total" | "platform_amount" | "producer_amount") => paid.reduce((s, o) => s + Number(o[k]), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Super admin</p>
          <h1 className="text-3xl font-extrabold md:text-4xl">Visão geral da plataforma</h1>
        </div>
        <Button variant="ink" asChild><Link to="/admin/configuracoes"><Settings /> Configurações</Link></Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={DollarSign} label="Volume vendido" value={brl(sum("total"))} hint={`${paid.length} inscrições pagas`} />
        <StatCard icon={Landmark} label="Receita da plataforma" value={brl(sum("platform_amount"))} hint="Taxas e comissões líquidas" />
        <StatCard icon={Briefcase} label="Repassado a produtores" value={brl(sum("producer_amount"))} hint={`${producers.length} produtores`} />
        <StatCard icon={CalendarDays} label="Eventos" value={events.length} hint={`${events.filter((e) => e.status === "publicado").length} publicados`} />
      </div>
      <div className="mt-6"><SalesChart orders={orders as any} /></div>

      <Tabs defaultValue="produtores" className="mt-10">
        <TabsList>
          <TabsTrigger value="produtores">Produtores {producers.some((p) => p.status === "pendente") && <Badge variant="warning" className="ml-2">{producers.filter((p) => p.status === "pendente").length}</Badge>}</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="inscricoes">Inscrições</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
        </TabsList>
        <TabsContent value="produtores" className="mt-6"><Producers producers={producers} /></TabsContent>
        <TabsContent value="eventos" className="mt-6"><Events events={events} /></TabsContent>
        <TabsContent value="inscricoes" className="mt-6"><Orders orders={orders} /></TabsContent>
        <TabsContent value="emails" className="mt-6"><Emails /></TabsContent>
      </Tabs>
    </div>
  );
}

function Producers({ producers }: { producers: any[] }) {
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Produtor</TableHead><TableHead>Documento</TableHead><TableHead>Status</TableHead><TableHead>Carteira</TableHead><TableHead>Taxa própria</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {producers.map((p) => (
              <TableRow key={p.id}>
                <TableCell><p className="font-semibold">{p.company_name}</p><p className="text-xs text-muted-foreground">{p.email}</p></TableCell>
                <TableCell className="font-mono text-xs">{p.document}</TableCell>
                <TableCell><Badge variant={p.status === "aprovado" ? "success" : p.status === "pendente" ? "warning" : "destructive"}>{p.status}</Badge></TableCell>
                <TableCell>{p.asaas_wallet_id ? <Badge variant="lime">Ativa</Badge> : <span className="text-xs text-muted-foreground">Sem carteira</span>}</TableCell>
                <TableCell className="text-sm">{p.fee_percent != null || p.fee_fixed != null ? `${p.fee_percent ?? "-"}% + ${brl(p.fee_fixed ?? 0)}` : "Padrão"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(p)}>Gerenciar</Button></TableCell>
              </TableRow>
            ))}
            {producers.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum produtor cadastrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {edit && <ProducerDialog p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProducerDialog({ p, onClose }: { p: any; onClose: () => void }) {
  const qc = useQueryClient();
  const upd = useServerFn(updateProducer);
  const mkWallet = useServerFn(createProducerWallet);
  const [status, setStatus] = useState(p.status);
  const [pct, setPct] = useState(p.fee_percent ?? "");
  const [fix, setFix] = useState(p.fee_fixed ?? "");
  const [wallet, setWallet] = useState(p.asaas_wallet_id ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await upd({
        data: {
          id: p.id,
          status,
          fee_percent: pct === "" ? null : Number(pct),
          fee_fixed: fix === "" ? null : Number(fix),
          asaas_wallet_id: wallet.trim() || null,
        },
      });
      toast.success("Produtor atualizado");
      qc.invalidateQueries({ queryKey: ["admin-producers"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    const r = await mkWallet({ data: { producerId: p.id } }).catch((e) => ({ ok: false as const, error: e.message }));
    setBusy(false);
    if (r.ok) {
      setWallet(r.walletId);
      toast.success("Carteira criada no Asaas");
      qc.invalidateQueries({ queryKey: ["admin-producers"] });
    } else toast.error(r.error);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{p.company_name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Comissão % (vazio = padrão)</Label><Input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Taxa fixa R$ (vazio = padrão)</Label><Input type="number" step="0.01" value={fix} onChange={(e) => setFix(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>ID da carteira Asaas (walletId)</Label>
            <div className="flex gap-2">
              <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Cole um walletId existente" className="font-mono text-xs" />
              {!p.asaas_wallet_id && <Button variant="lime" onClick={create} disabled={busy}>Criar no Asaas</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Crie uma subconta automaticamente ou informe a carteira de uma conta Asaas já existente do produtor.</p>
          </div>
          <Button variant="hero" className="w-full" onClick={save} disabled={busy}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Events({ events }: { events: any[] }) {
  const qc = useQueryClient();
  async function patch(id: string, p: Record<string, unknown>) {
    const { error } = await supabase.from("events").update(p).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-events"] });
  }
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <Table>
        <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Produtor</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Destaque</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-semibold">{e.title}</TableCell>
              <TableCell>{e.producers?.company_name}</TableCell>
              <TableCell>{fmtDate(e.starts_at)}</TableCell>
              <TableCell>
                <Select value={e.status} onValueChange={(v) => patch(e.id, { status: v })}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["rascunho", "publicado", "encerrado", "cancelado"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell><Switch checked={e.featured} onCheckedChange={(v) => patch(e.id, { featured: v })} /></TableCell>
              <TableCell className="text-right">{e.status === "publicado" && <Link to="/eventos/$slug" params={{ slug: e.slug }} className="text-sm text-primary">Ver</Link>}</TableCell>
            </TableRow>
          ))}
          {events.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum evento.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

function Orders({ orders }: { orders: any[] }) {
  const [filter, setFilter] = useState("todos");
  const list = filter === "todos" ? orders : orders.filter((o) => o.status === filter);
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas ({orders.length})</SelectItem>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => toCsv(list.map((o) => ({ codigo: o.code, evento: o.events?.title, produtor: o.producers?.company_name, participante: o.participant_name, email: o.participant_email, metodo: o.payment_method, status: o.status, total: o.total, plataforma: o.platform_amount, produtor_recebe: o.producer_amount, taxa_asaas: o.asaas_fee_estimate, data: o.created_at })), "inscricoes.csv")}>
          Exportar
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Evento</TableHead><TableHead>Participante</TableHead><TableHead>Método</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Plataforma</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.slice(0, 200).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs"><Link to="/pedido/$id" params={{ id: o.id }} className="text-primary">{o.code}</Link></TableCell>
                <TableCell>{o.events?.title}</TableCell>
                <TableCell>{o.participant_name}</TableCell>
                <TableCell>{METHOD_LABEL[o.payment_method]}</TableCell>
                <TableCell><Badge variant={ORDER_STATUS[o.status].variant}>{ORDER_STATUS[o.status].label}</Badge></TableCell>
                <TableCell className="text-right">{brl(o.total)}</TableCell>
                <TableCell className="text-right font-semibold text-success">{brl(o.platform_amount)}</TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground"><Ticket className="mx-auto mb-2" />Nenhuma inscrição.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Emails() {
  const { data = [] } = useQuery({
    queryKey: ["admin-emails"],
    queryFn: async () => (await supabase.from("email_log").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const label: Record<string, string> = { inscricao_criada: "Inscrição recebida", pagamento_confirmado: "Pagamento confirmado", pagamento_vencido: "Pagamento não realizado" };
  return (
    <div className="space-y-3">
      {data.some((d) => d.status === "aguardando_dominio") && (
        <p className="rounded-xl bg-warning/20 p-3 text-sm">Os e-mails estão sendo registrados, mas só serão enviados depois que o domínio de e-mail for configurado.</p>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Destinatário</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{fmtDate(d.created_at, true)}</TableCell>
                <TableCell>{label[d.kind] ?? d.kind}</TableCell>
                <TableCell>{d.recipient}</TableCell>
                <TableCell><Badge variant={d.status === "enviado" ? "success" : "secondary"}>{d.status}</Badge></TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum e-mail ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
