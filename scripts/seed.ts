import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { generateDataset } from '../src/domain/data';
import { createHash } from 'node:crypto';
import { sql, closeDb } from '../src/server/db';
import {
  isRawRowManifest,
  rawRowChunks,
  rawRowManifest,
  verifyRawRowChunks,
  type RawRowChunk,
} from '../src/integrations/seed-snapshot';
async function main() {
  const d = generateDataset({
    version: process.env.KAIA_DATASET_VERSION,
    seed: process.env.KAIA_DATASET_SEED,
    referenceDate: process.env.KAIA_REFERENCE_DATE,
  });
  const raw = {
    version: d.version,
    seed: d.seed,
    referenceDate: d.referenceDate,
    entities: d.entities,
    rows: d.rows,
    documents: d.documents,
    demography: d.demography,
    ...(d.coverage ? { coverage: d.coverage } : {}),
    ...(d.municipalities
      ? {
          municipalities: d.municipalities,
          municipalBenchmarks: d.municipalBenchmarks,
          municipalMetadata: d.municipalMetadata,
        }
      : {}),
  };
  const contentHash = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  const [existing] = await sql()`SELECT * FROM kaia_datasets WHERE version=${d.version}`;
  if (existing) {
    if (
      existing.seed !== d.seed ||
      existing.reference_date !== d.referenceDate ||
      existing.row_count !== d.rows.length ||
      existing.content_hash !== contentHash
    )
      throw new Error('Snapshot-version collision');
    const [snapshot] =
      await sql()`SELECT id,raw_payload,content_hash FROM kaia_lake_snapshots WHERE id=${`seed-${d.version}`}`;
    if (!snapshot || snapshot.content_hash !== contentHash)
      throw new Error('Rå snapshot mangler eller har ændret checksum.');
    if (isRawRowManifest(snapshot.raw_payload)) {
      async function* chunks() {
        for (let ordinal = 0; ordinal < snapshot.raw_payload.rowChunkCount; ordinal++) {
          const [part] = await sql()<
            RawRowChunk[]
          >`SELECT ordinal,payload,content_hash,row_count FROM kaia_lake_raw_chunks WHERE snapshot_id=${snapshot.id} AND ordinal=${ordinal}`;
          if (!part) throw new Error('Rå snapshot mangler en del.');
          yield part;
        }
      }
      if ((await verifyRawRowChunks(snapshot.raw_payload, chunks())) !== contentHash)
        throw new Error('Rå snapshot kan ikke genskabes med samme checksum.');
    }
    console.log(`Snapshot ${d.version} findes allerede; brugerkonti og samtaler bevaret.`);
    await closeDb();
    return;
  }
  await sql().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(610942)`;
    const [concurrent] =
      await tx`SELECT content_hash FROM kaia_datasets WHERE version=${d.version}`;
    if (concurrent) {
      if (concurrent.content_hash !== contentHash) throw new Error('Snapshot-version collision');
      return;
    }
    for (const e of d.entities)
      await tx`INSERT INTO kaia_entities(dataset_version,id,area,data) VALUES(${d.version},${e.id},${e.area},${tx.json(e as never)}) ON CONFLICT DO NOTHING`;
    for (let i = 0; i < d.rows.length; i += 1000) {
      const rows = d.rows.slice(i, i + 1000).map((r) => ({
        dataset_version: r.datasetVersion,
        id: r.id,
        entity_id: r.entityId,
        year: r.year,
        month: r.month,
        category: r.category,
        kind: r.kind,
        amount_ore: r.amountOre,
        quantity: r.quantity ?? null,
        unit_price_ore: r.unitPriceOre ?? null,
      }));
      await tx`INSERT INTO kaia_ledger ${tx(rows)} ON CONFLICT DO NOTHING`;
    }
    for (const doc of d.documents)
      await tx`INSERT INTO kaia_documents(dataset_version,id,area,classification,data) VALUES(${d.version},${doc.id},${doc.area},${doc.classification},${tx.json(doc as never)}) ON CONFLICT DO NOTHING`;
    const chunked = d.rows.length > 250_000;
    const snapshotId = `seed-${d.version}`;
    await tx`INSERT INTO kaia_lake_snapshots(id,source_id,dataset_version,observed_at,retrieved_at,schema_version,content_hash,raw_payload,entity_ids,row_count) VALUES(${snapshotId},'demo-ledger',${d.version},${new Date(d.referenceDate + 'T00:00:00Z')},${new Date()},${chunked ? 'kaia-generator-v2' : 'kaia-generator-v1'},${contentHash},${tx.json((chunked ? rawRowManifest(raw) : raw) as never)},${tx.json(d.entities.filter((e) => e.type !== 'committee').map((e) => e.id))},${d.rows.length}) ON CONFLICT DO NOTHING`;
    if (chunked)
      for (const chunk of rawRowChunks(d.rows)) {
        await tx`INSERT INTO kaia_lake_raw_chunks(snapshot_id,ordinal,payload,content_hash,row_count) VALUES(${snapshotId},${chunk.ordinal},${chunk.payload},${chunk.content_hash},${chunk.row_count})`;
      }
    for (const profile of d.municipalities || [])
      await tx`INSERT INTO kaia_municipal_profiles(dataset_version,id,data) VALUES(${d.version},${profile.id},${tx.json(profile as never)}) ON CONFLICT DO NOTHING`;
    for (let offset = 0; offset < (d.municipalBenchmarks?.length || 0); offset += 1000) {
      const values = d.municipalBenchmarks!.slice(offset, offset + 1000).map((row) => ({
        dataset_version: d.version,
        id: row.id,
        municipality_id: row.municipalityId,
        area: row.area,
        year: row.year,
        month: row.month,
        kind: row.kind,
        data: tx.json(row as never),
      }));
      await tx`INSERT INTO kaia_municipal_benchmarks ${tx(values)} ON CONFLICT DO NOTHING`;
    }
    await tx`INSERT INTO kaia_datasets(version,seed,reference_date,row_count,document_count,demography,content_hash,coverage,municipal_metadata) VALUES(${d.version},${d.seed},${d.referenceDate},${d.rows.length},${d.documents.length},${tx.json((d.demography as never) || [])},${contentHash},${tx.json((d.coverage || { fromYear: 2023, toYear: 2028 }) as never)},${d.municipalMetadata ? tx.json(d.municipalMetadata as never) : null}) ON CONFLICT DO NOTHING`;
  });
  console.log(
    `Seed færdigt: ${d.version}, ${d.rows.length} posteringer, ${d.documents.length} dokumenter.`,
  );
  await closeDb();
}
main().catch(async (error) => {
  console.error('Seed mislykkedes:', error instanceof Error ? error.message : 'ukendt fejl');
  await closeDb();
  process.exitCode = 1;
});
