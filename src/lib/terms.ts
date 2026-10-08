export type EventTerm = { id: string; title: string; text: string; enabled: boolean };

export const DEFAULT_TERMS: EventTerm[] = [
  {
    id: "consentimento",
    title: "Termo de consentimento e responsabilidade",
    text: "Declaro que li e concordo com o regulamento do evento, assumindo total responsabilidade pela minha participação e isentando a organização de quaisquer danos decorrentes dela.",
    enabled: false,
  },
  {
    id: "imagem",
    title: "Autorização de uso de imagem e vídeo",
    text: "Autorizo, de forma gratuita, o uso da minha imagem, voz e vídeo captados durante o evento para divulgação em quaisquer meios, sem limite de tempo.",
    enabled: false,
  },
  {
    id: "saude",
    title: "Declaração de saúde",
    text: "Declaro que estou em boas condições de saúde, apto(a) física e mentalmente para participar desta atividade, e que me submeti a avaliação médica adequada.",
    enabled: false,
  },
];

/** Merges stored terms with defaults so the 3 standard terms always exist. */
export function parseTerms(raw: unknown): EventTerm[] {
  const list = Array.isArray(raw) ? (raw as any[]) : [];
  const byId = new Map(list.filter((t) => t && typeof t.id === "string").map((t) => [t.id, t]));
  const merged = DEFAULT_TERMS.map((d) => {
    const s = byId.get(d.id);
    return s ? { id: d.id, title: String(s.title || d.title), text: String(s.text || d.text), enabled: !!s.enabled } : d;
  });
  const extras = list
    .filter((t) => t && typeof t.id === "string" && !DEFAULT_TERMS.some((d) => d.id === t.id))
    .map((t) => ({ id: t.id, title: String(t.title ?? ""), text: String(t.text ?? ""), enabled: !!t.enabled }));
  return [...merged, ...extras];
}

export const activeTerms = (raw: unknown) => parseTerms(raw).filter((t) => t.enabled && t.title.trim());
