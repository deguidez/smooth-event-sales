import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Film, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
import { faceDescriptors, loadFaceApi, loadImage, scaled, watermarkedPreview } from "@/lib/face";
import { deleteMyMedia, getPhotographerMe, getUploadTargets, myAlbumMedia, photographerEarnings, registerMedia, respondAlbumInvite, savePhotographer } from "@/lib/photos.functions";

export const Route = createFileRoute("/_authenticated/fotografo")({
  head: () => ({ meta: [
    { title: "Área do fotógrafo — Evenon" }, { name: "description", content: "Cadastro, convites, envio de fotos e vídeos e ganhos do fotógrafo." },
    { property: "og:title", content: "Área do fotógrafo — Evenon" }, { property: "og:description", content: "Cadastro, convites, envio de fotos e vídeos e ganhos do fotógrafo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: PhotographerPage,
});

function PhotographerPage() {
  const load = useServerFn(getPhotographerMe);
  const { data } = useQuery({ queryKey: ["photographer-me"], queryFn: () => load() });
  const [album, setAlbum] = useState<any>(null);
  if (!data) return <div className="mx-auto max-w-5xl px-4 py-20 text-muted-foreground">Carregando...</div>;
  const approved = data.me?.status === "aprovado";
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">Área do fotógrafo</h1>
      {data.me && <p className="mt-1 text-muted-foreground">Status do cadastro: <Badge variant={approved ? "success" : "secondary"}>{data.me.status}</Badge></p>}
      {album ? <Uploader album={album} onBack={() => setAlbum(null)} /> : (
        <Tabs defaultValue={data.me ? "albuns" : "cadastro"} className="mt-6">
          <TabsList><TabsTrigger value="albuns">Meus álbuns</TabsTrigger><TabsTrigger value="ganhos">Ganhos</TabsTrigger><TabsTrigger value="cadastro">Cadastro</TabsTrigger></TabsList>
          <TabsContent value="albuns" className="mt-6"><Invites invites={data.invites} approved={approved} hasProfile={!!data.me} onOpen={setAlbum} /></TabsContent>
          <TabsContent value="ganhos" className="mt-6"><Earnings /></TabsContent>
          <TabsContent value="cadastro" className="mt-6"><ProfileForm me={data.me} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ProfileForm({ me }: { me: any }) {
  const save = useServerFn(savePhotographer);
  const qc = useQueryClient();
  const [f, setF] = useState<any>({ name: me?.name ?? "", document: me?.document ?? "", phone: me?.phone ?? "", asaas_wallet_id: me?.asaas_wallet_id ?? "", bank: { bank_name: "", agency: "", account: "", account_type: "CONTA_CORRENTE", pix_key: "", ...(me?.bank ?? {}) } });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const setB = (k: string) => (e: any) => setF({ ...f, bank: { ...f.bank, [k]: e.target.value } });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({ data: { ...f, document: f.document.replace(/\D/g, ""), phone: f.phone.trim() } });
      toast.success(me ? "Cadastro atualizado" : "Cadastro enviado para aprovação");
      qc.invalidateQueries({ queryKey: ["photographer-me"] });
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label>Nome profissional</Label><Input value={f.name} onChange={set("name")} required /></div>
      <div className="space-y-1.5"><Label>CPF ou CNPJ</Label><Input value={f.document} onChange={set("document")} required /></div>
      <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={f.phone} onChange={set("phone")} required /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Carteira Asaas (walletId)</Label><Input value={f.asaas_wallet_id} onChange={set("asaas_wallet_id")} placeholder="Ex.: 0b1c2d3e-..." required /><p className="text-xs text-muted-foreground">No Asaas: Minha conta → Integrações → Carteira (Wallet ID). Seus ganhos caem direto nela.</p></div>
      <div className="space-y-1.5"><Label>Banco</Label><Input value={f.bank.bank_name} onChange={setB("bank_name")} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Agência</Label><Input value={f.bank.agency} onChange={setB("agency")} /></div><div className="space-y-1.5"><Label>Conta</Label><Input value={f.bank.account} onChange={setB("account")} /></div></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Chave Pix</Label><Input value={f.bank.pix_key} onChange={setB("pix_key")} /></div>
      <div><Button variant="hero" type="submit">{me ? "Salvar" : "Enviar cadastro"}</Button></div>
    </form>
  );
}

function Invites({ invites, approved, hasProfile, onOpen }: any) {
  const respond = useServerFn(respondAlbumInvite);
  const qc = useQueryClient();
  if (!hasProfile) return <p className="text-muted-foreground">Preencha seu cadastro na aba Cadastro para receber convites.</p>;
  if (!approved) return <p className="text-muted-foreground">Seu cadastro está aguardando aprovação do administrador.</p>;
  if (!invites.length) return <p className="text-muted-foreground">Nenhum convite ainda.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {invites.map((i: any) => (
        <div key={i.id} className="rounded-2xl border bg-card p-5 shadow-card">
          <p className="font-bold">{i.photo_albums?.events?.title}</p>
          <p className="text-sm text-muted-foreground">{fmtDate(i.photo_albums?.events?.starts_at)} · {i.photo_albums?.events?.city}/{i.photo_albums?.events?.state}</p>
          <div className="mt-4 flex gap-2">
            {i.status === "convidado" ? (
              <>
                <Button variant="hero" onClick={async () => { await respond({ data: { id: i.id, accept: true } }); qc.invalidateQueries({ queryKey: ["photographer-me"] }); }}>Aceitar convite</Button>
                <Button variant="outline" onClick={async () => { await respond({ data: { id: i.id, accept: false } }); qc.invalidateQueries({ queryKey: ["photographer-me"] }); }}>Recusar</Button>
              </>
            ) : i.status === "aceito" ? (
              <Button variant="hero" onClick={() => onOpen({ id: i.album_id, title: i.photo_albums?.events?.title })}><Upload /> Enviar fotos e vídeos</Button>
            ) : <Badge variant="destructive">Recusado</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Earnings() {
  const load = useServerFn(photographerEarnings);
  const { data = [] } = useQuery({ queryKey: ["ph-earn"], queryFn: () => load() });
  const total = data.reduce((s: number, r: any) => s + r.earnings, 0);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground"><p className="text-sm uppercase">Seus ganhos</p><p className="text-4xl font-extrabold">{brl(total)}</p></div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Fotos vendidas</TableHead><TableHead>Vídeos vendidos</TableHead><TableHead className="text-right">Ganhos</TableHead></TableRow></TableHeader>
          <TableBody>{data.map((r: any) => <TableRow key={r.albumId}><TableCell>{r.title}</TableCell><TableCell>{r.photosSold}</TableCell><TableCell>{r.videosSold}</TableCell><TableCell className="text-right font-semibold">{brl(r.earnings)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
    </div>
  );
}

function Uploader({ album, onBack }: { album: { id: string; title: string }; onBack: () => void }) {
  const targets = useServerFn(getUploadTargets);
  const register = useServerFn(registerMedia);
  const list = useServerFn(myAlbumMedia);
  const del = useServerFn(deleteMyMedia);
  const qc = useQueryClient();
  const { data: mine } = useQuery({ queryKey: ["my-media", album.id], queryFn: () => list({ data: { albumId: album.id } }) });
  const [kind, setKind] = useState<"photo" | "video">("photo");
  const [progress, setProgress] = useState<{ done: number; total: number; faces: number } | null>(null);
  useEffect(() => { loadFaceApi().catch(() => {}); }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const all = Array.from(files);
    setProgress({ done: 0, total: all.length, faces: 0 });
    let faces = 0;
    for (let i = 0; i < all.length; i += 10) {
      const batch = all.slice(i, i + 10);
      try {
        const t = await targets({ data: { albumId: album.id, files: batch.map((f) => ({ kind, ext: (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg" })) } });
        const items = [];
        for (let k = 0; k < batch.length; k++) {
          const file = batch[k]!; const tg = t.targets[k]!;
          if (kind === "photo") {
            const img = await loadImage(file);
            const desc = await faceDescriptors(scaled(img, 1600));
            faces += desc.length;
            const prev = await watermarkedPreview(img, t.watermarkPhoto);
            await supabase.storage.from("media-originals").uploadToSignedUrl(tg.original.path, tg.original.token, file, { contentType: file.type });
            await supabase.storage.from("media-previews").uploadToSignedUrl(tg.preview!.path, tg.preview!.token, prev, { contentType: "image/jpeg" });
            items.push({ kind, original_path: tg.original.path, preview_path: tg.preview!.path, width: img.naturalWidth, height: img.naturalHeight, faces: desc });
            URL.revokeObjectURL(img.src);
          } else {
            await supabase.storage.from("media-previews").uploadToSignedUrl(tg.original.path, tg.original.token, file, { contentType: file.type || "video/mp4" });
            items.push({ kind, original_path: tg.original.path, preview_path: null, width: null, height: null, faces: [] });
          }
          setProgress({ done: i + k + 1, total: all.length, faces });
        }
        await register({ data: { albumId: album.id, items } });
      } catch (e: any) { toast.error(e.message); break; }
    }
    toast.success("Envio concluído");
    setProgress(null);
    qc.invalidateQueries({ queryKey: ["my-media", album.id] });
  }

  return (
    <div className="mt-6 space-y-6">
      <button className="text-sm text-muted-foreground" onClick={onBack}>← Meus álbuns</button>
      <h2 className="text-2xl font-bold">{album.title}</h2>
      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex gap-2">
          <Button variant={kind === "photo" ? "default" : "outline"} onClick={() => setKind("photo")}><Camera /> Fotos</Button>
          <Button variant={kind === "video" ? "default" : "outline"} onClick={() => setKind("video")}><Film /> Vídeos</Button>
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center">
          <Upload className="size-8 text-primary" />
          <span className="font-semibold">Selecione {kind === "photo" ? "as fotos" : "os vídeos"} (vários de uma vez)</span>
          <span className="text-xs text-muted-foreground">{kind === "photo" ? "Os rostos são identificados no seu aparelho e a prévia com marca d'água é criada automaticamente. Mantenha esta página aberta até terminar." : "Vídeos aparecem para o cliente com a marca d'água sobre o player."}</span>
          <input type="file" multiple accept={kind === "photo" ? "image/jpeg,image/png,image/webp" : "video/*"} className="hidden" disabled={!!progress} onChange={(e) => upload(e.target.files)} />
        </label>
        {progress && (
          <div className="mt-4 space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <p className="text-sm text-muted-foreground">{progress.done} de {progress.total} enviados · {progress.faces} rostos identificados</p>
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 font-semibold">Seus arquivos neste álbum: {mine?.total ?? 0}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {mine?.items.map((m: any) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
              {m.url ? <img src={m.url} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center"><Film /></div>}
              <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">{m.faces} rostos</span>
              <button className="absolute right-1 top-1 hidden rounded bg-background/90 p-1 group-hover:block" onClick={async () => { try { await del({ data: { id: m.id } }); qc.invalidateQueries({ queryKey: ["my-media", album.id] }); } catch (e: any) { toast.error(e.message); } }}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
