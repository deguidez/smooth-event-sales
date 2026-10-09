// E-mails da venda de fotos + limpeza dos arquivos após 6 meses (chamado pelas automações a cada 5 min).
import { SITE_URL } from "./notify.server";

type Kind = "fotos_pedido_criado" | "fotos_nao_pagas" | "fotos_pagas";
const BATCH = 40;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function send(to: string, data: Record<string, unknown>, key: string) {
  const { sendTemplateEmail } = await import("./email-templates/send-email");
  const r = await sendTemplateEmail("order-status", to, { templateData: data, idempotencyKey: key });
  return r.sent ? "enviado" : "bloqueado";
}

export async function notifyPhotoOrder(orderId: string, kind: Kind) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: o } = await supabaseAdmin.from("photo_orders").select("id, code, total, customer_name, customer_email, photo_albums(events(title))").eq("id", orderId).maybeSingle();
  if (!o) return;
  // Ao pagar, anexa links diretos de download dos originais (sem marca d'água), válidos por 7 dias.
  let downloads: { label: string; url: string }[] = [];
  if (kind === "fotos_pagas") {
    const { data: items } = await supabaseAdmin.from("photo_order_items").select("kind, media_items(storage, original_path)").eq("order_id", orderId);
    const rows = (items ?? []).filter((it: any) => it.media_items);
    if (rows.length) {
      const { signMany } = await import("./media-storage.server");
      const signed = await signMany(rows.map((it: any) => ({ storage: it.media_items.storage ?? "cloud", path: it.media_items.original_path, kind: "original" as const, isVideo: it.kind === "video" })), 7 * 86400, true);
      downloads = rows.map((it: any, i: number) => ({ label: `Arquivo ${i + 1} (${it.kind === "video" ? "vídeo" : "foto"})`, url: signed[it.media_items.original_path] as string | undefined })).filter((d): d is { label: string; url: string } => !!d.url);
    }
  }
  let status = "enviado";
  try {
    status = await send(o.customer_email, {
      kind, name: o.customer_name, eventTitle: (o as any).photo_albums?.events?.title, code: o.code, total: brl(Number(o.total)),
      url: `${SITE_URL}/minhas-fotos`, downloads,
    }, `photo-${kind}-${o.id}`);
  } catch (e) {
    console.error("photo email failed", e);
    status = "falhou";
  }
  await supabaseAdmin.from("email_log").insert({ kind, recipient: o.customer_email, status } as any).then(() => null, () => null);
}

export async function runPhotoAutomations() {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const out = { photoSearchEmails: 0, photoUnpaidEmails: 0, photoPurged: 0 };
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

  // 1) Pesquisou, achou fotos e não comprou (60 min depois).
  const { data: searches } = await admin.from("photo_searches").select("id, album_id, user_id, email, photo_albums(active, events(title))").is("reminded_at", null).lt("created_at", ago(60)).gt("created_at", ago(3 * 1440)).limit(BATCH);
  for (const sr of searches ?? []) {
    await admin.from("photo_searches").update({ reminded_at: new Date().toISOString() }).eq("id", sr.id);
    if (!(sr as any).photo_albums?.active) continue;
    const { count } = await admin.from("photo_orders").select("id", { count: "exact", head: true }).eq("album_id", sr.album_id).eq("user_id", sr.user_id);
    if (count) continue;
    try {
      await send(sr.email, { kind: "fotos_encontradas", name: "", eventTitle: (sr as any).photo_albums?.events?.title, url: `${SITE_URL}/fotos/${sr.album_id}` }, `photo-search-${sr.id}-${sr.album_id}`);
      out.photoSearchEmails++;
    } catch (e) { console.error("photo search email failed", e); }
  }

  // 2) Comprou e não pagou (60 min depois, uma vez).
  const { data: pend } = await admin.from("photo_orders").select("id").eq("status", "pendente").is("reminded_at", null).lt("created_at", ago(60)).gt("created_at", ago(3 * 1440)).limit(BATCH);
  for (const o of pend ?? []) {
    await admin.from("photo_orders").update({ reminded_at: new Date().toISOString() }).eq("id", o.id);
    await notifyPhotoOrder(o.id, "fotos_nao_pagas");
    out.photoUnpaidEmails++;
  }

  // 3) Arquivos com mais de 6 meses são apagados do armazenamento (VPS ou nuvem).
  const { data: old } = await admin.from("media_items").select("id, kind, storage, original_path, preview_path").is("purged_at", null).lt("created_at", new Date(Date.now() - 183 * 86400_000).toISOString()).limit(100);
  if (old?.length) {
    const { removeMedia } = await import("./media-storage.server");
    for (const m of old) {
      try {
        await removeMedia(m as any);
        await admin.from("media_items").update({ purged_at: new Date().toISOString() }).eq("id", m.id);
        out.photoPurged++;
      } catch (e) { console.error("purge failed", m.id, e); }
    }
  }
  return out;
}
