// Studio workflow: the 6 production stages, the task contract and the task state machine (spec §5–§6).
// Every rule that protects the production is enforced here, server-side:
//  - a task can't start before its dependencies are APPROVED, or when the budget is used up;
//  - a task can't go to REVIEW without a stored deliverable (a new asset version) and a self-review;
//  - only the review agent or a human can approve; final approval of the film is human-only;
//  - an approved version is never overwritten – changes always create a new version.
import { db } from '@/lib/db';
import type { AgentId } from './agents';

export const STAGES: { n: number; title: string; goal: string }[] = [
  { n: 1, title: 'הבנת הסיפור', goal: 'תסריט קולנועי מאושר' },
  { n: 2, title: 'בניית העולם', goal: 'מאגר דמויות ועולמות מאושר' },
  { n: 3, title: 'הכנת הסרט', goal: 'סרט מקדים מתוזמן, לפני הפקת הווידאו' },
  { n: 4, title: 'יצירת האנימציה', goal: 'שוטי וידאו מאושרים' },
  { n: 5, title: 'הרכבה וגימור', goal: 'סרט מלא לבדיקת המפיק' },
  { n: 6, title: 'אישור ומסירה', goal: 'סרט מאסטר וחבילת הפצה' },
];

export const STATUSES = ['DRAFT', 'READY', 'RUNNING', 'REVIEW', 'APPROVED', 'REVISION_REQUIRED', 'BLOCKED', 'HUMAN_DECISION'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_HE: Record<Status, string> = {
  DRAFT: 'טיוטה', READY: 'מוכנה לביצוע', RUNNING: 'בביצוע', REVIEW: 'בבדיקה', APPROVED: 'אושרה',
  REVISION_REQUIRED: 'נדרש תיקון', BLOCKED: 'חסומה', HUMAN_DECISION: 'ממתינה להחלטת המפיק',
};
export const STATUS_COLOR: Record<Status, string> = {
  DRAFT: 'secondary', READY: 'info', RUNNING: 'primary', REVIEW: 'warning', APPROVED: 'success',
  REVISION_REQUIRED: 'danger', BLOCKED: 'dark', HUMAN_DECISION: 'danger',
};
// DRAFT → READY → RUNNING → REVIEW → APPROVED; REVIEW → REVISION_REQUIRED → RUNNING; * → BLOCKED → HUMAN_DECISION
const NEXT: Record<Status, Status[]> = {
  DRAFT: ['READY', 'BLOCKED'],
  READY: ['RUNNING', 'DRAFT', 'BLOCKED'],
  RUNNING: ['REVIEW', 'BLOCKED'],
  REVIEW: ['APPROVED', 'REVISION_REQUIRED', 'BLOCKED'],
  REVISION_REQUIRED: ['RUNNING', 'BLOCKED'],
  BLOCKED: ['HUMAN_DECISION'],
  HUMAN_DECISION: ['READY', 'RUNNING', 'REVISION_REQUIRED', 'DRAFT'],
  APPROVED: [], // a new version means a new task (or re-opening by the producer → REVISION_REQUIRED is not allowed: approved stays approved)
};
export const nextStatuses = (s: string) => NEXT[s as Status] || [];

export type Output = { name: string; kind: string; media?: boolean };
type Tpl = { key: string; stage: number; agent: AgentId; title: string; deps: string[]; review: AgentId | 'HUMAN'; outputs: Output[]; brief: string; criteria: string; share: number };

// Spec §5 – who does what in each stage. `share` = part of the project budget reserved for the task.
export const PLAN: Tpl[] = [
  // Stage 1 – story
  { key: 's1.screenplay', stage: 1, agent: 'AI-02', title: 'ניתוח הסיפור ותסריט קולנועי', deps: [], review: 'AI-03', share: 0.02,
    outputs: [{ name: 'screenplay', kind: 'screenplay' }, { name: 'scene_list', kind: 'scene_list' }, { name: 'character_arcs', kind: 'character_arcs' }],
    brief: 'להפוך את הסיפור לתסריט הפקה: לכל סצנה מקום, דמויות, מטרה דרמטית, פעולות, דיאלוג ומשך משוער.',
    criteria: 'העלילה והמסר של היוצר נשמרו; כל סצנה כוללת את כל השדות; הדיאלוג טבעי לגיל היעד; משך כולל תואם לאורך היעד.' },
  { key: 's1.direction', stage: 1, agent: 'AI-03', title: 'שפת הבימוי והוראות משחק', deps: ['s1.screenplay'], review: 'AI-01', share: 0.02,
    outputs: [{ name: 'directors_notes', kind: 'directors_notes' }],
    brief: 'לכתוב לכל סצנה ולכל דמות הוראות בימוי ומשחק שניתנות לצילום, תוכנית מצלמה וקצב.',
    criteria: 'כל הוראה היא פעולה שאפשר לצלם; כל בחירת מצלמה מנומקת; קצב תואם לתסריט.' },
  { key: 's1.plan', stage: 1, agent: 'AI-01', title: 'תוכנית הפקה ותקציב', deps: ['s1.screenplay', 's1.direction'], review: 'HUMAN', share: 0.01,
    outputs: [{ name: 'production_plan', kind: 'production_plan' }],
    brief: 'לבנות תוכנית הפקה מפורטת: סצנות, שוטים משוערים, תלויות, סיכונים, חלוקת תקציב ומסלולי תיקון.',
    criteria: 'יש תלויות מלאות, רזרבה לתיקונים, שוטים בסיכון מסומנים, וכל החלטה שמחייבת את המפיק מסומנת.' },
  // Stage 2 – world
  { key: 's2.characters', stage: 2, agent: 'AI-05', title: 'ספרי דמויות', deps: ['s1.plan'], review: 'AI-12', share: 0.05,
    outputs: [{ name: 'character_bible', kind: 'character_bible' }, { name: 'character_refs', kind: 'image', media: true }],
    brief: 'לבנות לכל דמות ספר דמות: מאפיינים נעולים, וריאציות מותרות, Turnaround, הבעות ופוזות, ופרומפט ייחוס קבוע. תמונות הייחוס מופקות במנוע תמונה מאושר.',
    criteria: 'כל מאפיין נעול מבוסס על האיור המקורי; השלמות מסומנות לאישור; תמונות הייחוס זהות לדמות.' },
  { key: 's2.environments', stage: 2, agent: 'AI-06', title: 'ספרי עולמות וסביבות', deps: ['s1.plan'], review: 'AI-12', share: 0.05,
    outputs: [{ name: 'environment_bible', kind: 'environment_bible' }, { name: 'environment_refs', kind: 'image', media: true }],
    brief: 'לבנות לכל מקום מפת מבט על, פרטים נעולים, ארבע זוויות צילום, שכבות ומאגר אביזרים.',
    criteria: 'המפות תואמות את האיורים; אין סתירות מבנה בין זוויות; השלמות מסומנות.' },
  { key: 's2.continuity', stage: 2, agent: 'AI-12', title: 'בדיקת עקביות הדמויות והעולמות', deps: ['s2.characters', 's2.environments'], review: 'HUMAN', share: 0.01,
    outputs: [{ name: 'continuity_world', kind: 'continuity_report' }],
    brief: 'להשוות את ספרי הדמויות והעולמות לאיורי המקור ולתסריט, ולדווח על כל סתירה.',
    criteria: 'כל תקלה מצביעה על מאפיין נעול; וריאציות תקינות לא דווחו; מצוין מה נבדק בפועל.' },
  // Stage 3 – pre-viz
  { key: 's3.storyboard', stage: 3, agent: 'AI-04', title: 'Shot List, סטוריבורד ו־Animatic', deps: ['s2.continuity'], review: 'AI-03', share: 0.06,
    outputs: [{ name: 'shot_list', kind: 'shot_list' }, { name: 'storyboard_frames', kind: 'image', media: true }, { name: 'animatic', kind: 'video', media: true }],
    brief: 'מפת מיקום לכל סצנה, Shot List מלא עם פריימי פתיחה/סיום, פריימים מצוירים ו־Animatic מתוזמן.',
    criteria: 'אין קפיצות ציר; כל שוט מקושר לשורת תסריט; משך כולל תואם.' },
  { key: 's3.voice', stage: 3, agent: 'AI-09', title: 'Voice Bible, מילון הגייה ותסריט דיבוב', deps: ['s1.plan'], review: 'AI-03', share: 0.02,
    outputs: [{ name: 'voice_bible', kind: 'voice_bible' }, { name: 'dub_script', kind: 'dub_script' }],
    brief: 'להגדיר קול לכל דמות, מילון הגייה לשמות ולמונחים, ותסריט דיבוב מנוקד עם הוראות משחק.',
    criteria: 'כל המונחים במילון; לכל שורה הוראת משחק; קולות הייחוס דורשים הרשאה מתועדת.' },
  { key: 's3.sound', stage: 3, agent: 'AI-10', title: 'תוכנית סאונד ו־Music Cue Sheet', deps: ['s3.storyboard'], review: 'AI-03', share: 0.02,
    outputs: [{ name: 'music_cue_sheet', kind: 'music_cue_sheet' }],
    brief: 'לסמן לכל שוט מוזיקה, שקט, אפקטים ואווירה, עם נקודות כניסה/יציאה ורישוי.',
    criteria: 'הדיאלוג לא מוסתר; לכל קטע יש תפקיד רגשי; הרישוי מתוכנן.' },
  { key: 's3.pacing', stage: 3, agent: 'AI-03', title: 'בדיקת קצב ובימוי של הסרט המקדים', deps: ['s3.storyboard', 's3.voice', 's3.sound'], review: 'HUMAN', share: 0.01,
    outputs: [{ name: 'pacing_review', kind: 'review' }],
    brief: 'לבדוק את ה־Animatic, הדיבוב והסאונד מול שפת הבימוי ולהחזיר הערות ממוקדות.',
    criteria: 'כל הערה מצביעה על שוט ועל שינוי מוגדר.' },
  // Stage 4 – animation
  { key: 's4.animation', stage: 4, agent: 'AI-07', title: 'תוכנית אנימציה ופוזות מפתח', deps: ['s3.pacing'], review: 'AI-03', share: 0.03,
    outputs: [{ name: 'animation_plan', kind: 'animation_plan' }],
    brief: 'לכל שוט: פוזות מפתח, תזמון, משקל, תנועה משנית, ושיטה (גנרטיבי או מבוקר) עם נימוק.',
    criteria: 'לכל פעולה יש הכנה ומשקל; השיטה מנומקת; תנועה לא משנה מאפיינים נעולים.' },
  { key: 's4.shot_packages', stage: 4, agent: 'AI-08', title: 'חבילות הפקה לשוטים (מנוע, פרומפט, הגדרות)', deps: ['s4.animation'], review: 'AI-07', share: 0.02,
    outputs: [{ name: 'shot_packages', kind: 'shot_packages' }],
    brief: 'לכל שוט: מנוע מומלץ ונימוק, פרומפט במבנה הקבוע, פריימי ייחוס, הגדרות והערכת עלות.',
    criteria: 'רק מנועים שאושרו לפרויקט; הפרומפט מצטט מאפיינים נעולים; העלות בתוך התקציב.' },
  { key: 's4.video', stage: 4, agent: 'AI-08', title: 'הפקת שוטי הווידאו', deps: ['s4.shot_packages'], review: 'AI-12', share: 0.45,
    outputs: [{ name: 'shots', kind: 'video', media: true }],
    brief: 'להפיק את השוטים במנועים המאושרים לפי החבילות, ולתעד לכל ניסיון מנוע, הגדרות ועלות.',
    criteria: 'השוטים תואמים לחבילות; הזהות נשמרה; כל ניסיון ועלות מתועדים.' },
  { key: 's4.continuity', stage: 4, agent: 'AI-12', title: 'בדיקת רציפות בין השוטים', deps: ['s4.video'], review: 'HUMAN', share: 0.01,
    outputs: [{ name: 'continuity_shots', kind: 'continuity_report' }],
    brief: 'להשוות כל שוט לספרי הדמויות והעולמות ולשוטים הסמוכים, ולדווח לפי שוט ופריים.',
    criteria: 'כל תקלה עם מיקום מדויק; וריאציות תקינות לא דווחו; מצוין מה נבדק בפועל.' },
  // Stage 5 – assembly
  { key: 's5.edit', stage: 5, agent: 'AI-11', title: 'עריכה: EDL, Rough Cut ו־Fine Cut', deps: ['s4.continuity'], review: 'AI-03', share: 0.04,
    outputs: [{ name: 'edl', kind: 'edl' }, { name: 'fine_cut', kind: 'video', media: true }],
    brief: 'להרכיב את הסרט מהגרסאות המאושרות בלבד, להתאים צבע וקצב ולבצע בדיקה טכנית.',
    criteria: 'כל שוט ב־EDL מאושר; אין קפיצות צבע; המפרט הטכני עומד ביעד.' },
  { key: 's5.audio', stage: 5, agent: 'AI-10', title: 'דיאלוגים, מוזיקה ואפקטים סופיים', deps: ['s4.continuity'], review: 'AI-11', share: 0.05,
    outputs: [{ name: 'dialogue_tracks', kind: 'audio', media: true }, { name: 'music_sfx_tracks', kind: 'audio', media: true }],
    brief: 'להפיק את הדיאלוגים (עם AI-09) ואת המוזיקה, האפקטים והאווירה בערוצים נפרדים.',
    criteria: 'קולות קבועים; הגייה נכונה; לכל קטע רישיון; ערוצים נפרדים.' },
  { key: 's5.qa', stage: 5, agent: 'AI-13', title: 'ביקורת איכות ותוכן', deps: ['s5.edit', 's5.audio'], review: 'HUMAN', share: 0.01,
    outputs: [{ name: 'qa_report', kind: 'qa_report' }],
    brief: 'לבדוק את הסרט המלא מול מדיניות התוכן, גיל היעד ותנאי האישור, ולהמליץ.',
    criteria: 'כל תקלה מסווגת; תקלה קריטית פוסלת; צוין מה נבדק בפועל.' },
  // Stage 6 – delivery
  { key: 's6.audit', stage: 6, agent: 'AI-14', title: 'בדיקת עלויות, זכויות וקבצים', deps: ['s5.qa'], review: 'HUMAN', share: 0.005,
    outputs: [{ name: 'ops_report', kind: 'ops_report' }],
    brief: 'להשוות עלויות לתקציב, לוודא זכויות מאומתות לכל נכס ולוודא שכל קובץ קיים.',
    criteria: 'אין חריגה לא מאושרת; לכל נכס בשימוש זכויות מאומתות; אין קובץ חסר.' },
  { key: 's6.final', stage: 6, agent: 'AI-01', title: 'דוח סופי למפיק', deps: ['s6.audit'], review: 'HUMAN', share: 0.005,
    outputs: [{ name: 'final_report', kind: 'final_report' }],
    brief: 'לסכם את ההפקה: מה הושלם, מה אושר, עלויות, זכויות, תקלות פתוחות והמלצה.',
    criteria: 'הדוח מפריד בין "הושלם טכנית" ל"אושר", ומציג כל החלטה פתוחה.' },
];

export const J = <T = any>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
export const money = (v: any) => Number(v || 0);

export async function projectSpent(projectId: number, taskId?: number) {
  const r = await db.filmCost.aggregate({ where: { projectId, ...(taskId ? { taskId } : {}) }, _sum: { amount: true } });
  return money(r._sum.amount);
}

export async function logEvent(projectId: number, taskId: number | null, actor: string, action: string, note = '', fromState = '', toState = '') {
  await db.filmEvent.create({ data: { projectId, taskId, actor, action, note: note.slice(0, 4000), fromState, toState } });
}

// Create the production tasks of the 6 stages for a project (idempotent: existing keys are kept).
export async function planProject(projectId: number, actor: string) {
  const p = await db.filmProject.findUniqueOrThrow({ where: { id: projectId } });
  const budget = money(p.budgetLimit);
  let created = 0;
  for (const t of PLAN) {
    const exists = await db.filmTask.findUnique({ where: { projectId_key: { projectId, key: t.key } } });
    if (exists) continue;
    await db.filmTask.create({ data: {
      projectId, key: t.key, stage: t.stage, agent: t.agent, title: t.title, reviewAgent: t.review,
      dependsOn: JSON.stringify(t.deps), expectedOutputs: JSON.stringify(t.outputs), creativeBrief: t.brief, acceptanceCriteria: t.criteria,
      budgetLimit: Math.round(budget * t.share * 100) / 100,
      constraints: 'אסור לשנות את העלילה, המסר, או מאפיינים נעולים של דמויות וסביבות שאושרו. אסור להחליף גרסה מאושרת.',
    } });
    created++;
  }
  await logEvent(projectId, null, actor, 'plan', `נוצרו ${created} משימות הפקה`);
  return created;
}

export type Actor = { kind: 'human'; userId: number } | { kind: 'agent'; id: string } | { kind: 'system' };
export const actorName = (a: Actor) => (a.kind === 'human' ? `human:${a.userId}` : a.kind === 'agent' ? a.id : 'system');

// The single entry point for status changes. Throws an Error with a Hebrew message when a rule blocks it.
export async function transition(taskId: number, to: Status, actor: Actor, note = '') {
  const t = await db.filmTask.findUniqueOrThrow({ where: { id: taskId }, include: { project: true, versions: true } });
  const from = t.status as Status;
  if (!nextStatuses(from).includes(to)) throw new Error(`מעבר לא חוקי: ${STATUS_HE[from]} → ${STATUS_HE[to]}`);
  const data: any = { status: to };

  if (to === 'READY') {
    const deps = J<string[]>(t.dependsOn, []);
    const depTasks = deps.length ? await db.filmTask.findMany({ where: { projectId: t.projectId, key: { in: deps } } }) : [];
    const open = depTasks.filter((d) => d.status !== 'APPROVED');
    if (open.length || depTasks.length < deps.length) throw new Error('המשימה תלויה במשימות שעדיין לא אושרו: ' + (open.map((d) => d.title).join(', ') || deps.join(', ')));
    if (!t.creativeBrief.trim() || !t.acceptanceCriteria.trim() || !J<any[]>(t.expectedOutputs, []).length) throw new Error('חוזה המשימה חסר: הוראות יצירתיות, תוצרים מחייבים ותנאי אישור הם חובה');
    // pin the approved versions of everything this task may read (production memory)
    const assets = await db.filmAsset.findMany({ where: { projectId: t.projectId, approvedVersion: { gt: 0 } } });
    data.approvedVersions = JSON.stringify(Object.fromEntries(assets.map((a) => [a.id, a.approvedVersion])));
    data.inputAssets = JSON.stringify(assets.map((a) => a.id));
  }
  if (to === 'RUNNING') {
    const spent = await projectSpent(t.projectId);
    if (money(t.project.budgetLimit) > 0 && spent >= money(t.project.budgetLimit)) throw new Error('תקציב הפרויקט נוצל במלואו – נדרשת החלטת מפיק');
    const tSpent = await projectSpent(t.projectId, t.id);
    if (money(t.budgetLimit) > 0 && tSpent >= money(t.budgetLimit)) throw new Error('תקציב המשימה נוצל – נדרשת החלטת מפיק');
    data.attempts = t.attempts + 1; data.blockedReason = '';
  }
  if (to === 'REVIEW') {
    const outs = J<Output[]>(t.expectedOutputs, []);
    const fresh = t.versions.filter((v) => v.status === 'draft');
    if (!fresh.length) throw new Error('אין תוצר שמור. תוצר מילולי בלבד אינו השלמת משימה – יש לשמור גרסה לכל תוצר מחייב');
    const assetIds = new Set(fresh.map((v) => v.assetId));
    const assets = await db.filmAsset.findMany({ where: { projectId: t.projectId, name: { in: outs.map((o) => o.name) } } });
    const missing = outs.filter((o) => !assets.some((a) => a.name === o.name && assetIds.has(a.id)));
    if (missing.length) throw new Error('חסרים תוצרים מחייבים: ' + missing.map((o) => o.name).join(', '));
    if (!t.selfReview.trim() && !note.trim()) throw new Error('נדרשת ביקורת עצמית לפני מסירה');
    if (note.trim() && !t.selfReview.trim()) data.selfReview = note;
  }
  if (to === 'APPROVED' || to === 'REVISION_REQUIRED') {
    const allowed = actor.kind === 'human' || (actor.kind === 'agent' && actor.id === t.reviewAgent);
    if (!allowed) throw new Error(`רק הסוכן הבודק (${t.reviewAgent}) או המפיק יכולים ${to === 'APPROVED' ? 'לאשר' : 'להחזיר לתיקון'}`);
    if (actor.kind === 'agent' && actor.id === t.agent) throw new Error('סוכן אינו יכול לאשר את התוצר של עצמו');
    if (to === 'REVISION_REQUIRED') { if (!note.trim()) throw new Error('יש לפרט מה לתקן'); data.revisionNotes = note; }
  }
  if (to === 'BLOCKED') { if (!note.trim()) throw new Error('יש לציין את סיבת החסימה'); data.blockedReason = note; data.runStartedAt = null; }
  if (['READY', 'RUNNING', 'REVISION_REQUIRED', 'DRAFT'].includes(to) && from === 'HUMAN_DECISION' && actor.kind !== 'human') throw new Error('רק המפיק מחליט על משימה שממתינה להחלטה');

  await db.filmTask.update({ where: { id: taskId }, data });
  if (to === 'APPROVED') {
    const drafts = t.versions.filter((v) => v.status === 'draft');
    for (const v of drafts) {
      await db.filmAssetVersion.update({ where: { id: v.id }, data: { status: 'approved', approvedBy: actorName(actor), approvedAt: new Date() } });
      await db.filmAsset.update({ where: { id: v.assetId }, data: { approvedVersion: v.version } });
    }
    await advanceStage(t.projectId);
  }
  if (to === 'REVISION_REQUIRED') {
    await db.filmAssetVersion.updateMany({ where: { taskId, status: 'draft' }, data: { status: 'rejected' } });
  }
  await logEvent(t.projectId, taskId, actorName(actor), 'status', note, from, to);
  // a blocked task always lands on the producer's desk
  if (to === 'BLOCKED') {
    await db.filmTask.update({ where: { id: taskId }, data: { status: 'HUMAN_DECISION' } });
    await logEvent(t.projectId, taskId, 'system', 'status', 'הועבר להחלטת המפיק', 'BLOCKED', 'HUMAN_DECISION');
  }
}

// Project stage = lowest stage that still has unapproved tasks.
export async function advanceStage(projectId: number) {
  const open = await db.filmTask.findFirst({ where: { projectId, status: { not: 'APPROVED' } }, orderBy: { stage: 'asc' } });
  const stage = open ? open.stage : 7;
  await db.filmProject.update({ where: { id: projectId }, data: { stage } });
}

// New immutable version of an asset (creates the asset on first use).
export async function addVersion(projectId: number, taskId: number | null, out: Output, v: { content?: string; storageKey?: string; mime?: string; size?: number; sha256?: string; meta?: any; createdBy: string }) {
  const asset = await db.filmAsset.upsert({
    where: { projectId_name: { projectId, name: out.name } },
    create: { projectId, name: out.name, kind: out.kind, media: !!out.media },
    update: {},
  });
  // optimistic retry on the (assetId, version) unique key
  for (let i = 0; i < 5; i++) {
    const last = await db.filmAssetVersion.findFirst({ where: { assetId: asset.id }, orderBy: { version: 'desc' } });
    const version = (last?.version || 0) + 1;
    try {
      const row = await db.filmAssetVersion.create({ data: {
        assetId: asset.id, version, taskId, content: v.content || '', storageKey: v.storageKey || '', mime: v.mime || (v.storageKey ? '' : 'text/markdown'),
        size: v.size || Buffer.byteLength(v.content || ''), sha256: v.sha256 || '', createdBy: v.createdBy, meta: JSON.stringify(v.meta || {}),
      } });
      await db.filmAsset.update({ where: { id: asset.id }, data: { currentVersion: version } });
      await logEvent(projectId, taskId, v.createdBy, 'version', `${out.name} v${version}`);
      return row;
    } catch (e: any) { if (e?.code !== 'P2002') throw e; }
  }
  throw new Error('לא ניתן ליצור גרסה חדשה (התנגשות)');
}

// Acceptance test scorecard (spec §8): 1–5 per domain; pass = ≥4 on the four key domains and no critical content issue.
export const SCORE_DOMAINS: [string, string, boolean][] = [
  ['characters', 'נאמנות לדמויות', true], ['motion', 'תנועה', true], ['story', 'הבנת הסיפור', true], ['edit', 'איכות העריכה', true],
  ['dialogue', 'דיאלוגים מובנים בעברית', false], ['sound', 'סאונד', false], ['versions', 'שמירת קבצים וגרסאות', false],
  ['issues', 'זיהוי והצגת תקלות', false], ['revision', 'תיקון שוט שנדחה', false], ['policy', 'מדיניות תוכן ותקציב', false],
];
export function scorecard(scoresJson: string) {
  const s = J<Record<string, number> & { critical?: boolean }>(scoresJson, {});
  const keyOk = SCORE_DOMAINS.filter(([, , key]) => key).every(([k]) => Number(s[k]) >= 4);
  const complete = SCORE_DOMAINS.every(([k]) => Number(s[k]) >= 1);
  return { scores: s, complete, pass: complete && keyOk && !s.critical };
}
