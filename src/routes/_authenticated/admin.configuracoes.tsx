import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Database, KeyRound, Percent, Plug, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSettings, getSystemStatus, registerAsaasWebhook, saveAdminSettings, testAsaasConnection } from "@/lib/admin.functions";
import { computeFees } from "@/lib/fees";
import { brl } from "@/lib/format";
import { AdminGate } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Super admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGate>
      <SettingsPage />
    </AdminGate>
  ),
});

function SettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdminSettings);
  const save = useServerFn(saveAdminSettings);
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => load() });
  const [f, setF] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  if (!f) return <div className="mx-auto max-w-5xl px-4 py-20 text-muted-foreground">Carregando...</div>;

  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function persist(extra: Record<string, unknown> = {}) {
    try {
      await save({
        data: {
          site_name: f.site_name,
          asaas_env: f.asaas_env,
          platform_wallet_id: f.platform_wallet_id || null,
          fee_percent: Number(f.fee_percent),
          fee_fixed: Number(f.fee_fixed),
          fee_paid_by_buyer: f.fee_paid_by_buyer,
          asaas_fee_pix: Number(f.asaas_fee_pix),
          asaas_fee_boleto: Number(f.asaas_fee_boleto),
          asaas_fee_card_percent: Number(f.asaas_fee_card_percent),
          asaas_fee_card_fixed: Number(f.asaas_fee_card_fixed),
          asaas_fee_paid_by: f.asaas_fee_paid_by,
          max_installments: Number(f.max_installments),
          boleto_due_days: Number(f.boleto_due_days),
          enable_pix: f.enable_pix,
          enable_boleto: f.enable_boleto,
          enable_card: f.enable_card,
          ...extra,
        },
      });
      toast.success("Configurações salvas");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/admin" className="text-sm text-muted-foreground">← Visão geral</Link>
      <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">Configurações da plataforma</h1>
      <Tabs defaultValue="api" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="api"><Plug className="mr-1.5 h-4 w-4" /> API Asaas</TabsTrigger>
          <TabsTrigger value="taxas"><Percent className="mr-1.5 h-4 w-4" /> Taxas e comissões</TabsTrigger>
          <TabsTrigger value="pagamentos"><KeyRound className="mr-1.5 h-4 w-4" /> Pagamentos</TabsTrigger>
          <TabsTrigger value="banco"><Database className="mr-1.5 h-4 w-4" /> Banco de dados</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="mt-6 space-y-6">
          <Card title="Conexão com o Asaas" desc="Cole a chave de API da sua conta Asaas (Integrações → Chave de API).">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field l="Nome do site"><Input value={f.site_name} onChange={num("site_name")} /></Field>
              <Field l="Ambiente">
                <Select value={f.asaas_env} onValueChange={(v) => setF({ ...f, asaas_env: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="producao">Produção (dinheiro real)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field l={`Chave de API ${f.hasApiKey ? `(atual: ${f.apiKeyPreview})` : ""}`} c="sm:col-span-2">
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={f.hasApiKey ? "Deixe em branco para manter a atual" : "$aact_..."} autoComplete="off" />
              </Field>
              <Field l="Carteira da plataforma (walletId)" c="sm:col-span-2">
                <Input value={f.platform_wallet_id ?? ""} onChange={num("platform_wallet_id")} className="font-mono text-xs" placeholder="Preenchido automaticamente ao testar a conexão" />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="hero" onClick={() => persist(apiKey ? { asaas_api_key: apiKey } : {})}>Salvar</Button>
              <TestButton />
            </div>
          </Card>
          <WebhookCard url={f.webhookUrl} configured={f.hasWebhookToken} />
        </TabsContent>

        <TabsContent value="taxas" className="mt-6 space-y-6">
          <Card title="Comissão da plataforma" desc="Valor que fica com o dono do site em cada inscrição. Pode ser alterado por produtor no painel do admin.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field l="Porcentagem (%)"><Input type="number" step="0.01" value={f.fee_percent} onChange={num("fee_percent")} /></Field>
              <Field l="Valor fixo (R$)"><Input type="number" step="0.01" value={f.fee_fixed} onChange={num("fee_fixed")} /></Field>
              <Field l="Quem paga a comissão">
                <Select value={f.fee_paid_by_buyer ? "comprador" : "produtor"} onValueChange={(v) => setF({ ...f, fee_paid_by_buyer: v === "comprador" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comprador">Comprador (somada ao preço)</SelectItem>
                    <SelectItem value="produtor">Produtor (descontada do repasse)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>
          <Card title="Taxas do Asaas" desc="Informe as taxas do seu contrato com o Asaas para calcular o lucro real.">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field l="Pix (R$)"><Input type="number" step="0.01" value={f.asaas_fee_pix} onChange={num("asaas_fee_pix")} /></Field>
              <Field l="Boleto (R$)"><Input type="number" step="0.01" value={f.asaas_fee_boleto} onChange={num("asaas_fee_boleto")} /></Field>
              <Field l="Cartão (%)"><Input type="number" step="0.01" value={f.asaas_fee_card_percent} onChange={num("asaas_fee_card_percent")} /></Field>
              <Field l="Cartão fixo (R$)"><Input type="number" step="0.01" value={f.asaas_fee_card_fixed} onChange={num("asaas_fee_card_fixed")} /></Field>
              <Field l="Quem absorve a taxa Asaas" c="sm:col-span-2">
                <Select value={f.asaas_fee_paid_by} onValueChange={(v) => setF({ ...f, asaas_fee_paid_by: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plataforma">Plataforma (sai da comissão)</SelectItem>
                    <SelectItem value="produtor">Produtor (descontada do repasse)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>
          <Simulator f={f} />
          <Button variant="hero" onClick={() => persist()}>Salvar taxas</Button>
        </TabsContent>

        <TabsContent value="pagamentos" className="mt-6">
          <Card title="Formas de pagamento" desc="Escolha o que os participantes podem usar.">
            <div className="space-y-4">
              <Toggle l="Pix" v={f.enable_pix} on={(v) => setF({ ...f, enable_pix: v })} />
              <Toggle l="Boleto" v={f.enable_boleto} on={(v) => setF({ ...f, enable_boleto: v })} />
              <Toggle l="Cartão de crédito" v={f.enable_card} on={(v) => setF({ ...f, enable_card: v })} />
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <Field l="Máximo de parcelas no cartão"><Input type="number" min={1} max={21} value={f.max_installments} onChange={num("max_installments")} /></Field>
                <Field l="Vencimento do boleto (dias)"><Input type="number" min={1} max={30} value={f.boleto_due_days} onChange={num("boleto_due_days")} /></Field>
              </div>
              <Button variant="hero" onClick={() => persist()}>Salvar</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="banco" className="mt-6"><DbStatus /></TabsContent>
      </Tabs>
    </div>
  );
}

function TestButton() {
  const test = useServerFn(testAsaasConnection);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await test().catch((e) => ({ ok: false as const, error: e.message }));
        setBusy(false);
        if (r.ok) {
          toast.success(`Conectado! Saldo: ${brl(r.balance)}`);
          qc.invalidateQueries({ queryKey: ["admin-settings"] });
        } else toast.error(r.error);
      }}
    >
      {busy ? "Testando..." : "Testar conexão"}
    </Button>
  );
}

function WebhookCard({ url, configured }: { url: string; configured: boolean }) {
  const reg = useServerFn(registerAsaasWebhook);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Confirmação automática de pagamentos (webhook)" desc="O Asaas avisa este site sempre que um pagamento é confirmado, vence ou é estornado.">
      <div className="flex items-center gap-2">
        {configured ? <Badge variant="success">Configurado</Badge> : <Badge variant="warning">Não configurado</Badge>}
      </div>
      <div className="mt-3 flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado"); }}><Copy /></Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Use o endereço do site publicado. No modo de pré-visualização, o status também é verificado automaticamente na página do pedido.</p>
      <Button
        className="mt-4"
        variant="ink"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await reg().catch((e) => ({ ok: false as const, error: e.message }));
          setBusy(false);
          if (r.ok) {
            toast.success("Webhook registrado no Asaas");
            qc.invalidateQueries({ queryKey: ["admin-settings"] });
          } else toast.error(r.error);
        }}
      >
        {busy ? "Registrando..." : "Registrar webhook no Asaas"}
      </Button>
    </Card>
  );
}

