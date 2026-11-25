#!/usr/bin/env python3
"""GREENTEC studio-bench: read-only environment report for the local GPU machine.

Installs nothing, downloads nothing, changes nothing. Prints a report and writes
results/env-<timestamp>.json. Run it before any model download:

    python env_check.py [--comfy http://127.0.0.1:8188] [--disk D:\\models]
"""
import argparse, datetime as dt, json, os, platform, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(cmd, timeout=20):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or '').strip(), (p.stderr or '').strip()
    except FileNotFoundError:
        return 127, '', 'not found'
    except Exception as e:  # noqa: BLE001 – report, never crash
        return 1, '', str(e)


def ram_info():
    try:
        import psutil  # optional
        vm = psutil.virtual_memory()
        return {'total_gb': round(vm.total / 2**30, 1), 'available_gb': round(vm.available / 2**30, 1), 'source': 'psutil'}
    except ImportError:
        pass
    if Path('/proc/meminfo').exists():
        kv = {l.split(':')[0]: int(l.split()[1]) for l in Path('/proc/meminfo').read_text().splitlines() if l.split()[1:2] and l.split()[1].isdigit()}
        return {'total_gb': round(kv.get('MemTotal', 0) / 2**20, 1), 'available_gb': round(kv.get('MemAvailable', 0) / 2**20, 1), 'source': '/proc/meminfo'}
    return {'note': 'install psutil for RAM figures (pip install psutil)'}


def gpu_info():
    q = 'name,driver_version,memory.total,memory.used,compute_cap,power.limit,temperature.gpu'
    code, out, err = run(['nvidia-smi', f'--query-gpu={q}', '--format=csv,noheader,nounits'])
    if code != 0:
        return {'ok': False, 'error': err or out or f'exit {code}'}
    gpus = []
    for line in out.splitlines():
        f = [x.strip() for x in line.split(',')]
        gpus.append(dict(zip(['name', 'driver', 'memory_total_mib', 'memory_used_mib', 'compute_cap', 'power_limit_w', 'temp_c'], f)))
    code, smi, _ = run(['nvidia-smi'])
    cuda_line = next((l for l in smi.splitlines() if 'CUDA Version' in l), '')
    return {'ok': True, 'gpus': gpus, 'driver_cuda': cuda_line.split('CUDA Version:')[-1].strip(' |') if cuda_line else ''}


def torch_info(skip_test=False):
    try:
        import torch
    except ImportError:
        return {'ok': False, 'error': 'torch not installed in this Python environment'}
    r = {'ok': True, 'version': torch.__version__, 'cuda_build': torch.version.cuda, 'cuda_available': torch.cuda.is_available()}
    if not r['cuda_available']:
        return r
    d = torch.cuda.get_device_properties(0)
    r.update({'device': d.name, 'capability': f'{d.major}.{d.minor}', 'total_vram_gb': round(d.total_memory / 2**30, 2),
              'arch_list': torch.cuda.get_arch_list(), 'bf16_supported': torch.cuda.is_bf16_supported(),
              'float8_dtype': hasattr(torch, 'float8_e4m3fn')})
    cap = f'sm_{d.major}{d.minor}'
    r['kernels_for_this_gpu'] = cap in r['arch_list'] or any(a.startswith('compute_') and int(a[8:]) <= d.major * 10 + d.minor for a in r['arch_list'] if a[8:].isdigit())
    free, total = torch.cuda.mem_get_info()
    r['mem_get_info_gb'] = {'free': round(free / 2**30, 2), 'total': round(total / 2**30, 2)}
    if not skip_test:
        try:  # small real compute test, ~200 MB
            a = torch.randn(4096, 4096, device='cuda', dtype=torch.bfloat16); b = torch.randn(4096, 4096, device='cuda', dtype=torch.bfloat16)
            torch.cuda.synchronize(); t = time.perf_counter()
            for _ in range(20): c = a @ b
            torch.cuda.synchronize(); el = time.perf_counter() - t
            r['bf16_matmul_tflops'] = round(20 * 2 * 4096**3 / el / 1e12, 1)
            r['bf16_matmul_ok'] = bool(torch.isfinite(c).all())
            del a, b, c; torch.cuda.empty_cache()
        except Exception as e:  # noqa: BLE001
            r['bf16_matmul_error'] = str(e)
    return r


