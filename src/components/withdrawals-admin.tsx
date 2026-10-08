import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, fmtDate } from "@/lib/format";
import { hasProducerAsaasKey, listWithdrawals, processWithdrawal, setProducerAsaasKey } from "@/lib/withdrawals.functions";

export const WITHDRAW_STATUS: Record<string, string> = {
  aguardando_codigo: "Aguardando código", solicitado: "Aguardando pagamento", processando: "Processando",
  pago: "Pago", falhou: "Falhou", recusado: "Recusado", cancelado: "Cancelado",
};

export function ProducerKeyField({ producerId }: { producerId: string }) {
  const check = useServerFn(hasProducerAsaasKey);
  const save = useServerFn(setProducerAsaasKey);
  const { data, refetch } = useQuery({ queryKey: ["producer-key", producerId], queryFn: () => check({ data: { producerId } }) });
  const [key, setKey] = useState("");
  async function go() {
    try { await save({ data: { producerId, apiKey: key } }); setKey(""); refetch(); toast.success("Chave salva"); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-1.5">
      <Label>Chave da API da subconta Asaas (para saque automático)</Label>
      <div className="flex gap-2">
        <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={data?.has ? "Chave cadastrada — cole outra para trocar" : "$aact_..."} className="font-mono text-xs" />
        <Button variant="outline" onClick={go} disabled={!key.trim()}>Salvar</Button>
      </div>
      <p className="text-xs text-muted-foreground">{data?.has ? "Cadastrada. " : "Sem chave: o saque só pode ser pago manualmente. "}A chave fica guardada no servidor e nunca é mostrada.</p>
    </div>
  );
}

export function WithdrawalsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listWithdrawals);
  const proc = useServerFn(processWithdrawal);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-withdrawals"], queryFn: () => list(), refetchInterval: 30000 });
  const [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, action: "asaas" | "manual" | "recusar") {
    const msg = action === "asaas" ? "Enviar o Pix agora pelo Asaas?" : action === "manual" ? "Marcar como pago (você já fez a transferência)?" : "Recusar este saque? O valor volta ao saldo do produtor.";
    if (!confirm(msg)) return;
    setBusy(id);
    try { const r = await proc({ data: { id, action } }); toast.success(`Saque: ${WITHDRAW_STATUS[r.status]}`); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }); }
  }
  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data.length) return <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhum pedido de saque.</div>;
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <Table>
        <TableHeader><TableRow><TableHead>Produtor</TableHead><TableHead>Valor</TableHead><TableHead>Conta</TableHead><TableHead>Data</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data.map((w: any) => (
            <TableRow key={w.id}>
              <TableCell><p className="font-medium">{w.producers?.company_name}</p><p className="text-xs text-muted-foreground">{w.producers?.email}</p></TableCell>
              <TableCell className="font-semibold">{brl(Number(w.amount))}</TableCell>
              <TableCell className="text-xs">{w.bank?.bank_code} - {w.bank?.bank_name}<br />Ag {w.bank?.agency}{w.bank?.agency_digit ? `-${w.bank.agency_digit}` : ""} · Conta {w.bank?.account}-{w.bank?.account_digit}<br />{w.bank?.owner_name}</TableCell>
              <TableCell className="text-xs">{fmtDate(w.created_at)}</TableCell>
              <TableCell><Badge variant={w.status === "pago" ? "lime" : w.status === "solicitado" ? "warning" : "secondary"}>{WITHDRAW_STATUS[w.status] ?? w.status}</Badge>{w.error && <p className="mt-1 max-w-48 text-xs text-destructive">{w.error}</p>}</TableCell>
              <TableCell>
                {w.status === "solicitado" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="hero" disabled={busy === w.id || !w.has_key} title={w.has_key ? "" : "Cadastre a chave da subconta na aba Produtores"} onClick={() => act(w.id, "asaas")}>Pagar via Asaas</Button>
                    <Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => act(w.id, "manual")}>Marcar pago</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === w.id} onClick={() => act(w.id, "recusar")}>Recusar</Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
