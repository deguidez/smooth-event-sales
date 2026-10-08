import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CustomFieldsForm } from "@/components/custom-fields";
import { isEmpty, parseFields } from "@/lib/custom-fields";
import { toast } from "sonner";
import { CreditCard, Minus, Plus, QrCode, Receipt, ShieldCheck } from "lucide-react";
import { computeFees } from "@/lib/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrder, getCheckoutInfo } from "@/lib/orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, categoryCover, fmtDate, onlyDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/checkout/$ticketId")({
  head: () => ({ meta: [{ title: "Finalizar inscrição — Inscreva" }, { name: "robots", content: "noindex" }] }),
  component: Checkout,
});

const METHODS = {
  PIX: { label: "Pix", icon: QrCode, hint: "Aprovação imediata" },
  CREDIT_CARD: { label: "Cartão", icon: CreditCard, hint: "Em até 12x" },
  BOLETO: { label: "Boleto", icon: Receipt, hint: "Compensa em até 3 dias úteis" },
} as const;

function Checkout() {
  const { ticketId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchInfo = useServerFn(getCheckoutInfo);
  const submitOrder = useServerFn(createOrder);
  const { data: info, isLoading, error } = useQuery({
    queryKey: ["checkout", ticketId],
    queryFn: () => fetchInfo({ data: { ticketId } }),
  });
  const [method, setMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">("PIX");
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", email: "", cpf: "", phone: "", birth_date: "", gender: "", shirt_size: "", team: "" });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [cart, setCart] = useState<Record<string, { qty: number; size: string }>>({});

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setF((p) => ({
          ...p,
          name: data?.full_name ?? "",
          email: data?.email ?? user.email ?? "",
          cpf: data?.cpf ?? "",
          phone: data?.phone ?? "",
          birth_date: data?.birth_date ?? "",
          gender: data?.gender ?? "",
        }));
      });
  }, [user]);

  useEffect(() => {
    if (info && !info.methods.includes(method) && info.methods[0]) setMethod(info.methods[0]);
  }, [info, method]);

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-20 text-muted-foreground">Carregando...</div>;
  if (error || !info) return <div className="mx-auto max-w-5xl px-4 py-20">{(error as Error)?.message ?? "Indisponível"}</div>;

  const chosen = info.products
    .map((p: any) => ({ p, c: cart[p.id] }))
    .filter((x: any) => x.c && x.c.qty > 0);
  const productsTotal = chosen.reduce((s: number, x: any) => s + x.p.price * x.c.qty, 0);
  const free = info.ticket.price + productsTotal <= 0;
  const quote = computeFees(info.ticket.price + productsTotal, method, info.feeSettings as any, info.feeOverride);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (info!.event.shirt_enabled && !f.shirt_size) { toast.error("Escolha o tamanho da camisa do kit"); return; }
    const reqMissing = parseFields(info!.event.custom_fields).find((cf) => cf.required && isEmpty(answers[cf.id]));
    if (reqMissing) { toast.error(`Preencha o campo "${reqMissing.label}"`); return; }
    const missing = chosen.find((x: any) => x.p.sizes.length && !x.c.size);
    if (missing) { toast.error(`Escolha o tamanho de ${missing.p.name}`); return; }
    setBusy(true);
    try {
      const cpf = onlyDigits(f.cpf);
      await supabase
        .from("profiles")
        .update({ full_name: f.name, cpf, phone: f.phone, birth_date: f.birth_date || null, gender: f.gender || null })
        .eq("id", user!.id);
      const r = await submitOrder({
        data: {
          ticketId,
          method,
          installments,
          items: chosen.map((x: any) => ({ productId: x.p.id, qty: x.c.qty, size: x.c.size || null })),
          participant: { ...f, cpf, phone: onlyDigits(f.phone) },
          answers,
        },
      });
      navigate({ to: "/pedido/$id", params: { id: r.orderId } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold">Finalizar inscrição</h1>
          <p className="text-muted-foreground">Preencha os dados do participante.</p>
        </div>
        <section className="grid gap-4 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-2">
          <Field label="Nome completo" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} required minLength={3} maxLength={120} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label="CPF"><Input value={f.cpf} onChange={set("cpf")} required placeholder="000.000.000-00" /></Field>
          <Field label="Celular"><Input value={f.phone} onChange={set("phone")} placeholder="(11) 99999-9999" /></Field>
          <Field label="Data de nascimento"><Input type="date" value={f.birth_date} onChange={set("birth_date")} /></Field>
          <Field label="Sexo">
            <Select value={f.gender} onValueChange={(v) => setF({ ...f, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {info.event.shirt_enabled && (
            <Field label="Tamanho da camisa do kit *">
              <Select value={f.shirt_size} onValueChange={(v) => setF({ ...f, shirt_size: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {info.event.shirt_sizes.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {info.event.category === "esporte" && (
            <Field label="Equipe / assessoria"><Input value={f.team} onChange={set("team")} maxLength={100} /></Field>
          )}
          <CustomFieldsForm fields={parseFields(info.event.custom_fields)} answers={answers} onChange={setAnswers} />
        </section>

        {info.products.length > 0 && (
          <section className="rounded-2xl border bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold">Adicione à sua inscrição</h2>
            <p className="mb-4 text-sm text-muted-foreground">Produtos do evento, somados no total.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {info.products.map((p: any) => {
                const c = cart[p.id] ?? { qty: 0, size: "" };
                const setC = (patch: Partial<typeof c>) => setCart({ ...cart, [p.id]: { ...c, ...patch } });
                return (
                  <div key={p.id} className={cn("overflow-hidden rounded-xl border-2 transition", c.qty > 0 ? "border-primary" : "border-border")}>
                    {p.image_url && <img src={p.image_url} alt={p.name} className="aspect-[4/3] w-full object-cover" />}
                    <div className="space-y-2 p-4">
                      <div className="flex justify-between gap-2"><p className="font-semibold">{p.name}</p><p className="font-bold text-primary">{brl(p.price)}</p></div>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      {p.available <= 0 ? <p className="text-sm text-muted-foreground">Esgotado</p> : (
                        <div className="flex items-center gap-2">
                          {p.sizes.length > 0 && (
                            <Select value={c.size} onValueChange={(v) => setC({ size: v })}>
                              <SelectTrigger className="w-24"><SelectValue placeholder="Tam." /></SelectTrigger>
                              <SelectContent>{p.sizes.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                          <Button type="button" size="icon" variant="outline" onClick={() => setC({ qty: Math.max(0, c.qty - 1) })}><Minus /></Button>
                          <span className="w-6 text-center font-bold">{c.qty}</span>
                          <Button type="button" size="icon" variant="outline" onClick={() => setC({ qty: Math.min(p.available, c.qty + 1) })}><Plus /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!free && (
          <section className="rounded-2xl border bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-bold">Forma de pagamento</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {info.methods.map((m) => {
                const M = METHODS[m];
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition",
                      method === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}
                  >
                    <M.icon className="h-6 w-6 text-primary" />
                    <p className="mt-2 font-semibold">{M.label}</p>
                    <p className="text-xs text-muted-foreground">{M.hint}</p>
                  </button>
                );
              })}
            </div>
            {method === "CREDIT_CARD" && info.maxInstallments > 1 && (
              <div className="mt-4 max-w-xs">
                <Label>Parcelas</Label>
                <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: info.maxInstallments }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x de {brl(quote.total / n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">Os dados do cartão são preenchidos com segurança na página do Asaas.</p>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border bg-card p-5 shadow-card lg:sticky lg:top-24">
        <img src={info.event.cover_url || categoryCover(info.event.category)} alt="" className="aspect-video w-full rounded-xl object-cover" />
        <div>
          <p className="font-bold">{info.event.title}</p>
          <p className="text-sm text-muted-foreground">{fmtDate(info.event.starts_at, true)}</p>
        </div>
        <div className="space-y-2 border-t pt-4 text-sm">
          <Row l={info.ticket.name} r={brl(info.ticket.price)} />
          {chosen.map((x: any) => <Row key={x.p.id} l={`${x.c.qty}x ${x.p.name}${x.c.size ? ` (${x.c.size})` : ""}`} r={brl(x.p.price * x.c.qty)} />)}
          {!free && quote.serviceFee > 0 && <Row l="Taxa de serviço" r={brl(quote.serviceFee)} />}
          <div className="flex justify-between border-t pt-3 text-lg font-extrabold">
            <span>Total</span>
            <span className="text-primary">{brl(free ? 0 : quote.total)}</span>
          </div>
        </div>
        {!free && !info.ready && (
          <p className="rounded-lg bg-warning/20 p-3 text-xs">As vendas deste evento ainda não estão habilitadas para pagamento.</p>
        )}
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy || (!free && !info.ready) || info.ticket.available <= 0}>
          {busy ? "Gerando..." : free ? "Confirmar inscrição" : "Ir para pagamento"}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Pagamento processado pelo Asaas
        </p>
      </aside>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{l}</span>
      <span>{r}</span>
    </div>
  );
}
