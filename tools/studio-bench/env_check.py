#!/usr/bin/env python3
"""GREENTEC studio-bench: read-only environment report for the local GPU machine.

Installs nothing, downloads nothing, changes no driver or system setting, sends
nothing anywhere. It reads system information and writes ONE file:
results/env-<timestamp>.json next to this script. User name, host name and home
folder are replaced by <USER>, <HOST>, <HOME> before anything is printed or saved.

    py -B env_check.py --disk D:\\            (Windows)
    python3 -B env_check.py --disk /data      (Linux / WSL)

Optional: --no-gpu-test skips the PyTorch check (it only runs if PyTorch is
already installed; it runs in a separate process with a time limit).

Exit codes: 0 = no problem found; 3 = problems found (listed); with --require-gpu
(used by the installer as a gate) a missing PyTorch, no CUDA device, no native kernels
for this GPU's architecture, or a failed/non-finite bf16 test is a problem too.
Standalone on purpose: this single file is all that is needed for step 0.
"""
import argparse, datetime as dt, json, os, platform, re, shutil, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
for _s in (sys.stdout, sys.stderr):  # Hebrew-safe output on any Windows code page
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass


# ---------- privacy ----------
def _secrets():
    home = Path.home()
    vals = {str(home), str(home).replace('\\', '/'), home.name,
            os.environ.get('USERNAME', ''), os.environ.get('USER', ''), platform.node(), os.environ.get('COMPUTERNAME', '')}
    return sorted((v for v in vals if v and len(v) > 2), key=len, reverse=True)


_USER_DIR = re.compile(r'(?i)([A-Z]:[\\/]+Users[\\/]+|/mnt/[a-z]/Users/|/home/|/Users/)([^\\/"\s]+)')


def scrub(text: str) -> str:
    """Remove user/host names and per-user folder names from a string."""
    if not isinstance(text, str): return text
    hosts = {platform.node().lower(), os.environ.get('COMPUTERNAME', '').lower()}
    for v in _secrets():
        if '\\' in v or '/' in v:
            text = re.sub(re.escape(v), '<HOME>', text, flags=re.I)
        else:  # whole words only, so short names do not damage other text
            text = re.sub(r'(?<![A-Za-z0-9])' + re.escape(v) + r'(?![A-Za-z0-9])', '<HOST>' if v.lower() in hosts else '<USER>', text, flags=re.I)
    return _USER_DIR.sub(lambda m: m.group(1) + '<USER>', text)


def redact(obj):
    """Scrub every string VALUE (never dict keys) recursively."""
    if isinstance(obj, dict): return {k: redact(v) for k, v in obj.items()}
    if isinstance(obj, list): return [redact(v) for v in obj]
    return scrub(obj) if isinstance(obj, str) else obj


# ---------- safe program lookup (never the current folder) ----------
def find_exe(name):
    exts = os.environ.get('PATHEXT', '.EXE;.BAT;.CMD').lower().split(';') if os.name == 'nt' else ['']
    cwd = os.path.normcase(os.path.abspath(os.getcwd()))
    for d in os.environ.get('PATH', '').split(os.pathsep):
        if not d or d in ('.',) or os.path.normcase(os.path.abspath(d)) == cwd: continue
        for e in exts:
            p = os.path.join(d, name + e)
            if os.path.isfile(p) and os.access(p, os.X_OK): return p
    return None


def run(name, args, timeout=20):
    exe = find_exe(name)
    if not exe: return 127, '', 'not found', None
    try:
        p = subprocess.run([exe, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
        return p.returncode, (p.stdout or '').strip(), (p.stderr or '').strip(), exe
    except Exception as e:  # noqa: BLE001
        return 1, '', str(e), exe


# ---------- facts ----------
def ram_info():
    if os.name == 'nt':
        try:
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong), ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                            ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong), ('ullTotalVirtual', ctypes.c_ulonglong),
                            ('ullAvailVirtual', ctypes.c_ulonglong), ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
            m = MS(); m.dwLength = ctypes.sizeof(MS)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                return {'total_gb': round(m.ullTotalPhys / 2**30, 1), 'available_gb': round(m.ullAvailPhys / 2**30, 1), 'source': 'GlobalMemoryStatusEx'}
        except Exception:  # noqa: BLE001
            pass
    if Path('/proc/meminfo').exists():
        kv = {}
        for l in Path('/proc/meminfo').read_text().splitlines():
            parts = l.split()
            if len(parts) >= 2 and parts[1].isdigit(): kv[parts[0].rstrip(':')] = int(parts[1])
        wsl = 'microsoft' in platform.release().lower()
        return {'total_gb': round(kv.get('MemTotal', 0) / 2**20, 1), 'available_gb': round(kv.get('MemAvailable', 0) / 2**20, 1), 'source': '/proc/meminfo',
                **({'note': 'WSL: this is the WSL virtual machine, not the whole computer'} if wsl else {})}
    return {'note': 'not available on this system'}


