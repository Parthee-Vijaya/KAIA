import { createHash } from 'node:crypto';

export const RAW_ROW_CHUNK_SIZE = 10_000;
const format = 'kaia-seed-row-chunks-v1';
export interface RawRowManifest {
  format: typeof format;
  headerJson: string;
  rowChunkCount: number;
  rowCount: number;
}
export interface RawRowChunk {
  ordinal: number;
  payload: string;
  content_hash: string;
  row_count: number;
}
export function isRawRowManifest(value: unknown): value is RawRowManifest {
  return (
    typeof value === 'object' && value !== null && 'format' in value && value.format === format
  );
}
export function rawRowManifest(raw: Record<string, unknown> & { rows: unknown[] }): RawRowManifest {
  return {
    format,
    headerJson: JSON.stringify({ ...raw, rows: [] }),
    rowChunkCount: Math.ceil(raw.rows.length / RAW_ROW_CHUNK_SIZE),
    rowCount: raw.rows.length,
  };
}
export function* rawRowChunks(rows: unknown[]): Generator<RawRowChunk> {
  for (let offset = 0; offset < rows.length; offset += RAW_ROW_CHUNK_SIZE) {
    const part = rows.slice(offset, offset + RAW_ROW_CHUNK_SIZE);
    const payload = JSON.stringify(part);
    yield {
      ordinal: offset / RAW_ROW_CHUNK_SIZE,
      payload,
      content_hash: createHash('sha256').update(payload).digest('hex'),
      row_count: part.length,
    };
  }
}
/** Verify a large source without materializing the complete raw array in memory. */
export async function verifyRawRowChunks(
  manifest: RawRowManifest,
  chunks: AsyncIterable<RawRowChunk>,
): Promise<string> {
  const marker = '"rows":[]';
  const position = manifest.headerJson.indexOf(marker);
  if (position < 0) throw new Error('Rå snapshot har en ugyldig header.');
  const hash = createHash('sha256').update(manifest.headerJson.slice(0, position) + '"rows":[');
  let ordinal = 0,
    count = 0;
  for await (const chunk of chunks) {
    if (
      chunk.ordinal !== ordinal ||
      createHash('sha256').update(chunk.payload).digest('hex') !== chunk.content_hash
    )
      throw new Error('Rå snapshot har en ugyldig del eller checksum.');
    const part: unknown = JSON.parse(chunk.payload);
    if (!Array.isArray(part) || part.length !== chunk.row_count)
      throw new Error('Rå snapshot har et ugyldigt antal rækker.');
    if (ordinal) hash.update(',');
    hash.update(chunk.payload.slice(1, -1));
    count += chunk.row_count;
    ordinal++;
  }
  if (ordinal !== manifest.rowChunkCount || count !== manifest.rowCount)
    throw new Error('Rå snapshot mangler dele eller rækker.');
  hash.update(']' + manifest.headerJson.slice(position + marker.length));
  return hash.digest('hex');
}
/** Text chunks retain the exact original JSON and key order, unlike JSONB. */
export function restoreRawRows(
  manifest: RawRowManifest,
  chunks: RawRowChunk[],
): Record<string, unknown> {
  if (chunks.length !== manifest.rowChunkCount) throw new Error('Rå snapshot mangler dele.');
  const header = JSON.parse(manifest.headerJson) as Record<string, unknown>;
  const rows: unknown[] = [];
  for (const [ordinal, chunk] of chunks.entries()) {
    if (
      chunk.ordinal !== ordinal ||
      createHash('sha256').update(chunk.payload).digest('hex') !== chunk.content_hash
    )
      throw new Error('Rå snapshot har en ugyldig del eller checksum.');
    const part: unknown = JSON.parse(chunk.payload);
    if (!Array.isArray(part) || part.length !== chunk.row_count)
      throw new Error('Rå snapshot har et ugyldigt antal rækker.');
    for (const row of part) rows.push(row);
  }
  if (rows.length !== manifest.rowCount)
    throw new Error('Rå snapshot har et ufuldstændigt antal rækker.');
  header.rows = rows;
  return header;
}
