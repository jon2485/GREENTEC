"""Shared safety helpers for measure.py / comfy_run.py / compare.py (env_check.py is standalone on purpose)."""
import os, platform, re, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def utf8_stdio():
    for s in (sys.stdout, sys.stderr):
        try: s.reconfigure(encoding='utf-8', errors='replace')
        except Exception: pass


# ---------- privacy ----------
_USER_DIR = re.compile(r'(?i)([A-Z]:[\\/]+Users[\\/]+|/mnt/[a-z]/Users/|/home/|/Users/)([^\\/"\s]+)')


def scrub(text):
    if not isinstance(text, str): return text
    home = Path.home()
    for v in sorted({str(home), str(home).replace('\\', '/')}, key=len, reverse=True):
        if len(v) > 3: text = re.sub(re.escape(v), '<HOME>', text, flags=re.I)
    hosts = {platform.node(), os.environ.get('COMPUTERNAME', '')}
    for v in {os.environ.get('USERNAME', ''), os.environ.get('USER', ''), home.name, *hosts}:
        if v and len(v) > 2:
            text = re.sub(r'(?<![A-Za-z0-9])' + re.escape(v) + r'(?![A-Za-z0-9])', '<HOST>' if v in hosts else '<USER>', text, flags=re.I)
    return _USER_DIR.sub(lambda m: m.group(1) + '<USER>', text)


def redact(obj):
    if isinstance(obj, dict): return {k: redact(v) for k, v in obj.items()}
    if isinstance(obj, list): return [redact(v) for v in obj]
    return scrub(obj) if isinstance(obj, str) else obj


def rel(p):
    """Path relative to the tool folder when possible (no absolute user paths in records)."""
    try: return str(Path(p).resolve().relative_to(HERE))
    except Exception: return scrub(str(p))


# ---------- local-only HTTP ----------
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, f'redirect to {newurl} refused', headers, fp)


LOCAL = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())  # ignores HTTP_PROXY / system proxy


def is_local_http(url: str) -> bool:
    u = urllib.parse.urlparse(url)
    return u.scheme == 'http' and (u.hostname or '') in ('127.0.0.1', 'localhost', '::1')


# ---------- safe program lookup (never the current folder) ----------
def find_exe(name):
    if os.path.isabs(name): return name if os.path.isfile(name) else None
    exts = os.environ.get('PATHEXT', '.EXE;.BAT;.CMD').lower().split(';') if os.name == 'nt' else ['']
    cwd = os.path.normcase(os.path.abspath(os.getcwd()))
    for d in os.environ.get('PATH', '').split(os.pathsep):
        if not d or d == '.' or os.path.normcase(os.path.abspath(d)) == cwd: continue
        for e in exts:
            p = os.path.join(d, name + e)
            if os.path.isfile(p) and os.access(p, os.X_OK): return p
    return None


def resolve_cmd(cmd):
    """'python'/'python3'/'py' → this interpreter; other programs → full path from PATH (not the current folder)."""
    if not cmd: return cmd
    head = cmd[0]
    if head.lower() in ('python', 'python3', 'py', 'python.exe', 'python3.exe', 'py.exe'): return [sys.executable, *cmd[1:]]
    exe = find_exe(head)
    return [exe, *cmd[1:]] if exe else cmd