def gpu_info():
    q = 'name,driver_version,memory.total,memory.used,compute_cap,power.limit,temperature.gpu'
    code, out, err, exe = run('nvidia-smi', [f'--query-gpu={q}', '--format=csv,noheader,nounits'])
    if code != 0: return {'ok': False, 'error': err or out or f'exit {code}'}
    gpus = [dict(zip(['name', 'driver', 'memory_total_mib', 'memory_used_mib', 'compute_cap', 'power_limit_w', 'temp_c'], [x.strip() for x in l.split(',')])) for l in out.splitlines()]
    _, smi, _, _ = run('nvidia-smi', [])  # only the "CUDA Version" line is kept (the rest lists running programs)
    cuda = next((l.split('CUDA Version:')[-1].strip(' |') for l in smi.splitlines() if 'CUDA Version' in l), '')
    return {'ok': True, 'gpus': gpus, 'driver_cuda': cuda, 'nvidia_smi': exe}


TORCH_PROBE = r'''
import json, time
r = {}
try:
    import torch
except Exception as e:
    print(json.dumps({'ok': False, 'error': 'torch not installed in this Python (' + type(e).__name__ + ')'})); raise SystemExit
r.update(ok=True, version=torch.__version__, cuda_build=torch.version.cuda, cuda_available=torch.cuda.is_available())
if r['cuda_available']:
    d = torch.cuda.get_device_properties(0); arch = torch.cuda.get_arch_list(); cap = d.major * 10 + d.minor
    r.update(device=d.name, capability=f'{d.major}.{d.minor}', total_vram_gb=round(d.total_memory / 2**30, 2), arch_list=arch,
             bf16_supported=torch.cuda.is_bf16_supported(), float8_dtype=hasattr(torch, 'float8_e4m3fn'),
             native_kernels=f'sm_{cap}' in arch, ptx_fallback=any(a.startswith('compute_') and a[8:].isdigit() and int(a[8:]) <= cap for a in arch))
    f, t = torch.cuda.mem_get_info(); r['mem_get_info_gb'] = {'free': round(f / 2**30, 2), 'total': round(t / 2**30, 2)}
    if RUN_TEST:
        try:
            a = torch.randn(4096, 4096, device='cuda', dtype=torch.bfloat16); b = torch.randn_like(a)
            torch.cuda.synchronize(); t0 = time.perf_counter()
            for _ in range(20): c = a @ b
            torch.cuda.synchronize(); el = time.perf_counter() - t0
            r['bf16_matmul_tflops'] = round(20 * 2 * 4096**3 / el / 1e12, 1); r['bf16_matmul_ok'] = bool(torch.isfinite(c).all())
        except Exception as e:
            r['bf16_matmul_error'] = str(e)[:500]
print(json.dumps(r))
'''


def torch_info(run_test: bool):
    """Runs in a separate Python process (-B: no .pyc files) with a time limit, so a hung driver cannot hang this script."""
    try:
        p = subprocess.run([sys.executable, '-B', '-c', 'RUN_TEST=' + repr(run_test) + TORCH_PROBE], capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=180, env={**os.environ, 'PYTHONUTF8': '1'})
        line = next((l for l in reversed(p.stdout.splitlines()) if l.startswith('{')), '')
        return json.loads(line) if line else {'ok': False, 'error': (p.stderr or 'no output')[-500:]}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': 'PyTorch check did not finish within 180 s'}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


_LOCAL = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())  # never via a proxy, never redirected


def comfy_info(urls):
    keep_dev = ('name', 'type', 'vram_total', 'vram_free', 'torch_vram_total')
    for url in urls:
        u = urllib.parse.urlparse(url)
        if u.scheme != 'http' or u.hostname not in ('127.0.0.1', 'localhost', '::1'): continue
        try:
            with _LOCAL.open(url.rstrip('/') + '/system_stats', timeout=5) as resp:
                st = json.loads(resp.read())
            sysi = st.get('system', {})
            return {'ok': True, 'url': url, 'versions': {k: sysi.get(k) for k in ('comfyui_version', 'python_version', 'pytorch_version', 'os')},
                    'ram_total_gb': round((sysi.get('ram_total') or 0) / 2**30, 1),
                    'devices': [{k: d.get(k) for k in keep_dev} for d in st.get('devices', [])]}  # argv and paths are NOT kept
        except Exception as e:  # noqa: BLE001
            last = str(e)
    return {'ok': False, 'error': locals().get('last', 'no local address given')}


