import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, Mail, Plus, RefreshCw, Reply, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AdminGate } from '@/components/admin-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getMailboxes, getMailFolders, getMailMessages, openMailMessage, sendMailMessage } from '@/lib/mail.functions';

export const Route = createFileRoute('/_authenticated/admin/email')({
  head: () => ({ meta: [{ title: 'Caixa de e-mail — Inscreva' }, { name: 'description', content: 'Caixa de e-mail da Hostinger exclusiva do superadmin Inscreva.' }, { property: 'og:title', content: 'Caixa de e-mail — Inscreva' }, { property: 'og:description', content: 'Mensagens e atendimento do superadmin Inscreva.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: () => <AdminGate><MailboxView /></AdminGate>,
});
function MailboxView() {
  const boxesFn = useServerFn(getMailboxes), foldersFn = useServerFn(getMailFolders), listFn = useServerFn(getMailMessages), openFn = useServerFn(openMailMessage), sendFn = useServerFn(sendMailMessage);
  const qc = useQueryClient();
  const [box, setBox] = useState(''), [folder, setFolder] = useState('INBOX'), [page, setPage] = useState(1), [uid, setUid] = useState<number | null>(null);
  const [compose, setCompose] = useState(false), [to, setTo] = useState(''), [subject, setSubject] = useState(''), [text, setText] = useState(''), [reply, setReply] = useState<{ uid: number; folder: string } | undefined>(), [sending, setSending] = useState(false);
  const boxes = useQuery({ queryKey: ['mail-boxes'], queryFn: () => boxesFn(), retry: false });
  const selectedBox = box || boxes.data?.[0]?.resourceId || '';
  const folders = useQuery({ queryKey: ['mail-folders', selectedBox], queryFn: () => foldersFn({ data: { mailbox: selectedBox } }), enabled: !!selectedBox, retry: false });
  const messages = useQuery({ queryKey: ['mail-messages', selectedBox, folder, page], queryFn: () => listFn({ data: { mailbox: selectedBox, folder, page } }), enabled: !!selectedBox, retry: false });
  const detail = useQuery({ queryKey: ['mail-detail', selectedBox, folder, uid], queryFn: async () => {
    if (!uid) throw new Error('Selecione uma mensagem');
    const result = await openFn({ data: { mailbox: selectedBox, folder, uid } });
    qc.invalidateQueries({ queryKey: ['mail-messages'] }); qc.invalidateQueries({ queryKey: ['mail-folders'] }); return result;
  }, enabled: !!selectedBox && !!uid, retry: false });
  const error = boxes.error || folders.error || messages.error || detail.error;
  function startCompose(isReply = false) {
    setTo(isReply ? detail.data?.from?.address || '' : ''); setSubject(isReply ? `Re: ${(detail.data?.subject || '').replace(/^Re:\s*/i, '')}` : ''); setText('');
    setReply(isReply && uid ? { uid, folder } : undefined); setCompose(true);
  }
  async function send(event: React.FormEvent) {
    event.preventDefault(); setSending(true);
    try { await sendFn({ data: { mailbox: selectedBox, to, subject, text, reply } }); toast.success('E-mail enviado'); setCompose(false); qc.invalidateQueries({ queryKey: ['mail-messages'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível enviar'); } finally { setSending(false); }
  }
  const folderLabel = (path: string, name: string, special?: string | null) => path === 'INBOX' ? 'Caixa de entrada' : special === '\\Sent' ? 'Enviados' : special === '\\Trash' ? 'Lixeira' : special === '\\Junk' ? 'Spam' : special === '\\Drafts' ? 'Rascunhos' : name;
  return <main className="mx-auto max-w-7xl px-4 py-10">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><Button variant="ghost" asChild className="mb-2"><Link to="/admin"><ArrowLeft /> Super admin</Link></Button><h1 className="text-3xl font-extrabold">Caixa de e-mail</h1><p className="mt-1 text-sm text-muted-foreground">Hostinger</p></div><div className="flex gap-2"><Button variant="outline" size="icon" title="Atualizar mensagens" aria-label="Atualizar mensagens" onClick={() => qc.invalidateQueries({ queryKey: ['mail-boxes'] }).then(() => { qc.invalidateQueries({ queryKey: ['mail-folders'] }); qc.invalidateQueries({ queryKey: ['mail-messages'] }); })}><RefreshCw /></Button><Button disabled={!selectedBox} onClick={() => startCompose()}><Plus /> Novo e-mail</Button></div></div>
    {error && <div role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error.message}</div>}
    {boxes.isPending ? <p className="py-20 text-center text-muted-foreground">Conectando à Hostinger...</p> : !selectedBox ? <div className="py-20 text-center"><Mail className="mx-auto mb-4 h-10 w-10 text-muted-foreground" /><h2 className="text-lg font-bold">Nenhuma caixa disponível</h2></div> : <>
    <Select value={selectedBox} onValueChange={v => { setBox(v); setUid(null); setFolder('INBOX'); setPage(1); }}><SelectTrigger className="mb-5 w-full sm:w-80"><SelectValue /></SelectTrigger><SelectContent>{boxes.data?.map(b => <SelectItem key={b.resourceId} value={b.resourceId}>{b.address}</SelectItem>)}</SelectContent></Select>
    <div className="grid min-h-[560px] border-y lg:grid-cols-[190px_330px_minmax(0,1fr)]">
      <aside className="flex gap-1 overflow-x-auto border-b py-4 lg:block lg:border-b-0 lg:border-r lg:pr-3">{folders.data?.map(f => <Button key={f.path} variant={folder === f.path ? 'secondary' : 'ghost'} className="mb-1 justify-start lg:w-full" onClick={() => { setFolder(f.path); setPage(1); setUid(null); }}><Inbox className="shrink-0" /><span className="truncate">{folderLabel(f.path, f.name, f.specialUse)}</span>{f.unreadCount > 0 && <span className="ml-auto text-xs">{f.unreadCount}</span>}</Button>)}</aside>
      <section className="min-w-0 border-b lg:border-b-0 lg:border-r"><div className="flex items-center justify-between border-b px-3 py-3"><span className="text-sm text-muted-foreground">{messages.data?.pagination.total || 0} mensagens</span><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="Página anterior" disabled={page === 1} onClick={() => { setPage(p => p - 1); setUid(null); }}><ChevronLeft /></Button><span className="text-xs">{page}</span><Button variant="ghost" size="icon" aria-label="Próxima página" disabled={page >= (messages.data?.pagination.totalPages || 1)} onClick={() => { setPage(p => p + 1); setUid(null); }}><ChevronRight /></Button></div></div>
      {messages.isPending ? <p className="p-6 text-sm text-muted-foreground">Carregando mensagens...</p> : !messages.data?.data.length ? <p className="p-6 text-sm text-muted-foreground">Esta pasta está vazia.</p> : messages.data.data.map(m => <Button key={m.uid} variant="ghost" className={`h-auto w-full justify-start rounded-none border-b px-4 py-4 text-left ${uid === m.uid ? 'bg-accent' : ''}`} onClick={() => setUid(m.uid)}><span className="block min-w-0 w-full"><span className={`block truncate ${m.unseen ? 'font-bold' : 'font-normal'}`}>{m.from?.name || m.from?.address || 'Sem remetente'}</span><span className="mt-1 block truncate font-normal">{m.subject || '(Sem assunto)'}</span><span className="mt-2 block text-xs font-normal text-muted-foreground">{new Date(m.date).toLocaleString('pt-BR')}</span></span></Button>)}</section>
      <section className="min-w-0 p-5">{detail.isFetching && uid ? <p className="text-muted-foreground">Abrindo mensagem...</p> : detail.data && uid ? <><h2 className="break-words text-xl font-bold">{detail.data.subject || '(Sem assunto)'}</h2><p className="mt-3 break-all text-sm text-muted-foreground">{detail.data.from?.name} &lt;{detail.data.from?.address}&gt;</p><p className="mt-1 text-xs text-muted-foreground">{new Date(detail.data.date).toLocaleString('pt-BR')}</p><Button className="my-4" variant="outline" disabled={!detail.data.from?.address} onClick={() => startCompose(true)}><Reply /> Responder</Button>{detail.data.text ? <p className="whitespace-pre-wrap break-words border-t pt-5 text-sm leading-7">{detail.data.text}</p> : <iframe title="Conteúdo do e-mail" sandbox="" referrerPolicy="no-referrer" className="h-[600px] w-full border-0" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{font-family:Arial;overflow-wrap:anywhere}</style>${detail.data.html}`} />}</> : <div className="grid h-full min-h-60 place-content-center text-center text-muted-foreground"><Mail className="mx-auto mb-3 h-9 w-9" /><p>Selecione uma mensagem</p></div>}</section>
    </div></>}
    <Dialog open={compose} onOpenChange={v => { if (!sending) setCompose(v); }}><DialogContent><DialogHeader><DialogTitle>{reply ? 'Responder e-mail' : 'Novo e-mail'}</DialogTitle></DialogHeader><form onSubmit={send} className="space-y-4"><div><Label htmlFor="mail-to">Para</Label><Input id="mail-to" type="email" required value={to} onChange={e => setTo(e.target.value)} /></div><div><Label htmlFor="mail-subject">Assunto</Label><Input id="mail-subject" required value={subject} onChange={e => setSubject(e.target.value)} /></div><div><Label htmlFor="mail-body">Mensagem</Label><Textarea id="mail-body" rows={9} required value={text} onChange={e => setText(e.target.value)} /></div><Button type="submit" disabled={sending}><Send />{sending ? 'Enviando...' : 'Enviar e-mail'}</Button></form></DialogContent></Dialog>
  </main>;
}