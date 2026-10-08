import { useEffect, useState } from "react";
import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** QR de uma inscrição: o mesmo conteúdo do QR do comprovante em PDF. */
export function orderQrValue(orderId: string) {
  return `${window.location.origin}/pedido/${encodeURIComponent(orderId)}`;
}

async function makeQr(value: string, width: number) {
  const mod: any = await import("qrcode");
  const QR = mod.default ?? mod;
  return QR.toDataURL(value, { width, margin: 1 }) as Promise<string>;
}

/** Gera o QR no navegador (o backend não roda no servidor). */
export function useQrDataUrl(value: string, width = 512) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    makeQr(value, width)
      .then((d) => alive && setUrl(d))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [value, width]);
  return url;
}

export function OrderQrImage({ orderId, size = 56, className = "" }: { orderId: string; size?: number; className?: string }) {
  const url = useQrDataUrl(orderQrValue(orderId), Math.max(256, size * 4));
  if (!url)
    return (
      <div
        className={`shrink-0 animate-pulse rounded-lg bg-muted ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt="QR code da inscrição"
      title="QR code da inscrição"
      className={`shrink-0 rounded-lg bg-card p-1 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Botão que abre o QR grande, para apresentar na retirada do kit ou na entrada. */
export function OrderQrDialog({
  orderId,
  code,
  title,
  className = "",
}: {
  orderId: string;
  code: string;
  title?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const url = useQrDataUrl(orderQrValue(orderId), 512);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
          <QrCode className="h-4 w-4" />
          QR da inscrição
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">QR code da inscrição</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {title && <p className="text-sm font-semibold">{title}</p>}
          {url ? (
            <img src={url} alt="QR code da inscrição" className="h-56 w-56 rounded-2xl border bg-card p-3" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-2xl border bg-muted" aria-hidden />
          )}
          <p className="font-display text-2xl font-extrabold tracking-wider">{code}</p>
          <p className="text-xs text-muted-foreground">
            Mostre este código na retirada do kit ou na entrada do evento.
          </p>
          {url && (
            <a href={url} download={`qrcode-${code}.png`} className="w-full">
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4" />
                Baixar QR
              </Button>
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
