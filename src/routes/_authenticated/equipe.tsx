import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomFieldsForm } from "@/components/custom-fields";
import { computeFees, type Method } from "@/lib/fees";
import { brl, fmtDate, METHOD_LABEL, onlyDigits, ORDER_STATUS } from "@/lib/format";
import {
  cancelTeamOrders, createTeamOrders, getTeamState, inviteByCpf, listTeamEvents, listTeamOrders, refreshTeamOrders, removeTeamMember,
} from "@/lib/team.functions";

const TITLE = "Minha equipe — Evenon";
const DESC = "Adicione atletas pelo CPF, faça inscrições em grupo e acompanhe os pagamentos.";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: TeamPage,
});

function TeamPage() {
  const get = useServerFn(getTeamState);
  const { data, isPending } = useQuery({ queryKey: ["team-state"], queryFn: () => get() });
  const [tab, setTab] = useState("atletas");
  if (isPending) return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Carregando…</div>;
  if (data?.manager?.status !== "aprovado")
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">Seu acesso de gerente de equipe ainda não foi liberado.</p>
        <Button className="mt-4" variant="outline" asChild><Link to="/minha-conta">Ir para Minha conta</Link></Button>
      </div>
    );
  const accepted = data.members.filter((m) => m.status === "aceito");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 rounded-3xl bg-ink p-8 text-ink-foreground">
        <p className="text-sm text-ink-muted">Gerente de equipe</p>
        <h1 className="text-3xl font-extrabold md:text-4xl">{data.manager.team_name}</h1>
        <p className="mt-2 text-sm text-ink-muted">{accepted.length} atletas na equipe</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="atletas">Atletas</TabsTrigger>
          <TabsTrigger value="inscrever">Nova inscrição</TabsTrigger>
          <TabsTrigger value="cobrancas">Inscrições e pagamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="atletas" className="mt-6"><Members members={data.members} /></TabsContent>
        <TabsContent value="inscrever" className="mt-6"><NewRegistration members={accepted} onDone={() => setTab("cobrancas")} /></TabsContent>
        <TabsContent value="cobrancas" className="mt-6"><TeamOrders /></TabsContent>
      </Tabs>
    </div>
  );
}

type Member = { id: string; athleteId: string; status: string; name: string; email: string; cpf: string; complete: boolean };

