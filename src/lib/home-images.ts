import hero from "@/assets/hero.jpg";
import esporte from "@/assets/cat-esporte.jpg";
import show from "@/assets/cat-show.jpg";
import congresso from "@/assets/cat-congresso.jpg";

export const HOME_IMAGES = [
  { key: "banner", label: "Banner principal", fallback: hero },
  { key: "esporte", label: "Esportes", fallback: esporte },
  { key: "show", label: "Shows", fallback: show },
  { key: "congresso", label: "Congressos", fallback: congresso },
] as const;
export type HomeImageKey = (typeof HOME_IMAGES)[number]["key"];
export type HomeImages = Partial<Record<HomeImageKey, string | null>>;