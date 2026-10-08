import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { prepareHomeImageUpload, resolveHomeImageUpload } from "@/lib/admin.functions";
import { HOME_IMAGES, type HomeImages } from "@/lib/home-images";

export function HomeImagesEditor({ value, onChange, onBusyChange }: {
  value: HomeImages;
  onChange: (key: keyof HomeImages, url: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  return <div className="grid gap-6 sm:grid-cols-2">
    {HOME_IMAGES.map((image) => <ImageField key={image.key} label={image.label}
      value={value[image.key] ?? null} fallback={image.fallback}
      onChange={(url) => onChange(image.key, url)} onBusyChange={onBusyChange} />)}
  </div>;
}

function ImageField({ label, value, fallback, onChange, onBusyChange }: {
  label: string; value?: string | null; fallback: string;
  onChange: (url: string | null) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const prepare = useServerFn(prepareHomeImageUpload);
  const resolve = useServerFn(resolveHomeImageUpload);
  async function upload(file?: File) {
    if (!file) return;
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[file.type as "image/jpeg" | "image/png" | "image/webp"];
    if (!extension) { toast.error("Escolha uma imagem JPG, PNG ou WEBP"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("A imagem deve ter até 8 MB"); return; }
    setBusy(true); onBusyChange(true);
    try {
      const target = await prepare({ data: { extension } });
      const { error } = await supabase.storage.from("event-files").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
      if (error) throw error;
      const image = await resolve({ data: { path: target.path } });
      onChange(image.url);
      toast.success("Imagem enviada");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); onBusyChange(false); if (input.current) input.current.value = ""; }
  }
  return <div className="min-w-0 space-y-3">
    <h3 className="font-semibold">{label}</h3>
    <img src={value || fallback} alt={`Prévia: ${label}`} className="aspect-video w-full rounded-lg border object-cover" />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{busy ? "Enviando..." : `Trocar imagem: ${label}`}</Button>
      {value && <Button type="button" variant="ghost" size="icon" disabled={busy} title={`Restaurar imagem padrão: ${label}`} aria-label={`Restaurar imagem padrão: ${label}`} onClick={() => onChange(null)}><RotateCcw className="h-4 w-4" /></Button>}
    </div>
    <input ref={input} aria-label={`Imagem: ${label}`} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} />
  </div>;
}