// Admin screens of the AI Film Studio (am=studio). Same string-rendering approach as the other admin screens.
import { db } from '@/lib/db';
import { A, AJ, esc, card, table, btn, actBtn, form, fText, fArea, fBool, fSelect, dt, tabs, badge } from './ui';
import { AGENTS, DEPARTMENTS, agentById, agentLabel } from '@/lib/studio/agents';
import { STAGES, STATUS_HE, STATUS_COLOR, PLAN, SCORE_DOMAINS, J, money, nextStatuses, projectSpent, scorecard, type Output, type Status } from '@/lib/studio/workflow';
import { STUDIO_MODEL, studioAiReady, isRunning } from '@/lib/studio/runner';

const usd = (v: any) => '$' + money(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const st = (s: string) => badge(STATUS_HE[s as Status] || s, STATUS_COLOR[s as Status] || 'secondary');
const pre = (s: string) => `<pre class="adm-pre" dir="auto" style="white-space:pre-wrap;max-height:70vh;overflow:auto">${esc(s)}</pre>`;
const AGENT_OPTS: [string, string][] = [...AGENTS.map((a) => [a.id, `${a.id} · ${a.he}`] as [string, string]), ['HUMAN', 'המפיק (אדם)']];
export const PROVIDER_HINT = 'anthropic, kling, seedance, veo, runway, ltx, elevenlabs, suno, ffmpeg, manual';

// ---------- projects ----------
export async function projects() {
  const list = await db.filmProject.findMany({ orderBy: { id: 'desc' }, include: { tasks: { select: { status: true } } } });
  const spent = await db.filmCost.groupBy({ by: ['projectId'], _sum: { amount: true } });
  const rows = list.map((p) => {
    const done = p.tasks.filter((t) => t.status === 'APPROVED').length;
    const waiting = p.tasks.filter((t) => t.status === 'HUMAN_DECISION').length;
    const s = money(spent.find((x) => x.projectId === p.id)?._sum.amount);
    return [
      `P-${p.id}`, `<a href="${A('studio', 'project', { id: p.id })}"><b>${esc(p.title)}</b></a>${p.isTest ? ' ' + badge('מבחן', 'info') : ''}${p.approvedAt ? ' ' + badge('אושר להפצה', 'success') : ''}`,
      p.stage > 6 ? badge('הושלם', 'success') : `${p.stage}. ${esc(STAGES[p.stage - 1]?.title || '')}`,
      p.tasks.length ? `${done}/${p.tasks.length}${waiting ? ' ' + badge(`${waiting} להחלטתך`, 'danger') : ''}` : '<span class="text-muted">טרם תוכנן</span>',
      `${usd(s)} / ${usd(p.budgetLimit)}`, p.aiEnabled ? badge('מאושר', 'success') : badge('לא מאושר', 'secondary'), dt(p.updatedAt),
    ];
  });
  const create = form(AJ('studio', 'create_project'), `<div class="row g-2"><div class="col-md-6">${fText('title', 'שם הסרט', '', 'text', 'required')}</div><div class="col-md-3">${fText('budgetLimit', 'תקציב (USD)', '50', 'number', 'step="0.01" min="0"')}</div><div class="col-md-3">${fText('audience', 'קהל יעד', 'ילדים 4–9')}</div></div>${fArea('story', 'הסיפור (טקסט מלא)', '', 6)}`, 'פתיחת פרויקט');
  return card('פרויקטי סרטים', table(['מזהה', 'סרט', 'שלב', 'משימות שאושרו', 'הוצאה / תקציב', 'שימוש ב־AI', 'עודכן'], rows), btn(A('studio', 'agents'), 'צוות האולפן', 'btn-light')) + card('פרויקט חדש', create);
}

function stageBoard(p: any, tasks: any[]) {
  return STAGES.map((s) => {
    const ts = tasks.filter((t) => t.stage === s.n);
    const done = ts.length && ts.every((t) => t.status === 'APPROVED');
    return `<div class="adm-card card mb-3"><div class="card-header d-flex justify-content-between align-items-center"><b>שלב ${s.n} · ${esc(s.title)}</b><span class="small text-muted">תוצר: ${esc(s.goal)} ${done ? badge('הושלם', 'success') : p.stage === s.n ? badge('שלב נוכחי', 'primary') : ''}</span></div><div class="card-body p-0">${table(['משימה', 'סוכן', 'בודק', 'מצב', 'תקציב'], ts.map((t) => [
      `<a href="${A('studio', 'task', { id: t.id })}">${esc(t.title)}</a> <small class="text-muted">T-${t.id}</small>`, esc(agentLabel(t.agent)), esc(agentLabel(t.reviewAgent)),
      st(t.status) + (t.runStartedAt ? ' ' + badge('רץ…', 'primary') : ''), usd(t.budgetLimit),
    ]))}</div></div>`;
  }).join('');
}

export async function project(id: number) {
  const p = await db.filmProject.findUnique({ where: { id }, include: {
    tasks: { orderBy: [{ stage: 'asc' }, { id: 'asc' }] }, assets: { orderBy: { id: 'asc' }, include: { versions: { orderBy: { version: 'desc' } } } },
    costs: { orderBy: { id: 'desc' } }, rights: { orderBy: { id: 'asc' } }, events: { orderBy: { id: 'desc' }, take: 300 },
  } });
  if (!p) return card('לא נמצא', 'הפרויקט לא קיים.');
  const spent = await projectSpent(id);
  const waiting = p.tasks.filter((t) => t.status === 'HUMAN_DECISION' || (t.status === 'REVIEW' && t.reviewAgent === 'HUMAN'));
  const over = money(p.budgetLimit) > 0 && spent > money(p.budgetLimit);

  const head = `<div class="row g-3 mb-3">
    <div class="col-6 col-md-3"><div class="card adm-card p-3"><div class="small text-muted">שלב</div><div class="fs-5">${p.stage > 6 ? 'הושלם' : `${p.stage} · ${esc(STAGES[p.stage - 1].title)}`}</div></div></div>
    <div class="col-6 col-md-3"><div class="card adm-card p-3"><div class="small text-muted">משימות שאושרו</div><div class="fs-5">${p.tasks.filter((t) => t.status === 'APPROVED').length}/${p.tasks.length}</div></div></div>
    <div class="col-6 col-md-3"><div class="card adm-card p-3"><div class="small text-muted">הוצאה / תקציב</div><div class="fs-5 ${over ? 'text-danger' : ''}">${usd(spent)} / ${usd(p.budgetLimit)}</div></div></div>
    <div class="col-6 col-md-3"><div class="card adm-card p-3"><div class="small text-muted">שימוש ב־Claude API</div><div class="fs-6">${p.aiEnabled ? badge('מאושר ע״י המפיק', 'success') : badge('לא מאושר', 'secondary')} ${studioAiReady() ? '' : badge('חסר ANTHROPIC_API_KEY', 'danger')}</div></div></div></div>`;
  const decisions = waiting.length ? card('ממתין להחלטתך', table(['משימה', 'מצב', 'סיבה'], waiting.map((t) => [`<a href="${A('studio', 'task', { id: t.id })}">${esc(t.title)}</a>`, st(t.status), esc(t.blockedReason || (t.status === 'REVIEW' ? 'בדיקת המפיק' : ''))]))) : '';

  const overview = p.tasks.length ? stageBoard(p, p.tasks) : `<div class="text-center py-4"><p>טרם נוצרו משימות. AI-01 יפתח ${PLAN.length} משימות בששת שלבי ההפקה, עם תלויות, בודקים ותקציב לכל משימה.</p>${actBtn(AJ('studio', 'plan', id), 'יצירת משימות ההפקה', '', 'btn-primary')}</div>`;

  const settings = form(AJ('studio', 'save_project', id), `<div class="row g-2"><div class="col-md-6">${fText('title', 'שם הסרט', p.title, 'text', 'required')}</div><div class="col-md-3">${fText('budgetLimit', 'תקציב (USD)', money(p.budgetLimit), 'number', 'step="0.01" min="0"')}</div><div class="col-md-3">${fText('audience', 'קהל יעד', p.audience)}</div></div>
    ${fArea('story', 'הסיפור (טקסט מלא)', p.story, 10)}
    <div class="alert alert-warning small">הפעלת המתג הבא מאשרת לשלוח ל־Claude API (Anthropic) את הסיפור, חוזי המשימות והנכסים המאושרים של הפרויקט הזה בלבד, בכל פעם שתלחצו "הפעלת הסוכן". אין שליחה אוטומטית ואין חריגה מהתקציב.</div>
    ${fBool('aiEnabled', 'אני מאשר שימוש ב־Claude API לפרויקט הזה', p.aiEnabled)}
    ${fText('providers', `מנועים חיצוניים מאושרים לפרויקט (מופרד בפסיקים: ${PROVIDER_HINT})`, J<string[]>(p.providers, []).join(', '))}
    ${fArea('notes', 'הערות והחלטות הפקה', p.notes, 4)}`);

  const assets = table(['נכס', 'סוג', 'גרסה נוכחית', 'גרסה מאושרת', 'גרסאות'], p.assets.map((a) => [
    `<b>${esc(a.name)}</b>`, esc(a.kind) + (a.media ? ' ' + badge('מדיה', 'info') : ''), `v${a.currentVersion}`, a.approvedVersion ? badge('v' + a.approvedVersion, 'success') : '—',
    a.versions.map((v) => `<a href="${A('studio', 'version', { id: v.id })}" class="me-1">${badge('v' + v.version, v.status === 'approved' ? 'success' : v.status === 'rejected' ? 'danger' : 'secondary')}</a>`).join(''),
  ]));

  const taskOpts: [string, string][] = [['', '—'], ...p.tasks.map((t) => [String(t.id), `T-${t.id} ${t.title}`] as [string, string])];
  const costs = table(['תאריך', 'משימה', 'ספק', 'סוג', 'יחידות', 'סכום', 'הערה'], p.costs.map((c) => [dt(c.createdAt), c.taskId ? `<a href="${A('studio', 'task', { id: c.taskId })}">T-${c.taskId}</a>` : '', esc(c.provider), esc(c.kind), `<small dir="ltr">${esc(c.units)}</small>`, usd(c.amount), esc(c.note)]))
    + `<h6 class="mt-4">רישום הוצאה ממנוע חיצוני</h6>` + form(AJ('studio', 'add_cost', id), `<div class="row g-2"><div class="col-md-3">${fSelect('taskId', 'משימה', '', taskOpts)}</div><div class="col-md-2">${fText('provider', 'ספק', '', 'text', 'required')}</div><div class="col-md-2">${fSelect('kind', 'סוג', 'video', [['video', 'וידאו'], ['image', 'תמונה'], ['voice', 'קול'], ['music', 'מוזיקה'], ['text', 'טקסט'], ['other', 'אחר']])}</div><div class="col-md-2">${fText('units', 'יחידות', '')}</div><div class="col-md-1">${fText('amount', 'USD', '', 'number', 'step="0.0001" min="0" required')}</div><div class="col-md-2">${fText('note', 'הערה', '')}</div></div>`, 'רישום');
  const rights = table(['נושא', 'בעלים', 'רישיון', 'מסחרי', 'אסמכתה', 'מאומת', ''], p.rights.map((r) => [esc(r.subject), esc(r.owner), esc(r.license), r.commercial ? '✔' : '✘', r.proofKey ? `<code dir="ltr">${esc(r.proofKey)}</code>` : '—', r.verified ? badge('מאומת', 'success') : badge('לא מאומת', 'warning'),
    r.verified ? '' : actBtn(AJ('studio', 'verify_right', r.id), 'אימות', 'לאשר שבדקתם את ההסכם/הרישיון?', 'btn-light-primary')]))
    + `<h6 class="mt-4">רישום זכויות</h6>` + form(AJ('studio', 'add_right', id), `<div class="row g-2"><div class="col-md-3">${fSelect('subject', 'נושא', 'story', [['story', 'סיפור'], ['illustration', 'איורים'], ['voice', 'קול'], ['music', 'מוזיקה'], ['engine', 'פלט מנוע AI'], ['font', 'גופן'], ['other', 'אחר']])}</div><div class="col-md-3">${fText('owner', 'בעל הזכויות', '', 'text', 'required')}</div><div class="col-md-3">${fText('license', 'רישיון / הסכם', '')}</div><div class="col-md-3">${fText('proofKey', 'אסמכתה (מפתח קובץ בדלי)', '')}</div></div>${fBool('commercial', 'כולל שימוש מסחרי', false)}${fArea('notes', 'הערות', '', 2)}`, 'רישום');

  const sc = scorecard(p.scores);
  const score = form(AJ('studio', 'save_scores', id), `<p class="small text-muted">מבחן הקבלה (סצנה של 45–60 שניות): ציון 1–5 לכל תחום. נדרש 4 לפחות בתחומים המסומנים ★, ללא תקלות תוכן קריטיות. אלה יעדי קבלה, לא טענה שהמודלים כבר עומדים בהם.</p><div class="row g-2">${SCORE_DOMAINS.map(([k, l, key]) => `<div class="col-6 col-md-3">${fSelect(k, (key ? '★ ' : '') + l, sc.scores[k] || '', [['', '—'], ...[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])])}</div>`).join('')}</div>${fBool('critical', 'נמצאה תקלת תוכן קריטית', sc.scores.critical)}
    <div class="mb-3">${sc.complete ? (sc.pass ? badge('עבר את מבחן הקבלה', 'success') : badge('לא עבר', 'danger')) : badge('טרם הושלם', 'secondary')}</div>`, 'שמירת ציונים');

  const log = table(['זמן', 'משימה', 'מבצע', 'פעולה', 'מעבר', 'הערה'], p.events.map((e) => [dt(e.createdAt), e.taskId ? `<a href="${A('studio', 'task', { id: e.taskId })}">T-${e.taskId}</a>` : '', esc(e.actor), esc(e.action), e.fromState ? `${esc(STATUS_HE[e.fromState as Status] || e.fromState)} → ${esc(STATUS_HE[e.toState as Status] || e.toState)}` : '', `<small style="white-space:pre-wrap">${esc(e.note)}</small>`]));

  const allApproved = p.tasks.length > 0 && p.tasks.every((t) => t.status === 'APPROVED');
  const finalBox = p.approvedAt ? `<div class="alert alert-success">הסרט אושר להפצה ב־${dt(p.approvedAt)}.</div>`
    : allApproved ? `<div class="alert alert-info d-flex justify-content-between align-items-center flex-wrap gap-2"><span>כל המשימות אושרו. אישור ההפצה הוא החלטה שלך בלבד.</span>${actBtn(AJ('studio', 'approve_film', id), 'אישור הסרט להפצה', 'לאשר את הסרט להפצה? הפעולה נרשמת ביומן.', 'btn-success')}</div>` : '';

  return `<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><h2 class="h4 m-0">${esc(p.title)} <small class="text-muted">P-${p.id}</small></h2><div class="d-flex gap-2">${btn(A('studio', 'projects'), 'כל הפרויקטים', 'btn-light')}${p.tasks.length ? actBtn(AJ('studio', 'plan', id), 'השלמת משימות חסרות', '', 'btn-light') : ''}</div></div>`
    + head + finalBox + decisions
    + card('הפקה', tabs('prj', [['board', 'שלבי ההפקה', overview], ['settings', 'הגדרות ואישורים', settings], ['assets', 'נכסים וגרסאות', assets], ['budget', 'תקציב', costs], ['rights', 'זכויות', rights], ['score', 'מבחן קבלה', score], ['log', 'יומן הפקה', log]]));
}

