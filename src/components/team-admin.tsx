import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTeamManagers, setTeamManagerStatus } from "@/lib/team.functions";
import { fmtDate } from "@/lib/format";

const ST: Record<string, { l: string; v: "success" | "warning" | "destructive" }> = {
  aprovado: { l: "Liberado", v: "success" },
  pendente: { l: "Aguardando", v: "warning" },
  suspenso: { l: "Suspenso", v: "destructive" },
};

export function TeamManagersAdmin() {
  const list = useServerFn(listTeamManagers);
  const setStatus = useServerFn(setTeamManagerStatus);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["team-managers"], queryFn: () => list() });
  async function change(userId: string, status: "aprovado" | "suspenso") {
    try {
      await setStatus({ data: { userId, status } });
      toast.success(status === "aprovado" ? "Gerente liberado" : "Gerente suspenso");
      qc.invalidateQueries({ queryKey: ["team-managers"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4">
        <h2 className="font-bold">Gerenciadores de equipe</h2>
        <p className="text-sm text-muted-foreground">Atletas que pediram para inscrever e pagar por uma equipe.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Equipe</TableHead><TableHead>Responsável</TableHead><TableHead>Atletas</TableHead><TableHead>Pedido em</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum pedido ainda.</TableCell></TableRow>}
          {data.map((m: any) => (
            <TableRow key={m.user_id}>
              <TableCell className="font-semibold">{m.team_name}</TableCell>
              <TableCell>{m.name}<div className="text-xs text-muted-foreground">{m.email}</div></TableCell>
              <TableCell>{m.members}</TableCell>
              <TableCell>{fmtDate(m.created_at)}</TableCell>
              <TableCell><Badge variant={ST[m.status]?.v}>{ST[m.status]?.l}</Badge></TableCell>
              <TableCell className="text-right">
                {m.status !== "aprovado" && <Button size="sm" onClick={() => change(m.user_id, "aprovado")}>Liberar</Button>}
                {m.status === "aprovado" && <Button size="sm" variant="outline" onClick={() => change(m.user_id, "suspenso")}>Suspender</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
