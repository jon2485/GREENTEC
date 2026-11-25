"""GREENTEC studio-bench – Python tool tests (run on windows-latest and ubuntu-latest by GitHub Actions).

Uses temporary folders, a mock nvidia-smi, a stub 'torch' package and an in-process fake ComfyUI
HTTP server. These test the tools' own logic only – they are NOT evidence that any model runs.
"""
import http.server, json, os, shutil, subprocess, sys, tempfile, textwrap, threading, unittest
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
PY = sys.executable
WIN = os.name == 'nt'


def run(args, env=None, cwd=None, timeout=120):
    e = {**os.environ, **(env or {})}
    p = subprocess.run([PY, '-B', *map(str, args)], capture_output=True, text=True, encoding='utf-8', errors='replace', env=e, cwd=cwd, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def make_mock_smi(folder: Path, driver='621.14'):
    folder.mkdir(parents=True, exist_ok=True)
    if WIN:
        (folder / 'nvidia-smi.cmd').write_text(textwrap.dedent(f'''\
            @echo off
            echo %* | findstr /C:"--query-gpu=name" >nul && (echo NVIDIA RTX PRO 5000 Blackwell, {driver}, 48935, 12.0, 300.00, 900, 40& exit /b 0)
            echo %* | findstr /C:"--query-gpu=memory.used" >nul && (echo 900& exit /b 0)
            echo ^| NVIDIA-SMI {driver}   Driver Version: {driver}   CUDA Version: 13.0 ^|
            '''), encoding='ascii')
    else:
        p = folder / 'nvidia-smi'
        p.write_text(textwrap.dedent(f'''\
            #!/bin/sh
            case "$*" in
              *--query-gpu=name*) echo "NVIDIA RTX PRO 5000 Blackwell, {driver}, 48935, 12.0, 300.00, 900, 40";;
              *--query-gpu=memory.used*) echo 900;;
              *) echo "| NVIDIA-SMI {driver}   Driver Version: {driver}   CUDA Version: 13.0 |";;
            esac
            '''))
        p.chmod(0o755)
    return folder


def make_torch_stub(folder: Path, native=True, matmul_ok=True):
    t = folder / 'torch'; t.mkdir(parents=True, exist_ok=True)
    arch = "['sm_90', 'sm_120']" if native else "['sm_90', 'compute_90']"
    (t / '__init__.py').write_text(textwrap.dedent(f'''\
        # test stub only – not PyTorch
        __version__ = '2.14.1+cu130-stub'; float8_e4m3fn = object(); bfloat16 = 'bf16'
        class version: cuda = '13.0'
        class _P: name = 'Stub RTX PRO 5000'; major = 12; minor = 0; total_memory = 48 * 2**30
        class _T:
            def __matmul__(s, o): return s
        def isfinite(x):
            class R:
                def all(self): return {matmul_ok}
            return R()
        def randn(*a, **k): return _T()
        def randn_like(x): return _T()
        class cuda:
            is_available = staticmethod(lambda: True); get_device_properties = staticmethod(lambda i: _P())
            get_arch_list = staticmethod(lambda: {arch}); is_bf16_supported = staticmethod(lambda: True)
            mem_get_info = staticmethod(lambda: (40 * 2**30, 48 * 2**30)); synchronize = staticmethod(lambda: None)
        '''))
    return folder


class EnvCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()); self.tool = self.tmp / 'bench'; shutil.copytree(BENCH, self.tool, ignore=shutil.ignore_patterns('results', '__pycache__', 'out'))
        self.env = {'PATH': str(make_mock_smi(self.tmp / 'bin')) + os.pathsep + os.environ['PATH']}

    def tearDown(self): shutil.rmtree(self.tmp, ignore_errors=True)

    def gate(self, **stub):
        env = dict(self.env)
        if stub is not None and stub.get('install', True):
            env['PYTHONPATH'] = str(make_torch_stub(self.tmp / 'stub', stub.get('native', True), stub.get('matmul_ok', True)))
        return run([self.tool / 'env_check.py', '--require-gpu', '--disk', self.tmp], env=env)

    def test_gate_passes_with_native_kernels(self):
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_gate_fails_without_native_kernels(self):
        code, out = self.gate(native=False)
        self.assertEqual(code, 3, out); self.assertIn('GATE: no native kernels', out)

    def test_gate_fails_when_bf16_test_fails(self):
        code, out = self.gate(matmul_ok=False)
        self.assertEqual(code, 3, out); self.assertIn('GATE: bf16 test', out)

    def test_gate_fails_without_torch(self):
        code, out = run([self.tool / 'env_check.py', '--require-gpu', '--disk', self.tmp], env=self.env)
        self.assertEqual(code, 3, out); self.assertIn('GATE: PyTorch is not usable', out)

    def test_report_has_no_user_or_host_names(self):
        self.gate()
        rep = next((self.tool / 'results').glob('env-*.json')).read_text(encoding='utf-8')
        for secret in {Path.home().name, os.environ.get('USERNAME', ''), os.environ.get('USER', '')}:
            if secret and len(secret) > 2:
                self.assertNotRegex(rep, r'(?i)(?<![A-Za-z0-9])' + secret + r'(?![A-Za-z0-9])')

    def test_scrub_windows_paths(self):
        sys.path.insert(0, str(self.tool))
        import importlib, env_check; importlib.reload(env_check)
        self.assertEqual(env_check.scrub(r'C:\Users\Yossi.Cohen\x'), r'C:\Users\<USER>\x')
        self.assertEqual(env_check.scrub('/mnt/c/Users/Dan/x'), '/mnt/c/Users/<USER>/x')


class MeasureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()); self.tool = self.tmp / 'bench'; shutil.copytree(BENCH, self.tool, ignore=shutil.ignore_patterns('results', '__pycache__', 'out'))

    def tearDown(self): shutil.rmtree(self.tmp, ignore_errors=True)

    def last(self):
        return json.loads((self.tool / 'results' / 'runs.jsonl').read_text(encoding='utf-8').splitlines()[-1])

    def test_ok_and_output_hashed(self):
        out = self.tmp / 'o'; out.mkdir()
        code, txt = run([self.tool / 'measure.py', '--model', 't', '--profile', 'p', '--case', 'T', '--outputs', out, '--', 'python', '-c', f"open(r'{out / 'a.txt'}','w').write('x')"])
        self.assertEqual(code, 0, txt); r = self.last(); self.assertEqual(r['status'], 'ok'); self.assertEqual(len(r['outputs']), 1)

    def test_oom_category(self):
        run([self.tool / 'measure.py', '--model', 't', '--profile', 'p', '--case', 'T', '--', 'python', '-c', "import sys;print('torch.OutOfMemoryError: CUDA out of memory');sys.exit(1)"])
        self.assertEqual(self.last()['failure_category'], 'oom')

    def test_nan_is_case_sensitive(self):
        run([self.tool / 'measure.py', '--model', 't', '--profile', 'p', '--case', 'T', '--', 'python', '-c', "import sys;print('nanobind nanoseconds');sys.exit(1)"])
        self.assertEqual(self.last()['failure_category'], 'other')

    def test_timeout_kills_grandchildren(self):
        marker = self.tmp / 'grandchild_alive.txt'
        grand = self.tmp / 'grand.py'; grand.write_text(f"import time\ntime.sleep(6)\nopen({str(marker)!r}, 'w').write('x')\n")
        parent = self.tmp / 'parent.py'; parent.write_text(f"import subprocess, sys, time\nsubprocess.Popen([sys.executable, {str(grand)!r}])\ntime.sleep(60)\n")
        code, txt = run([self.tool / 'measure.py', '--model', 't', '--profile', 'p', '--case', 'T', '--timeout', '2', '--', 'python', parent])
        rec = self.last()
        self.assertEqual(rec['status'], 'timeout', f"{txt}\n{rec.get('error_tail')}")
        import time; time.sleep(7)
        self.assertFalse(marker.exists(), 'grandchild survived the timeout')

    def test_missing_program(self):
        run([self.tool / 'measure.py', '--model', 't', '--profile', 'p', '--case', 'T', '--', 'definitely_not_a_program_xyz'])
        self.assertEqual(self.last()['failure_category'], 'missing_program')


