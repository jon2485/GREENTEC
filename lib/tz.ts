// Israel local time (winter +02:00, summer +03:00) – the legacy site, the owner and the date filters all use it.
const JLM = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const offset = (t: number) => { const p = Object.fromEntries(JLM.formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t; };
export function israelTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  const local = Date.UTC(y, mo - 1, d, h, mi, s); if (isNaN(local)) return null;
  let t = local - offset(local - 2 * 3600e3); t = local - offset(t);
  return new Date(t);
}
/** "2026-11-27" (a date field) → the first / last moment of that day in Israel. */
export function israelDay(ymd: string, end = false): Date | undefined {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return undefined;
  return (end ? israelTime(+m[1], +m[2], +m[3], 23, 59, 59) : israelTime(+m[1], +m[2], +m[3])) || undefined;
}