function Simulator({ f }: { f: any }) {
  const [price, setPrice] = useState("100");
  const s = {
    ...f,
    fee_percent: Number(f.fee_percent), fee_fixed: Number(f.fee_fixed),
    asaas_fee_pix: Number(f.asaas_fee_pix), asaas_fee_boleto: Number(f.asaas_fee_boleto),
    asaas_fee_card_percent: Number(f.asaas_fee_card_percent), asaas_fee_card_fixed: Number(f.asaas_fee_card_fixed),
  };
  return (
    <div className="rounded-2xl border bg-ink p-6 text-ink-foreground shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Simulador: inscrição de</p>
        <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32 bg-card text-card-foreground" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => {
          const r = computeFees(Number(price) || 0, m, s);
          return (
            <div key={m} className="rounded-xl bg-sidebar-accent p-4 text-sm">
              <p className="mb-2 font-bold text-accent">{m === "PIX" ? "Pix" : m === "BOLETO" ? "Boleto" : "Cartão"}</p>
              <p>Comprador paga: <b>{brl(r.total)}</b></p>
              <p>Produtor recebe: <b>{brl(r.producerAmount)}</b></p>
              <p>Taxa Asaas: {brl(r.asaasFee)}</p>
              <p>Plataforma fica: <b className="text-accent">{brl(r.platformAmount)}</b></p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DbStatus() {
  const load = useServerFn(getSystemStatus);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["system-status"], queryFn: () => load() });
  const names: Record<string, string> = { profiles: "Usuários", producers: "Produtores", events: "Eventos", ticket_types: "Categorias/lotes", orders: "Inscrições", email_log: "E-mails registrados" };
  return (
    <Card title="Banco de dados" desc="O banco já vem configurado e protegido. Aqui você acompanha a saúde e o volume de dados.">
      {data ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-3 text-sm">
            <Status ok l={`Banco conectado (${data.latencyMs} ms)`} />
            <Status ok={data.asaasConfigured} l="Chave Asaas" />
            <Status ok={data.webhookConfigured} l="Webhook" />
            <Badge variant="outline">Ambiente: {data.env === "producao" ? "Produção" : "Sandbox"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(data.counts).map(([k, v]) => (
              <div key={k} className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">{names[k] ?? k}</p>
                <p className="font-display text-2xl font-extrabold">{v}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Verificando...</p>
      )}
      <Button variant="outline" className="mt-5" onClick={() => refetch()} disabled={isFetching}>Atualizar</Button>
    </Card>
  );
}

function Status({ ok, l }: { ok: boolean; l: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />} {l}
    </span>
  );
}
function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold">{title}</h2>
      {desc && <p className="mb-5 text-sm text-muted-foreground">{desc}</p>}
      {children}
    </section>
  );
}
function Field({ l, c, children }: { l: string; c?: string; children: React.ReactNode }) {
  return <div className={`space-y-1.5 ${c ?? ""}`}><Label>{l}</Label>{children}</div>;
}
function Toggle({ l, v, on }: { l: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-xl border p-4"><span className="font-medium">{l}</span><Switch checked={v} onCheckedChange={on} /></label>;
}
