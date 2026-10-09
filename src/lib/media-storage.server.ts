// Armazenamento de fotos/vídeos: VPS (MinIO compatível com S3) quando configurado,
// senão o armazenamento da nuvem (arquivos antigos continuam onde estão: coluna media_items.storage).
import { AwsClient } from "aws4fetch";

export type Kind = "original" | "preview";

function cfg() {
  const endpoint = process.env["VPS_S3_ENDPOINT"]?.replace(/\/+$/, "");
  const accessKeyId = process.env["VPS_S3_ACCESS_KEY"];
  const secretAccessKey = process.env["VPS_S3_SECRET_KEY"];
  const bucket = process.env["VPS_S3_BUCKET"] || "evenon-fotos";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: process.env["VPS_S3_REGION"] || "us-east-1" }) };
}

export const vpsEnabled = () => !!cfg();

const cloudBucket = (kind: Kind, isVideo: boolean) => (kind === "preview" || isVideo ? "media-previews" : "media-originals");
/** Organização na VPS: <album>/originais|previas/<fotografo>/<arquivo> */
export const vpsKey = (path: string, kind: Kind, isVideo: boolean) => {
  const [album, ...rest] = path.split("/");
  return `${album}/${kind === "original" || isVideo ? "originais" : "previas"}/${rest.join("/")}`;
};

async function presign(method: "GET" | "PUT" | "DELETE", key: string, seconds: number, download?: boolean) {
  const c = cfg()!;
  const url = new URL(`${c.endpoint}/${c.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Expires", String(seconds));
  if (download) url.searchParams.set("response-content-disposition", `attachment; filename="${key.split("/").pop()}"`);
  const signed = await c.client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

export async function uploadUrl(storage: string, path: string, kind: Kind, isVideo: boolean) {
  if (storage === "vps") return { url: await presign("PUT", vpsKey(path, kind, isVideo), 60 * 60), path, token: null as string | null };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = cloudBucket(kind, isVideo);
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Não foi possível preparar o envio");
  return { url: null as string | null, path: data.path, token: data.token, bucket };
}

export async function signMany(items: { storage: string; path: string; kind: Kind; isVideo: boolean }[], seconds: number, download = false) {
  const out: Record<string, string> = {};
  const vps = items.filter((i) => i.storage === "vps");
  await Promise.all(vps.map(async (i) => { out[i.path] = await presign("GET", vpsKey(i.path, i.kind, i.isVideo), seconds, download); }));
  const cloud = items.filter((i) => i.storage !== "vps");
  if (cloud.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groups: Record<string, string[]> = {};
    for (const i of cloud) (groups[cloudBucket(i.kind, i.isVideo)] ??= []).push(i.path);
    for (const [bucket, paths] of Object.entries(groups)) {
      for (let k = 0; k < paths.length; k += 500) {
        const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths.slice(k, k + 500), seconds, download ? { download: true } : undefined);
        for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      }
    }
  }
  return out;
}

export async function removeMedia(m: { storage: string; kind: string; original_path: string; preview_path: string }) {
  const isVideo = m.kind === "video";
  if (m.storage === "vps") {
    const keys = new Set([vpsKey(m.original_path, "original", isVideo), vpsKey(m.preview_path, "preview", isVideo)]);
    await Promise.all([...keys].map(async (k) => fetch(await presign("DELETE", k, 300), { method: "DELETE" }).catch(() => null)));
    return;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from("media-originals").remove([m.original_path]);
  await supabaseAdmin.storage.from("media-previews").remove([...new Set([m.preview_path, m.original_path])]);
}

/** Teste de conexão para o super admin. */
export async function testVps() {
  if (!cfg()) return { ok: false, message: "Dados da VPS ainda não cadastrados" };
  const key = `_teste/${crypto.randomUUID()}.txt`;
  const put = await fetch(await presign("PUT", key, 300), { method: "PUT", body: "ok" }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as any);
  if (!put.ok) return { ok: false, message: `Falha ao gravar na VPS (${put.status} ${put.statusText})` };
  await fetch(await presign("DELETE", key, 300), { method: "DELETE" }).catch(() => null);
  return { ok: true, message: "Conexão com a VPS funcionando" };
}
