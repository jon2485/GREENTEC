#!/usr/bin/env python3
"""GREENTEC studio-bench: run one experiment and record what really happened.

Wraps the command you type (usually comfy_run.py), samples GPU memory and system
RAM while it runs, and appends one JSON line to results/runs.jsonl – for
successes AND failures (OOM, crash, timeout, Ctrl+C). Values that could not be
measured are recorded as null. Paths are stored relative to this folder and
user/host names are removed.

    py -B measure.py --model wan-animate-2-distill-int8 --profile int8-480p --case B4 \
        --seed 42 --input ref.png --input drive.mp4 --outputs out/B4-run1 -- \
        python comfy_run.py workflows/wan_animate2_api.json --out out/B4-run1 --set 12.inputs.seed=42

VRAM: nvidia-smi reports memory used on the whole GPU (every process, including
a running ComfyUI). The baseline before the run is recorded so the delta can be read honestly.
"""
import argparse, datetime as dt, hashlib, json, os, re, signal, subprocess, sys, threading, time, uuid
from pathlib import Path
from _common import HERE, utf8_stdio, redact, rel, find_exe, resolve_cmd

RUNS = HERE / 'results' / 'runs.jsonl'
FAIL_PATTERNS = [  # (category, regex on the log tail) – first match wins
    ('oom', r'out of memory|OutOfMemoryError|cudaMalloc failed|Allocation on device'),
    ('cuda_arch', r'no kernel image is available|is not compatible with the current PyTorch|CUDA capability sm_\d+ is not compatible'),
    ('missing_node', r'node type not found|Cannot execute because a node is missing|missing_node_type'),
    ('missing_model', r'Value not in list|ckpt_name|unet_name|clip_name|vae_name|lora_name|models/[a-z_]+/.*(not found|No such file)'),
    ('comfy_unreachable', r'Connection refused|actively refused|urlopen error'),
    ('nan', r'\bNaN\b|nan values|inf values'),
]
utf8_stdio()


def sha256(p: Path):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


NVSMI = find_exe('nvidia-smi')


def gpu_used_mib():
    if not NVSMI: return None
    try:
        out = subprocess.run([NVSMI, '--query-gpu=memory.used', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5).stdout
        vals = [int(x) for x in out.split() if x.strip().isdigit()]
        return sum(vals) if vals else None
    except Exception:  # noqa: BLE001
        return None


def ram_used_mib():
    if os.name == 'nt':
        try:
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong), ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                            ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong), ('ullTotalVirtual', ctypes.c_ulonglong),
                            ('ullAvailVirtual', ctypes.c_ulonglong), ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
            m = MS(); m.dwLength = ctypes.sizeof(MS)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)): return (m.ullTotalPhys - m.ullAvailPhys) // 2**20
        except Exception:  # noqa: BLE001
            return None
    p = Path('/proc/meminfo')
    if p.exists():
        kv = {}
        for l in p.read_text().splitlines():
            parts = l.split()
            if len(parts) >= 2 and parts[1].isdigit(): kv[parts[0].rstrip(':')] = int(parts[1])
        if 'MemTotal' in kv and 'MemAvailable' in kv: return (kv['MemTotal'] - kv['MemAvailable']) // 1024
    return None


class Sampler(threading.Thread):
    def __init__(self, every=0.5):
        super().__init__(daemon=True); self.every = every; self.stop = threading.Event(); self.gpu = []; self.ram = []
    def run(self):
        while not self.stop.is_set():
            g, r = gpu_used_mib(), ram_used_mib()
            if g is not None: self.gpu.append(g)
            if r is not None: self.ram.append(r)
            self.stop.wait(self.every)


def kill_tree(p: subprocess.Popen):
    """Stop the child AND everything it started."""
    try:
        if os.name == 'nt':
            tk = find_exe('taskkill')
            if tk: subprocess.run([tk, '/T', '/F', '/PID', str(p.pid)], capture_output=True, timeout=30)
            else: p.kill()
        else:
            os.killpg(os.getpgid(p.pid), signal.SIGKILL)
    except Exception:  # noqa: BLE001
        try: p.kill()
        except Exception: pass


