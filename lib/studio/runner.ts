// Runs a studio task (or its review) on the Claude API.
// Guard rails, all enforced here before any request is sent:
//  - the producer approved AI use for the project (FilmProject.aiEnabled) and ANTHROPIC_API_KEY is set;
//  - the request can't cost more than what's left in the task and project budgets (max_tokens is derived from it);
//  - the agent only sees the project's story, the task contract and the pinned approved versions (production memory);
//  - every deliverable is stored as a new immutable asset version, every request is logged with its real cost and model.
// Media (images, video, voice, music) is never generated here: the agent prepares the package and the files
// are uploaded from an engine the producer approved.
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { AGENTS, COMMON_RULES, agentById, type Agent } from './agents';
import { J, money, projectSpent, logEvent, transition, addVersion, type Output } from './workflow';

export const STUDIO_MODEL = process.env.STUDIO_MODEL || 'claude-opus-5-5';
export const studioAiReady = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// USD per 1M tokens [input, output]. Unknown models are priced conservatively.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25], 'claude-opus-4-7': [5, 25],
  'claude-sonnet-5-5': [2, 10], 'claude-sonnet-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-2': [8, 40], 'claude-fable-5-1': [10, 50],
};
const priceOf = (model: string): [number, number] => PRICES[model] || PRICES[Object.keys(PRICES).find((k) => model.startsWith(k)) || ''] || [10, 50];
// budget guard uses the most expensive model the default fallback chain may route to
const GUARD: [number, number] = [5, 25];
const MAX_INPUT_CHARS = 1_500_000;

function usageCost(model: string, u: any) {
  const [pi, po] = priceOf(model);
  const input = (u?.input_tokens || 0) + (u?.cache_creation_input_tokens || 0) * 1.25 + (u?.cache_read_input_tokens || 0) * 0.1;
  return { usd: (input * pi + (u?.output_tokens || 0) * po) / 1e6, units: `in ${u?.input_tokens || 0} (+cache w ${u?.cache_creation_input_tokens || 0} / r ${u?.cache_read_input_tokens || 0}) / out ${u?.output_tokens || 0} tokens` };
}

