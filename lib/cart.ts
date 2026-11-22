import { cookies } from 'next/headers';
export type CartLine = { id: number; mode: 'digital' | 'physical' | 'both'; qty: number };
export async function getCart(): Promise<CartLine[]> {
  try { return JSON.parse((await cookies()).get('gt_cart')?.value || '[]'); } catch { return []; }
}
export async function saveCart(lines: CartLine[]) {
  (await cookies()).set('gt_cart', JSON.stringify(lines.slice(0, 60)), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
}
