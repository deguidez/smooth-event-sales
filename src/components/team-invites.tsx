import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTeamState, removeTeamMember, requestTeamManager, respondTeamInvite } from "@/lib/team.functions";

/** Convites de equipe recebidos pelo atleta + pedido para virar gerente. */
export function TeamInvites() {
  const get = useServerFn(getTeamState);
  const respond = useServerFn(respondTeamInvite);
  const leave = useServerFn(removeTeamMember);
  const request = useServerFn(requestTeamManager);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team-state"], queryFn: () => get() });
  const [name, setName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["team-state"] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); }
  };
  if (!data) return null;
  const invites = data.invites.filter((i) => i.status !== "recusado");
  const m = data.manager;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4" /> Minhas equipes</h3>
        {invites.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum convite de equipe.</p>}
        <div className="mt-3 space-y-2">
          {invites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="font-semibold">{i.teamName}</p>
                <p className="text-xs text-muted-foreground">Gerente: {i.managerName}{i.status === "convidado" ? " · quer inscrever e pagar por você" : ""}</p>
              </div>
              {i.status === "convidado" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => run(() => respond({ data: { id: i.id, accept: true } }), "Você entrou na equipe")}>Aceitar</Button>
                  <Button size="sm" variant="outline" onClick={() => run(() => respond({ data: { id: i.id, accept: false } }), "Convite recusado")}>Recusar</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="success">Participando</Badge>
                  <Button size="sm" variant="ghost" onClick={() => run(() => leave({ data: { id: i.id } }), "Você saiu da equipe")}>Sair</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h3 className="font-bold">Gerenciar uma equipe</h3>
        {m?.status === "aprovado" ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Você gerencia a equipe <b>{m.team_name}</b>.</p>
            <Button variant="hero" size="sm" asChild><Link to="/equipe">Abrir área da equipe</Link></Button>
          </div>
        ) : m?.status === "pendente" ? (
          <p className="mt-2 text-sm text-muted-foreground">Pedido da equipe <b>{m.team_name}</b> enviado. Aguarde a liberação.</p>
        ) : m?.status === "suspenso" ? (
          <p className="mt-2 text-sm text-muted-foreground">Seu acesso de gerente está suspenso.</p>
        ) : (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => request({ data: { teamName: name } }), "Pedido enviado"); }}>
            <Input className="max-w-xs" placeholder="Nome da equipe / assessoria" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            <Button type="submit">Pedir acesso de gerente</Button>
          </form>
        )}
      </div>
    </div>
  );
}
