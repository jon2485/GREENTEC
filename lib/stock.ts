// Stock rules. null = unlimited. Digital downloads and the linked extra edition are never limited by Product.quantity.
// A chosen size/colour has its own stock (variantsJson combos); otherwise the product's quantity applies.
export function availFor(p: { quantity: number | null }, mode: string, choiceStock: number | null, hasGroups: boolean): number | null {
  if (mode === 'digital' || mode === 'link') return null;
  // No quantity = unlimited; a quantity above 0 = in stock; 0 = out of stock (the number itself is not a purchase limit)
  const n = choiceStock != null ? choiceStock : hasGroups ? null : p.quantity;
  return n == null || n > 0 ? null : 0;
}
export const stockMsg = (_avail?: number) => 'המוצר אזל מהמלאי';
