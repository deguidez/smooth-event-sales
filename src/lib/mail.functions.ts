import { auditedAction } from "./activity-middleware";
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

type Address = { name: string; address: string };
export type MailMessage = { uid: number; subject: string | null; date: string; unseen: boolean; from: Address | null; to: Address[]; attachments: { filename: string }[] };
export type MailFolder = { path: string; name: string; specialUse: string | null; unreadCount: number };
export type Mailbox = { resourceId: string; address: string };
async function authorize(ctx: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await ctx.supabase.rpc('has_role', { _user_id: ctx.userId, _role: 'super_admin' });
  if (error || !data) throw new Error('Acesso restrito ao super admin');
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = process.env['HOSTINGER_MAIL_API_TOKEN'];
  if (!token) throw new Error('A conexão com a Hostinger ainda não foi configurada.');
  const res = await fetch(`https://api.mail.hostinger.com/api/v1${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.error('Hostinger Mail request failed', res.status);
    throw new Error(res.status === 403 ? 'A Hostinger recusou o acesso (403). Confira se Agentic Mail está ativo e se a chave autoriza esta caixa; se continuar, contate o suporte da Hostinger.' : res.status === 401 ? 'A Hostinger não aceitou a chave de acesso. Atualize-a nas configurações de segredos.' : `A Hostinger não concluiu a operação (${res.status}). Tente novamente mais tarde.`);
  }
  return res.status === 204 ? {} as T : await res.json() as T;
}
const mailbox = z.string().regex(/^AC[A-Za-z0-9]+$/);
const selection = z.object({ mailbox, folder: z.string().min(1).max(255) });
const message = selection.extend({ uid: z.number().int().positive() });
const base = (id: string) => `/mailboxes/${encodeURIComponent(id)}`;
const folderPath = (id: string, folder: string) => `${base(id)}/folders/${encodeURIComponent(folder)}/messages`;

export const getMailboxes = createServerFn({ method: 'GET' }).middleware([auditedAction("getMailboxes")]).handler(async ({ context }) => {
  await authorize(context);
  return (await request<{ data: { mailboxes: Mailbox[] } }>('/me')).data.mailboxes;
});
export const getMailFolders = createServerFn({ method: 'GET' }).middleware([auditedAction("getMailFolders")]).inputValidator(z.object({ mailbox })).handler(async ({ context, data }) => {
  await authorize(context);
  return (await request<{ data: MailFolder[] }>(`${base(data.mailbox)}/folders?perPage=100`)).data;
});
export const getMailMessages = createServerFn({ method: 'GET' }).middleware([auditedAction("getMailMessages")]).inputValidator(selection.extend({ page: z.number().int().positive() })).handler(async ({ context, data }) => {
  await authorize(context);
  return request<{ data: MailMessage[]; pagination: { totalPages: number; total: number } }>(`${folderPath(data.mailbox, data.folder)}?page=${data.page}&perPage=25`);
});
export const openMailMessage = createServerFn({ method: 'POST' }).middleware([auditedAction("openMailMessage")]).inputValidator(message).handler(async ({ context, data }) => {
  await authorize(context);
  const path = `${folderPath(data.mailbox, data.folder)}/${data.uid}`;
  const [meta, body] = await Promise.all([request<{ data: MailMessage }>(path), request<{ data: { text: string; html: string } }>(`${path}/text`)]);
  return { ...meta.data, ...body.data };
});
export const sendMailMessage = createServerFn({ method: 'POST' }).middleware([auditedAction("sendMailMessage")]).inputValidator(z.object({
  mailbox, to: z.string().email(), subject: z.string().trim().min(1).max(998), text: z.string().trim().min(1).max(100000),
  reply: z.object({ uid: z.number().int().positive(), folder: z.string().min(1).max(255) }).optional(),
})).handler(async ({ context, data }) => {
  await authorize(context);
  await request(`${base(data.mailbox)}/send`, 'POST', { to: [data.to], subject: data.subject, text: data.text, ...(data.reply ? { inReplyTo: data.reply } : {}) });
  return { sent: true };
});