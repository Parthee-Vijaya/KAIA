/** Explicit development/import job; never run by a Vercel question handler. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { StatbankClient } from './statbank';
import { snapshotHash } from './lake';

async function refresh() {
  const client = new StatbankClient();
  const prices = await client.extract('PRIS01', [
    { code: 'VAREGR', values: ['0451', '0722'] },
    { code: 'ENHED', values: ['100'] },
    { code: 'Tid', values: ['2025M09', '2026M09'] },
  ]);
  const population = await client.extract('FOLK1A', [
    { code: 'OMRÅDE', values: ['326'] },
    { code: 'KØN', values: ['TOT'] },
    { code: 'ALDER', values: ['IALT'] },
    { code: 'CIVILSTAND', values: ['TOT'] },
    { code: 'Tid', values: ['2025K3', '2026K3'] },
  ]);
  // Verified BEV107 definitions keep international and domestic movement distinct.
  const movements = await client.extract('BEV107', [
    { code: 'OMRÅDE', values: ['326'] },
    { code: 'BEVÆGELSE', values: ['B02', 'B03', 'B05', 'B06', 'B08AA', 'B09BA'] },
    { code: 'KØN', values: ['M', 'K'] },
    { code: 'Tid', values: ['2025'] },
  ]);
  const payload = {
    schemaVersion: '1',
    datasetVersion: 'dst-public-2026-10-20',
    status: 'verified-public-snapshot',
    retrievedAt: new Date().toISOString(),
    extracts: { prices, population, movements },
    unitNote:
      'PRIS01: indeks, 2025 = 100, verificeret i Danmarks Statistiks faglige dokumentation. FOLK1A og BEV107: antal personer.',
    unitSourceUrl: 'https://www.dst.dk/da/Statistik/emner/oekonomi/prisindeks/forbrugerprisindeks',
  };
  const path = resolve('src/integrations/snapshots/statbank-2026-10-20.json');
  await writeFile(
    path,
    JSON.stringify({ ...payload, contentHash: snapshotHash(payload) }, null, 2) + '\n',
    { flag: 'wx' },
  );
  process.stdout.write(
    `Verificeret offentligt udtræk gemt i ${path}. ${prices.rows.length + population.rows.length + movements.rows.length} observationer.\n`,
  );
}
refresh().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Indlæsningen mislykkedes.'}\n`);
  process.exitCode = 1;
});
