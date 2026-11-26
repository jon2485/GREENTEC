#!/bin/bash
# Copy the repo into the local test copy and apply the local-only Prisma adapter patch (engines can't be downloaded here).
set -e
SRC=/home/claude/greentec; DST=/home/claude/gt-test
cd $SRC && tar --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./test-results --exclude=./playwright-report -cf - . | (cd $DST && tar xf -)
cd $DST
python3 - <<'EOF'
import re
p='prisma/schema.prisma';s=open(p).read()
if 'engineType' not in s: s=s.replace('generator client {\n  provider = "prisma-client-js"\n}','generator client {\n  provider   = "prisma-client-js"\n  engineType = "client"\n}',1)
open(p,'w').write(s)
for p in ['lib/db.ts','scripts/seed.mjs','scripts/import-legacy-admin.mjs','scripts/audit-legacy.mjs']:
    s=open(p).read()
    if 'PrismaPg' in s: continue
    s=s.replace('new PrismaClient()','new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })')
    s="import { PrismaPg } from '@prisma/adapter-pg';\n"+s
    open(p,'w').write(s)
EOF
echo synced
