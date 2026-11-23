// Legacy manufacturer / artist URL (greentec.co.il/ProductSuppliers/id/{id}) – kept identical for SEO and menus.
import Supplier, { generateMetadata } from '../../../supplier/[id]/page';
export const dynamic = 'force-dynamic';
export { generateMetadata };
export default Supplier;
