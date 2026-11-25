#!/usr/bin/env python3
"""GREENTEC studio-bench: run one experiment and record what really happened.

Wraps any command (usually comfy_run.py or a model's own CLI), samples GPU memory
and system RAM while it runs, and appends one JSON line to results/runs.jsonl –
successes AND failures (OOM, crash, timeout). Nothing is inferred: if a value
could not be measured it is recorded as null.

    python measure.py --model wan-animate-2-distill --profile int8-480p --case B4 \
        --seed 42 --input ref.png --input drive.mp4 --outputs out/B4-run1 \
        -- python comfy_run.py workflows/wan_animate2_api.json --out out/B4-run1 --set 12.inputs.seed=42

Note on VRAM: nvidia-smi reports memory used on the whole GPU (every process,
including a running ComfyUI server). The baseline before the run is recorded so
the delta can be read honestly.
"""
import argparse, datetime as dt, hashlib, json, re, subprocess, sys, threading, time, uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = HERE / 'results' / 'runs.jsonl'
FAIL_PATTERNS = [  # (category, regex on stderr/stdout tail)
    ('oom', r'out of memory|OutOfMemoryError|CUDA error: out of memory|cudaMalloc failed|Allocation on device'),
    ('missing_model', r'No such file|FileNotFoundError|not found in .*models|Value not in list'),
    ('missing_node', r'node type not found|Cannot execute because a node is missing|missing_node_type'),
    ('cuda_arch', r'no kernel image is available|sm_\d+ is not compatible|CUDA capability .* not compatible'),
    ('nan', r'NaN|nan values|inf values'),
]


def sha256(p: Path):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def gpu_used_mib():
    try:
        out = subprocess.run(['nvidia-smi', '--query-gpu=memory.used', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5).stdout
        return sum(int(x) for x in out.split() if x.strip().isdigit())
    except Exception:  # noqa: BLE001
        return None


def ram_used_mib():
    if sys.platform == 'win32':
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
    try:
        import psutil
        vm = psutil.virtual_memory(); return (vm.total - vm.available) // 2**20
    except ImportError:
        p = Path('/proc/meminfo')
        if p.exists():
            kv = {l.split(':')[0]: int(l.split()[1]) for l in p.read_text().splitlines() if l.split()[1:2] and l.split()[1].isdigit()}
            return (kv['MemTotal'] - kv['MemAvailable']) // 1024
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--model', required=True, help='model key from candidates.json')
    ap.add_argument('--profile', required=True, help='e.g. int8-480p-81f, fp8-offload-720p')
    ap.add_argument('--case', required=True, help='benchmark case B1..B8, or SMOKE')
    ap.add_argument('--seed', default='')
    ap.add_argument('--input', action='append', default=[], help='input file (hashed); repeatable')
    ap.add_argument('--outputs', default='', help='folder the command writes into (files are listed and hashed)')
    ap.add_argument('--timeout', type=int, default=3 * 3600)
    ap.add_argument('--note', default='')
    ap.add_argument('cmd', nargs=argparse.REMAINDER, help='-- command to run')
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd[:1] == ['--'] else a.cmd
    if not cmd: ap.error('give the command after --')

    run_id = dt.datetime.now().strftime('%Y%m%d-%H%M%S-') + uuid.uuid4().hex[:6]
    logdir = HERE / 'results' / 'logs'; logdir.mkdir(parents=True, exist_ok=True)
    log = logdir / f'{run_id}.log'
    before_out = set(Path(a.outputs).rglob('*')) if a.outputs and Path(a.outputs).exists() else set()
    base_gpu, base_ram = gpu_used_mib(), ram_used_mib()
    s = Sampler(); s.start(); t0 = time.perf_counter(); status = 'ok'; code = None
    with log.open('w', encoding='utf-8') as lf:
        lf.write('$ ' + ' '.join(cmd) + '\n')
        try:
            p = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, timeout=a.timeout)
            code = p.returncode
        except subprocess.TimeoutExpired:
            status = 'timeout'
        except FileNotFoundError as e:
            status = 'failed'; lf.write(f'\n[measure] {e}\n')
    secs = time.perf_counter() - t0; s.stop.set(); s.join(2)
    tail = log.read_text(encoding='utf-8', errors='replace')[-6000:]
    category = None
    if status == 'ok' and code != 0: status = 'failed'
    if status != 'ok':
        category = next((c for c, rx in FAIL_PATTERNS if re.search(rx, tail, re.I)), 'timeout' if status == 'timeout' else 'other')
        if category == 'oom': status = 'oom'

    outs = []
    if a.outputs and Path(a.outputs).exists():
        for f in sorted(set(Path(a.outputs).rglob('*')) - before_out):
            if f.is_file(): outs.append({'path': str(f), 'bytes': f.stat().st_size, 'sha256': sha256(f)})
    rec = {
        'run_id': run_id, 'timestamp': dt.datetime.now().isoformat(timespec='seconds'), 'model': a.model, 'profile': a.profile, 'case': a.case,
        'seed': a.seed, 'command': cmd, 'status': status, 'exit_code': code, 'failure_category': category,
        'seconds': round(secs, 1),
        'gpu_mib': {'baseline': base_gpu, 'peak': max(s.gpu) if s.gpu else None, 'peak_delta': (max(s.gpu) - base_gpu) if s.gpu and base_gpu is not None else None, 'samples': len(s.gpu)},
        'ram_mib': {'baseline': base_ram, 'peak': max(s.ram) if s.ram else None, 'peak_delta': (max(s.ram) - base_ram) if s.ram and base_ram is not None else None},
        'inputs': [{'path': i, 'sha256': sha256(Path(i)) if Path(i).is_file() else None} for i in a.input],
        'outputs': outs, 'log': str(log), 'note': a.note,
        'error_tail': tail[-1500:] if status != 'ok' else '',
    }
    RUNS.parent.mkdir(parents=True, exist_ok=True)
    with RUNS.open('a', encoding='utf-8') as f: f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    print(json.dumps({k: rec[k] for k in ('run_id', 'status', 'failure_category', 'seconds', 'gpu_mib', 'ram_mib')}, ensure_ascii=False))
    print(f'outputs: {len(outs)} file(s) · log: {log}')
    sys.exit(0 if status == 'ok' else 1)


if __name__ == '__main__':
    main()
