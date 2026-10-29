import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const support = join(homedir(), 'Library/Application Support/KAIA');
const state = join(support, 'hybrid');
const env = join(state, 'backend.env');
const server = join(support, 'backend/current/server.js');
if (!existsSync(env) || !existsSync(server))
  throw new Error('Publish the standalone build and configure the private backend.env first.');
mkdirSync(state, { recursive: true, mode: 0o700 });
for (const file of ['backend.stdout.log', 'backend.stderr.log']) {
  const path = join(state, file);
  if (!existsSync(path)) writeFileSync(path, '', { mode: 0o600 });
  chmodSync(path, 0o600);
}
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>dk.kaia.demo.backend</string>
<key>ProgramArguments</key><array>${[process.execPath, `--env-file=${env}`, server].map((value) => `<string>${escape(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${escape(state)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${escape(join(state, 'backend.stdout.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(state, 'backend.stderr.log'))}</string>
</dict></plist>`;
const directory = join(homedir(), 'Library/LaunchAgents');
mkdirSync(directory, { recursive: true });
const path = join(directory, 'dk.kaia.demo.backend.plist');
writeFileSync(path, plist, { mode: 0o600 });
const domain = `gui/${process.getuid()}`;
const present =
  spawnSync('/bin/launchctl', ['print', `${domain}/dk.kaia.demo.backend`], { stdio: 'ignore' })
    .status === 0;
const result = spawnSync(
  '/bin/launchctl',
  present ? ['kickstart', '-k', `${domain}/dk.kaia.demo.backend`] : ['bootstrap', domain, path],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exitCode = result.status || 1;
else
  console.log(
    JSON.stringify({
      event: 'local_backend_service_started',
      label: 'dk.kaia.demo.backend',
      port: 3212,
    }),
  );
