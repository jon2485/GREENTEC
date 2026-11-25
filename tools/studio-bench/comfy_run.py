#!/usr/bin/env python3
"""GREENTEC studio-bench: run one ComfyUI workflow headless and save its outputs.

The workflow must be in ComfyUI *API format* (in ComfyUI: Workflow → Export (API)).
Talks ONLY to ComfyUI on this computer (http://127.0.0.1), never through a proxy,
never following redirects. Uses ComfyUI's own API: /upload/image, /prompt,
/history, /view, /free, /interrupt.

Inputs are uploaded into ComfyUI/input/studio-bench/ without overwriting existing
files; refer to them in --set as @1, @2 … (in upload order):

    py -B comfy_run.py workflows/qwen_edit_2511_api.json --out out/B1-run1 \
        --upload ref.png --set 41.inputs.image=@1 --set 3.inputs.seed=42 --free-before

Exit code 0 only when ComfyUI reports success and at least one output file was saved.
"""
import argparse, json, mimetypes, re, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path
from _common import LOCAL, is_local_http, redact, utf8_stdio

utf8_stdio()


def http(base, path, data=None, headers=None, timeout=60):
    req = urllib.request.Request(base.rstrip('/') + path, data=data, method='POST' if data is not None else 'GET', headers=headers or {})
    with LOCAL.open(req, timeout=timeout) as r:
        return r.read()



def post_json(base, path, obj):
    return json.loads(http(base, path, json.dumps(obj).encode('utf-8'), {'Content-Type': 'application/json'}) or b'{}')


def safe_name(name: str) -> str:
    """A plain file name: no folders, no '..', no drive letters, no control or reserved characters."""
    n = re.sub(r'[\x00-\x1f"<>:|?*\\/]', '_', str(name)).strip(' .')
    if not n or set(n) <= {'.', '_'}: raise ValueError(f'unsafe file name: {name!r}')
    return n[:180]


def upload(base, file: Path):
    """Streamed multipart upload into input/studio-bench/ – never overwrites an existing file."""
    boundary = uuid.uuid4().hex
    ct = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="subfolder"\r\n\r\nstudio-bench\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\nfalse\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{safe_name(file.name)}"\r\nContent-Type: {ct}\r\n\r\n').encode()
    tail = f'\r\n--{boundary}--\r\n'.encode()
    size = len(head) + file.stat().st_size + len(tail)

    def body():
        yield head
        with file.open('rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''): yield chunk
        yield tail
    r = json.loads(http(base, '/upload/image', body(), {'Content-Type': f'multipart/form-data; boundary={boundary}', 'Content-Length': str(size)}, timeout=1800))
    return f"{r.get('subfolder')}/{r['name']}" if r.get('subfolder') else r['name']


def apply_sets(wf, sets, uploaded):
    for s in sets:
        path, _, raw = s.partition('=')
        node, *keys = path.split('.')
        if node not in wf or not keys: raise SystemExit(f'--set {s!r}: node {node} not in workflow (API-format ids are the top-level keys)')
        m = re.fullmatch(r'@(\d+)', raw)
        if m:
            i = int(m.group(1))
            if not 1 <= i <= len(uploaded): raise SystemExit(f'--set {s!r}: there is no upload #{i}')
            val = uploaded[i - 1]
        else:
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
    ap.add_argument('--server', default='http://127.0.0.1:8188', help='local ComfyUI only (ComfyUI Desktop uses port 8000)')
    ap.add_argument('--set', action='append', default=[], help='NODE.inputs.KEY=VALUE (JSON allowed; @N = Nth upload)')
    ap.add_argument('--upload', action='append', default=[], help='input file to upload to ComfyUI/input/studio-bench/')
    ap.add_argument('--free-before', action='store_true', help='unload all models before the run (clean VRAM measurement)')
    ap.add_argument('--timeout', type=int, default=3 * 3600)
    a = ap.parse_args()
    if not is_local_http(a.server): raise SystemExit('Only a ComfyUI on this computer is allowed (http://127.0.0.1:PORT).')

    wf = json.loads(Path(a.workflow).read_text(encoding='utf-8-sig'))
    if isinstance(wf, dict) and 'nodes' in wf and 'links' in wf: raise SystemExit('This is a UI-format workflow. Export it with Workflow → Export (API).')
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    uploaded = [upload(a.server, Path(f)) for f in a.upload]
    for i, u in enumerate(uploaded, 1): print(f'upload @{i} -> {u}')
    apply_sets(wf, a.set, uploaded)
    (out / 'workflow_api_used.json').write_text(json.dumps(wf, indent=1, ensure_ascii=False), encoding='utf-8')  # exact graph that ran
    if a.free_before:
        post_json(a.server, '/free', {'unload_models': True, 'free_memory': True}); time.sleep(2)
    try:
        r = post_json(a.server, '/prompt', {'prompt': wf, 'client_id': uuid.uuid4().hex})
    except urllib.error.HTTPError as e:
        print('ComfyUI rejected the workflow:', e.read().decode('utf-8', 'replace')[:4000], file=sys.stderr); sys.exit(2)
    pid = r.get('prompt_id'); print('prompt_id', pid)
    if r.get('node_errors'): print('node_errors:', json.dumps(r['node_errors'], ensure_ascii=False)[:4000], file=sys.stderr); sys.exit(2)

    t0 = time.time(); hist = None
    try:
        while time.time() - t0 < a.timeout:
            h = json.loads(http(a.server, f'/history/{urllib.parse.quote(str(pid))}') or b'{}')
            st = (h.get(pid) or {}).get('status') or {}
            if st.get('completed') or st.get('status_str') == 'error': hist = h[pid]; break
            time.sleep(2)
    except KeyboardInterrupt:
        post_json(a.server, '/interrupt', {}); print('interrupted – asked ComfyUI to stop', file=sys.stderr); sys.exit(130)
    if hist is None:
        post_json(a.server, '/interrupt', {}); print('timeout – asked ComfyUI to stop the job', file=sys.stderr); sys.exit(3)
    (out / 'history.json').write_text(json.dumps(redact(hist), indent=1, ensure_ascii=False), encoding='utf-8')
    st = hist.get('status', {})
    if st.get('status_str') == 'error':
        msgs = [m for m in st.get('messages', []) if m and m[0] == 'execution_error']
        print('execution_error:', json.dumps(redact(msgs), ensure_ascii=False)[:6000], file=sys.stderr); sys.exit(4)
    saved = 0; used = set()
    for node_id, item in iter_files(hist.get('outputs')):
        if item.get('type') == 'temp': continue  # previews
        q = urllib.parse.urlencode({'filename': item['filename'], 'subfolder': item.get('subfolder', ''), 'type': item.get('type', 'output')})
        name = safe_name(f"{node_id}_{item.get('subfolder', '')}_{item['filename']}" if item.get('subfolder') else f"{node_id}_{item['filename']}")
        base, n = name, 1
        while name.lower() in used: n += 1; name = f'{Path(base).stem}-{n}{Path(base).suffix}'
        used.add(name.lower())
        dest = out / name
        if dest.resolve().parent != out.resolve(): raise SystemExit(f'unsafe output path {dest}')
        req = urllib.request.Request(a.server.rstrip('/') + '/view?' + q)
        with LOCAL.open(req, timeout=1800) as resp, dest.open('wb') as f:
            for chunk in iter(lambda: resp.read(1 << 20), b''): f.write(chunk)  # streamed
        saved += 1
    print(f'saved {saved} file(s) to {out} in {time.time() - t0:.0f}s')
    sys.exit(0 if saved else 5)


if __name__ == '__main__':
    main()
