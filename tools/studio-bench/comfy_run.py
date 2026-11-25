#!/usr/bin/env python3
"""GREENTEC studio-bench: run one ComfyUI workflow headless and save its outputs.

The workflow must be in ComfyUI *API format* (in ComfyUI: Workflow → Export (API)).
Uses only ComfyUI's own HTTP API on the local machine: POST /prompt, GET /history,
GET /view, POST /upload/image, POST /free. Exit code 0 only when ComfyUI reports
success and at least one output file was saved.

    python comfy_run.py workflows/qwen_edit_2511_api.json --out out/B1-run1 \
        --upload ref.png --set 41.inputs.image=ref.png --set 3.inputs.seed=42 --free-before
"""
import argparse, json, mimetypes, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path


def http(base, path, data=None, ctype='application/json', timeout=60):
    req = urllib.request.Request(base.rstrip('/') + path, data=data, method='POST' if data is not None else 'GET')
    if data is not None: req.add_header('Content-Type', ctype)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def post_json(base, path, obj):
    return json.loads(http(base, path, json.dumps(obj).encode('utf-8')) or b'{}')


def upload(base, file: Path):
    boundary = uuid.uuid4().hex
    ct = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{file.name}"\r\nContent-Type: {ct}\r\n\r\n').encode() + file.read_bytes() + \
           (f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n').encode()
    return json.loads(http(base, '/upload/image', body, f'multipart/form-data; boundary={boundary}', timeout=600))


def apply_sets(wf, sets):
    for s in sets:
        path, _, raw = s.partition('=')
        node, *keys = path.split('.')
        if node not in wf: raise SystemExit(f'--set: node {node} not in workflow (API-format ids are the top-level keys)')
        try: val = json.loads(raw)
        except json.JSONDecodeError: val = raw
        cur = wf[node]
        for k in keys[:-1]: cur = cur.setdefault(k, {})
        cur[keys[-1]] = val


def iter_files(outputs):
    for node_id, out in (outputs or {}).items():
        for v in out.values():
            if isinstance(v, list):
                for item in v:
                    if isinstance(item, dict) and 'filename' in item: yield node_id, item


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('workflow'); ap.add_argument('--out', required=True)
    ap.add_argument('--server', default='http://127.0.0.1:8188')
    ap.add_argument('--set', action='append', default=[], help='NODE.inputs.KEY=VALUE (JSON values allowed)')
    ap.add_argument('--upload', action='append', default=[], help='input file to upload to ComfyUI/input first')
    ap.add_argument('--free-before', action='store_true', help='unload all models before the run (clean VRAM measurement)')
    ap.add_argument('--timeout', type=int, default=3 * 3600)
    a = ap.parse_args()

    wf = json.loads(Path(a.workflow).read_text(encoding='utf-8'))
    if 'nodes' in wf and 'links' in wf: raise SystemExit('This is a UI-format workflow. Export it with Workflow → Export (API).')
    apply_sets(wf, a.set)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / 'workflow_api_used.json').write_text(json.dumps(wf, indent=1), encoding='utf-8')  # exact graph that ran
    for f in a.upload: print('uploaded', upload(a.server, Path(f)))
    if a.free_before:
        post_json(a.server, '/free', {'unload_models': True, 'free_memory': True}); time.sleep(2)
    try:
        r = post_json(a.server, '/prompt', {'prompt': wf, 'client_id': uuid.uuid4().hex})
    except urllib.error.HTTPError as e:
        print('ComfyUI rejected the workflow:', e.read().decode('utf-8', 'replace')[:4000], file=sys.stderr); sys.exit(2)
    pid = r.get('prompt_id'); print('prompt_id', pid)
    if r.get('node_errors'): print('node_errors:', json.dumps(r['node_errors'])[:4000], file=sys.stderr); sys.exit(2)

    t0 = time.time(); hist = None
    while time.time() - t0 < a.timeout:
        h = json.loads(http(a.server, f'/history/{pid}') or b'{}')
        if pid in h and h[pid].get('status', {}).get('completed') is not None and (h[pid]['status'].get('completed') or h[pid]['status'].get('status_str') == 'error'):
            hist = h[pid]; break
        time.sleep(2)
    if hist is None: print('timeout waiting for ComfyUI', file=sys.stderr); sys.exit(3)
    st = hist.get('status', {})
    (out / 'history.json').write_text(json.dumps(hist, indent=1), encoding='utf-8')
    if st.get('status_str') == 'error':
        msgs = [m for m in st.get('messages', []) if m and m[0] == 'execution_error']
        print('execution_error:', json.dumps(msgs)[:6000], file=sys.stderr); sys.exit(4)
    saved = 0
    for node_id, item in iter_files(hist.get('outputs')):
        if item.get('type') == 'temp': continue  # previews
        q = urllib.parse.urlencode({'filename': item['filename'], 'subfolder': item.get('subfolder', ''), 'type': item.get('type', 'output')})
        (out / f"{node_id}_{item['filename']}").write_bytes(http(a.server, f'/view?{q}', timeout=600)); saved += 1
    print(f'saved {saved} file(s) to {out} in {time.time() - t0:.0f}s')
    sys.exit(0 if saved else 5)


if __name__ == '__main__':
    main()
