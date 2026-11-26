# End-to-end tests (Playwright)

Tests live in `tests/e2e/*.spec.ts` and run against a running site with a **seeded database**
(they read and change rows through Prisma, e.g. create a test customer, pin a product, set stock).
Never point them at production.

```bash
# a normal environment (Prisma engines download fine):
npx prisma db push && node scripts/seed.mjs && node scripts/import-legacy-admin.mjs --once
npm run build && npm start &              # http://localhost:3000, with TEST_PAYMENTS=1 or STAGING=1
BASE_URL=http://localhost:3000 npm run test:e2e
```

Optional variables:
- `STAGING_BASE_URL` + `SHOWCASE_TOKEN` – a second instance started with `STAGING=1 STAGING_USER=… STAGING_PASS=… SHOWCASE_TOKEN=…`
  (checks the basic-auth gate and the supplier showcase link).
- `PROD_BASE_URL` – an instance with neither `STAGING` nor `TEST_PAYMENTS` (checks that the simulated payment is closed).
- `CHROME_PATH` – a local Chrome when Playwright's own browsers aren't installed.

## Claude's cloud sandbox (Prisma engine downloads are blocked)

The files here were used to run the suite in a sandbox where `binaries.prisma.sh` is unreachable:
- `schema-ddl.cjs` builds the Postgres DDL from `prisma/schema.prisma` (instead of `prisma db push`):
  `node tools/e2e-local/schema-ddl.cjs prisma/schema.prisma | psql …`
- `sync.sh` copies the repo to a scratch folder and switches *that copy only* to Prisma's Rust-free client
  (`engineType = "client"` + `@prisma/adapter-pg`, installed with `npm i --no-save @prisma/adapter-pg@6.19.0 pg @prisma/internals@6.19.0`).
  Generate with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/bin/true npx prisma generate`.
- `restart.sh` builds and starts three instances (normal :3100, staging-gated :3101, production-like :3102); `run-tests.sh` runs the suite and prints the failures.

Don't commit those adapter changes: production uses the normal Prisma engine.
