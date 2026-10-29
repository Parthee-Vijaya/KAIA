import { cpSync, existsSync, mkdirSync, renameSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const source = resolve('.next/standalone');
if (!existsSync(join(source, 'server.js')))
  throw new Error('Run npm run build:clean before publishing the local backend.');
const root =
  process.env.KAIA_LOCAL_RUNTIME_DIR || join(homedir(), 'Library/Application Support/KAIA/backend');
const release = join(root, 'releases', String(Date.now()));
mkdirSync(release, { recursive: true, mode: 0o700 });
cpSync(source, release, { recursive: true, filter: (file) => !basename(file).startsWith('.env') });
cpSync(resolve('.next/static'), join(release, '.next/static'), { recursive: true });
if (existsSync('public')) cpSync('public', join(release, 'public'), { recursive: true });
const link = join(root, `current-${Date.now()}`);
symlinkSync(release, link, 'dir');
renameSync(link, join(root, 'current'));
console.log(
  JSON.stringify({
    event: 'local_backend_published',
    release,
    current: join(root, 'current'),
    secretsCopied: false,
  }),
);
