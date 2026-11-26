// The legacy feed address (Merchant Center was set up with https://www.greentec.co.il/GoogleShopping/feed/1):
// same feed as /feeds/google-shopping.xml, so nothing has to change in Merchant Center at go-live.
export { GET } from '../../../feeds/google-shopping.xml/route';
export const dynamic = 'force-dynamic';
