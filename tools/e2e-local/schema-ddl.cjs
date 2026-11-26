// Local-only: builds Postgres DDL from prisma/schema.prisma (prisma db push can't run here: engine downloads are blocked).
const { getDMMF } = require('@prisma/internals');
const fs = require('fs');
const q = (s) => `"${s}"`;
const T = { String: 'TEXT', Int: 'INTEGER', BigInt: 'BIGINT', Float: 'DOUBLE PRECISION', Boolean: 'BOOLEAN', DateTime: 'TIMESTAMP(3)', Json: 'JSONB', Bytes: 'BYTEA' };
function colType(f) {
  if (f.nativeType) { const [n, a] = f.nativeType; if (n === 'Decimal') return `DECIMAL(${a.join(',')})`; if (n === 'VarChar') return `VARCHAR(${a[0] || ''})`; if (n === 'Text') return 'TEXT'; if (n === 'Date') return 'DATE'; if (n === 'Timestamptz') return `TIMESTAMPTZ(${a[0] || 3})`; if (n === 'SmallInt') return 'SMALLINT'; if (n === 'Real') return 'REAL'; }
  if (f.type === 'Decimal') return 'DECIMAL(65,30)';
  return T[f.type] || 'TEXT';
}
function def(f) {
  if (!f.hasDefaultValue) return '';
  const d = f.default;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    if (d.name === 'now') return ' DEFAULT CURRENT_TIMESTAMP';
    return ''; // autoincrement / cuid / uuid handled elsewhere / client side
  }
  if (Array.isArray(d)) return ` DEFAULT ARRAY[${d.map((x) => (typeof x === 'string' ? `'${x.replace(/'/g, "''")}'` : x)).join(',')}]::${colType(f)}[]`;
  if (typeof d === 'string') return ` DEFAULT '${d.replace(/'/g, "''")}'` + (f.type === 'Json' ? '::jsonb' : '');
  if (typeof d === 'boolean' || typeof d === 'number') return ` DEFAULT ${d}`;
  return '';
}
getDMMF({ datamodel: fs.readFileSync(process.argv[2], 'utf8') }).then(({ datamodel: dm }) => {
  const out = [], fks = [], idx = [];
  for (const e of dm.enums) out.push(`CREATE TYPE ${q(e.dbName || e.name)} AS ENUM (${e.values.map((v) => `'${v.dbName || v.name}'`).join(', ')});`);
  const tbl = (m) => m.dbName || m.name;
  for (const m of dm.models) {
    const cols = [];
    for (const f of m.fields.filter((x) => x.kind !== 'object')) {
      const auto = f.default && f.default.name === 'autoincrement';
      let t = auto ? (f.type === 'BigInt' ? 'BIGSERIAL' : 'SERIAL') : f.kind === 'enum' ? q(f.type) : colType(f);
      if (f.isList) t += '[]';
      cols.push(`  ${q(f.dbName || f.name)} ${t}${f.isRequired && !f.isList ? ' NOT NULL' : ''}${auto ? '' : def(f)}`);
      if (f.isUnique) idx.push(`CREATE UNIQUE INDEX ${q(`${tbl(m)}_${f.name}_key`)} ON ${q(tbl(m))}(${q(f.dbName || f.name)});`);
    }
    const pk = m.fields.filter((x) => x.isId).map((x) => x.dbName || x.name);
    const pkc = pk.length ? pk : m.primaryKey ? m.primaryKey.fields : [];
    if (pkc.length) cols.push(`  CONSTRAINT ${q(tbl(m) + '_pkey')} PRIMARY KEY (${pkc.map(q).join(', ')})`);
    out.push(`CREATE TABLE ${q(tbl(m))} (\n${cols.join(',\n')}\n);`);
    for (const u of m.uniqueFields || []) idx.push(`CREATE UNIQUE INDEX ${q(`${tbl(m)}_${u.join('_')}_key`)} ON ${q(tbl(m))}(${u.map(q).join(', ')});`);
    for (const f of m.fields.filter((x) => x.kind === 'object' && x.relationFromFields && x.relationFromFields.length)) {
      const to = dm.models.find((x) => x.name === f.type);
      const od = { Cascade: 'CASCADE', SetNull: 'SET NULL', Restrict: 'RESTRICT', NoAction: 'NO ACTION', SetDefault: 'SET DEFAULT' }[f.relationOnDelete] || (f.isRequired ? 'RESTRICT' : 'SET NULL');
      fks.push(`ALTER TABLE ${q(tbl(m))} ADD CONSTRAINT ${q(`${tbl(m)}_${f.relationFromFields.join('_')}_fkey`)} FOREIGN KEY (${f.relationFromFields.map(q).join(', ')}) REFERENCES ${q(tbl(to))}(${f.relationToFields.map(q).join(', ')}) ON DELETE ${od} ON UPDATE CASCADE;`);
    }
  }
  // @@index([...]) lines (DMMF in this version doesn't expose them): parse the schema text
  const src = fs.readFileSync(process.argv[2], 'utf8');
  for (const mm of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) for (const ii of mm[2].matchAll(/@@index\(\[([^\]]+)\]\)/g)) {
    const fsx = ii[1].split(',').map((s) => s.trim()); idx.push(`CREATE INDEX ${q(`${mm[1]}_${fsx.join('_')}_idx`)} ON ${q(mm[1])}(${fsx.map(q).join(', ')});`);
  }
  process.stdout.write(out.concat(idx, fks).join('\n') + '\n');
});
