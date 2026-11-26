#!/bin/bash
# rebuild the test copy and restart the three local instances (normal / staging-gated / production-like)
cd /home/claude/gt-test && ./sync.sh >/dev/null
pkill -f "next-server" ; pkill -f "next start"; sleep 2
set -a; . ./.env.local; set +a
npx next build > /tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }
nohup npx next start -p 3100 > /tmp/next.log 2>&1 &
STAGING=1 STAGING_USER=stg STAGING_PASS=stgpass SHOWCASE_TOKEN=e2e-showcase-token-0123456789abcdefXYZ nohup npx next start -p 3101 > /tmp/next-stg.log 2>&1 &
STAGING= TEST_PAYMENTS= nohup npx next start -p 3102 > /tmp/next-prod.log 2>&1 &
sleep 6; for p in 3100 3101 3102; do curl -s -o /dev/null -w "$p %{http_code}  " http://localhost:$p/; done; echo
