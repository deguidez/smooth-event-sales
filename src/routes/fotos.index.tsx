import { createFileRoute } from "@tanstack/react-router";
import { AlbumGrid } from "@/components/album-grid";

export const Route = createFileRoute("/fotos/")({
  head: () => ({ meta: [
    { title: "Fotos dos eventos — Evenon" }, { name: "description", content: "Encontre suas fotos e vídeos dos eventos por reconhecimento facial e compre em alta qualidade." },
    { property: "og:title", content: "Fotos dos eventos — Evenon" }, { property: "og:description", content: "Encontre suas fotos e vídeos dos eventos por reconhecimento facial e compre em alta qualidade." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AlbumsPage,
});

function AlbumsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-4xl font-extrabold">Fotos dos eventos</h1>
      <p className="mt-2 text-muted-foreground">Escolha o evento, tire uma selfie e veja todas as fotos em que você aparece.</p>
      <div className="mt-8"><AlbumGrid /></div>
    </div>
  );
}
