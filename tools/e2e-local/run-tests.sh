#!/bin/bash
cd /home/claude/gt-test && set -a; . ./.env.local; set +a
export CHROME_PATH=/usr/bin/google-chrome BASE_URL=http://localhost:3100 STAGING_BASE_URL=http://localhost:3101 SHOWCASE_TOKEN=e2e-showcase-token-0123456789abcdefXYZ PROD_BASE_URL=http://localhost:3102
timeout 1200 npx playwright test --reporter=json "$@" 2>/dev/null > /tmp/pw.json
python3 - <<'PY'
import json,re
d=json.load(open('/tmp/pw.json'))
def walk(s,path=''):
    for sp in s.get('specs',[]):
        for t in sp['tests']:
            for r in t['results']:
                if r['status']!='passed':
                    msg=re.sub(r'\x1b\[[0-9;]*m','',(r.get('error') or {}).get('message','') if r.get('error') else '')
                    print('##',r['status'],'|',t.get('projectName'),'|',path,'>',sp['title']); print('  ',msg.strip()[:1200]); print()
    for c in s.get('suites',[]): walk(c,path+' > '+c['title'])
for s in d['suites']: walk(s,s['title'])
print(d['stats'])
PY
