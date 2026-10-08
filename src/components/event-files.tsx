import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const DOC_KINDS: Record<string, string> = {
  regulamento: "Regulamento",
  resultado: "Resultado",
  percurso: "Percurso / mapa",
  programacao: "Programação",
  outro: "Outro",
};

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export async function uploadEventFile(producerId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${producerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("event-files").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("event-files").createSignedUrl(path, TEN_YEARS);
  if (e2 || !data) throw e2 ?? new Error("Falha ao gerar link");
  return data.signedUrl;
}

export function CoverUpload({ producerId, value, onChange }: { producerId: string; value: string | null; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha uma imagem (JPG, PNG ou WEBP)"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 8 MB)"); return; }
    setBusy(true);
    try { onChange(await uploadEventFile(producerId, file)); toast.success("Imagem enviada — clique em Salvar"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <Label>Imagem de capa</Label>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="h-16 w-28 rounded-lg object-cover" /> : <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Sem imagem</div>}
        <Button type="button" variant="outline" disabled={busy} onClick={() => ref.current?.click()}><Upload /> {busy ? "Enviando..." : "Enviar imagem"}</Button>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

export function EventDocsEditor({ eventId, producerId }: { eventId: string; producerId: string }) {
  const qc = useQueryClient();
  const key = ["event-docs", eventId];
  const { data: docs = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("event_documents").select("*").eq("event_id", eventId).order("position")).data ?? [],
  });
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("regulamento");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(url: string, isFile: boolean) {
    const { error } = await supabase.from("event_documents").insert({ event_id: eventId, title: title.trim() || DOC_KINDS[kind] || "Documento", kind, url, is_file: isFile, position: docs.length });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setLink("");
    toast.success("Documento adicionado");
    qc.invalidateQueries({ queryKey: key });
  }
  async function addFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Envie um arquivo PDF"); return; }
    setBusy(true);
    try { await add(await uploadEventFile(producerId, file), true); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  function addLink() {
    try { const u = new URL(link.trim()); if (!/^https?:$/.test(u.protocol)) throw 0; add(u.toString(), false); }
    catch { toast.error("Link inválido (use https://...)"); }
  }
  async function remove(id: string) {
    await supabase.from("event_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
      <div>
        <h3 className="text-lg font-bold">Documentos do evento</h3>
        <p className="text-sm text-muted-foreground">Regulamento, resultados, percurso... Envie um PDF ou cole um link. Eles aparecem na página do evento.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(DOC_KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Título (opcional), ex.: Resultado 10 km" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="hero" disabled={busy} onClick={() => fileRef.current?.click()}><Upload /> {busy ? "Enviando..." : "Enviar PDF"}</Button>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => addFile(e.target.files?.[0])} />
        <div className="flex flex-1 gap-2">
          <Input placeholder="ou cole um link https://..." value={link} onChange={(e) => setLink(e.target.value)} />
          <Button type="button" variant="outline" onClick={addLink} disabled={!link}><Link2 /> Adicionar link</Button>
        </div>
      </div>
      <ul className="divide-y rounded-xl border">
        {docs.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum documento ainda.</li>}
        {docs.map((d: any) => (
          <li key={d.id} className="flex items-center justify-between gap-3 p-3">
            <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium hover:underline">
              {d.is_file ? <FileText className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4 text-primary" />}
              {d.title} <span className="text-xs text-muted-foreground">· {DOC_KINDS[d.kind] ?? d.kind}</span>
            </a>
            <Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