function Members({ members }: { members: Member[] }) {
  const invite = useServerFn(inviteByCpf);
  const remove = useServerFn(removeTeamMember);
  const qc = useQueryClient();
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await invite({ data: { cpf: onlyDigits(cpf) } });
      toast.success(`Convite enviado para ${r.name}. Ele precisa aceitar em Minha conta → Equipes.`);
      setCpf("");
      qc.invalidateQueries({ queryKey: ["team-state"] });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  const st: Record<string, { l: string; v: "success" | "warning" | "destructive" }> = {
    aceito: { l: "Na equipe", v: "success" }, convidado: { l: "Aguardando aceite", v: "warning" }, recusado: { l: "Recusou", v: "destructive" },
  };
  return (
    <div className="space-y-6">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label>CPF do atleta</Label>
          <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" className="w-56" required />
        </div>
        <Button type="submit" disabled={busy}><UserPlus /> Convidar</Button>
        <p className="w-full text-xs text-muted-foreground">O atleta precisa ter cadastro no site e aceitar o convite.</p>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {members.length === 0 && <p className="text-muted-foreground">Nenhum atleta ainda.</p>}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{m.name}</p>
              <p className="truncate text-xs text-muted-foreground">{m.cpf}{m.email ? ` · ${m.email}` : ""}</p>
              {m.status === "aceito" && !m.complete && <p className="text-xs text-destructive">Cadastro incompleto</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={st[m.status]?.v}>{st[m.status]?.l}</Badge>
              <Button size="icon" variant="ghost" aria-label="Remover" onClick={async () => {
                await remove({ data: { id: m.id } });
                qc.invalidateQueries({ queryKey: ["team-state"] });
              }}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Entry = { shirt_size: string; answers: Record<string, any> };

function NewRegistration({ members, onDone }: { members: Member[]; onDone: () => void }) {
  const listEv = useServerFn(listTeamEvents);
  const create = useServerFn(createTeamOrders);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team-events"], queryFn: () => listEv() });
  const [eventId, setEventId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [method, setMethod] = useState<Method>("PIX");
  const [sel, setSel] = useState<Record<string, Entry>>({});
  const [accepted, setAccepted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ev = data?.events.find((e) => e.id === eventId);
  const tk = ev?.tickets.find((t) => t.id === ticketId);
  const fees = useMemo(() => (tk && data ? computeFees(tk.price, method, data.feeSettings as any, ev!.feeOverride) : null), [tk, method, data, ev]);
  const n = Object.keys(sel).length;

  const toggle = (id: string, on: boolean) => setSel((s) => {
    const c = { ...s };
    if (on) c[id] = { shirt_size: "", answers: {} }; else delete c[id];
    return c;
  });

  async function submit(mode: "grupo" | "individual") {
    if (!ev || !tk || !n) return;
    setBusy(true);
    try {
      const r: any = await create({ data: { ticketId: tk.id, method, mode, accepted, entries: Object.entries(sel).map(([athleteId, e]) => ({ athleteId, shirt_size: e.shirt_size || null, answers: e.answers })) } });
      toast.success(r.free ? `${r.count} inscrições confirmadas` : mode === "grupo" ? `${r.count} inscrições criadas. Pague a cobrança única.` : `${r.count} cobranças enviadas por e-mail aos atletas`);
      if (r.failed?.length) toast.error(`Falhou para: ${r.failed.join(", ")}`);
      setSel({});
      qc.invalidateQueries({ queryKey: ["team-orders"] });
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (!data) return <p className="text-muted-foreground">Carregando eventos…</p>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Evento</Label>
          <Select value={eventId} onValueChange={(v) => { setEventId(v); setTicketId(""); setAccepted([]); }}>
            <SelectTrigger><SelectValue placeholder="Escolha o evento" /></SelectTrigger>
            <SelectContent>{data.events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title} · {fmtDate(e.starts_at)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Lote</Label>
          <Select value={ticketId} onValueChange={setTicketId} disabled={!ev}>
            <SelectTrigger><SelectValue placeholder="Escolha o lote" /></SelectTrigger>
            <SelectContent>{ev?.tickets.map((t) => <SelectItem key={t.id} value={t.id} disabled={t.available <= 0}>{t.name} · {brl(t.price)} ({t.available} vagas)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Forma de pagamento</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{data.methods.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m] ?? m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {ev && tk && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Atletas ({n} selecionados)</h3>
              <Button size="sm" variant="ghost" onClick={() => n === members.length ? setSel({}) : setSel(Object.fromEntries(members.map((m) => [m.athleteId, sel[m.athleteId] ?? { shirt_size: "", answers: {} }])))}>
                {n === members.length ? "Desmarcar todos" : "Marcar todos"}
              </Button>
            </div>
            {members.length === 0 && <p className="text-muted-foreground">Nenhum atleta aceitou ainda. Convide na aba Atletas.</p>}
            {members.map((m) => {
              const e = sel[m.athleteId];
              return (
                <div key={m.id} className={`rounded-xl border bg-card p-4 ${e ? "border-primary" : ""}`}>
                  <label className="flex items-center gap-3 font-semibold">
                    <Checkbox checked={!!e} disabled={!m.complete} onCheckedChange={(c) => toggle(m.athleteId, !!c)} />
                    {m.name} {!m.complete && <span className="text-xs font-normal text-destructive">(cadastro incompleto)</span>}
                  </label>
                  {e && (ev.shirt_enabled || ev.fields.length > 0) && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {ev.shirt_enabled && (
                        <div className="space-y-1.5">
                          <Label>Camisa *</Label>
                          <Select value={e.shirt_size} onValueChange={(v) => setSel((s) => ({ ...s, [m.athleteId]: { ...e, shirt_size: v } }))}>
                            <SelectTrigger><SelectValue placeholder="Tamanho" /></SelectTrigger>
                            <SelectContent>{ev.shirt_sizes.map((z: string) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}
                      <CustomFieldsForm fields={ev.fields} answers={e.answers} onChange={(a) => setSel((s) => ({ ...s, [m.athleteId]: { ...e, answers: a } }))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {ev.terms.length > 0 && (
            <div className="space-y-2 rounded-2xl border bg-card p-5">
              <p className="font-semibold">Termos (aceitos em nome dos atletas)</p>
              {ev.terms.map((t) => (
                <label key={t.id} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={accepted.includes(t.id)} onCheckedChange={(c) => setAccepted((a) => c ? [...a, t.id] : a.filter((x) => x !== t.id))} />
                  <span><b>{t.title}.</b> {t.text}</span>
                </label>
              ))}
            </div>
          )}

          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5 shadow-card">
            <div>
              <p className="text-sm text-muted-foreground">{n} × {brl(fees?.total ?? 0)}</p>
              <p className="font-display text-2xl font-extrabold">{brl((fees?.total ?? 0) * n)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!n || busy} onClick={() => submit("individual")}>Enviar cobrança para cada atleta</Button>
              <Button variant="hero" disabled={!n || busy} onClick={() => submit("grupo")}>Pagar tudo de uma vez</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TeamOrders() {
  const list = useServerFn(listTeamOrders);
  const refresh = useServerFn(refreshTeamOrders);
  const cancel = useServerFn(cancelTeamOrders);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["team-orders"], queryFn: () => list(), refetchInterval: 30_000 });
  const [eventF, setEventF] = useState("todos");
  const [checked, setChecked] = useState<string[]>([]);
  const events = [...new Map(data.map((o: any) => [o.event_id, o.events?.title])).entries()];
  const rows = data.filter((o: any) => eventF === "todos" || o.event_id === eventF);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    rows.forEach((o: any) => { const k = o.payment_group_id ?? o.id; m.set(k, [...(m.get(k) ?? []), o]); });
    return [...m.values()];
  }, [rows]);
  const pend = rows.filter((o: any) => o.status === "pendente").map((o: any) => o.id);
  const reload = () => qc.invalidateQueries({ queryKey: ["team-orders"] });
  async function doRefresh(ids: string[]) {
    if (!ids.length) return;
    try { const r = await refresh({ data: { orderIds: ids } }); toast.success(r.paid ? `${r.paid} pagamento(s) confirmado(s)` : "Nenhum pagamento novo"); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  async function doCancel(ids: string[]) {
    if (!ids.length || !confirm("Cancelar as inscrições selecionadas? Cobranças em grupo são canceladas inteiras.")) return;
    try { const r = await cancel({ data: { orderIds: ids } }); toast.success(`${r.cancelled} cancelada(s)`); setChecked([]); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={eventF} onValueChange={setEventF}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os eventos</SelectItem>
            {events.map(([id, t]) => <SelectItem key={id} value={id}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => doRefresh(pend)} disabled={!pend.length}><RefreshCw /> Verificar pagamentos</Button>
        <Button variant="outline" onClick={() => doCancel(checked)} disabled={!checked.length}><X /> Cancelar selecionadas</Button>
        <p className="text-xs text-muted-foreground">Pix e cartão não pagos são cancelados automaticamente após 30 minutos.</p>
      </div>
      {groups.length === 0 && <p className="text-muted-foreground">Nenhuma inscrição ainda.</p>}
      {groups.map((g) => {
        const first = g[0];
        const isGroup = !!first.payment_group_id;
        const total = g.reduce((s: number, o: any) => s + Number(o.total), 0);
        const pending = first.status === "pendente";
        return (
          <div key={first.payment_group_id ?? first.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{first.events?.title} · {first.ticket_types?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {isGroup ? `Cobrança única · ${g.length} atletas` : "Cobrança enviada ao atleta"} · {METHOD_LABEL[first.payment_method] ?? first.payment_method} · {fmtDate(first.created_at, true)} · {brl(total)}
                </p>
              </div>
              {isGroup && pending && (
                <div className="flex flex-wrap gap-2">
                  {first.pix_payload && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(first.pix_payload); toast.success("Pix copia e cola copiado"); }}><Copy /> Copiar Pix</Button>}
                  {first.invoice_url && <Button size="sm" variant="hero" asChild><a href={first.invoice_url} target="_blank" rel="noreferrer">Pagar agora</a></Button>}
                </div>
              )}
            </div>
            {isGroup && pending && first.pix_qr_image && <img src={`data:image/png;base64,${first.pix_qr_image}`} alt="QR Code Pix" className="mt-3 h-40 w-40 rounded-lg border" />}
            <div className="mt-3 divide-y">
              {g.map((o: any) => {
                const st = ORDER_STATUS[o.status];
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2 text-sm">
                    <Checkbox disabled={o.status !== "pendente"} checked={checked.includes(o.id)} onCheckedChange={(c) => setChecked((x) => c ? [...x, o.id] : x.filter((y) => y !== o.id))} />
                    <span className="flex-1 truncate">{o.participant_name}{o.shirt_size ? ` · camisa ${o.shirt_size}` : ""}</span>
                    {!isGroup && o.status === "pendente" && o.invoice_url && <a className="text-xs text-primary underline" href={o.invoice_url} target="_blank" rel="noreferrer">link de pagamento</a>}
                    <Badge variant={st?.variant}>{st?.label ?? o.status}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
