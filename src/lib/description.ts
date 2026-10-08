import { FilterXSS, escapeAttrValue } from "xss";

const filter = new FilterXSS({
  whiteList: {
    p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
    h2: [], h3: [], h4: [], ul: [], ol: ["start"], li: [], blockquote: [],
    hr: [], a: ["href", "title", "target", "rel"], img: ["src", "alt", "title"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object"],
  onTagAttr(tag, name, value) {
    if (tag === "img" && name === "src" && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
      return `src="${escapeAttrValue(value)}"`;
    }
    if ((tag === "img" && name === "src") || (tag === "a" && name === "href")) {
      const valid = tag === "img" ? /^https?:\/\//i.test(value) : /^(https?:\/\/|mailto:)/i.test(value);
      if (!valid) return "";
    }
    if (tag === "a" && name === "target") return 'target="_blank" rel="noopener noreferrer"';
    return undefined;
  },
});

export function sanitizeDescription(html: string) {
  return filter.process(html);
}

export function descriptionHtml(text: string | null | undefined): string {
  if (!text) return "";
  if (/<\/?(?:p|h[2-4]|div|strong|b|em|ul|ol|img|br|blockquote|a)\b/i.test(text)) return sanitizeDescription(text);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const images = escaped.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1">');
  return sanitizeDescription(`<p>${images.replace(/\n/g, "<br>")}</p>`);
}