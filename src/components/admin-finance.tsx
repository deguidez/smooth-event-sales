import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, fmtDate, onlyDigits } from "@/lib/format";
import { confirmAdminWithdrawal, getAdminFinance, requestAdminWithdrawal, saveAdminBankAccount } from "@/lib/withdrawals.functions";
import { WITHDRAW_STATUS } from "./withdrawals-admin";

const BANKS: [string, string][] = [
  ["001", "Banco do Brasil"], ["033", "Santander"], ["077", "Banco Inter"], ["104", "Caixa Econômica Federal"],
  ["208", "BTG Pactual"], ["212", "Banco Original"], ["237", "Bradesco"], ["260", "Nu Pagamentos (Nubank)"],
  ["290", "PagSeguro"], ["323", "Mercado Pago"], ["336", "C6 Bank"], ["341", "Itaú Unibanco"],
  ["380", "PicPay"], ["422", "Safra"], ["461", "Asaas"], ["633", "Rendimento"], ["655", "Votorantim"],
  ["748", "Sicredi"], ["756", "Sicoob"], ["041", "Banrisul"], ["070", "BRB"], ["004", "Banco do Nordeste"],
];

export function AdminFinance() {
  const get = useServerFn(getAdminFinance);
  const { data, refetch } = useQuery({ queryKey: ["admin-finance"], queryFn: () => get(), refetchInterval: 60000 });
  const [show, setShow] = useState(true);
  const [bankOpen, setBankOpen] = useState(false);
  const [wOpen, setWOpen] = useState(false);
  const b = data?.balance;
  const v = (n?: number) => (show ? brl(n ?? 0) : "R$ •••");
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-bold">Saque da plataforma (suas comissões)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-center justify-between border-b pb-3"><h3 className="font-bold">Comissões</h3>
            <button aria-label="Mostrar ou ocultar valores" onClick={() => setShow(!show)}>{show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}</button></div>
          <dl className="mt-4 space-y-3 text-sm">
            <Row l="Comissões no mês" r={v(b?.month)} />
            <Row l="Total já sacado" r={v(b?.withdrawn)} />
          </dl>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-center justify-between border-b pb-3"><h3 className="font-bold">Meu extrato</h3>
            <button aria-label="Mostrar ou ocultar valores" onClick={() => setShow(!show)}>{show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}</button></div>
          <dl className="mt-4 space-y-3 text-sm">
            <Row l="Saldo a receber" r={v(b?.pending)} hint={`Cartão libera ${b?.releaseDays ?? 4} dias após o pagamento`} />
            <Row l="Saldo disponível" r={v(b?.available)} />
            <Row l={<b>Saldo total</b>} r={<b>{v(b?.total)}</b>} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="hero" disabled={!b || b.available <= 0} onClick={() => (data?.bank ? setWOpen(true) : (toast.info("Cadastre sua conta bancária primeiro"), setBankOpen(true)))}>Transferir saldo <ArrowRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => setBankOpen(true)}><Landmark className="h-4 w-4" /> {data?.bank ? "Conta bancária" : "Cadastrar conta bancária"}</Button>
          </div>
        </div>
      </div>
      {!!data?.withdrawals.length && (
        <div className="mt-4 rounded-2xl border bg-card p-4 shadow-card">
          <h3 className="mb-2 font-bold">Meus saques</h3>
          <ul className="divide-y text-sm">
            {data.withdrawals.filter((w: any) => w.status !== "aguardando_codigo").map((w: any) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{fmtDate(w.created_at)}</span><span className="font-semibold">{brl(Number(w.amount))}</span>
                <Badge variant={w.status === "pago" ? "lime" : "secondary"}>{WITHDRAW_STATUS[w.status] ?? w.status}</Badge>
                {w.error && <span className="w-full text-xs text-destructive">{w.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bankOpen && <BankDialog bank={data?.bank} onClose={() => { setBankOpen(false); refetch(); }} />}
      {wOpen && data?.bank && <WithdrawDialog bank={data.bank} available={b!.available} onClose={() => { setWOpen(false); refetch(); }} />}
    </section>
  );
}

function Row({ l, r, hint }: { l: React.ReactNode; r: React.ReactNode; hint?: string }) {
  return <div className="flex justify-between gap-4"><dt>{l}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</dt><dd className="shrink-0">{r}</dd></div>;
}

function BankDialog({ bank, onClose }: { bank: any; onClose: () => void }) {
  const save = useServerFn(saveAdminBankAccount);
  const [f, setF] = useState({
    bank_code: bank?.bank_code ?? "", agency: bank?.agency ?? "", agency_digit: bank?.agency_digit ?? "",
    account: bank?.account ?? "", account_digit: bank?.account_digit ?? "", account_type: bank?.account_type ?? "CONTA_CORRENTE",
    owner_name: bank?.owner_name ?? "", owner_document: bank?.owner_document ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { ...f, bank_name: BANKS.find((x) => x[0] === f.bank_code)?.[1] ?? "", agency: onlyDigits(f.agency), account: onlyDigits(f.account), owner_document: onlyDigits(f.owner_document) } as any });
      toast.success("Conta bancária salva"); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Dados bancários da plataforma</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {bank && <div className="rounded-lg bg-success/15 px-3 py-2 text-sm font-medium">✓ Conta ativa</div>}
          <div className="space-y-1.5"><Label>Banco</Label>
            <Select value={f.bank_code} onValueChange={(v) => setF({ ...f, bank_code: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha o banco" /></SelectTrigger>
              <SelectContent>{BANKS.map(([c, n]) => <SelectItem key={c} value={c}>{c} - {n}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid grid-cols-[1fr_5rem] gap-2"><div className="space-y-1.5"><Label>Agência</Label><Input value={f.agency} onChange={set("agency")} required /></div><div className="space-y-1.5"><Label>Dígito</Label><Input value={f.agency_digit} onChange={set("agency_digit")} maxLength={2} /></div></div>
          <div className="grid grid-cols-[1fr_5rem] gap-2"><div className="space-y-1.5"><Label>Conta</Label><Input value={f.account} onChange={set("account")} required /></div><div className="space-y-1.5"><Label>Dígito</Label><Input value={f.account_digit} onChange={set("account_digit")} maxLength={2} /></div></div>
          <div className="space-y-1.5"><Label>Tipo de conta</Label>
            <Select value={f.account_type} onValueChange={(v) => setF({ ...f, account_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="CONTA_CORRENTE">Corrente</SelectItem><SelectItem value="CONTA_POUPANCA">Poupança</SelectItem></SelectContent>
            </Select><p className="text-xs text-muted-foreground">Contas salário e conjuntas não são aceitas.</p></div>
          <div className="space-y-1.5"><Label>Favorecido</Label><Input value={f.owner_name} onChange={set("owner_name")} required /></div>
          <div className="space-y-1.5"><Label>CPF/CNPJ do favorecido</Label><Input value={f.owner_document} onChange={set("owner_document")} required placeholder="Somente números" /></div>
          <Button variant="hero" className="w-full" disabled={busy || !f.bank_code}>Salvar conta</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ bank, available, onClose }: { bank: any; available: number; onClose: () => void }) {
  const req = useServerFn(requestAdminWithdrawal);
  const conf = useServerFn(confirmAdminWithdrawal);
  const [amount, setAmount] = useState(available.toFixed(2).replace(".", ","));
  const [step, setStep] = useState<{ id: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    const n = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!(n > 0) || n > available) { toast.error("Valor inválido"); return; }
    setBusy(true);
    try { setStep(await req({ data: { amount: n } })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    try {
      const r = await conf({ data: { id: step!.id, code } });
      toast.success(r.status === "pago" ? "Pix enviado para sua conta!" : "Saque confirmado! O Pix está sendo processado.");
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Solicitação de transferência</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg border border-primary bg-primary/5 p-3 text-sm"><b>Asaas</b><span>Disponível: {brl(available)}</span></div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 text-muted-foreground">O saldo será transferido para a conta:</p>
            <p><b>Banco:</b> {bank.bank_code} - {bank.bank_name}</p>
            <p><b>Agência:</b> {bank.agency}{bank.agency_digit ? `-${bank.agency_digit}` : ""}</p>
            <p><b>Conta:</b> {bank.account}{bank.account_digit ? `-${bank.account_digit}` : ""}</p>
          </div>
          {!step ? (
            <>
              <div className="space-y-1.5"><Label>Valor a transferir (R$)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
              <div className="flex justify-between gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="hero" onClick={send} disabled={busy}>{busy ? "Enviando código..." : "Transferir"}</Button></div>
            </>
          ) : (
            <>
              <p className="text-sm">Enviamos um código de 6 dígitos para <b>{step.email}</b>. Ele vale por 15 minutos.</p>
              <Input value={code} onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))} placeholder="000000" className="text-center text-2xl tracking-[0.5em]" inputMode="numeric" />
              <div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setStep(null)}>Voltar</Button><Button variant="hero" onClick={confirm} disabled={busy || code.length !== 6}>Confirmar saque</Button></div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