def tail(path: Path, n=64 * 1024):
    with path.open('rb') as f:
        f.seek(0, 2); size = f.tell(); f.seek(max(0, size - n))
        return f.read().decode('utf-8', 'replace')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--model', required=True, help='model key from candidates.json')
    ap.add_argument('--profile', required=True, help='e.g. int8-480p-77f, fp8-offload-720p')
    ap.add_argument('--case', required=True, help='benchmark case B1..B8, or SMOKE')
    ap.add_argument('--seed', default='')
    ap.add_argument('--input', action='append', default=[], help='input file (hashed); repeatable')
    ap.add_argument('--outputs', default='', help='folder the command writes into (new files are listed and hashed)')
    ap.add_argument('--timeout', type=int, default=4 * 3600, help='seconds (default 4 h; comfy_run stops itself at 3 h)')
    ap.add_argument('--note', default='')
    ap.add_argument('cmd', nargs=argparse.REMAINDER, help='-- command to run')
    a = ap.parse_args()
    cmd = resolve_cmd(a.cmd[1:] if a.cmd[:1] == ['--'] else a.cmd)
    if not cmd: ap.error('give the command after --')

    run_id = dt.datetime.now().strftime('%Y%m%d-%H%M%S-') + uuid.uuid4().hex[:6]
    logdir = HERE / 'results' / 'logs'; logdir.mkdir(parents=True, exist_ok=True)
    log = logdir / f'{run_id}.log'
    outdir = Path(a.outputs) if a.outputs else None
    before_out = set(outdir.rglob('*')) if outdir and outdir.exists() else set()
    base_gpu, base_ram = gpu_used_mib(), ram_used_mib()
    s = Sampler(); s.start(); t0 = time.perf_counter(); status = 'ok'; code = None; category = None
    env = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}
    try:
        with log.open('w', encoding='utf-8') as lf:
            lf.write('$ ' + ' '.join(map(str, cmd)) + '\n'); lf.flush()
            try:
                p = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT, env=env,
                                     **({'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}))
            except FileNotFoundError as e:
                status, category = 'failed', 'missing_program'; lf.write(f'\n[measure] program not found: {e}\n'); p = None
            if p:
                try: code = p.wait(timeout=a.timeout)
                except subprocess.TimeoutExpired:
                    status, category = 'timeout', 'timeout'; kill_tree(p); code = p.wait()
                except KeyboardInterrupt:
                    status, category = 'interrupted', 'interrupted'; kill_tree(p); code = p.wait()
    finally:
        secs = time.perf_counter() - t0; s.stop.set(); s.join(2)
        text = tail(log)
        if status == 'ok' and code != 0:
            status = 'failed'
            category = next((c for c, rx in FAIL_PATTERNS if re.search(rx, text, 0 if c == 'nan' else re.I)), 'other')
            if category == 'oom': status = 'oom'
        outs = []
        if outdir and outdir.exists():
            for f in sorted(set(outdir.rglob('*')) - before_out):
                if f.is_file(): outs.append({'path': rel(f), 'bytes': f.stat().st_size, 'sha256': sha256(f)})
        rec = redact({
            'run_id': run_id, 'timestamp': dt.datetime.now().isoformat(timespec='seconds'), 'model': a.model, 'profile': a.profile, 'case': a.case,
            'seed': a.seed, 'command': [Path(cmd[0]).name, *map(str, cmd[1:])], 'status': status, 'exit_code': code, 'failure_category': category,
            'seconds': round(secs, 1),
            'gpu_mib': {'baseline': base_gpu, 'peak': max(s.gpu) if s.gpu else None, 'peak_delta': (max(s.gpu) - base_gpu) if s.gpu and base_gpu is not None else None, 'samples': len(s.gpu)},
            'ram_mib': {'baseline': base_ram, 'peak': max(s.ram) if s.ram else None, 'peak_delta': (max(s.ram) - base_ram) if s.ram and base_ram is not None else None},
            'inputs': [{'path': rel(i), 'sha256': sha256(Path(i)) if Path(i).is_file() else None} for i in a.input],
            'outputs': outs, 'log': rel(log), 'note': a.note, 'error_tail': text[-1500:] if status != 'ok' else '',
        })
        RUNS.parent.mkdir(parents=True, exist_ok=True)
        with RUNS.open('a', encoding='utf-8') as f: f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(json.dumps({k: rec[k] for k in ('run_id', 'status', 'failure_category', 'seconds', 'gpu_mib', 'ram_mib')}, ensure_ascii=False))
        print(f"outputs: {len(outs)} file(s) · log: {rec['log']}")
    sys.exit(0 if status == 'ok' else 1)


if __name__ == '__main__':
    main()