function agentSystem(a: Agent, mode: 'work' | 'review') {
  return [
    `אתה ${a.id} – ${a.role} (${a.he}) באולפן הסרטים של GREENTEC, אולפן אנימציה לסרטי ילדים לציבור החרדי.`,
    `מחלקה: ${a.dept}.`, `המשימה המקצועית שלך: ${a.mission}`, `אחריות: ${a.responsibility}`,
    `כישורים:\n${a.skills.map((s) => '- ' + s).join('\n')}`,
    `שיטת העבודה שלך (לפי הסדר):\n${a.method.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    `בדיקה עצמית לפני מסירה:\n${a.selfCheck.map((s) => '- ' + s).join('\n')}`,
    `כללים לכל אנשי הצוות:\n${COMMON_RULES.map((s) => '- ' + s).join('\n')}`,
    mode === 'review'
      ? 'במשימה הזו אתה הסוכן הבודק. אתה בודק תוצר של סוכן אחר מול חוזה המשימה ותנאי האישור. אתה לא משכתב את התוצר – אתה מחליט ומנמק. "approve" רק כשכל תנאי האישור מתקיימים ואין תקלה קריטית או גבוהה. "revise" עם הערות תיקון ממוקדות שהמבצע יכול לבצע. "escalate" כשההחלטה שייכת למפיק (זכויות, תקציב, מדיניות, או חוסר מידע).'
      : 'כתוב את התוצרים בעברית (מונחים מקצועיים באנגלית מותרים). תוצר צריך להיות שלם ומוכן לשימוש המחלקה הבאה, לא תקציר.',
  ].join('\n\n');
}

type Ctx = { text: string; chars: number };
async function buildContext(taskId: number): Promise<Ctx & { task: any; project: any; outs: Output[] }> {
  const task = await db.filmTask.findUniqueOrThrow({ where: { id: taskId }, include: { project: true } });
  const project = task.project;
  const outs = J<Output[]>(task.expectedOutputs, []);
  const pinned = J<Record<string, number>>(task.approvedVersions, {});
  const ids = Object.keys(pinned).map(Number);
  const assets = ids.length ? await db.filmAsset.findMany({ where: { id: { in: ids } } }) : [];
  const parts: string[] = [];
  parts.push(`# הפרויקט\nשם: ${project.title}\nקהל יעד: ${project.audience || 'לא צוין'}\n\n## הסיפור המקורי\n${project.story || '(לא הוזן סיפור)'}`);
  parts.push(`# חוזה המשימה\nTask ID: T-${task.id} (${task.key})\nProject ID: P-${project.id}\nScene / Shot: ${task.sceneId || '-'} / ${task.shotId || '-'}\nAssigned Agent: ${task.agent}\nReview Agent: ${task.reviewAgent}\nכותרת: ${task.title}\n\n## Creative Brief\n${task.creativeBrief}\n\n## Technical Requirements\n${task.technicalReq || '-'}\n\n## Constraints (אסור לשנות)\n${task.constraints || '-'}\n\n## Expected Outputs\n${outs.map((o) => `- ${o.name} (${o.kind}${o.media ? ', קובץ מדיה ממנוע חיצוני' : ''})`).join('\n')}\n\n## Acceptance Criteria\n${task.acceptanceCriteria}\n\n## Budget Limit\n$${money(task.budgetLimit).toFixed(2)}`);
  if (assets.length) {
    const versions = await db.filmAssetVersion.findMany({ where: { OR: assets.map((a) => ({ assetId: a.id, version: pinned[a.id] })) } });
    parts.push('# נכסים מאושרים (גרסאות נעולות – זה זיכרון ההפקה)');
    for (const a of assets) {
      const v = versions.find((x) => x.assetId === a.id);
      if (!v) continue;
      parts.push(a.media
        ? `## ${a.name} v${v.version} (${a.kind}, קובץ מדיה – לא צורף, אין לך גישה לתוכן החזותי/הקולי)\nמטא־נתונים: ${v.meta}`
        : `## ${a.name} v${v.version} (${a.kind})\n${v.content}`);
    }
  } else parts.push('# נכסים מאושרים\nאין עדיין נכסים מאושרים בפרויקט.');
  const text = parts.join('\n\n');
  return { text, chars: text.length, task, project, outs };
}

async function guardBudget(task: any, project: any, inputChars: number) {
  if (!project.aiEnabled) throw new Error('המפיק לא אישר שליחת חומרי הפרויקט ל־Claude API (הגדרות הפרויקט)');
  if (!studioAiReady()) throw new Error('ANTHROPIC_API_KEY לא הוגדר במשתני הסביבה (Railway)');
  if (inputChars > MAX_INPUT_CHARS) throw new Error(`חומרי הקלט גדולים מדי (${inputChars.toLocaleString()} תווים). יש לפצל את המשימה – לא נשלח קלט מקוצר`);
  const projLeft = money(project.budgetLimit) > 0 ? money(project.budgetLimit) - (await projectSpent(project.id)) : Infinity;
  const taskLeft = money(task.budgetLimit) > 0 ? money(task.budgetLimit) - (await projectSpent(project.id, task.id)) : Infinity;
  const left = Math.min(projLeft, taskLeft);
  if (!Number.isFinite(left)) throw new Error('לא הוגדר תקציב לפרויקט או למשימה – אין הרצה בלי תקרת הוצאה');
  const inTokens = Math.ceil(inputChars / 2) + 3000; // Hebrew ≈ 2 chars/token, conservative
  const inCost = (inTokens * GUARD[0]) / 1e6;
  const maxOut = Math.floor(((left - inCost) * 1e6) / GUARD[1]);
  if (maxOut < 8000) throw new Error(`לא נשאר מספיק תקציב להרצה (נותרו $${left.toFixed(2)}; נדרשים לפחות $${(inCost + (8000 * GUARD[1]) / 1e6).toFixed(2)})`);
  return Math.min(64000, maxOut);
}

async function callClaude(system: string, user: string, schema: any, maxTokens: number) {
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: STUDIO_MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // on a safety decline the API retries on a suitable model; response.model says who answered
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  const cost = usageCost(msg.model, msg.usage);
  if (msg.stop_reason === 'refusal') return { msg, cost, error: `המודל סירב לבקשה (${msg.stop_details?.category || 'ללא קטגוריה'}): ${msg.stop_details?.explanation || ''}` };
  if (msg.stop_reason === 'max_tokens') return { msg, cost, error: 'התוצר נקטע בתקרת האורך שהתקציב מאפשר – לא נשמר תוצר חלקי' };
  const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  try { return { msg, cost, data: JSON.parse(text) }; } catch { return { msg, cost, error: 'התשובה לא הייתה במבנה המוסכם' }; }
}

const WORK_SCHEMA = (docNames: string[], mediaNames: string[]) => ({
  type: 'object', additionalProperties: false,
  required: ['deliverables', 'media_requests', 'self_review', 'needs_human_decision', 'human_question'],
  properties: {
    deliverables: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'format', 'content'], properties: {
      name: { type: 'string', enum: docNames.length ? docNames : ['none'] }, format: { type: 'string', enum: ['markdown', 'json'] }, content: { type: 'string' } } } },
    media_requests: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['output', 'engine_type', 'items'], properties: {
      output: { type: 'string', enum: mediaNames.length ? mediaNames : ['none'] }, engine_type: { type: 'string' },
      items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'prompt', 'notes'], properties: { id: { type: 'string' }, prompt: { type: 'string' }, notes: { type: 'string' } } } } } } },
    self_review: { type: 'object', additionalProperties: false, required: ['criteria', 'issues', 'uncertainties'], properties: {
      criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['criterion', 'met', 'note'], properties: { criterion: { type: 'string' }, met: { type: 'boolean' }, note: { type: 'string' } } } },
      issues: { type: 'array', items: { type: 'string' } }, uncertainties: { type: 'array', items: { type: 'string' } } } },
    needs_human_decision: { type: 'boolean' }, human_question: { type: 'string' },
  },
});

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'scores', 'issues', 'summary', 'revision_notes', 'not_checked'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise', 'escalate'] },
    scores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['criterion', 'score', 'note'], properties: { criterion: { type: 'string' }, score: { type: 'integer', enum: [1, 2, 3, 4, 5] }, note: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'location', 'problem', 'fix'], properties: { severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, location: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } } } },
    summary: { type: 'string' }, revision_notes: { type: 'string' }, not_checked: { type: 'string' },
  },
};

