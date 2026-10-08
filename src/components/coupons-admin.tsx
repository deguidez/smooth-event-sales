import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCoupon, listCoupons, saveCoupon } from "@/lib/coupons.functions";
import { brl, fmtDate, ORDER_STATUS } from "@/lib/format";

export function CouponsAdmin({ events }: { events: any[] }) {
  const qc = useQueryClient();
  const list = useServerFn(listCoupons);
  const del = useServerFn(deleteCoupon);
  const { data } = useQuery({ queryKey: ["admin-coupons"], queryFn: () => list() });
  const [edit, setEdit] = useState<any | null>(null);
  const [usesOf, setUsesOf] = useState<any | null>(null);
  const coupons = data?.coupons ?? [];
  const uses = data?.uses ?? [];
  const usedCount = (id: string) => uses.filter((u: any) => u.coupon_id === id && ["pago", "pendente"].includes(u.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cupons de desconto em porcentagem, para um evento ou para todos.</p>
        <Button onClick={() => setEdit({ code: "", event_id: null, percent: 10, min_amount: null, valid_until: null, max_uses: null, active: true })}>Novo cupom</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Evento</TableHead><TableHead>Desconto</TableHead><TableHead>Mínimo</TableHead><TableHead>Validade</TableHead><TableHead>Usos</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {coupons.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum cupom criado</TableCell></TableRow>}
            {coupons.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-bold">{c.code}</TableCell>
                <TableCell>{c.events?.title ?? <Badge variant="secondary">Geral</Badge>}</TableCell>
                <TableCell>{Number(c.percent)}%</TableCell>
                <TableCell>{c.min_amount != null ? brl(Number(c.min_amount)) : "—"}</TableCell>
                <TableCell>{c.valid_until ? fmtDate(c.valid_until, true) : "Sem validade"}</TableCell>
                <TableCell>{usedCount(c.id)}{c.max_uses ? ` / ${c.max_uses}` : ""}</TableCell>
                <TableCell>{c.active && !(c.valid_until && new Date(c.valid_until) < new Date()) ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setUsesOf(c)}>Quem usou</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...c, valid_until: c.valid_until ? c.valid_until.slice(0, 16) : null })}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                    if (!confirm(`Excluir o cupom ${c.code}? As inscrições que usaram mantêm o desconto.`)) return;
                    try { await del({ data: { id: c.id } }); toast.success("Cupom excluído"); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); } catch (e) { toast.error((e as Error).message); }
                  }}>Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {edit && <CouponDialog c={edit} events={events} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); }} />}
      <Dialog open={!!usesOf} onOpenChange={(o) => !o && setUsesOf(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Quem usou {usesOf?.code}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Participante</TableHead><TableHead>Evento</TableHead><TableHead>Desconto</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead></TableRow></TableHeader>
              <TableBody>
                {uses.filter((u: any) => u.coupon_id === usesOf?.id).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell><p className="font-medium">{u.participant_name}</p><p className="text-xs text-muted-foreground">{u.participant_email} · #{u.code}</p></TableCell>
                    <TableCell>{u.events?.title}</TableCell>
                    <TableCell>{brl(Number(u.discount))}</TableCell>
                    <TableCell>{brl(Number(u.total))}</TableCell>
                    <TableCell>{(ORDER_STATUS as any)[u.status]?.label ?? u.status}</TableCell>
                    <TableCell>{fmtDate(u.created_at, true)}</TableCell>
                  </TableRow>
                ))}
                {!uses.some((u: any) => u.coupon_id === usesOf?.id) && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Ninguém usou ainda</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CouponDialog({ c, events, onClose, onSaved }: { c: any; events: any[]; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(saveCoupon);
  const [f, setF] = useState(c);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v === "" ? null : Number(v));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: {
        id: f.id, code: f.code, event_id: f.event_id || null, percent: Number(f.percent),
        min_amount: f.min_amount === "" || f.min_amount == null ? null : Number(f.min_amount),
        valid_until: f.valid_until ? new Date(f.valid_until).toISOString() : null,
        max_uses: f.max_uses === "" || f.max_uses == null ? null : Number(f.max_uses), active: f.active,
      } });
      toast.success("Cupom salvo");
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{c.id ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Código</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required maxLength={40} placeholder="CORRIDA10" /></div>
          <div className="space-y-1.5"><Label>Desconto (%)</Label><Input type="number" min={0.01} max={100} step="0.01" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} required /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Evento</Label>
            <Select value={f.event_id ?? "geral"} onValueChange={(v) => setF({ ...f, event_id: v === "geral" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Cupom geral (todos os eventos)</SelectItem>
                {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Valor mínimo (opcional)</Label><Input type="number" min={0} step="0.01" value={f.min_amount ?? ""} onChange={(e) => setF({ ...f, min_amount: num(e.target.value) })} placeholder="Sem mínimo" /></div>
          <div className="space-y-1.5"><Label>Limite de usos (opcional)</Label><Input type="number" min={1} step="1" value={f.max_uses ?? ""} onChange={(e) => setF({ ...f, max_uses: num(e.target.value) })} placeholder="Ilimitado" /></div>
          <div className="space-y-1.5"><Label>Validade (opcional)</Label><Input type="datetime-local" value={f.valid_until ?? ""} onChange={(e) => setF({ ...f, valid_until: e.target.value || null })} /></div>
          <div className="flex items-center gap-2 pt-6"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /><Label>Ativo</Label></div>
          <Button type="submit" className="sm:col-span-2" disabled={busy}>{busy ? "Salvando..." : "Salvar cupom"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
