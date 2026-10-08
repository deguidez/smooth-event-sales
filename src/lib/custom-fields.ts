export type CustomField = { id: string; label: string; type: "text" | "textarea" | "checkbox" | "select"; required: boolean; options: string[] };

export const FIELD_TYPES: Record<CustomField["type"], string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  checkbox: "De marcar",
  select: "Lista de opções",
};

export function parseFields(raw: unknown): CustomField[] {
  return Array.isArray(raw) ? (raw as CustomField[]).filter((f) => f && f.id && f.label) : [];
}

export function isEmpty(v: unknown) {
  return v == null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

export function formatAnswer(f: CustomField, v: unknown): string {
  if (isEmpty(v)) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (v === true) return "Sim";
  return String(v);
}

/** Valida e limpa as respostas conforme os campos do evento. Lança erro se faltar obrigatório. */
export function cleanAnswers(fields: CustomField[], answers: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    let v = answers?.[f.id];
    if (f.type === "text" || f.type === "textarea") v = typeof v === "string" ? v.trim().slice(0, f.type === "text" ? 200 : 2000) : "";
    else if (f.type === "select") v = typeof v === "string" && f.options.includes(v) ? v : "";
    else if (f.options.length) v = Array.isArray(v) ? v.filter((x) => typeof x === "string" && f.options.includes(x)) : [];
    else v = v === true;
    if (f.required && isEmpty(v)) throw new Error(`Preencha o campo "${f.label}"`);
    if (!isEmpty(v)) out[f.id] = v;
  }
  return out;
}