class FakeComfy(http.server.BaseHTTPRequestHandler):
    history = {}; prompts = []
    def log_message(self, *a): pass
    def _j(self, o, code=200):
        b = json.dumps(o).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if self.path == '/prompt':
            FakeComfy.prompts.append(json.loads(body)['prompt'])
            FakeComfy.history['p1'] = {'status': {'status_str': 'success', 'completed': True, 'messages': []}, 'outputs': {'9': {'images': [
                {'filename': '../../evil.png', 'subfolder': '', 'type': 'output'}, {'filename': 'x.png', 'subfolder': 'a', 'type': 'output'}, {'filename': 'x.png', 'subfolder': 'b', 'type': 'output'}]}}}
            return self._j({'prompt_id': 'p1', 'number': 1, 'node_errors': {}})
        if self.path == '/upload/image':
            ok = b'name="overwrite"\r\n\r\nfalse' in body and b'studio-bench' in body
            return self._j({'name': 'ref.png', 'subfolder': 'studio-bench' if ok else '', 'type': 'input'})
        return self._j({})
    def do_GET(self):
        if self.path.startswith('/history/'): return self._j(FakeComfy.history)
        if self.path.startswith('/view'):
            self.send_response(200); self.send_header('Content-Length', '4'); self.end_headers(); self.wfile.write(b'DATA')


class ComfyRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), FakeComfy); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()

    def test_upload_set_traversal_and_proxy_ignored(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            wf = tmp / 'wf.json'; wf.write_bytes(b'\xef\xbb\xbf' + json.dumps({'3': {'inputs': {'seed': 1}}, '41': {'inputs': {'image': 'x'}}}).encode())
            ref = tmp / 'ref.png'; ref.write_bytes(b'img'); out = tmp / 'out'
            env = {'HTTP_PROXY': 'http://127.0.0.1:9', 'http_proxy': 'http://127.0.0.1:9'}
            code, txt = run([BENCH / 'comfy_run.py', wf, '--out', out, '--server', f'http://127.0.0.1:{self.port}', '--upload', ref, '--set', '41.inputs.image=@1', '--set', '3.inputs.seed=42'], env=env)
            self.assertEqual(code, 0, txt)
            self.assertEqual(FakeComfy.prompts[-1]['41']['inputs']['image'], 'studio-bench/ref.png')
            self.assertEqual(FakeComfy.prompts[-1]['3']['inputs']['seed'], 42)
            files = sorted(p.name for p in out.iterdir())
            self.assertIn('9_a_x.png', files); self.assertIn('9_b_x.png', files)
            self.assertTrue(all((out / f).resolve().parent == out.resolve() for f in files))
            self.assertFalse((tmp / 'evil.png').exists())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_refuses_non_local_server(self):
        code, txt = run([BENCH / 'comfy_run.py', 'x.json', '--out', 'o', '--server', 'http://10.0.0.1:8188'])
        self.assertNotEqual(code, 0); self.assertIn('Only a ComfyUI on this computer', txt)


class CompareTests(unittest.TestCase):
    def test_excel_bom_csv(self):
        tmp = Path(tempfile.mkdtemp()); tool = tmp / 'bench'; shutil.copytree(BENCH, tool, ignore=shutil.ignore_patterns('results', '__pycache__', 'out'))
        try:
            res = tool / 'results'; res.mkdir()
            (res / 'runs.jsonl').write_text(json.dumps({'run_id': 'R1', 'model': 'm', 'profile': 'p', 'case': 'B1', 'status': 'ok', 'seconds': 1, 'gpu_mib': {'peak': None, 'peak_delta': None}, 'ram_mib': {'peak': None}, 'log': 'l'}) + '\n{broken\n', encoding='utf-8')
            (res / 'scores.csv').write_bytes('\ufeffrun_id,rater,criterion,score,notes\nR1,owner,art_lines,4,ok\nR1,owner,art_colors,9,bad\n'.encode('utf-8'))
            code, txt = run([tool / 'compare.py'])
            rep = (res / 'report.md').read_text(encoding='utf-8')
            self.assertEqual(code, 0, txt); self.assertIn('4.0', rep); self.assertIn('skipped 1 unreadable run line(s) and 1 invalid score row(s)', rep)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
