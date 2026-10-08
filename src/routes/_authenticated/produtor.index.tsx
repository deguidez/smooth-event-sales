import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, DollarSign, Ticket, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SalesChart, StatCard } from "@/components/dash";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createProducerWallet } from "@/lib/admin.functions";
import { brl, CATEGORIES, fmtDate, onlyDigits, ORDER_STATUS, slugify } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/produtor/")({
  head: () => ({ meta: [{ title: "Painel do produtor — Inscreva" }, { name: "description", content: "Gerencie seus eventos e inscritos na Inscreva." }, { property: "og:title", content: "Painel do produtor — Inscreva" }, { property: "og:description", content: "Gerencie seus eventos e inscritos na Inscreva." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: ProducerHome,
});

function useProducer() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-producer", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("producers").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
}

function ProducerHome() {
  const { data: producer, isLoading } = useProducer();
  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Carregando...</div>;
  if (!producer) return <ProducerSignup />;
  return <ProducerDashboard producer={producer} />;
}

function ProducerSignup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({
    company_name: "", document: "", email: user?.email ?? "", phone: "", birth_date: "", company_type: "MEI",
    postal_code: "", address: "", address_number: "", province: "", income_value: "5000",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const isCnpj = onlyDigits(f.document).length === 14;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const doc = onlyDigits(f.document);
    if (doc.length !== 11 && doc.length !== 14) { toast.error("Informe um CPF ou CNPJ válido"); return; }
    const { error } = await supabase.from("producers").insert({
      user_id: user!.id,
      company_name: f.company_name.trim(),
      document: doc,
      email: f.email.trim(),
      phone: onlyDigits(f.phone),
      birth_date: f.birth_date || null,
      company_type: isCnpj ? f.company_type : null,
      postal_code: onlyDigits(f.postal_code),
      address: f.address,
      address_number: f.address_number,
      province: f.province,
      income_value: Number(f.income_value) || 5000,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Cadastro enviado! Aguarde a aprovação.");
    qc.invalidateQueries({ queryKey: ["my-producer"] });
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">Venda inscrições com a gente</h1>
      <p className="mt-2 text-muted-foreground">Cadastre seus dados. Eles são usados para criar sua carteira de recebimento no Asaas.</p>
      <form onSubmit={submit} className="mt-8 grid gap-4 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-2">
        <F l="Nome / Razão social" c="sm:col-span-2"><Input value={f.company_name} onChange={set("company_name")} required maxLength={120} /></F>
        <F l="CPF ou CNPJ"><Input value={f.document} onChange={set("document")} required /></F>
        <F l="E-mail"><Input type="email" value={f.email} onChange={set("email")} required /></F>
        <F l="Celular"><Input value={f.phone} onChange={set("phone")} required /></F>
        {isCnpj ? (
          <F l="Tipo de empresa">
            <Select value={f.company_type} onValueChange={(v) => setF({ ...f, company_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEI">MEI</SelectItem>
                <SelectItem value="LIMITED">Limitada</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="ASSOCIATION">Associação</SelectItem>
              </SelectContent>
            </Select>
          </F>
        ) : (
          <F l="Data de nascimento"><Input type="date" value={f.birth_date} onChange={set("birth_date")} required /></F>
        )}
        <F l="CEP"><Input value={f.postal_code} onChange={set("postal_code")} required /></F>
        <F l="Endereço"><Input value={f.address} onChange={set("address")} required /></F>
        <F l="Número"><Input value={f.address_number} onChange={set("address_number")} required /></F>
        <F l="Bairro"><Input value={f.province} onChange={set("province")} required /></F>
        <F l="Faturamento mensal (R$)"><Input type="number" value={f.income_value} onChange={set("income_value")} /></F>
        <div className="sm:col-span-2"><Button variant="hero" size="lg" type="submit">Enviar cadastro</Button></div>
      </form>
    </div>
  );
}

function ProducerDashboard({ producer }: { producer: any }) {
  const qc = useQueryClient();
  const createWallet = useServerFn(createProducerWallet);
  const [creating, setCreating] = useState(false);
  const { data: events = [] } = useQuery({
    queryKey: ["producer-events", producer.id],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*, ticket_types(quantity, sold)").eq("producer_id", producer.id).order("starts_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: orders = [] } = useQuery({
    queryKey: ["producer-orders", producer.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, producer_amount, created_at, participant_name, payment_method, events(title)")
        .eq("producer_id", producer.id)
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });
  const paid = orders.filter((o) => o.status === "pago");
  const revenue = paid.reduce((s, o) => s + Number(o.producer_amount), 0);

  async function wallet() {
    setCreating(true);
    const r = await createWallet({ data: { producerId: producer.id } }).catch((e) => ({ ok: false as const, error: e.message }));
    setCreating(false);
    if (r.ok) {
      toast.success("Carteira criada!");
      qc.invalidateQueries({ queryKey: ["my-producer"] });
    } else toast.error(r.error);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Painel do produtor</p>
          <h1 className="text-3xl font-extrabold md:text-4xl">{producer.company_name}</h1>
        </div>
        <NewEventDialog producerId={producer.id} />
      </div>

      {producer.status !== "aprovado" && (
        <div className="mb-6 rounded-2xl border border-warning bg-warning/15 p-4 text-sm">
          {producer.status === "pendente"
            ? "Seu cadastro está em análise. Você já pode criar eventos, mas só poderá publicá-los após a aprovação."
            : "Sua conta de produtor está suspensa. Fale com o suporte."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={DollarSign} label="A receber (vendas pagas)" value={brl(revenue)} />
        <StatCard icon={Ticket} label="Inscrições pagas" value={paid.length} />
        <StatCard icon={Users} label="Pendentes" value={orders.filter((o) => o.status === "pendente").length} />
        <div className="rounded-2xl border bg-ink p-5 text-ink-foreground shadow-card">
          <div className="flex items-center gap-2 text-sm text-ink-muted"><Wallet className="h-4 w-4" /> Carteira Asaas</div>
          {producer.asaas_wallet_id ? (
            <>
              <p className="mt-2 font-semibold text-accent">Ativa</p>
              <p className="mt-1 truncate font-mono text-xs text-ink-muted">{producer.asaas_wallet_id}</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm">O dinheiro das vendas cai direto nela.</p>
              <Button variant="lime" size="sm" className="mt-3" onClick={wallet} disabled={creating}>
                {creating ? "Criando..." : "Criar minha carteira"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6"><SalesChart orders={orders as any} /></div>

      <h2 className="mb-4 mt-10 text-2xl font-bold">Meus eventos</h2>
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Crie seu primeiro evento.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <Table>
            <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Vendidos</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {events.map((e) => {
                const cap = e.ticket_types.reduce((s: number, t: any) => s + t.quantity, 0);
                const sold = e.ticket_types.reduce((s: number, t: any) => s + t.sold, 0);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-semibold">{e.title}</TableCell>
                    <TableCell>{fmtDate(e.starts_at)}</TableCell>
                    <TableCell><Badge variant={e.status === "publicado" ? "success" : "secondary"}>{e.status}</Badge></TableCell>
                    <TableCell>{sold}/{cap}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild><Link to="/produtor/eventos/$id" params={{ id: e.id }}>Gerenciar</Link></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-4 mt-10 text-2xl font-bold">Últimas vendas</h2>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Participante</TableHead><TableHead>Evento</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Você recebe</TableHead></TableRow></TableHeader>
          <TableBody>
            {orders.slice(0, 15).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.code}</TableCell>
                <TableCell>{o.participant_name}</TableCell>
                <TableCell>{o.events?.title}</TableCell>
                <TableCell><Badge variant={ORDER_STATUS[o.status]!.variant}>{ORDER_STATUS[o.status]!.label}</Badge></TableCell>
                <TableCell className="text-right font-semibold">{brl(o.producer_amount)}</TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma venda ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewEventDialog({ producerId }: { producerId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("esporte");
  const [date, setDate] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("events")
      .insert({ producer_id: producerId, title: title.trim(), category: category as any, starts_at: new Date(date).toISOString(), slug })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    navigate({ to: "/produtor/eventos/$id", params: { id: data.id } });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="hero"><CalendarPlus /> Novo evento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <F l="Nome do evento"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} /></F>
          <F l="Tipo">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F l="Data e hora"><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required /></F>
          <Button type="submit" variant="hero" className="w-full">Criar e configurar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ l, c, children }: { l: string; c?: string; children: React.ReactNode }) {
  return <div className={`space-y-1.5 ${c ?? ""}`}><Label>{l}</Label>{children}</div>;
}
