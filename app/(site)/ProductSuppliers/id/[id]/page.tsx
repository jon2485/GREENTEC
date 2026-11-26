// Legacy manufacturer / artist URL (greentec.co.il/ProductSuppliers/id/{id}) – kept identical for SEO and menus.
// A 301 set in the admin for this exact URL wins (the legacy site redirected some artists to their category page).
import { permanentRedirect } from 'next/navigation';
import Supplier, { generateMetadata } from '../../../supplier/[id]/page';
import { findRedirect, locationOf } from '@/lib/redirects';
export const dynamic = 'force-dynamic';
export { generateMetadata };
export default async function LegacySupplier(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await props.params;
  const red = await findRedirect(`/ProductSuppliers/id/${id}`);
  if (red) permanentRedirect(locationOf(red.to));
  return Supplier(props as any);
}
