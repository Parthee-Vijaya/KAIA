import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { closeDb } from '../src/server/db';
import { grantLiveAccessForOwner } from '../src/server/live-access';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

async function main() {
  const { values } = parseArgs({
    options: {
      'owner-file': { type: 'string' },
      provider: { type: 'string', default: 'corti' },
      days: { type: 'string', default: '30' },
      'daily-limit': { type: 'string', default: '60' },
    },
  });
  if (!values['owner-file']) throw new Error('Angiv --owner-file med en privat ejerbinding.');
  const binding = z
    .object({ ownerId: z.string().min(1) })
    .passthrough()
    .parse(JSON.parse(await readFile(values['owner-file'], 'utf8')));
  const result = await grantLiveAccessForOwner(binding.ownerId, {
    providerId: z.literal('corti').parse(values.provider),
    days: Number(values.days),
    dailyLimit: Number(values['daily-limit']),
  });
  console.log(JSON.stringify(result));
}
main()
  .catch(() => {
    console.error(
      'Live-tildelingen kunne ikke gennemføres. Kontrollér ejerbinding og testet forbindelse.',
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
