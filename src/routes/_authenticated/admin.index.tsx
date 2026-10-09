import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, CalendarDays, DollarSign, Landmark, Settings, Ticket, Pencil, ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProducerKeyField, WithdrawalsAdmin } from "@/components/withdrawals-admin";
import { TeamManagersAdmin } from "@/components/team-admin";
import { AdminFinance } from "@/components/admin-finance";
import { PhotosAdmin } from "@/components/photos-admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesChart, StatCard, toCsv } from "@/components/dash";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin-gate";
import { createProducerWallet, listUsers, setUserRole, updateProducer, updateUser, adminCreateProducer, deleteProducer, adminCreateUser, deleteUser } from "@/lib/admin.functions";
import { CouponsAdmin } from "@/components/coupons-admin";
import { ActivityLogView } from "@/components/activity-log-view";
import { loadFinancialOrders, loadFinancialSummary } from "@/lib/financial";

function Finance({ orders }: { orders: any[] }) {
  const paid = orders.filter((o) => o.status === "pago");
  const by = new Map<string, { name: string; count: number; total: number; producer: number; platform: number; fee: number }>();
  for (const o of paid) {
    const name = o.producers?.company_name ?? "—";
    const r = by.get(name) ?? { name, count: 0, total: 0, producer: 0, platform: 0, fee: 0 };
    r.count++; r.total += Number(o.total); r.producer += Number(o.producer_amount); r.platform += Number(o.platform_amount); r.fee += Number(o.asaas_fee_estimate);
    by.set(name, r);
  }
  const rows = [...by.values()].sort((a, b) => b.total - a.total);
  const t = rows.reduce((s, r) => ({ total: s.total + r.total, producer: s.producer + r.producer, platform: s.platform + r.platform, fee: s.fee + r.fee }), { total: 0, producer: 0, platform: 0, fee: 0 });
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 text-sm">
        <p className="font-semibold">Como o dinheiro é dividido</p>
        <p className="mt-1 text-muted-foreground">Em cada pagamento, o valor do evento vai direto para a carteira Asaas do produtor. A plataforma fica somente com as taxas e comissões configuradas.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><p className="text-muted-foreground">Total pago</p><p className="text-xl font-bold">{brl(t.total)}</p></div>
          <div><p className="text-muted-foreground">Para os produtores</p><p className="text-xl font-bold">{brl(t.producer)}</p></div>
          <div><p className="text-muted-foreground">Sua comissão (líquida)</p><p className="text-xl font-bold text-primary">{brl(t.platform)}</p></div>
          <div><p className="text-muted-foreground">Taxas Asaas (estimadas)</p><p className="text-xl font-bold">{brl(t.fee)}</p></div>
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Produtor</TableHead><TableHead>Confirmadas</TableHead><TableHead>Total</TableHead><TableHead>Repasse produtor</TableHead><TableHead>Comissão plataforma</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma venda paga ainda.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.count}</TableCell><TableCell>{brl(r.total)}</TableCell><TableCell>{brl(r.producer)}</TableCell><TableCell className="font-semibold">{brl(r.platform)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", producer: "Produtor", athlete: "Atleta" };

function Users() {
  const qc = useQueryClient();
  const load = useServerFn(listUsers);
  const setRole = useServerFn(setUserRole);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("todos");
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: () => load() });
  const list = users.filter((u: any) => (filter === "todos" || u.roles.includes(filter)) && `${u.full_name ?? ""} ${u.email ?? ""} ${u.cpf ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  async function toggle(userId: string, role: "super_admin" | "producer" | "athlete", enabled: boolean) {
    try { await setRole({ data: { userId, role, enabled } }); toast.success("Acesso atualizado"); qc.invalidateQueries({ queryKey: ["admin-users"] }); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Buscar por nome, e-mail ou CPF" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos ({users.length})</SelectItem>
            <SelectItem value="athlete">Atletas</SelectItem>
            <SelectItem value="producer">Produtores</SelectItem>
            <SelectItem value="super_admin">Super admins</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><Button variant="hero" onClick={() => setCreating(true)}>Novo usuário</Button></div>
      </div>
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead>Inscrições</TableHead><TableHead>Perfis</TableHead><TableHead>Super admin</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>}
            {list.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell><p className="font-medium">{u.full_name || "—"}</p><p className="text-xs text-muted-foreground">desde {fmtDate(u.created_at)}</p></TableCell>
                <TableCell><p>{u.email}</p><p className="text-xs text-muted-foreground">{u.phone || ""} {u.city ? `· ${u.city}/${u.state ?? ""}` : ""}</p></TableCell>
                <TableCell>{u.orders} · {brl(u.spent)}</TableCell>
                <TableCell className="space-x-1">{u.roles.map((r: string) => <Badge key={r} variant={r === "super_admin" ? "lime" : "secondary"}>{ROLE_LABEL[r] ?? r}</Badge>)}</TableCell>
                <TableCell><Switch checked={u.roles.includes("super_admin")} onCheckedChange={(v) => toggle(u.id, "super_admin", v)} /></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setEditing(u)}>Editar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <UserDialog u={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-users"] }); }} />}
      {creating && <NewUserDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["admin-users"] }); }} />}
      <p className="text-xs text-muted-foreground">O perfil de produtor é liberado ao aprovar o cadastro na aba Produtores.</p>
    </div>
  );
}
import { brl, fmtDate, METHOD_LABEL, ORDER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => typeof search['tab'] === "string" ? { tab: search['tab'] } : {},
  head: () => ({ meta: [{ title: "Super admin — Inscreva" }, { name: "description", content: "Administre usuários, eventos e o financeiro da Inscreva." }, { property: "og:title", content: "Super admin — Inscreva" }, { property: "og:description", content: "Administre usuários, eventos e o financeiro da Inscreva." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function UserDialog({ u, onClose, onSaved }: { u: any; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(updateUser);
  const del = useServerFn(deleteUser);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    full_name: u.full_name ?? "", email: u.email ?? "", phone: u.phone ?? "", cpf: u.cpf ?? "",
    birth_date: u.birth_date ?? "", gender: u.gender ?? "", city: u.city ?? "", state: u.state ?? "", password: "",
  });
  const [roles, setRoles] = useState<string[]>(u.roles);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? v.trim() : null);
  async function submit() {
    setBusy(true);
    try {
      await save({ data: {
        userId: u.id, email: f.email.trim(), full_name: n(f.full_name), phone: n(f.phone), cpf: n(f.cpf),
        birth_date: n(f.birth_date), gender: n(f.gender), city: n(f.city), state: n(f.state)?.toUpperCase() ?? null,
        password: f.password ? f.password : undefined, roles: roles as any,
      } });
      toast.success("Usuário atualizado");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Excluir o usuário ${u.email}? A conta, o perfil e os acessos serão apagados.`)) return;
    setBusy(true);
    try {
      await del({ data: { userId: u.id } });
      toast.success("Usuário excluído");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const fields: [keyof typeof f, string, string?][] = [
    ["full_name", "Nome completo"], ["email", "E-mail", "email"], ["phone", "Telefone"], ["cpf", "CPF"],
    ["birth_date", "Nascimento", "date"], ["gender", "Gênero"], ["city", "Cidade"], ["state", "UF"],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([k, label, type]) => (
            <div key={k} className={k === "full_name" || k === "email" ? "sm:col-span-2" : ""}>
              <Label>{label}</Label>
              <Input type={type ?? "text"} value={f[k]} onChange={set(k)} maxLength={k === "state" ? 2 : undefined} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label>Nova senha</Label>
            <Input type="text" placeholder="Deixe em branco para manter a atual" value={f.password} onChange={set("password")} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Perfis de acesso</Label>
            {(["athlete", "producer", "super_admin"] as const).map((r) => (
              <div key={r} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">{ROLE_LABEL[r] ?? r}</span>
                <Switch checked={roles.includes(r)} onCheckedChange={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="mr-auto text-destructive" disabled={busy} onClick={remove}>Excluir usuário</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="hero" disabled={busy || !f.email} onClick={submit}>{busy ? "Salvando..." : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewUserDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const make = useServerFn(adminCreateUser);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ full_name: "", email: "", phone: "", cpf: "", password: "" });
  const [roles, setRoles] = useState<string[]>(["athlete"]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? v.trim() : null);
  async function submit() {
    setBusy(true);
    try {
      await make({ data: {
        email: f.email.trim(), password: f.password, full_name: n(f.full_name), phone: n(f.phone), cpf: n(f.cpf),
        roles: roles as any,
      } });
      toast.success("Usuário criado");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Nome completo</Label><Input value={f.full_name} onChange={set("full_name")} /></div>
          <div className="sm:col-span-2"><Label>E-mail</Label><Input type="email" value={f.email} onChange={set("email")} /></div>
          <div><Label>Telefone</Label><Input value={f.phone} onChange={set("phone")} /></div>
          <div><Label>CPF</Label><Input value={f.cpf} onChange={set("cpf")} /></div>
          <div className="sm:col-span-2"><Label>Senha</Label><Input type="text" placeholder="mín. 6 caracteres" value={f.password} onChange={set("password")} /></div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Perfis de acesso</Label>
            {(["athlete", "producer", "super_admin"] as const).map((r) => (
              <div key={r} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">{ROLE_LABEL[r] ?? r}</span>
                <Switch checked={roles.includes(r)} onCheckedChange={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="hero" disabled={busy || !f.email || f.password.length < 6} onClick={submit}>{busy ? "Criando..." : "Criar usuário"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminPage() {
  return (
    <AdminGate>
      <AdminDashboard />
    </AdminGate>
  );
}

function AdminDashboard() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => loadFinancialOrders(),
    refetchInterval: 30000,
  });
  const financial = useQuery({ queryKey: ["admin-financial"], queryFn: loadFinancialSummary, refetchInterval: 30000 });
  const { data: producers = [] } = useQuery({
    queryKey: ["admin-producers"],
    queryFn: async () => (await supabase.from("producers").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: events = [] } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => (await supabase.from("events").select("id, title, slug, status, featured, starts_at, fee_percent, fee_fixed, queue_enabled, queue_capacity, queue_window_minutes, producers(company_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const paid = orders.filter((o) => o.status === "pago");
  const sum = (k: "total" | "platform_amount" | "producer_amount") => paid.reduce((s, o) => s + Number(o[k]), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Tabs value={tab ?? "financeiro"} onValueChange={(value) => {
        if (value === "configuracoes") { navigate({ to: "/admin/configuracoes" }); return; }
        if (value === "caixa-email") { navigate({ to: "/admin/email" }); return; }
        navigate({ search: { tab: value }, replace: true, resetScroll: false });
      }}>
        <TabsList aria-label="Menu do super admin" className="mb-8 h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="produtores">Produtores {producers.some((p) => p.status === "pendente") && <Badge variant="warning" className="ml-2">{producers.filter((p) => p.status === "pendente").length}</Badge>}</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="inscricoes">Inscrições</TabsTrigger>
          <TabsTrigger value="fotos">Fotos</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
          <TabsTrigger value="saques">Saques</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="configuracoes"><Settings className="mr-1.5 h-4 w-4" /> Configurações</TabsTrigger>
          <TabsTrigger value="caixa-email">Caixa de e-mail</TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={DollarSign} label="Volume vendido" value={brl(financial.data?.total ?? sum("total"))} hint={`${financial.data?.confirmed ?? paid.length} confirmadas · ${financial.data?.paid ?? paid.filter((o) => Number(o.total) > 0).length} pagas · ${financial.data?.free ?? paid.filter((o) => Number(o.total) === 0).length} gratuitas`} />
            <StatCard icon={Landmark} label="Receita da plataforma" value={brl(sum("platform_amount"))} hint="Taxas e comissões líquidas" />
            <StatCard icon={Briefcase} label="Repassado a produtores" value={brl(sum("producer_amount"))} hint={`${producers.length} produtores`} />
            <StatCard icon={CalendarDays} label="Eventos" value={events.length} hint={`${events.filter((e) => e.status === "publicado").length} publicados`} />
          </div>
          <SalesChart orders={orders as any} />
          <AdminFinance />
          <Finance orders={orders} />
        </TabsContent>
        <TabsContent value="produtores" className="mt-6"><Producers producers={producers} /></TabsContent>
        <TabsContent value="usuarios" className="mt-6"><Users /></TabsContent>
        <TabsContent value="equipes" className="mt-6"><TeamManagersAdmin /></TabsContent>
        <TabsContent value="eventos" className="mt-6"><Events events={events} /></TabsContent>
        <TabsContent value="inscricoes" className="mt-6"><Orders orders={orders} /></TabsContent>
        <TabsContent value="saques"><WithdrawalsAdmin /></TabsContent>
        <TabsContent value="fotos" className="mt-6"><PhotosAdmin /></TabsContent>
        <TabsContent value="cupons" className="mt-6"><CouponsAdmin events={events} /></TabsContent>
        <TabsContent value="emails" className="mt-6"><Emails /></TabsContent>
        <TabsContent value="logs" className="mt-6"><ActivityLogView /></TabsContent>
      </Tabs>
    </div>
  );
}

function Producers({ producers }: { producers: any[] }) {
  const [edit, setEdit] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="hero" onClick={() => setCreating(true)}>Novo produtor</Button></div>
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
      {creating && <NewProducerDialog onClose={() => setCreating(false)} onCreated={(p) => { setCreating(false); setEdit(p); }} />}
    </>
  );
}

function NewProducerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: any) => void }) {
  const qc = useQueryClient();
  const make = useServerFn(adminCreateProducer);
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(true);
  const [f, setF] = useState({
    account_email: "", account_password: "", company_name: "", document: "", email: "", phone: "",
    birth_date: "", company_type: "", postal_code: "", address: "", address_number: "", province: "", income_value: "5000",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? v.trim() : null);
  const isCnpj = f.document.replace(/\D/g, "").length === 14;
  async function submit() {
    setBusy(true);
    try {
      const r = await make({ data: {
        account_email: f.account_email.trim(), account_password: f.account_password || undefined,
        company_name: f.company_name.trim(), document: f.document.trim(), email: (f.email || f.account_email).trim(),
        phone: n(f.phone), birth_date: n(f.birth_date), company_type: isCnpj ? (f.company_type || "LIMITED") : null,
        postal_code: n(f.postal_code), address: n(f.address), address_number: n(f.address_number), province: n(f.province),
        income_value: f.income_value ? Number(f.income_value) : null, approve,
      } });
      toast.success("Produtor criado. Agora crie ou informe a carteira.");
      await qc.invalidateQueries({ queryKey: ["admin-producers"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      const { data: p } = await supabase.from("producers").select("*").eq("id", r.id).single();
      onCreated(p);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const F = (k: keyof typeof f, label: string, opts: { type?: string; full?: boolean; ph?: string } = {}) => (
    <div className={`space-y-1.5 ${opts.full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      <Input type={opts.type ?? "text"} value={f[k]} onChange={set(k)} placeholder={opts.ph} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Novo produtor</DialogTitle></DialogHeader>
        <p className="text-sm font-semibold">Conta de acesso</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {F("account_email", "E-mail de login", { type: "email" })}
          {F("account_password", "Senha (só se a conta ainda não existir)", { ph: "mín. 6 caracteres" })}
        </div>
        <p className="pt-2 text-sm font-semibold">Dados do produtor (usados na carteira Asaas)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {F("company_name", "Nome / Razão social", { full: true })}
          {F("document", "CPF ou CNPJ")}
          {isCnpj ? (
            <div className="space-y-1.5"><Label>Tipo de empresa</Label>
              <Select value={f.company_type || "LIMITED"} onValueChange={(v) => setF({ ...f, company_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEI">MEI</SelectItem><SelectItem value="LIMITED">Limitada</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="ASSOCIATION">Associação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : F("birth_date", "Data de nascimento", { type: "date" })}
          {F("email", "E-mail da carteira Asaas", { type: "email", ph: "diferente do e-mail da sua conta Asaas" })}
          {F("phone", "Celular")}
          {F("postal_code", "CEP")}
          {F("province", "Bairro")}
          {F("address", "Endereço")}
          {F("address_number", "Número")}
          {F("income_value", "Faturamento mensal (R$)", { type: "number" })}
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <span className="text-sm">Já aprovar este produtor</span>
          <Switch checked={approve} onCheckedChange={setApprove} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="hero" disabled={busy || !f.account_email || !f.company_name || !f.document} onClick={submit}>{busy ? "Criando..." : "Criar produtor"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProducerDialog({ p, onClose }: { p: any; onClose: () => void }) {
  const qc = useQueryClient();
  const upd = useServerFn(updateProducer);
  const mkWallet = useServerFn(createProducerWallet);
  const del = useServerFn(deleteProducer);
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
  async function remove() {
    if (!confirm(`Excluir o produtor ${p.company_name}? Os eventos dele sem inscrições também serão apagados.`)) return;
    setBusy(true);
    try {
      await del({ data: { id: p.id } });
      toast.success("Produtor excluído");
      qc.invalidateQueries({ queryKey: ["admin-producers"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
          <ProducerKeyField producerId={p.id} />
          <Button variant="hero" className="w-full" onClick={save} disabled={busy}>Salvar</Button>
          <Button variant="outline" className="w-full text-destructive" onClick={remove} disabled={busy}>Excluir produtor</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Events({ events }: { events: any[] }) {
  const qc = useQueryClient();
  async function patch(id: string, p: any) {
    const { error } = await supabase.from("events").update(p).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-events"] });
  }
  const [editing, setEditing] = useState<any>(null);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      {editing && <EventFeeDialog e={editing} onClose={() => setEditing(null)} onSave={async (p) => { await patch(editing.id, p); toast.success("Taxa do evento salva"); setEditing(null); }} />}
      <Table>
        <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Produtor</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Destaque</TableHead><TableHead>Taxa do evento</TableHead><TableHead>Fila de espera</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
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
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                  {e.fee_percent != null || e.fee_fixed != null ? `${e.fee_percent ?? "padrão"}% + ${e.fee_fixed != null ? brl(e.fee_fixed) : "padrão"}` : "Padrão"}
                </Button>
              </TableCell>
              <TableCell>
                <Badge variant={e.queue_enabled ? "success" : "secondary"}>{e.queue_enabled ? "Ativa" : "Desativada"}</Badge>
                {e.queue_enabled && <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{e.queue_capacity} por vez · {e.queue_window_minutes} min</p>}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild><Link to="/produtor/eventos/$id" params={{ id: e.id }} search={{ tab: "dados" }}><Pencil /> Editar evento</Link></Button>
                  <Button size="sm" variant="outline" asChild><Link to="/produtor/eventos/$id" params={{ id: e.id }} search={{ tab: "fila" }}><ListOrdered /> Configurar fila</Link></Button>
                  {e.status === "publicado" && <Button size="sm" variant="ghost" asChild><Link to="/eventos/$slug" params={{ slug: e.slug }}>Ver</Link></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {events.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum evento.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

function EventFeeDialog({ e, onClose, onSave }: { e: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [pct, setPct] = useState(e.fee_percent ?? "");
  const [fix, setFix] = useState(e.fee_fixed ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Taxa e comissão — {e.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Comissão %</Label><Input type="number" step="0.01" min="0" value={pct} onChange={(ev) => setPct(ev.target.value)} placeholder="Padrão" /></div>
            <div className="space-y-1.5"><Label>Taxa fixa R$</Label><Input type="number" step="0.01" min="0" value={fix} onChange={(ev) => setFix(ev.target.value)} placeholder="Padrão" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Vale só para este evento. Campo vazio usa a taxa do produtor ou, se não houver, a taxa geral das Configurações.</p>
          <Button variant="hero" className="w-full" onClick={() => onSave({ fee_percent: pct === "" ? null : Number(pct), fee_fixed: fix === "" ? null : Number(fix) })}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
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
                <TableCell><Badge variant={ORDER_STATUS[o.status]!.variant}>{ORDER_STATUS[o.status]!.label}</Badge></TableCell>
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
