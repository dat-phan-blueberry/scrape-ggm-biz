import type { BusinessProfile, MenuCategory } from "./types.ts";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const url = (value: unknown) => {
  try { const u = new URL(text(value)); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
};

/** Giữ riêng danh sách món, ảnh thực đơn và link; không suy menu chữ từ ảnh món. */
export function normalizeMenu(raw: unknown): BusinessProfile["menu"] {
  if (!raw) return null;
  const menu = object(raw);
  const categories: MenuCategory[] = rows(menu.categories).map(c => ({
    title: text(c.title),
    items: rows(c.items).map(i => ({ title: text(i.title), price: text(i.price), description: text(i.description) })).filter(i => i.title),
  })).filter(c => c.items.length > 0);
  return {
    categories,
    highlights: rows(menu.highlights).map(h => ({ title: text(h.title), thumbnail: url(h.thumbnail || h.image) })),
    link: url(typeof raw === "string" ? raw : menu.link),
    source: text(menu.source),
    images: rows(menu.images).map(i => ({ thumbnail: url(i.thumbnail || i.image), image: url(i.image), date: text(i.date) })).filter(i => i.thumbnail),
  };
}
