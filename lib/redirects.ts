import { db } from './db';
/** Location header value for a redirect target: Hebrew paths must be percent-encoded (a raw one crashes the response). */
export const locationOf = (to: string) => { let u = to; try { u = decodeURI(to); } catch {} return encodeURI(u); };
/** The admin's 301 redirect for this path, if any (stored decoded or encoded). */
export const findRedirect = (path: string) => db.redirect.findFirst({ where: { OR: [{ from: path }, { from: encodeURI(path) }] } });