// ---------- task ----------
export async function task(id: number) {
  const t = await db.filmTask.findUnique({ where: { id }, include: { project: true, versions: { include: { asset: true }, orderBy: { id: 'desc' } } } });
  if (!t) return card('לא נמצא', 'המשימה לא קיימת.');
  const events = await db.filmEvent.findMany({ where: { taskId: id }, orderBy: { id: 'desc' }, take: 200 });
  const agent = agentById(t.agent);
  const outs = J<Output[]>(t.expectedOutputs, []);
  const spent = await projectSpent(t.projectId, id);
  const live = t.runStartedAt && isRunning(id);
  const stale = t.runStartedAt && !live;

  const actions: string[] = [];
  const canRun = ['READY', 'REVISION_REQUIRED'].includes(t.status) || (t.status === 'RUNNING' && !t.runStartedAt);
  if (canRun && agent) actions.push(actBtn(AJ('studio', 'run', id), `הפעלת ${agent.id} (${esc(STUDIO_MODEL)})`, `להפעיל את ${agent.he} על Claude API? תקציב המשימה שנותר: ${usd(money(t.budgetLimit) - spent)}`, 'btn-primary'));
  if (t.status === 'REVIEW' && agentById(t.reviewAgent) && !t.runStartedAt) actions.push(actBtn(AJ('studio', 'review', id), `בדיקה ע״י ${t.reviewAgent}`, `להפעיל את ${agentLabel(t.reviewAgent)} לבדיקת התוצר?`, 'btn-warning'));
  if (stale) actions.push(actBtn(AJ('studio', 'release', id), 'שחרור הרצה תקועה', 'ההרצה לא פעילה בשרת (ייתכן שהשרת אותחל). לשחרר ולהעביר להחלטתך?', 'btn-light-danger'));

  const nexts = nextStatuses(t.status);
  const moveForm = nexts.length ? form(AJ('studio', 'transition', id), `<div class="row g-2"><div class="col-md-4">${fSelect('to', 'מעבר למצב', nexts[0], nexts.map((s) => [s, STATUS_HE[s]] as [string, string]))}</div><div class="col-md-8">${fArea('note', 'הערה / הערות תיקון / סיבה', '', 2)}</div></div>`, 'עדכון מצב') : '';

  const contract = form(AJ('studio', 'save_task', id), `<div class="row g-2">
    <div class="col-md-6">${fText('title', 'כותרת', t.title)}</div><div class="col-md-2">${fText('sceneId', 'Scene ID', t.sceneId)}</div><div class="col-md-2">${fText('shotId', 'Shot ID', t.shotId)}</div><div class="col-md-2">${fText('budgetLimit', 'Budget Limit (USD)', money(t.budgetLimit), 'number', 'step="0.01" min="0"')}</div>
    <div class="col-md-6">${fSelect('agent', 'Assigned Agent', t.agent, AGENT_OPTS.filter(([k]) => k !== 'HUMAN'))}</div><div class="col-md-6">${fSelect('reviewAgent', 'Review Agent', t.reviewAgent, AGENT_OPTS)}</div></div>
    ${fArea('creativeBrief', 'Creative Brief', t.creativeBrief, 4)}${fArea('technicalReq', 'Technical Requirements', t.technicalReq, 3)}${fArea('constraints', 'Constraints – מה אסור לשנות', t.constraints, 3)}
    ${fArea('expectedOutputs', 'Expected Outputs (JSON: [{"name","kind","media"}])', JSON.stringify(outs, null, 1), 4)}${fArea('acceptanceCriteria', 'Acceptance Criteria', t.acceptanceCriteria, 3)}
    <div class="small text-muted mb-3">Task ID: T-${t.id} · Project: P-${t.projectId} · תלויות: ${esc(J<string[]>(t.dependsOn, []).join(', ') || 'אין')} · ניסיונות: ${t.attempts} · גרסאות מאושרות שננעלו בכניסה ל"מוכנה": <code dir="ltr">${esc(t.approvedVersions)}</code></div>`,
    'שמירת חוזה');
  const contractNote = ['DRAFT', 'HUMAN_DECISION', 'READY'].includes(t.status) ? (t.status === 'READY' ? '<div class="alert alert-light small">שמירת שינוי בחוזה תחזיר את המשימה ל"טיוטה".</div>' : '') : '<div class="alert alert-light small">החוזה נעול בזמן ביצוע, בדיקה ואחרי אישור. שינוי מחייב החלטת מפיק.</div>';

  const versions = table(['תוצר', 'גרסה', 'מצב', 'נוצר ע״י', 'זמן', ''], t.versions.map((v) => [esc(v.asset.name), 'v' + v.version, badge(v.status === 'approved' ? 'מאושר' : v.status === 'rejected' ? 'נדחה' : 'טיוטה', v.status === 'approved' ? 'success' : v.status === 'rejected' ? 'danger' : 'secondary'), esc(v.createdBy), dt(v.createdAt), `<a href="${A('studio', 'version', { id: v.id })}">צפייה</a>`]));
  const providers = J<string[]>(t.project.providers, []);
  const media = outs.filter((o) => o.media);
  const upload = media.length && t.status === 'RUNNING' && !t.runStartedAt ? `<h6 class="mt-4">העלאת קובצי מדיה ממנוע מאושר</h6>${providers.length ? '' : '<div class="alert alert-warning small">לא אושר אף מנוע חיצוני לפרויקט (הגדרות הפרויקט).</div>'}
    ${media.map((o) => `<div class="border rounded p-3 mb-2" data-studio-box><b>${esc(o.name)}</b> <small class="text-muted">(${esc(o.kind)})</small>
      <div class="row g-2 mt-1"><div class="col-md-3">${fSelect('engine', 'מנוע', providers[0] || '', providers.map((x) => [x, x] as [string, string]))}</div><div class="col-md-3">${fText('cost', 'עלות (USD)', '', 'number', 'step="0.0001" min="0"')}</div><div class="col-md-6">${fText('settings', 'הגדרות / seed / פרומפט', '')}</div></div>
      <label class="btn btn-light border">בחירת קובץ<input type="file" hidden data-studio-upload="${esc(o.name)}" data-project="${t.projectId}" data-task="${t.id}"></label>
      <div class="progress mt-2 d-none"><div class="progress-bar" style="width:0%">0%</div></div></div>`).join('')}` : '';

  const reviewTxt = `<h6>ביקורת עצמית של המבצע</h6>${t.selfReview ? pre(t.selfReview) : '<p class="text-muted">אין עדיין.</p>'}${t.revisionNotes ? `<h6 class="mt-3">הערות תיקון אחרונות</h6>${pre(t.revisionNotes)}` : ''}${t.blockedReason ? `<h6 class="mt-3">סיבת חסימה</h6>${pre(t.blockedReason)}` : ''}`;
  const log = table(['זמן', 'מבצע', 'פעולה', 'מעבר', 'הערה'], events.map((e) => [dt(e.createdAt), esc(e.actor), esc(e.action), e.fromState ? `${esc(STATUS_HE[e.fromState as Status] || e.fromState)} → ${esc(STATUS_HE[e.toState as Status] || e.toState)}` : '', `<small style="white-space:pre-wrap">${esc(e.note)}</small>`]));

  const top = `<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div class="small"><a href="${A('studio', 'project', { id: t.projectId })}">${esc(t.project.title)}</a> · שלב ${t.stage} · ${esc(STAGES[t.stage - 1]?.title || '')}</div><h2 class="h4 m-0">${esc(t.title)} <small class="text-muted">T-${t.id}</small> ${st(t.status)}</h2><div class="small text-muted">${esc(agentLabel(t.agent))} → בודק: ${esc(agentLabel(t.reviewAgent))} · הוצאה: ${usd(spent)} / ${usd(t.budgetLimit)}</div></div><div class="d-flex gap-2 flex-wrap">${actions.join('')}</div></div>`
    + (live ? `<div class="alert alert-primary">הסוכן עובד על המשימה מאז ${dt(t.runStartedAt)}. הדף מתרענן אוטומטית.</div><meta http-equiv="refresh" content="15">` : '')
    + (t.status === 'RUNNING' && !t.runStartedAt && media.length ? '<div class="alert alert-info">תוצרי הטקסט נשמרו. העלו את קובצי המדיה מהמנוע המאושר, ואז העבירו ל"בבדיקה".</div>' : '');

  return top + card('משימה', tabs('tsk', [['outputs', 'תוצרים וגרסאות', versions + upload], ['status', 'מצב ומעברים', moveForm || '<p class="text-muted">אין מעברים זמינים ממצב זה.</p>'], ['contract', 'חוזה המשימה', contractNote + contract], ['review', 'ביקורת והערות', reviewTxt], ['log', 'יומן', log]]));
}

