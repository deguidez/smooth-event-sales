import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, PackageCheck, QrCode, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QrScanner, fileToJpeg } from "@/components/qr-scanner";
import { kitDeliver, kitOpen, kitSearch } from "@/lib/kits.functions";
import { formatAnswer, parseFields } from "@/lib/custom-fields";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/entrega-kit/$token")({
  head: () => ({
    meta: [
      { title: "Entrega de kits — Evenon" },
      { name: "description", content: "Área do operador para conferir inscrições e registrar a entrega de kits." },
      { property: "og:title", content: "Entrega de kits — Evenon" },
      { property: "og:description", content: "Área do operador para conferir inscrições e registrar a entrega de kits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: KitDeskPage,
});

const maskCpf = (c: string) => (c?.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : c);

function KitDeskPage() {
  const { token } = Route.useParams();
  const open = useServerFn(kitOpen);
  const search = useServerFn(kitSearch);
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [operator, setOperator] = useState("");
  const [opReady, setOpReady] = useState(false);
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => open({ data: { token } }).then(setInfo).catch((e) => setErr(e.message)), [token]);
  useEffect(() => {
    reload();
    const saved = localStorage.getItem("kit-operator");
    if (saved) { setOperator(saved); setOpReady(true); }
  }, [reload]);

  async function find(value: string) {
    if (value.trim().length < 3) return;
    setBusy(true);
    try { setRes(await search({ data: { token, q: value } })); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  const onScan = useCallback((t: string) => { setScan(false); setQ(t); find(t); }, [token]);

  if (err) return <div className="mx-auto max-w-md px-4 py-20 text-center text-destructive">{err}</div>;
  if (!info) return <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">Carregando...</div>;

  if (!opReady)
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-extrabold">Entrega de kits</h1>
        <p className="text-muted-foreground">{info.event.title}</p>
        <form className="mt-6 space-y-3 rounded-2xl border bg-card p-5 shadow-card" onSubmit={(e) => { e.preventDefault(); if (operator.trim().length < 2) return; localStorage.setItem("kit-operator", operator.trim()); setOpReady(true); }}>
          <Label>Seu nome (operador)</Label>
          <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Nome completo" autoFocus />
          <p className="text-xs text-muted-foreground">Cada entrega fica registrada com o seu nome, data e horário.</p>
          <Button variant="hero" className="w-full" type="submit">Começar</Button>
        </form>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Entrega de kits</h1>
          <p className="truncate text-muted-foreground">{info.event.title}</p>
        </div>
        <Badge variant="secondary">{info.delivered}/{info.total} entregues</Badge>
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
        <UserRound className="size-4" /> Operador: <b className="text-foreground">{operator}</b>
        <button className="ml-2 underline" onClick={() => { localStorage.removeItem("kit-operator"); setOpReady(false); }}>trocar</button>
      </p>

      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); find(q); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº da inscrição ou CPF" inputMode="text" />
        <Button type="submit" disabled={busy}><Search /></Button>
        <Button type="button" variant="outline" onClick={() => setScan((s) => !s)}><QrCode /></Button>
      </form>
      {scan && <div className="mt-3"><QrScanner onResult={onScan} /></div>}

      {res && (
        <div className="mt-5 space-y-4">
          {res.orders.length === 0 && <p className="rounded-xl border p-4 text-center text-muted-foreground">Nenhuma inscrição encontrada.</p>}
          {res.orders.map((o: any) => (
            <OrderCard key={o.id} o={o} fields={parseFields(res.fields)} delivery={res.deliveries.find((d: any) => d.order_id === o.id)}
              token={token} operator={operator} onDone={() => { find(q); reload(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ o, fields, delivery, token, operator, onDone }: any) {
  const deliver = useServerFn(kitDeliver);
  const [third, setThird] = useState(false);
  const [t, setT] = useState({ name: "", phone: "", cpf: "", photo: "" });
  const [saving, setSaving] = useState(false);
  const items = [...(o.shirt_size ? [{ name: "Camiseta", size: o.shirt_size, qty: 1 }] : []), ...((o.items as any[]) ?? [])];
  const answers = fields.map((f: any) => [f.label, formatAnswer(f, o.custom_answers?.[f.id])]).filter(([, v]: any) => v);

  async function confirm() {
    if (third && (!t.photo || t.name.length < 3 || t.cpf.replace(/\D/g, "").length !== 11 || t.phone.replace(/\D/g, "").length < 10)) {
      toast.error("Para terceiros: foto, nome, telefone e CPF são obrigatórios"); return;
    }
    setSaving(true);
    try {
      await deliver({ data: { token, orderId: o.id, operatorName: operator, ...(third ? { third: { name: t.name.trim(), phone: t.phone.replace(/\D/g, ""), cpf: t.cpf.replace(/\D/g, ""), photo: t.photo } } : {}) } });
      toast.success("Entrega registrada");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold">{o.participant_name}</p>
          <p className="text-sm text-muted-foreground">#{o.code} · CPF {maskCpf(o.participant_cpf)} · {o.ticket_types?.name}</p>
          {o.team && <p className="text-sm text-muted-foreground">Equipe: {o.team}</p>}
        </div>
        {delivery ? <Badge variant="success">Entregue</Badge> : o.status === "pago" ? <Badge>Pago</Badge> : <Badge variant="destructive">Não pago</Badge>}
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Entregar</p>
        <ul className="mt-1 space-y-1">
          <li className="flex items-center gap-2"><PackageCheck className="size-4 text-primary" /> Kit de inscrição ({o.ticket_types?.name})</li>
          {items.map((i: any, k: number) => <li key={k} className="flex items-center gap-2"><PackageCheck className="size-4 text-primary" /> {i.qty}x {i.name}{i.size ? ` — tamanho ${i.size}` : ""}</li>)}
        </ul>
      </div>
      {answers.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {answers.map(([k, v]: any) => <><dt key={`k${k}`} className="text-muted-foreground">{k}</dt><dd key={`v${k}`}>{v}</dd></>)}
        </dl>
      )}

      {delivery ? (
        <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
          <p className="flex items-center gap-1 font-semibold"><CheckCircle2 className="size-4" /> Entregue em {fmtDate(delivery.delivered_at)} por {delivery.operator_name}</p>
          {delivery.receiver_type === "terceiro" && <p>Retirado por terceiro: {delivery.third_name}</p>}
        </div>
      ) : o.status === "pago" ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm"><Switch checked={third} onCheckedChange={setThird} /> Retirada por outra pessoa</label>
          {third && (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm">
                {t.photo ? <img src={t.photo} alt="Foto de quem retirou" className="max-h-48 rounded-lg" /> : <><Camera className="size-5" /> Fotografar a pessoa</>}
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setT({ ...t, photo: await fileToJpeg(f) }); }} />
              </label>
              <Input placeholder="Nome completo" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
              <Input placeholder="Telefone" inputMode="tel" value={t.phone} onChange={(e) => setT({ ...t, phone: e.target.value })} />
              <Input placeholder="CPF" inputMode="numeric" value={t.cpf} onChange={(e) => setT({ ...t, cpf: e.target.value })} />
            </div>
          )}
          <Button variant="hero" className="w-full" disabled={saving} onClick={confirm}>{saving ? "Registrando..." : "Confirmar entrega do kit completo"}</Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-destructive">Pagamento não confirmado — não entregue o kit.</p>
      )}
    </div>
  );
}
