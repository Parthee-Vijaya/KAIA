import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  rawRowChunks,
  rawRowManifest,
  restoreRawRows,
  verifyRawRowChunks,
  RAW_ROW_CHUNK_SIZE,
} from '../src/integrations/seed-snapshot';
const raw = {
  version: 'fixture',
  rows: Array.from({ length: RAW_ROW_CHUNK_SIZE + 1 }, (_, id) => ({
    id,
    amountOre: (id + 1) * -17,
    text: 'æøå',
  })),
  documents: [{ title: 'Simuleret materiale' }],
};
describe('Versioneret rå seeddata i begrænsede dele', () => {
  it('genskaber hele snapshot med samme rækkefølge og byteeksakte checksum', () => {
    const manifest = rawRowManifest(raw),
      chunks = [...rawRowChunks(raw.rows)];
    expect(chunks.map((c) => c.row_count)).toEqual([10_000, 1]);
    expect(JSON.stringify(manifest).length).toBeLessThan(1000);
    const restored = restoreRawRows(manifest, chunks);
    expect(restored).toEqual(raw);
    const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
    expect(hash(restored)).toBe(hash(raw));
  });
  it('verificerer den samlede checksum stykvis uden en samlet rå JSONB-array', async () => {
    async function* chunks() {
      yield* rawRowChunks(raw.rows);
    }
    expect(await verifyRawRowChunks(rawRowManifest(raw), chunks())).toBe(
      createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
    );
  });
  it('afviser manglende, ændrede og ombyttede dele samt forkerte rækketal', () => {
    const manifest = rawRowManifest(raw),
      chunks = [...rawRowChunks(raw.rows)];
    expect(() => restoreRawRows(manifest, chunks.slice(1))).toThrow('mangler');
    expect(() => restoreRawRows(manifest, [...chunks].reverse())).toThrow('checksum');
    expect(() => restoreRawRows(manifest, [{ ...chunks[0], payload: '[]' }, chunks[1]])).toThrow(
      'checksum',
    );
    expect(() => restoreRawRows(manifest, [{ ...chunks[0], row_count: 1 }, chunks[1]])).toThrow(
      'antal',
    );
  });
});
