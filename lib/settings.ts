import { db } from './db';
import { cache } from 'react';
export const getSettings = cache(async () => {
  const rows = await db.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
});
