import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Empty values take precedence over Next.js automatic dotenv loading. No file is moved or deleted.
const environment = {
  ...process.env,
  KAIA_TEST_MODE: '0',
  DATABASE_URL: '',
  NODE_ENV: 'production',
};
for (const key of Object.keys(environment))
  if (
    key.startsWith('KAIA_') &&
    !['KAIA_DATASET_VERSION', 'KAIA_DATASET_SEED', 'KAIA_REFERENCE_DATE'].includes(key)
  )
    environment[key] = '';
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local'])
  if (existsSync(file))
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
      if (
        match &&
        !['KAIA_DATASET_VERSION', 'KAIA_DATASET_SEED', 'KAIA_REFERENCE_DATE'].includes(match[1])
      )
        environment[match[1]] = '';
    }
environment.KAIA_TEST_MODE = '0';
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env: environment,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