const running = new Set<number>();
export const isRunning = (taskId: number) => running.has(taskId);

// Start the agent's work. Validates synchronously (errors go back to the admin), runs the request in the background.
export async function startRun(taskId: number, userId: number) {
  if (running.has(taskId)) throw new Error('המשימה כבר רצה');
  const ctx = await buildContext(taskId);
  const { task, project, outs } = ctx;
  const agent = agentById(task.agent);
  if (!agent) throw new Error('סוכן לא מוכר');
  if (!['READY', 'REVISION_REQUIRED'].includes(task.status) && !(task.status === 'RUNNING' && !task.runStartedAt)) throw new Error('אפשר להפעיל רק משימה במצב "מוכנה לביצוע" או "נדרש תיקון"');
  const docOuts = outs.filter((o) => !o.media), mediaOuts = outs.filter((o) => o.media);
  if (!docOuts.length && !mediaOuts.length) throw new Error('למשימה אין תוצרים מחייבים');

  let user = ctx.text;
  if (task.status === 'REVISION_REQUIRED' || task.revisionNotes) {
    const rejected = await db.filmAssetVersion.findMany({ where: { taskId, status: 'rejected' }, orderBy: { id: 'desc' }, include: { asset: true }, take: 10 });
    const seen = new Set<number>(); const prev = rejected.filter((v) => !seen.has(v.assetId) && seen.add(v.assetId));
    user += `\n\n# סבב תיקון\n## הערות התיקון\n${task.revisionNotes}\n\n## הגרסה הקודמת שנדחתה\n${prev.map((v) => `### ${v.asset.name} v${v.version}\n${v.asset.media ? '(קובץ מדיה)' : v.content}`).join('\n\n')}\n\nתקן רק את מה שנדרש בהערות. כל השאר נשאר מילה במילה.`;
  }
  user += `\n\n# מה להחזיר\n- deliverables: תוצר מלא לכל אחד מהתוצרים: ${docOuts.map((o) => o.name).join(', ') || '(אין תוצרי טקסט)'}.\n- media_requests: ${mediaOuts.length ? `לכל תוצר מדיה (${mediaOuts.map((o) => o.name).join(', ')}) – רשימת פריטים להפקה במנוע חיצוני, עם פרומפט מלא לכל פריט. אתה לא מפיק את המדיה בעצמך.` : 'רשימה ריקה.'}\n- self_review: בדיקה מול כל אחד מתנאי האישור, בעיות וחוסר ודאות.\n- needs_human_decision: true רק אם אי אפשר להמשיך בלי החלטת המפיק (וכתוב את השאלה ב־human_question).`;

  const maxTokens = await guardBudget(task, project, user.length + agentSystem(agent, 'work').length);
  if (task.status !== 'RUNNING') await transition(taskId, 'RUNNING', { kind: 'human', userId }, `הופעל ${agent.id} על ${STUDIO_MODEL}`);
  await db.filmTask.update({ where: { id: taskId }, data: { runStartedAt: new Date() } });
  running.add(taskId);
  workRun(taskId, agent, user, docOuts, mediaOuts, maxTokens).finally(() => running.delete(taskId));
}

