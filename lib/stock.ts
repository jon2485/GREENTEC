// Stock rules. null = unlimited. Digital downloads and the linked extra edition are never limited by Product.quantity.
// A chosen size/colour has its own stock (variantsJson combos); otherwise the product's quantity applies.
export function availFor(p: { quantity: number | null }, mode: string, choiceStock: number | null, hasGroups: boolean): number | null {
  if (mode === 'digital' || mode === 'link') return null;
  if (choiceStock != null) return Math.max(0, choiceStock);
  if (hasGroups) return null;
  return p.quantity == null ? null : Math.max(0, p.quantity);
}
export const stockMsg = (avail: number) => (avail <= 0 ? 'המוצר אזל מהמלאי' : avail === 1 ? 'נותרה יחידה אחת בלבד במלאי' : `נותרו ${avail} יחידות בלבד במלאי`);
