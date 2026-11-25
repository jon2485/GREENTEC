#!/usr/bin/env python3
"""GREENTEC studio-bench: comparison report from real runs and human scores.

Reads results/runs.jsonl (written by measure.py) and results/scores.csv
(filled in by people after watching the outputs) and writes results/report.md.

scores.csv columns: run_id,rater,criterion,score,notes   (score 1–5)
Criteria used by the first-shot acceptance test (see docs/OPEN_MODEL_EVALUATION.md §11–12):
identity_before, identity_after, body_motion, acting, lipsync, hebrew, continuity,
style_match, edit_sound, content_fit
"""
import csv, json, statistics as stats
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RES = HERE / 'results'


def main():
    runs = [json.loads(l) for l in (RES / 'runs.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()] if (RES / 'runs.jsonl').exists() else []
    scores = defaultdict(lambda: defaultdict(list)); notes = defaultdict(list)
    if (RES / 'scores.csv').exists():
        for r in csv.DictReader((RES / 'scores.csv').open(encoding='utf-8')):
            try: scores[r['run_id']][r['criterion']].append(float(r['score']))
            except (KeyError, ValueError): continue
            if r.get('notes'): notes[r['run_id']].append(f"{r.get('rater', '')}: {r['notes']}")
    crit = sorted({c for s in scores.values() for c in s})
    mib = lambda v: '' if v is None else f'{v / 1024:.1f}'
    lines = ['# studio-bench report', '', f'{len(runs)} runs · {sum(r["status"] == "ok" for r in runs)} ok · {sum(r["status"] != "ok" for r in runs)} failed', '']
    by_case = defaultdict(list)
    for r in runs: by_case[r['case']].append(r)
    for case in sorted(by_case):
        lines += [f'## {case}', '', '| run | model | profile | status | sec | GPU peak GB | GPU Δ GB | RAM peak GB | ' + ' | '.join(crit) + ' |',
                  '|' + '---|' * (8 + len(crit))]
        for r in by_case[case]:
            sc = [f"{stats.mean(scores[r['run_id']][c]):.1f}" if scores[r['run_id']].get(c) else '' for c in crit]
            st = r['status'] + (f" ({r['failure_category']})" if r.get('failure_category') else '')
            lines.append(f"| {r['run_id']} | {r['model']} | {r['profile']} | {st} | {r['seconds']} | {mib(r['gpu_mib']['peak'])} | {mib(r['gpu_mib']['peak_delta'])} | {mib(r['ram_mib']['peak'])} | " + ' | '.join(sc) + ' |')
        lines.append('')
    fails = [r for r in runs if r['status'] != 'ok']
    if fails:
        lines += ['## Failures', '']
        for r in fails:
            lines += [f"- **{r['run_id']}** {r['model']} / {r['profile']} / {r['case']}: {r['status']} ({r.get('failure_category')}) – log `{r['log']}`"]
    if notes:
        lines += ['', '## Rater notes', ''] + [f'- **{k}**: ' + ' · '.join(v) for k, v in notes.items()]
    (RES / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'written {RES / "report.md"}')


if __name__ == '__main__':
    main()