async function workRun(taskId: number, agent: Agent, user: string, docOuts: Output[], mediaOuts: Output[], maxTokens: number) {
  const task = await db.filmTask.findUniqueOrThrow({ where: { id: taskId } });
  const actor = { kind: 'agent' as const, id: agent.id };
  try {
    const r = await callClaude(agentSystem(agent, 'work'), user, WORK_SCHEMA(docOuts.map((o) => o.name), mediaOuts.map((o) => o.name)), maxTokens);
    await db.filmCost.create({ data: { projectId: task.projectId, taskId, provider: 'anthropic', kind: 'text', units: r.cost.units, amount: r.cost.usd, note: `${agent.id} work · ${r.msg.model}`, createdBy: agent.id } });
    await logEvent(task.projectId, taskId, agent.id, 'run', `model ${r.msg.model} · $${r.cost.usd.toFixed(4)} · stop ${r.msg.stop_reason}`);
    if (r.error || !r.data) return void (await transition(taskId, 'BLOCKED', actor, r.error || 'אין תוצר'));
    const d = r.data;
    const meta = { model: r.msg.model, requestedModel: STUDIO_MODEL, usage: r.msg.usage, attempt: task.attempts };
    for (const o of docOuts) {
      const del = (d.deliverables || []).find((x: any) => x.name === o.name);
      if (!del || !String(del.content || '').trim()) continue;
      let content = String(del.content);
      if (del.format === 'json') { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* keep as is */ } }
      await addVersion(task.projectId, taskId, o, { content, mime: del.format === 'json' ? 'application/json' : 'text/markdown', createdBy: agent.id, meta });
    }
    for (const m of d.media_requests || []) {
      const o = mediaOuts.find((x) => x.name === m.output); if (!o) continue;
      await addVersion(task.projectId, taskId, { name: `${o.name}__requests`, kind: 'media_requests' }, { content: JSON.stringify(m, null, 2), mime: 'application/json', createdBy: agent.id, meta });
    }
    const sr = d.self_review || {};
    const selfReview = [
      ...(sr.criteria || []).map((c: any) => `${c.met ? '✔' : '✘'} ${c.criterion}${c.note ? ' – ' + c.note : ''}`),
      ...(sr.issues?.length ? ['', 'בעיות:', ...sr.issues.map((s: string) => '- ' + s)] : []),
      ...(sr.uncertainties?.length ? ['', 'חוסר ודאות:', ...sr.uncertainties.map((s: string) => '- ' + s)] : []),
    ].join('\n');
    await db.filmTask.update({ where: { id: taskId }, data: { selfReview, runStartedAt: null } });
    const missing = docOuts.filter((o) => !(d.deliverables || []).some((x: any) => x.name === o.name && String(x.content || '').trim()));
    if (d.needs_human_decision) return void (await transition(taskId, 'BLOCKED', actor, 'שאלה למפיק: ' + (d.human_question || '(לא פורטה)')));
    if (missing.length) return void (await transition(taskId, 'BLOCKED', actor, 'הסוכן לא החזיר את כל התוצרים: ' + missing.map((o) => o.name).join(', ')));
    if (mediaOuts.length) return void (await logEvent(task.projectId, taskId, 'system', 'waiting', 'תוצרי הטקסט נשמרו. ממתין להעלאת קובצי המדיה מהמנוע המאושר לפני מעבר לבדיקה: ' + mediaOuts.map((o) => o.name).join(', ')));
    await transition(taskId, 'REVIEW', actor, 'נמסר לבדיקה');
  } catch (e: any) {
    console.error('[studio] run', taskId, e);
    const msg = e instanceof Anthropic.APIError ? `שגיאת API ${e.status}: ${e.message}` : String(e?.message || e);
    await db.filmTask.update({ where: { id: taskId }, data: { runStartedAt: null } }).catch(() => {});
    await transition(taskId, 'BLOCKED', actor, 'ההרצה נכשלה: ' + msg).catch(() => {});
  }
}

