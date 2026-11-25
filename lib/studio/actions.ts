// adminAjax actions of the studio: /admin/adminAjax/studio/{action}/{id}
import { db } from '@/lib/db';
import { agentById } from './agents';
import { J, money, planProject, transition, addVersion, logEvent, projectSpent, scorecard, STATUSES, SCORE_DOMAINS, type Output, type Status } from './workflow';
import { startRun, startReview, isRunning } from './runner';

type R = { status: 'success' | 'error'; message?: string; redirect?: string; reload?: boolean };
const ok = (message = 'נשמר', extra: Partial<R> = {}): R => ({ status: 'success', message, ...extra });
const err = (message: string): R => ({ status: 'error', message });
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const n = (f: FormData, k: string) => { const v = Number(f.get(k)); return Number.isFinite(v) && v >= 0 ? v : 0; };
const providersOf = (raw: string) => [...new Set(raw.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export async function studioAction(action: string, id: number, f: FormData, url: URL, user: { id: number }): Promise<R> {
  const human = { kind: 'human' as const, userId: user.id };
  const who = `human:${user.id}`;
  switch (action) {
    case 'create_project': {
      const title = s(f, 'title'); if (!title) return err('שם הסרט חובה');
      const p = await db.filmProject.create({ data: { title, story: s(f, 'story'), audience: s(f, 'audience'), budgetLimit: n(f, 'budgetLimit') } });
      await logEvent(p.id, null, who, 'project', 'הפרויקט נפתח');
      return ok('הפרויקט נפתח', { redirect: `/admin?am=studio&ac=project&id=${p.id}` });
    }
    case 'save_project': {
      const before = await db.filmProject.findUniqueOrThrow({ where: { id } });
      const aiEnabled = f.get('aiEnabled') === '1'; const providers = providersOf(s(f, 'providers'));
      await db.filmProject.update({ where: { id }, data: { title: s(f, 'title') || before.title, story: s(f, 'story'), audience: s(f, 'audience'), budgetLimit: n(f, 'budgetLimit'), aiEnabled, providers: JSON.stringify(providers), notes: s(f, 'notes') } });
      const changes = [
        before.aiEnabled !== aiEnabled ? `שימוש ב־Claude API: ${aiEnabled ? 'אושר' : 'בוטל'}` : '',
        before.providers !== JSON.stringify(providers) ? `מנועים מאושרים: ${providers.join(', ') || 'אין'}` : '',
        money(before.budgetLimit) !== n(f, 'budgetLimit') ? `תקציב: $${money(before.budgetLimit)} → $${n(f, 'budgetLimit')}` : '',
        before.story !== s(f, 'story') ? 'הסיפור עודכן' : '',
      ].filter(Boolean);
      if (changes.length) await logEvent(id, null, who, 'settings', changes.join(' · '));
      return ok('נשמר', { reload: true });
    }
    case 'plan': { const c = await planProject(id, who); return ok(c ? `נוצרו ${c} משימות` : 'כל המשימות כבר קיימות', { reload: true }); }
    case 'save_task': {
      const t = await db.filmTask.findUniqueOrThrow({ where: { id } });
      if (!['DRAFT', 'READY', 'HUMAN_DECISION'].includes(t.status)) return err('החוזה נעול במצב הנוכחי');
      let outs: Output[];
      try { outs = JSON.parse(s(f, 'expectedOutputs') || '[]'); } catch { return err('Expected Outputs: JSON לא תקין'); }
      if (!Array.isArray(outs) || outs.some((o) => !o || typeof o.name !== 'string' || !/^[a-z0-9_]+$/.test(o.name) || typeof o.kind !== 'string')) return err('כל תוצר צריך name (אותיות לטיניות קטנות, ספרות, _) ו־kind');
      const agent = s(f, 'agent'), review = s(f, 'reviewAgent');
      if (!agentById(agent)) return err('סוכן מבצע לא מוכר');
      if (review !== 'HUMAN' && !agentById(review)) return err('סוכן בודק לא מוכר');
      if (review === agent) return err('הבודק חייב להיות שונה מהמבצע');
      await db.filmTask.update({ where: { id }, data: {
        title: s(f, 'title') || t.title, sceneId: s(f, 'sceneId'), shotId: s(f, 'shotId'), budgetLimit: n(f, 'budgetLimit'), agent, reviewAgent: review,
        creativeBrief: s(f, 'creativeBrief'), technicalReq: s(f, 'technicalReq'), constraints: s(f, 'constraints'), expectedOutputs: JSON.stringify(outs.map((o) => ({ name: o.name, kind: o.kind, media: !!o.media }))), acceptanceCriteria: s(f, 'acceptanceCriteria'),
        ...(t.status === 'READY' ? { status: 'DRAFT' } : {}),
      } });
      await logEvent(t.projectId, id, who, 'contract', 'חוזה המשימה עודכן', t.status === 'READY' ? 'READY' : '', t.status === 'READY' ? 'DRAFT' : '');
      return ok('החוזה נשמר', { reload: true });
    }
    case 'transition': {
      const to = s(f, 'to') as Status; if (!STATUSES.includes(to)) return err('מצב לא מוכר');
      if (isRunning(id)) return err('הסוכן עדיין עובד על המשימה');
      await transition(id, to, human, s(f, 'note'));
      return ok('המצב עודכן', { reload: true });
    }
    case 'run': await startRun(id, user.id); return ok('הסוכן התחיל לעבוד. הדף יתרענן עם התוצר.', { reload: true });
    case 'review': await startReview(id, user.id); return ok('הבדיקה התחילה', { reload: true });
    case 'release': {
      if (isRunning(id)) return err('ההרצה עדיין פעילה');
      const t = await db.filmTask.findUniqueOrThrow({ where: { id } });
      await db.filmTask.update({ where: { id }, data: { runStartedAt: null } });
      if (t.status === 'RUNNING') await transition(id, 'BLOCKED', human, 'הרצה הופסקה באמצע (השרת אותחל או נכשל) – לא נשמר תוצר');
      else await logEvent(t.projectId, id, who, 'release', 'בדיקה תקועה שוחררה');
      return ok('שוחרר', { reload: true });
    }
    case 'add_media': {
      const t = await db.filmTask.findUniqueOrThrow({ where: { id }, include: { project: true } });
      if (t.status !== 'RUNNING') return err('אפשר להעלות תוצר רק למשימה בביצוע');
      const out = J<Output[]>(t.expectedOutputs, []).find((o) => o.name === s(f, 'output') && o.media);
      if (!out) return err('תוצר מדיה לא מוכר במשימה');
      const engine = s(f, 'engine').toLowerCase();
      if (!J<string[]>(t.project.providers, []).includes(engine)) return err('המנוע לא אושר לפרויקט. רק המפיק מאשר מנועים (הגדרות הפרויקט)');
      const key = s(f, 'key'); if (!key.startsWith(`studio/${t.projectId}/`)) return err('מפתח קובץ לא תקין');
      const cost = n(f, 'cost');
      await addVersion(t.projectId, id, out, { storageKey: key, mime: s(f, 'mime'), size: n(f, 'size'), createdBy: `${t.agent}/${who}`, meta: { engine, settings: s(f, 'settings'), cost, uploadedBy: who, file: s(f, 'name') } });
      if (cost > 0) await db.filmCost.create({ data: { projectId: t.projectId, taskId: id, provider: engine, kind: out.kind === 'image' ? 'image' : out.kind === 'audio' ? 'voice' : 'video', units: s(f, 'name'), amount: cost, note: `${out.name}`, createdBy: who } });
      const spent = await projectSpent(t.projectId);
      return ok(money(t.project.budgetLimit) > 0 && spent > money(t.project.budgetLimit) ? 'הקובץ נשמר – שימו לב: חריגה מתקציב הפרויקט' : 'הקובץ נשמר כגרסה חדשה', { reload: true });
    }
    case 'add_cost': {
      const amount = n(f, 'amount'); const provider = s(f, 'provider').toLowerCase(); if (!provider || !amount) return err('ספק וסכום חובה');
      const taskId = Number(f.get('taskId')) || null;
      await db.filmCost.create({ data: { projectId: id, taskId, provider, kind: s(f, 'kind') || 'other', units: s(f, 'units'), amount, note: s(f, 'note'), createdBy: who } });
      await logEvent(id, taskId, who, 'cost', `${provider} $${amount} ${s(f, 'note')}`);
      return ok('ההוצאה נרשמה', { reload: true });
    }
    case 'add_right': {
      const owner = s(f, 'owner'); if (!owner) return err('בעל הזכויות חובה');
      await db.filmRight.create({ data: { projectId: id, subject: s(f, 'subject'), owner, license: s(f, 'license'), commercial: f.get('commercial') === '1', proofKey: s(f, 'proofKey'), notes: s(f, 'notes') } });
      await logEvent(id, null, who, 'right', `${s(f, 'subject')}: ${owner}`);
      return ok('נרשם', { reload: true });
    }
    case 'verify_right': {
      const r = await db.filmRight.update({ where: { id }, data: { verified: true } });
      await logEvent(r.projectId, null, who, 'right', `זכויות אומתו: ${r.subject} (${r.owner})`);
      return ok('אומת', { reload: true });
    }
    case 'save_scores': {
      const sc: Record<string, any> = {};
      for (const [k] of SCORE_DOMAINS) { const v = Number(f.get(k)); if (v >= 1 && v <= 5) sc[k] = v; }
      sc.critical = f.get('critical') === '1';
      await db.filmProject.update({ where: { id }, data: { scores: JSON.stringify(sc) } });
      const r = scorecard(JSON.stringify(sc));
      await logEvent(id, null, who, 'score', `ציוני מבחן הקבלה: ${JSON.stringify(sc)} → ${r.complete ? (r.pass ? 'עבר' : 'לא עבר') : 'חלקי'}`);
      return ok('נשמר', { reload: true });
    }
    case 'approve_film': {
      const p = await db.filmProject.findUniqueOrThrow({ where: { id }, include: { tasks: true, rights: true } });
      if (!p.tasks.length || p.tasks.some((t) => t.status !== 'APPROVED')) return err('יש משימות שעדיין לא אושרו');
      const unverified = p.rights.filter((r) => !r.verified || !r.commercial);
      if (!p.rights.length || unverified.length) return err('לכל נכס בסרט צריך רישום זכויות מאומת עם שימוש מסחרי');
      const spent = await projectSpent(id);
      if (money(p.budgetLimit) > 0 && spent > money(p.budgetLimit)) return err(`ההוצאה ($${spent.toFixed(2)}) חורגת מהתקציב – יש לעדכן את התקציב בהחלטה מפורשת לפני האישור`);
      await db.filmProject.update({ where: { id }, data: { approvedAt: new Date(), approvedBy: user.id } });
      await logEvent(id, null, who, 'approve', 'המפיק אישר את הסרט להפצה');
      return ok('הסרט אושר להפצה', { reload: true });
    }
    case 'competency': {
      const a = agentById(url.searchParams.get('agent') || ''); if (!a) return err('סוכן לא מוכר');
      const p = await db.filmProject.create({ data: { title: `מבחן כשירות · ${a.id} ${a.he}`, isTest: true, budgetLimit: 5, notes: 'פרויקט מבחן. הוסיפו את חומרי המקור לסיפור לפני ההפעלה.' } });
      await db.filmTask.create({ data: {
        projectId: p.id, key: 'test', stage: 1, agent: a.id, title: `מבחן כשירות – ${a.he}`, reviewAgent: 'HUMAN', budgetLimit: 5,
        creativeBrief: a.test, acceptanceCriteria: a.selfCheck.join('; '),
        expectedOutputs: JSON.stringify([{ name: 'test_output', kind: 'competency_test' }]),
        constraints: 'לעבוד רק לפי חומרי המקור שבסיפור הפרויקט.',
      } });
      await logEvent(p.id, null, who, 'project', `פרויקט מבחן כשירות ל־${a.id}`);
      return ok('פרויקט המבחן נפתח', { redirect: `/admin?am=studio&ac=project&id=${p.id}` });
    }
  }
  return err(`פעולה לא מוכרת: studio/${action}`);
}
