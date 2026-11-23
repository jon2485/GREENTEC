// Product variations (e.g. מידה) and properties (e.g. תוספת קשירה), exactly as on the live greentec.co.il product page.
// Stored per product in Product.variantsJson:
//   groups: [{id, name, options:[{id,label,img?,color?}]}]       – one choice per group (radio)
//   combos: {".36.": {price, qty, img}}                           – key = "." + chosen option ids (sorted by group order) + "."
//   props:  [{id, name, kind?: 'text', options:[{id,label,price,def}]}] – add-ons (select), price added on top
export type VGroup = { id: number; name: string; options: { id: number; label: string; img?: string; color?: string }[] };
export type VProp = { id: number; name: string; kind?: string; options: { id: number; label: string; price: number; def?: boolean }[] };
export type Variants = { groups: VGroup[]; combos: Record<string, { price: number | null; qty: number | null; img?: string }>; props: VProp[]; def?: number };

export function parseVariants(json?: string | null): Variants | null {
  if (!json) return null;
  try { const v = JSON.parse(json); if (!v || (!(v.groups || []).length && !(v.props || []).length)) return null; return { groups: v.groups || [], combos: v.combos || {}, props: v.props || [], def: v.def }; } catch { return null; }
}
// combo key the legacy site uses: ".a.b." – the chosen option ids sorted ascending
export const comboKey = (ids: number[]) => (ids.length ? '.' + [...ids].sort((a, b) => a - b).join('.') + '.' : '');
export const optLabel = (g: VGroup, o: { id: number; label: string; color?: string }) => o.label || (o.color ? `גוון ${g.options.indexOf(o as any) + 1}` : String(o.id));

// Price + human label for a chosen variation/properties. Returns null if the choice is not valid for this product.
export function resolveChoice(v: Variants | null, base: number, vk?: string, pr?: string): { unit: number; label: string; stock: number | null } | null {
  if (!v) return vk || pr ? null : { unit: base, label: '', stock: null };
  let unit = base; let stock: number | null = null; const parts: string[] = [];
  if (v.groups.length) {
    if (!vk) return null;
    const ids = vk.split('.').filter(Boolean).map(Number);
    if (ids.length !== v.groups.length) return null;
    for (const g of v.groups) { const o = g.options.find((x) => ids.includes(x.id)); if (!o) return null; parts.push(`${g.name}: ${optLabel(g, o)}`); }
    const c = v.combos[comboKey(ids)];
    const full = Object.keys(v.combos).filter((k) => k.split('.').filter(Boolean).length === v.groups.length);
    if (full.length && !c) return null;
    if (c?.price != null && c.price > 0) unit = c.price;
    if (c?.qty != null) stock = Math.max(0, c.qty);
  }
  const chosen = new Map<number, number>();
  for (const kv of String(pr || '').split(',').filter(Boolean)) { const [g, o] = kv.split(':').map(Number); if (g && o) chosen.set(g, o); }
  for (const g of v.props) {
    if (g.kind === 'text') continue;
    const oid = chosen.get(g.id) ?? g.options.find((o) => o.def)?.id;
    if (!oid) continue;
    const o = g.options.find((x) => x.id === oid); if (!o) return null;
    unit += o.price || 0; parts.push(`${g.name}: ${o.label}`);
  }
  return { unit, label: parts.join(' · '), stock };
}