export async function version(id: number) {
  const v = await db.filmAssetVersion.findUnique({ where: { id }, include: { asset: true, task: true } });
  if (!v) return card('לא נמצא', 'הגרסה לא קיימת.');
  const body = v.storageKey ? `<p><code dir="ltr">${esc(v.storageKey)}</code> · ${esc(v.mime)} · ${(v.size / 1048576).toFixed(1)}MB</p><a class="btn btn-primary btn-sm" href="${AJ('studio', 'file', v.id)}" target="_blank">פתיחת הקובץ</a>` : pre(v.content);
  return card(`${esc(v.asset.name)} v${v.version}`, `<p class="small text-muted">${esc(v.asset.kind)} · נוצר ע״י ${esc(v.createdBy)} · ${dt(v.createdAt)} · מצב: ${esc(v.status)}${v.approvedBy ? ` · אושר ע״י ${esc(v.approvedBy)} ${dt(v.approvedAt)}` : ''}</p>${body}<h6 class="mt-3">מטא־נתונים</h6>${pre(JSON.stringify(J(v.meta, {}), null, 2))}`,
    (v.taskId ? btn(A('studio', 'task', { id: v.taskId }), 'למשימה', 'btn-light') : '') + btn(A('studio', 'project', { id: v.asset.projectId }), 'לפרויקט', 'btn-light'));
}

