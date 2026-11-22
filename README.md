# GREENTEC 2.0

New greentec.co.il: Next.js 15 + PostgreSQL (Prisma) + Railway Storage Bucket for digital downloads.
See **CLAUDE.md** for the full brief, decisions, structure and remaining work.

```bash
npm install
cp .env.example .env   # set DATABASE_URL etc.
npx prisma db push && npm run seed
npm run dev
```