def comfy_info(url):
    try:
        with urllib.request.urlopen(url.rstrip('/') + '/system_stats', timeout=5) as resp:
            return {'ok': True, 'system_stats': json.loads(resp.read())}
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'error': str(e)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--comfy', default='http://127.0.0.1:8188', help='ComfyUI address (only queried if running)')
    ap.add_argument('--disk', default=str(HERE), help='folder where models/outputs will live')
    ap.add_argument('--no-gpu-test', action='store_true', help='skip the small bf16 matmul test')
    a = ap.parse_args()

    du = shutil.disk_usage(a.disk) if Path(a.disk).exists() else None
    code, ff, _ = run(['ffmpeg', '-hide_banner', '-version'])
    rep = {
        'timestamp': dt.datetime.now().isoformat(timespec='seconds'),
        'os': {'system': platform.system(), 'release': platform.release(), 'version': platform.version(), 'machine': platform.machine(), 'wsl': 'microsoft' in platform.release().lower()},
        'python': sys.version.split()[0], 'cpu_count': os.cpu_count(), 'ram': ram_info(),
        'disk': {'path': a.disk, 'free_gb': round(du.free / 2**30, 1), 'total_gb': round(du.total / 2**30, 1)} if du else {'path': a.disk, 'error': 'path not found'},
        'gpu': gpu_info(), 'torch': torch_info(a.no_gpu_test),
        'ffmpeg': ff.splitlines()[0] if code == 0 and ff else 'not found',
        'ffmpeg_config_gpl': ('--enable-gpl' in ff) if code == 0 else None,
        'ffmpeg_config_nonfree': ('--enable-nonfree' in ff) if code == 0 else None,
        'comfyui': comfy_info(a.comfy),
    }
    out = HERE / 'results'; out.mkdir(exist_ok=True)
    f = out / f"env-{dt.datetime.now():%Y%m%d-%H%M%S}.json"
    f.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding='utf-8')

    g, t = rep['gpu'], rep['torch']
    print('== GREENTEC studio-bench: environment ==')
    print(f"OS: {rep['os']['system']} {rep['os']['release']}{' (WSL)' if rep['os']['wsl'] else ''} | Python {rep['python']} | CPUs {rep['cpu_count']}")
    print(f"RAM: {rep['ram']} | Disk {rep['disk']}")
    print('GPU:', g['gpus'] if g.get('ok') else 'nvidia-smi: ' + g.get('error', ''), '| driver CUDA', g.get('driver_cuda', ''))
    print('PyTorch:', {k: t.get(k) for k in ('version', 'cuda_build', 'cuda_available', 'device', 'capability', 'kernels_for_this_gpu', 'bf16_matmul_tflops', 'error') if k in t})
    print('FFmpeg:', rep['ffmpeg'], '| GPL build:', rep['ffmpeg_config_gpl'], '| nonfree:', rep['ffmpeg_config_nonfree'])
    print('ComfyUI:', 'running' if rep['comfyui']['ok'] else 'not reachable (' + rep['comfyui']['error'][:80] + ')')
    problems = []
    if not g.get('ok'): problems.append('nvidia-smi not available – check the NVIDIA driver')
    if t.get('ok') and t.get('cuda_available') and not t.get('kernels_for_this_gpu'): problems.append('this PyTorch build has no kernels for this GPU architecture – install a build that supports it')
    if t.get('ok') and not t.get('cuda_available'): problems.append('PyTorch cannot see CUDA')
    if du and du.free < 250 * 2**30: problems.append(f'less than 250 GB free on {a.disk}')
    print('\nProblems:' if problems else '\nNo blocking problems found.', *(f'\n - {p}' for p in problems))
    print(f'\nSaved: {f}')


if __name__ == '__main__':
    main()
