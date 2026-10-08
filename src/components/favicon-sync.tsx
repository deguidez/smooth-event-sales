import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBranding } from "@/lib/public.functions";

// Aplica o favicon configurado pelo super admin (data URL) na aba do navegador.
export function FaviconSync() {
  const load = useServerFn(getBranding);
  const { data } = useQuery({ queryKey: ["branding"], queryFn: () => load() });

  useEffect(() => {
    const favicon = data?.favicon;
    if (!favicon) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = favicon.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
    link.href = favicon;
  }, [data?.favicon]);

  return null;
}
