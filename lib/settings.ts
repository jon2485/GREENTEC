import { db } from './db';
import { cache } from 'react';
export const getSettings = cache(async () => {
  // small site settings only: the layout calls this on every page in production, and some rows are large
  // reports or migration data (gsc_report, legacy_buttons, legacy_audit, ...) that pages never read from here
  const rows = await db.setting.findMany({ where: { NOT: [{ key: { startsWith: 'legacy_' } }, { key: { startsWith: 'admin_' } }, { key: { startsWith: 'gsc_' } }, { key: { startsWith: 'image_migration' } }, { key: { startsWith: 'home_design' } }] } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
});
