import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { toast } from "sonner";
import { Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Link as LinkIcon, Unlink, Undo2, Redo2, ImagePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { uploadEventFile } from "@/components/event-files";
import { descriptionHtml, sanitizeDescription } from "@/lib/description";

export function DescriptionEditor({ producerId, value, onChange }: { producerId: string; value: string; onChange: (v: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linkValue, setLinkValue] = useState<string | null>(null);
  const savedSelection = useRef<{ from: number; to: number } | null>(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }), Image.configure({ allowBase64: true })],
    immediatelyRender: false,
    content: descriptionHtml(value),
    editorProps: {
      attributes: { class: "rich-description min-h-64 p-4 outline-none", role: "textbox", "aria-label": "Descrição completa", "aria-multiline": "true" },
      transformPastedHTML: sanitizeDescription,
      handlePaste: (_view, event) => {
        // Prefer clipboard HTML so formatted text and remote images stay together.
        if (event.clipboardData?.getData("text/html")) return false;
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        void insertFiles(images);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const images = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        void insertFiles(images);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : sanitizeDescription(current.getHTML())),
  });

  useEffect(() => {
    if (!editor) return;
    const html = descriptionHtml(value);
    if (sanitizeDescription(editor.getHTML()) !== html && !editor.isFocused) editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, value]);

  async function insertFiles(files: File[]) {
    if (!editor) return;
    savedSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setBusy(true);
    try {
      for (const f of files) {
        if (!f.type.startsWith("image/")) throw new Error("Escolha uma imagem");
        if (f.size > 8 * 1024 * 1024) throw new Error("Imagem até 8 MB");
        const src = await uploadEventFile(producerId, f);
        const position = savedSelection.current;
        const chain = editor.chain().focus();
        if (position) chain.setTextSelection(position);
        chain.setImage({ src, alt: f.name }).run();
        savedSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
      }
      toast.success("Imagem inserida");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no envio"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }

  function tool(label: string, Icon: LucideIcon, action: () => void, active = false, disabled = false) {
    return <Tooltip key={label}><TooltipTrigger asChild><Button type="button" size="icon" variant={active ? "secondary" : "ghost"} className="h-8 w-8 shrink-0" aria-label={label} aria-pressed={active} disabled={!editor || busy || disabled} onClick={action}><Icon className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-card">
      <TooltipProvider delayDuration={200}><div role="toolbar" aria-label="Formatação da descrição" className="flex flex-wrap items-center gap-1 border-b bg-muted/50 p-2">
        {tool("Negrito", Bold, () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
        {tool("Itálico", Italic, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
        {tool("Sublinhado", Underline, () => editor?.chain().focus().toggleUnderline().run(), editor?.isActive("underline"))}
        {tool("Tachado", Strikethrough, () => editor?.chain().focus().toggleStrike().run(), editor?.isActive("strike"))}
        {tool("Título", Heading2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
        {tool("Subtítulo", Heading3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
        {tool("Lista", List, () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
        {tool("Lista numerada", ListOrdered, () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
        {tool("Citação", Quote, () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}
        {tool("Inserir link", LinkIcon, () => { if (!editor) return; savedSelection.current = editor.state.selection; setLinkValue(editor.getAttributes("link")["href"] ?? ""); }, editor?.isActive("link"))}
        {tool("Remover link", Unlink, () => editor?.chain().focus().unsetLink().run(), false, !editor?.isActive("link"))}
        {tool(busy ? "Enviando imagem" : "Inserir imagem", ImagePlus, () => file.current?.click())}
        {tool("Desfazer", Undo2, () => editor?.chain().focus().undo().run(), false, !editor?.can().undo())}
        {tool("Refazer", Redo2, () => editor?.chain().focus().redo().run(), false, !editor?.can().redo())}
      </div></TooltipProvider>
      {linkValue !== null && <div className="flex flex-wrap gap-2 border-b p-2"><input aria-label="Endereço do link" type="url" className="min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" placeholder="https://" value={linkValue} onChange={(e) => setLinkValue(e.target.value)} /><Button type="button" size="sm" onClick={() => { if (!editor || !/^(https?:\/\/|mailto:)/i.test(linkValue)) { toast.error("Informe um link válido"); return; } const chain = editor.chain().focus(); if (savedSelection.current) chain.setTextSelection(savedSelection.current); chain.extendMarkRange("link").setLink({ href: linkValue }).run(); setLinkValue(null); }}>Aplicar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setLinkValue(null)}>Cancelar</Button></div>}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void insertFiles([selected]); }} />
      <EditorContent editor={editor} />
      {busy && <p role="status" className="px-4 pb-3 text-sm text-muted-foreground">Enviando imagem…</p>}
    </div>
  );
}

export function RichDescription({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <div className="rich-description min-w-0 max-w-full text-muted-foreground" dangerouslySetInnerHTML={{ __html: descriptionHtml(text) }} />;
}

export function myMapsEmbed(input: string | null | undefined): string | null {
  if (!input) return null;
  const mid = input.match(/[?&]mid=([\w-]+)/)?.[1];
  return mid ? `https://www.google.com/maps/d/embed?mid=${mid}` : null;
}

export function RouteMap({ value }: { value: string | null | undefined }) {
  const src = myMapsEmbed(value);
  if (!src) return null;
  return <section className="min-w-0 max-w-full space-y-3"><h2 className="text-xl font-bold">Mapa do percurso</h2><iframe src={src} title="Mapa do percurso" className="block h-64 w-full max-w-full rounded-lg border sm:h-72" loading="lazy" /></section>;
}