// ---------- crew ----------
export function agents() {
  return DEPARTMENTS.map((d) => card(esc(d), `<div class="row g-3">${AGENTS.filter((a) => a.dept === d).map((a) => `<div class="col-md-6"><div class="border rounded p-3 h-100"><div class="d-flex justify-content-between"><b>${a.id} · ${esc(a.he)}</b>${badge(a.runsOn === 'claude' ? 'Claude' : a.runsOn === 'mixed' ? 'Claude + מנוע חיצוני' : 'מנוע חיצוני', a.runsOn === 'claude' ? 'success' : 'info')}</div><div class="small text-muted" dir="ltr">${esc(a.role)}</div><p class="small mt-2 mb-2">${esc(a.mission)}</p><a href="${A('studio', 'agent', { agent: a.id })}">כרטיס התפקיד ←</a></div></div>`).join('')}</div>`)).join('');
}

export function agent(code: string) {
  const a = agentById(code);
  if (!a) return card('לא נמצא', 'סוכן לא מוכר.');
  const li = (xs: string[], ol = false) => `<${ol ? 'ol' : 'ul'} class="small">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`;
  return card(`${a.id} · ${esc(a.he)} <small class="text-muted" dir="ltr">${esc(a.role)}</small>`, `<p>${esc(a.mission)}</p><p class="small"><b>אחריות:</b> ${esc(a.responsibility)}</p>
    <div class="row"><div class="col-md-6"><h6>כישורים</h6>${li(a.skills)}<h6>תוצרים</h6>${li(a.outputs)}</div><div class="col-md-6"><h6>שיטת עבודה</h6>${li(a.method, true)}<h6>בדיקה עצמית לפני מסירה</h6>${li(a.selfCheck)}</div></div>
    <h6>מבחן כשירות</h6><p class="small">${esc(a.test)}</p>${a.engines?.length ? `<p class="small"><b>מנועים חיצוניים:</b> ${esc(a.engines.join(', '))} – רק אחרי אישור המפיק לפרויקט.</p>` : ''}
    ${actBtn(AJ('studio', 'competency', 0) + '?agent=' + a.id, 'פתיחת פרויקט מבחן כשירות', `לפתוח פרויקט מבחן עבור ${a.id}? שימוש ב־AI ייפתח רק אחרי שתאשרו אותו בהגדרות הפרויקט.`, 'btn-light-primary')}`,
    btn(A('studio', 'agents'), 'כל הצוות', 'btn-light'));
}
