import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
import { writeFileSync } from 'node:fs';
import { sql, closeDb } from '../src/server/db';
import {
  isRawRowManifest,
  verifyRawRowChunks,
  type RawRowChunk,
} from '../src/integrations/seed-snapshot';
const version = 'KAIA-DEMO-2026.09-v4';
const checks: { name: string; result: 'passed'; actual: unknown }[] = [];
function check(name: string, actual: unknown, expected: unknown = true) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  checks.push({ name, result: 'passed', actual });
}
async function main() {
  const [meta] = await sql()`SELECT * FROM kaia_datasets WHERE version=${version}`;
  const [counts] =
    await sql()`SELECT count(*)::int AS n,min(year) AS first,max(year) AS last,count(*) FILTER (WHERE kind='actual' AND (year>2026 OR (year=2026 AND month>9)))::int AS future_actual FROM kaia_ledger WHERE dataset_version=${version}`;
  check('expanded financial rows persisted', counts.n, 1_245_024);
  check('metadata agrees with ledger count', meta.row_count, counts.n);
  check('historical coverage', counts.first, 2020);
  check('forecast coverage', counts.last, 2032);
  check('no invented future actuals', counts.future_actual, 0);
  const [docs] =
    await sql()`SELECT count(*)::int AS n FROM kaia_documents WHERE dataset_version=${version}`;
  check('searchable documents persisted', docs.n, 1742);
  check('metadata agrees with document count', meta.document_count, docs.n);
  const [profiles] =
    await sql()`SELECT count(*)::int AS n FROM kaia_municipal_profiles WHERE dataset_version=${version}`;
  const [benchmarks] =
    await sql()`SELECT count(*)::int AS n FROM kaia_municipal_benchmarks WHERE dataset_version=${version}`;
  check('six municipality profiles persisted', profiles.n, 6);
  check('versioned area benchmarks persisted', benchmarks.n, 16506);
  const [reconciliation] =
    await sql()`WITH ledger AS (SELECT e.area,l.year,l.month,l.kind,sum(l.amount_ore) AS total FROM kaia_ledger l JOIN kaia_entities e ON e.dataset_version=l.dataset_version AND e.id=l.entity_id WHERE l.dataset_version=${version} GROUP BY e.area,l.year,l.month,l.kind), benchmarks AS (SELECT area,year,month,kind,(data->>'amountOre')::bigint AS total FROM kaia_municipal_benchmarks WHERE dataset_version=${version} AND municipality_id='municipality-kalundborg') SELECT count(*)::int AS differences FROM ledger l FULL JOIN benchmarks b USING(area,year,month,kind) WHERE l.total IS DISTINCT FROM b.total`;
  check(
    'every canonical municipal area/month/kind total agrees with own ledger',
    reconciliation.differences,
    0,
  );
  const [snapshot] = await sql()`SELECT * FROM kaia_lake_snapshots WHERE id=${`seed-${version}`}`;
  if (!isRawRowManifest(snapshot.raw_payload))
    throw new Error('Expanded snapshot does not have a bounded raw manifest.');
  check('raw snapshot uses bounded chunks', snapshot.raw_payload.rowChunkCount, 125);
  async function* parts() {
    for (let ordinal = 0; ordinal < snapshot.raw_payload.rowChunkCount; ordinal++) {
      const [part] = await sql()<
        RawRowChunk[]
      >`SELECT ordinal,payload,content_hash,row_count FROM kaia_lake_raw_chunks WHERE snapshot_id=${snapshot.id} AND ordinal=${ordinal}`;
      if (!part) throw new Error('Raw snapshot part missing.');
      yield part;
    }
  }
  const reconstructed = await verifyRawRowChunks(snapshot.raw_payload, parts());
  check(
    'complete raw snapshot reconstructed with original SHA256',
    reconstructed,
    meta.content_hash,
  );
  check(
    'lake and curated dataset have same immutable content hash',
    snapshot.content_hash,
    meta.content_hash,
  );
  const report = {
    testedAt: new Date().toISOString(),
    environment: process.env.KAIA_VERIFY_ENV || 'local-development-postgres',
    version,
    checks,
  };
  writeFileSync('docs/expanded-database-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ version, checks: checks.length, passed: true }));
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Verification failed');
    process.exitCode = 1;
  })
  .finally(closeDb);