// AI review by the task's review agent. Media deliverables can't be seen by the reviewer: it then only recommends,
// and the producer approves.
export async function startReview(taskId: number, userId: number) {
  if (running.has(taskId)) throw new Error('המשימה כבר רצה');
  const ctx = await buildContext(taskId);
  const { task, project, outs } = ctx;
  if (task.status !== 'REVIEW') throw new Error('אפשר לבדוק רק משימה במצב "בבדיקה"');
  const reviewer = agentById(task.reviewAgent);
  if (!reviewer) throw new Error('הבודק של המשימה הוא המפיק – אין בדיקת AI');
  const drafts = await db.filmAssetVersion.findMany({ where: { taskId, status: 'draft' }, include: { asset: true }, orderBy: { id: 'asc' } });
  const user = `${ctx.text}\n\n# התוצר לבדיקה (מאת ${task.agent})\n${drafts.map((v) => `## ${v.asset.name} v${v.version}${v.asset.media ? ' (קובץ מדיה – לא צורף, אינך יכול לראות או לשמוע אותו)' : ''}\n${v.asset.media ? 'מטא־נתונים: ' + v.meta : v.content}`).join('\n\n')}\n\n## הביקורת העצמית של המבצע\n${task.selfReview || '-'}\n\n# מה להחזיר\nציון 1–5 לכל תנאי אישור, תקלות לפי חומרה עם מיקום ותיקון, החלטה, הערות תיקון ממוקדות (אם revise), ו־not_checked: מה לא יכולת לבדוק בפועל.`;
  const maxTokens = await guardBudget(task, project, user.length + agentSystem(reviewer, 'review').length);
  await db.filmTask.update({ where: { id: taskId }, data: { runStartedAt: new Date() } });
  await logEvent(task.projectId, taskId, `human:${userId}`, 'review', `הופעלה בדיקה ע״י ${reviewer.id}`);
  running.add(taskId);
  reviewRun(taskId, reviewer, user, maxTokens, outs.some((o) => o.media)).finally(() => running.delete(taskId));
}

async function reviewRun(taskId: number, reviewer: Agent, user: string, maxTokens: number, hasMedia: boolean) {
  const task = await db.filmTask.findUniqueOrThrow({ where: { id: taskId } });
  const actor = { kind: 'agent' as const, id: reviewer.id };
  try {
    const r = await callClaude(agentSystem(reviewer, 'review'), user, REVIEW_SCHEMA, maxTokens);
    await db.filmCost.create({ data: { projectId: task.projectId, taskId, provider: 'anthropic', kind: 'text', units: r.cost.units, amount: r.cost.usd, note: `${reviewer.id} review · ${r.msg.model}`, createdBy: reviewer.id } });
    await db.filmTask.update({ where: { id: taskId }, data: { runStartedAt: null } });
    if (r.error || !r.data) return void (await logEvent(task.projectId, taskId, reviewer.id, 'review', 'הבדיקה נכשלה: ' + (r.error || 'אין תשובה')));
    const d = r.data;
    const report = [
      `החלטה: ${d.verdict}`, d.summary, '',
      ...(d.scores || []).map((s: any) => `${s.score}/5 · ${s.criterion}${s.note ? ' – ' + s.note : ''}`),
      ...(d.issues?.length ? ['', 'תקלות:', ...d.issues.map((i: any) => `[${i.severity}] ${i.location}: ${i.problem} → ${i.fix}`)] : []),
      ...(d.not_checked ? ['', 'לא נבדק בפועל: ' + d.not_checked] : []),
    ].join('\n');
    await addVersion(task.projectId, taskId, { name: `review__${task.key}`, kind: 'review' }, { content: report, createdBy: reviewer.id, meta: { model: r.msg.model, verdict: d.verdict } });
    // the review report is the reviewer's own record – it must not be approved along with the deliverable
    await db.filmAssetVersion.updateMany({ where: { taskId, asset: { name: `review__${task.key}` } }, data: { status: 'approved', approvedBy: reviewer.id, approvedAt: new Date() } });
    const critical = (d.issues || []).some((i: any) => i.severity === 'critical' || i.severity === 'high');
    if (d.verdict === 'revise') return void (await transition(taskId, 'REVISION_REQUIRED', actor, d.revision_notes || d.summary));
    if (d.verdict === 'escalate' || hasMedia || (d.verdict === 'approve' && critical))
      return void (await logEvent(task.projectId, taskId, reviewer.id, 'recommend', `${hasMedia ? 'תוצרי מדיה דורשים צפייה אנושית. ' : ''}המלצת הבודק: ${d.verdict}. ממתין לאישור המפיק.\n${d.summary}`));
    await transition(taskId, 'APPROVED', actor, d.summary);
  } catch (e: any) {
    console.error('[studio] review', taskId, e);
    await db.filmTask.update({ where: { id: taskId }, data: { runStartedAt: null } }).catch(() => {});
    await logEvent(task.projectId, taskId, reviewer.id, 'review', 'הבדיקה נכשלה: ' + (e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : e?.message || e)).catch(() => {});
  }
}

export { AGENTS };
