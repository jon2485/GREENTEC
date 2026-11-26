// Google Analytics events (admin → מערכת → google analytics events), as in the legacy admin: each row fires a GA event
// on a purchase or on add-to-cart, for one product (product ID) or for every product (empty).
// Stored in Setting "ga_events", one row per line: type|productId|Category|Action|Label|Value (type = purchase | cart).
export type GaEvent = { type: 'purchase' | 'cart'; pid: string; category: string; action: string; label: string; value: string };
export const GA_TYPES: [GaEvent['type'], string][] = [['purchase', 'רכישה'], ['cart', 'סל קניות']];
export function parseGaEvents(s?: string | null): GaEvent[] {
  return String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [type, pid = '', category = '', action = '', label = '', value = ''] = l.split('|').map((x) => x.trim());
    return { type: type === 'cart' ? 'cart' : 'purchase', pid, category, action, label, value } as GaEvent;
  });
}
export const serializeGaEvents = (list: GaEvent[]) => list.map((e) => [e.type, e.pid, e.category, e.action, e.label, e.value].map((x) => String(x ?? '').replace(/[|\r\n]/g, ' ').trim()).join('|')).join('\n');
/** Events that apply to these products (an event without a product ID applies to all). */
export const gaFor = (list: GaEvent[], type: GaEvent['type'], productIds: (number | string)[]) =>
  list.filter((e) => e.type === type && (!e.pid || productIds.map(String).includes(e.pid)));
/** Inline script that sends the events to GTM's dataLayer and to gtag when present. */
export const GA_FIRE = `function(E){window.dataLayer=window.dataLayer||[];E.forEach(function(e){window.dataLayer.push({event:'ga_event',eventCategory:e.category,eventAction:e.action,eventLabel:e.label,eventValue:e.value});if(typeof window.gtag==='function')window.gtag('event',e.action||'event',{event_category:e.category,event_label:e.label,value:Number(e.value)||undefined});});}`;
export const gaScript = (events: GaEvent[]) => (events.length ? `(${GA_FIRE})(${JSON.stringify(events).replace(/</g, '\\u003c')});` : '');
