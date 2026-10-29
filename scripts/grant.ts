import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { sql, closeDb } from '../src/server/db';
import { areas } from '../src/server/validation';
// CLI grants scope only; roles always originate from a validated Entra login.
async function main() {
  const [identity, areaList, unitList] = process.argv.slice(2);
  if (!identity || !areaList || !unitList)
    throw new Error(
      'Brug: tsx scripts/grant.ts tenant:oid schools,facilities unit-id,unit-id (eller * for alle enheder i områderne)',
    );
  const selected = areaList.split(',').map((x) => areas.parse(x));
  const [user] = await sql()`SELECT id FROM kaia_users WHERE id=${identity}`;
  if (!user) throw new Error('Identiteten skal logge ind først.');
  const allowed =
    await sql()`SELECT id FROM kaia_entities WHERE dataset_version=${process.env.KAIA_DATASET_VERSION || 'KAIA-DEMO-2026.09-v4'} AND area IN ${sql()(selected)}`;
  const units = unitList === '*' ? allowed.map((x) => x.id) : unitList.split(',');
  if (units.some((id) => !allowed.some((e) => e.id === id)))
    throw new Error('Enheden er ikke i det valgte område.');
  await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${identity},${sql().json(units)},${sql().json(selected)}) ON CONFLICT(user_id) DO UPDATE SET unit_ids=excluded.unit_ids,areas=excluded.areas`;
  console.log('Scope opdateret. Entra-app-roller er uændrede.');
  await closeDb();
}
main().catch(async (e) => {
  console.error(e.message);
  await closeDb();
  process.exitCode = 1;
});