def disk_info(path):
    p = Path(path)
    if not p.exists(): return {'error': 'path not found'}
    du = shutil.disk_usage(p)
    return {'drive': p.resolve().anchor or '/', 'free_gb': round(du.free / 2**30, 1), 'total_gb': round(du.total / 2**30, 1)}  # drive only, no folder names


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--disk', default=str(HERE), help='drive/folder where models will live')
    ap.add_argument('--comfy', action='append', default=[], help='local ComfyUI address to query if running (default: 127.0.0.1:8188 and :8000)')
    ap.add_argument('--no-gpu-test', action='store_true', help='skip the PyTorch check')
    ap.add_argument('--require-gpu', action='store_true', help='gate mode: fail unless PyTorch works on this GPU (native kernels + bf16 test)')
    a = ap.parse_args()

    code, ff, _, ffexe = run('ffmpeg', ['-hide_banner', '-version'])
    rep = {
        'timestamp': dt.datetime.now().isoformat(timespec='seconds'), 'tool': 'studio-bench/env_check v4',
        'os': {'system': platform.system(), 'release': platform.release(), 'version': platform.version(), 'machine': platform.machine(), 'wsl': 'microsoft' in platform.release().lower()},
        'python': sys.version.split()[0], 'cpu_count': os.cpu_count(), 'ram': ram_info(), 'disk': disk_info(a.disk),
        'gpu': gpu_info(), 'torch': {'skipped': True} if (a.no_gpu_test and not a.require_gpu) else torch_info(True),
        'ffmpeg': ff.splitlines()[0] if code == 0 and ff else 'not found',
        'ffmpeg_gpl_build': ('--enable-gpl' in ff) if code == 0 else None, 'ffmpeg_nonfree_build': ('--enable-nonfree' in ff) if code == 0 else None,
        'comfyui': comfy_info(a.comfy or ['http://127.0.0.1:8188', 'http://127.0.0.1:8000']),
    }
    rep = redact(rep)

    g, t = rep['gpu'], rep['torch']
    print('== GREENTEC studio-bench: environment (read-only) ==')
    print(f"OS: {rep['os']['system']} {rep['os']['release']}{' (WSL)' if rep['os']['wsl'] else ''} | Python {rep['python']} | CPUs {rep['cpu_count']}")
    print(f"RAM: {rep['ram']} | Disk {rep['disk']}")
    print('GPU:', g['gpus'] if g.get('ok') else 'nvidia-smi: ' + g.get('error', ''), '| driver CUDA', g.get('driver_cuda', ''))
    print('PyTorch:', {k: t.get(k) for k in ('version', 'cuda_build', 'cuda_available', 'device', 'capability', 'native_kernels', 'ptx_fallback', 'bf16_matmul_tflops', 'error', 'skipped') if k in t})
    print('FFmpeg:', rep['ffmpeg'], '| GPL build:', rep['ffmpeg_gpl_build'], '| nonfree:', rep['ffmpeg_nonfree_build'])
    print('ComfyUI:', 'running ' + rep['comfyui']['url'] if rep['comfyui']['ok'] else 'not running')
    problems = []
    if not g.get('ok'): problems.append('nvidia-smi not available – check the NVIDIA driver (do not install anything yet)')
    if t.get('ok') and t.get('cuda_available') and not (t.get('native_kernels') or t.get('ptx_fallback')): problems.append('this PyTorch build has no kernels for this GPU')
    if t.get('ok') and not t.get('cuda_available'): problems.append('PyTorch is installed but cannot see CUDA')
    if rep['disk'].get('free_gb') is not None and rep['disk']['free_gb'] < 150: problems.append(f"less than 150 GB free on {rep['disk']['drive']}")
    if a.require_gpu:
        if not t.get('ok'): problems.append('GATE: PyTorch is not usable here: ' + str(t.get('error', 'unknown')))
        elif not t.get('cuda_available'): problems.append('GATE: PyTorch does not see a CUDA GPU')
        else:
            if not t.get('native_kernels'): problems.append(f"GATE: no native kernels for this GPU (capability {t.get('capability')}) in PyTorch {t.get('version')}")
            if t.get('bf16_matmul_error') or not t.get('bf16_matmul_ok'): problems.append('GATE: bf16 test on the GPU failed: ' + str(t.get('bf16_matmul_error', 'non-finite result')))
    rep['problems'] = problems
    print('\nProblems:' if problems else '\nNo blocking problems found.', *(f'\n - {p}' for p in problems))
    rep = redact(rep)
    out = HERE / 'results'; out.mkdir(exist_ok=True)
    f = out / f"env-{dt.datetime.now():%Y%m%d-%H%M%S}.json"
    f.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\nSaved: results/{f.name}  (open it in Notepad before sending)')
    blocking = [p for p in problems if p.startswith('GATE:') or p.startswith('nvidia-smi')] if a.require_gpu else problems
    sys.exit(3 if blocking else 0)


if __name__ == '__main__':
    main()
