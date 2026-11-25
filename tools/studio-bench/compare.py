#!/usr/bin/env python3
"""GREENTEC studio-bench: comparison report from real runs and human scores.

Reads results/runs.jsonl (written by measure.py) and results/scores.csv
(filled in by people after watching the outputs) and writes results/report.md.

scores.csv columns: run_id,rater,criterion,score,notes   (score 1–5)
Criteria used by the first-shot acceptance test (see docs/OPEN_MODEL_EVALUATION.md §11–12):
identity_before, identity_after, body_motion, acting, lipsync, hebrew, continuity,
art_lines, art_colors, art_proportions, art_face, art_style, edit_sound, content_fit
"""
import csv, io, json, statistics as stats, sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))  # embedded Python (._pth) does not add the script folder
from _common import utf8_stdio

utf8_stdio()

HERE = Path(__file__).resolve().parent
RES = HERE / 'results'


def main():
    runs, bad_runs = [], 0
    if (RES / 'runs.jsonl').exists():
        for l in (RES / 'runs.jsonl').read_text(encoding='utf-8', errors='replace').splitlines():
            if not l.strip(): continue
            try: runs.append(json.loads(l))
            except json.JSONDecodeError: bad_runs += 1
    scores = defaultdict(lambda: defaultdict(list)); notes = defaultdict(list)
    bad_scores = 0
    if (RES / 'scores.csv').exists():
        raw = (RES / 'scores.csv').read_bytes()
        try: text = raw.decode('utf-8-sig')          # Excel "CSV UTF-8" adds a BOM
        except UnicodeDecodeError: text = raw.decode('cp1255', 'replace')  # Excel Hebrew ANSI
        for r in csv.DictReader(io.StringIO(text)):
            try:
                v = float(r['score'])
                if not 1 <= v <= 5: raise ValueError
                scores[r['run_id'].strip()][r['criterion'].strip()].append(v)
            except (KeyError, ValueError, TypeError, AttributeError):
                bad_scores += 1; continue
            if r.get('notes'): notes[r['run_id']].append(f"{r.get('rater', '')}: {r['notes']}")
    crit = sorted({c for s in scores.values() for c in s})
    mib = lambda v: '' if v is None else f'{v / 1024:.1f}'
    lines = ['# studio-bench report', '', f'{len(runs)} runs · {sum(r["status"] == "ok" for r in runs)} ok · {sum(r["status"] != "ok" for r in runs)} failed', '']
    if bad_runs or bad_scores: lines += [f'⚠ skipped {bad_runs} unreadable run line(s) and {bad_scores} invalid score row(s)', '']
    by_case = defaultdict(list)
    for r in runs: by_case[r['case']].append(r)
    for case in sorted(by_case):
        lines += [f'## {case}', '', '| run | model | profile | status | sec | GPU peak GB | GPU Δ GB | RAM peak GB | ' + ' | '.join(crit) + ' |',
                  '|' + '---|' * (8 + len(crit))]
        for r in by_case[case]:
            sc = [f"{stats.mean(scores[r['run_id']][c]):.1f}" if scores[r['run_id']].get(c) else '' for c in crit]
            st = r.get('status', '?') + (f" ({r['failure_category']})" if r.get('failure_category') else '')
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
