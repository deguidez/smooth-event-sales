import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { listPublicAlbums } from "@/lib/photos.functions";

export function AlbumGrid({ limit }: { limit?: number }) {
  const load = useServerFn(listPublicAlbums);
  const { data = [] } = useQuery({ queryKey: ["public-albums"], queryFn: () => load() });
  const list = limit ? data.slice(0, limit) : data;
  if (!list.length) return <p className="text-muted-foreground">Em breve, fotos dos próximos eventos.</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((a: any) => (
        <Link key={a.id} to="/fotos/$albumId" params={{ albumId: a.id }} className="group overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="aspect-[16/10] overflow-hidden bg-muted">
            {a.events?.cover_url ? <img src={a.events.cover_url} alt={a.events.title} className="size-full object-cover transition group-hover:scale-105" /> : <div className="flex size-full items-center justify-center"><Camera className="size-10 text-muted-foreground" /></div>}
          </div>
          <div className="p-4">
            <p className="font-bold">{a.events?.title}</p>
            <p className="text-sm text-muted-foreground">{fmtDate(a.events?.starts_at)} · {a.events?.city}/{a.events?.state}</p>
            <p className="mt-2 text-sm"><b>{a.media_count}</b> arquivos · foto a partir de {brl(a.photo_price)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

