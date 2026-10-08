import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadEventFile } from "@/components/event-files";

const IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;

export function DescriptionEditor({ producerId, value, onChange }: { producerId: string; value: string; onChange: (v: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return void toast.error("Escolha uma imagem");
    if (f.size > 8 * 1024 * 1024) return void toast.error("Imagem até 8 MB");
    setBusy(true);
    try {
      const url = await uploadEventFile(producerId, f);
      const pos = ta.current?.selectionStart ?? value.length;
      const token = `\n![imagem](${url})\n`;
      onChange(value.slice(0, pos) + token + value.slice(pos));
      toast.success("Imagem inserida");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no envio");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Textarea ref={ta} rows={10} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="flex items-center gap-3">
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {busy ? "Enviando..." : "Inserir imagem"}
        </Button>
        <span className="text-xs text-muted-foreground">A imagem entra onde o cursor estiver.</span>
      </div>
      {IMG_RE.test(value) && (
        <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Pré-visualização</p><RichDescription text={value} /></div>
      )}
    </div>
  );
}

export function RichDescription({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(IMG_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(<span key={i++}>{text.slice(last, idx)}</span>);
    parts.push(<img key={i++} src={m[1]} alt="" loading="lazy" className="my-3 block w-full rounded-xl" />);
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return <div className="whitespace-pre-line leading-relaxed text-muted-foreground">{parts}</div>;
}

/** Accepts a Google My Maps share link, embed link or full <iframe> code; returns embed URL. */
export function myMapsEmbed(input: string | null | undefined): string | null {
  if (!input) return null;
  const mid = input.match(/[?&]mid=([\w-]+)/)?.[1];
  return mid ? `https://www.google.com/maps/d/embed?mid=${mid}` : null;
}

export function RouteMap({ value }: { value: string | null | undefined }) {
  const src = myMapsEmbed(value);
  if (!src) return null;
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-bold">Mapa do percurso</h2>
      <iframe src={src} title="Mapa do percurso" className="mt-3 h-[420px] w-full rounded-xl border-0" loading="lazy" />
    </div>
  );
}
