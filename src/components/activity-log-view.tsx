import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { listActivityLogs } from "@/lib/activity.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const actions: Record<string, string> = { page_view: "Página acessada", browser_error: "Erro no navegador", query_error: "Falha ao carregar dados", mutation_error: "Falha ao salvar", insert: "Registro criado", update: "Registro atualizado", delete: "Registro excluído", request_failed: "Falha no site", asaas_request_failed: "Asaas recusou a operação", getAdminSettings: "Configurações consultadas", listUsers: "Usuários consultados", setUserRole: "Acesso alterado", saveAdminSettings: "Configurações salvas", prepareHomeImageUpload: "Envio de imagem iniciado", resolveHomeImageUpload: "Imagem enviada", testAsaasConnection: "Conexão Asaas testada", registerAsaasWebhook: "Notificações Asaas configuradas", getSystemStatus: "Estado do sistema consultado", updateProducer: "Produtor atualizado", createProducerWallet: "Criação de carteira solicitada", updateUser: "Usuário atualizado", adminCreateUser: "Usuário criado", deleteUser: "Usuário excluído", adminCreateProducer: "Produtor criado", deleteProducer: "Produtor excluído", getCheckoutInfo: "Inscrição iniciada", createOrder: "Inscrição solicitada", refreshOrder: "Pagamento consultado", getMailboxes: "Caixas de e-mail consultadas", getMailFolders: "Pastas de e-mail consultadas", getMailMessages: "E-mails consultados", openMailMessage: "E-mail aberto", sendMailMessage: "Envio de e-mail solicitado" };
export function ActivityLogView() {
  const [area, setArea] = useState<"todos" | "admin" | "produtor" | "atleta" | "sistema">("todos");
  const [level, setLevel] = useState<"todos" | "info" | "error">("todos");
  const [page, setPage] = useState(0);
  const load = useServerFn(listActivityLogs);
  const query = useQuery({ queryKey: ["activity-logs", area, level, page], queryFn: () => load({ data: { area, level, page } }), refetchInterval: 30000 });
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">Registros do sistema</h2><p className="text-sm text-muted-foreground">{query.data?.count ?? 0} registros</p></div>
      <div className="flex flex-wrap gap-2">
        <Select value={area} onValueChange={(v) => { setArea(v as typeof area); setPage(0); }}><SelectTrigger className="w-40" aria-label="Área dos registros"><SelectValue /></SelectTrigger><SelectContent>{["todos", "admin", "produtor", "atleta", "sistema"].map((a) => <SelectItem key={a} value={a}>{a === "todos" ? "Todas as áreas" : a === "admin" ? "Super admin" : a[0]?.toUpperCase() + a.slice(1)}</SelectItem>)}</SelectContent></Select>
        <Select value={level} onValueChange={(v) => { setLevel(v as typeof level); setPage(0); }}><SelectTrigger className="w-36" aria-label="Tipo dos registros"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem><SelectItem value="info">Atividades</SelectItem><SelectItem value="error">Erros</SelectItem></SelectContent></Select>
        <Button variant="outline" size="icon" aria-label="Atualizar registros" title="Atualizar registros" onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} /></Button>
      </div>
    </div>
    {query.isError && <p role="alert" className="text-destructive">Não foi possível carregar os registros. Tente atualizar.</p>}
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <Table><TableHeader><TableRow><TableHead>Data e hora</TableHead><TableHead>Área / usuário</TableHead><TableHead>Atividade</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader><TableBody>
        {query.isLoading && <TableRow><TableCell colSpan={4}>Carregando registros…</TableCell></TableRow>}
        {query.data?.logs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>}
        {query.data?.logs.map((log) => <TableRow key={log.id}>
          <TableCell className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
          <TableCell><p className="font-medium">{log.actor_name}</p><p className="text-xs text-muted-foreground">{log.area} · {log.source}</p></TableCell>
          <TableCell><Badge variant={log.level === "error" ? "destructive" : "secondary"}>{log.level === "error" ? "Erro" : "Atividade"}</Badge><p className="mt-1 text-sm">{actions[log.action] ?? log.action}</p><p className="text-xs text-muted-foreground">{log.entity_type ?? log.path}</p></TableCell>
          <TableCell><details><summary className="cursor-pointer text-sm">Ver detalhes</summary><pre className="mt-2 max-w-72 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify({ id: log.entity_id, ...((log.details && typeof log.details === "object") ? log.details : {}) }, null, 2)}</pre></details></TableCell>
        </TableRow>)}
      </TableBody></Table>
    </div>
    <div className="flex items-center justify-end gap-3"><span className="text-sm text-muted-foreground">Página {page + 1}</span><Button variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={(page + 1) * 50 >= (query.data?.count ?? 0)} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div>
  </section>;
}