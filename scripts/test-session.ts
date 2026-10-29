import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { randomBytes } from 'node:crypto';
import { sql, closeDb } from '../src/server/db';
import { hashSession } from '../src/server/crypto';
import { isLocalTest } from '../src/server/auth';
import { getDataset } from '../src/domain/data';
async function main() {
  if (!isLocalTest())
    throw new Error(
      'Testfixture kræver eksplicit lokal udvikling og er deaktiveret på Vercel/produktion.',
    );
  const profile = process.argv[2] || 'admin';
  if (!['admin', 'school', 'council', 'other', 'unassigned'].includes(profile))
    throw new Error('Ukendt testprofil.');
  const role =
    profile === 'school'
      ? 'KAIA.DepartmentHead'
      : profile === 'council'
        ? 'KAIA.Council'
        : 'KAIA.Admin';
  const id = `local-test:${profile}`;
  const all = getDataset().entities.filter((e) => profile !== 'school' || e.area === 'schools');
  await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${id},'local-test',${profile},${sql().json(profile === 'unassigned' ? [] : [role])},'Økonomikonsulent','Økonomikonsulent') ON CONFLICT(id) DO UPDATE SET roles=excluded.roles`;
  if (profile !== 'unassigned')
    await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${id},${sql().json(all.map((e) => e.id))},${sql().json([...new Set(all.map((e) => e.area))])}) ON CONFLICT(user_id) DO UPDATE SET unit_ids=excluded.unit_ids,areas=excluded.areas`;
  const token = randomBytes(32).toString('base64url');
  await sql()`INSERT INTO kaia_sessions(id_hash,user_id,expires_at,test_only) VALUES(${hashSession(token)},${id},${new Date(Date.now() + 3600_000)},1)`;
  // The only output is an explicitly local, one-hour fixture cookie. Never use it in production or commit it.
  console.log(`kaia_session=${token}`);
  await closeDb();
}
main().catch(async (e) => {
  console.error(e.message);
  await closeDb();
  process.exitCode = 1;
});
