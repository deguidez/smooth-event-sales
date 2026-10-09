import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/format";
import { ownerPhotoEarnings } from "@/lib/photos.functions";

/** Organizer's share of photo sales; event total only when the super admin allows it. */
export function OwnerPhotoEarnings() {
  const load = useServerFn(ownerPhotoEarnings);
  const { data = [] } = useQuery({ queryKey: ["owner-photo-earnings"], queryFn: () => load() });
  if (!data.length) return null;
  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-xl font-bold">Ganhos com fotos dos eventos</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <Table>
          <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Pedidos pagos</TableHead><TableHead>Faturamento total</TableHead><TableHead className="text-right">Sua comissão</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((r: any) => (
              <TableRow key={r.albumId}>
                <TableCell>{r.title}</TableCell><TableCell>{r.orders}</TableCell>
                <TableCell>{r.total == null ? <span className="text-muted-foreground">—</span> : brl(r.total)}</TableCell>
                <TableCell className="text-right font-semibold">{brl(r.owner)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
