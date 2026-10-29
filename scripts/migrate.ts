import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { readFile, readdir } from 'node:fs/promises';
import { sql, closeDb } from '../src/server/db';
async function main() {
  const { POSTGRES_LAKE_DDL } = await import('../src/integrations/lake');
  await sql().unsafe(POSTGRES_LAKE_DDL);
  await sql().begin(async (tx) => {
    const directory = new URL('../migrations/', import.meta.url);
    const migrations = (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    for (const migration of migrations)
      await tx.unsafe(await readFile(new URL(migration, directory), 'utf8'));
  });
  console.log('Database-migrationer gennemført.');
  await closeDb();
}
main().catch(async () => {
  console.error('Migration mislykkedes. Kontrollér databaseadgang og skema.');
  await closeDb();
  process.exitCode = 1;
});
