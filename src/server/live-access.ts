import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AccessContext, ProviderPublic } from '@/domain/types';
import { sql } from './db';
import { ApiError } from './errors';
import {
  activeProvider,
  configured,
  connectionFingerprint,
  getProvider,
  publicProviders,
  type ProviderConnection,
} from './providers';

const grantSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1).max(200),
  providerId: z.literal('corti'),
  model: z.string().min(1).max(120),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  dailyLimit: z.number().int().min(1).max(60),
  revokedAt: z.iso.datetime().optional(),
  lease: z.object({ token: z.string().uuid(), expiresAt: z.iso.datetime() }).optional(),
});
type LiveGrant = z.infer<typeof grantSchema>;
const grantKey = (ownerId: string) => `live-grant:${ownerId}`;

function validGrant(value: unknown, ownerId: string): LiveGrant | undefined {
  const parsed = grantSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.ownerId !== ownerId ||
    parsed.data.revokedAt ||
    Date.parse(parsed.data.expiresAt) <= Date.now()
  )
    return undefined;
  return parsed.data;
}
async function readGrant(ownerId: string) {
  const [row] = await sql().unsafe<{ data: unknown }[]>(
    'SELECT data FROM kaia_configuration WHERE key=$1',
    [grantKey(ownerId)],
  );
  return validGrant(row?.data, ownerId);
}
function matches(grant: LiveGrant, provider: ProviderConnection) {
  return (
    grant.providerId === provider.id &&
    grant.model === provider.model &&
    grant.fingerprint === connectionFingerprint(provider) &&
    provider.tested === true &&
    configured(provider)
  );
}

/** Only a private server/CLI action may create a grant; display names and browser roles are irrelevant. */
export async function grantLiveAccessForOwner(
  ownerId: string,
  options: { providerId: 'corti'; days?: number; dailyLimit?: number },
) {
  const input = z
    .object({
      providerId: z.literal('corti'),
      days: z.number().int().min(1).max(30).default(30),
      dailyLimit: z.number().int().min(1).max(60).default(60),
    })
    .strict()
    .parse(options);
  if (!/^demo:[0-9a-f-]{36}$/i.test(ownerId))
    throw new ApiError(400, 'Live-tildelingen kræver en eksisterende besøgsidentitet.');
  const [owner] = await sql().unsafe<{ id: string }[]>(
    "SELECT id FROM kaia_users WHERE id=$1 AND tenant_id='kaia-demo'",
    [ownerId],
  );
  if (!owner) throw new ApiError(404, 'Besøgsidentiteten blev ikke fundet.');
  const provider = await getProvider(input.providerId);
  if (!provider.tested || !configured(provider))
    throw new ApiError(409, 'Den valgte live-forbindelse skal være testet først.');
  const grant: LiveGrant = {
    version: 1,
    ownerId,
    providerId: input.providerId,
    model: provider.model,
    fingerprint: connectionFingerprint(provider),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + input.days * 86_400_000).toISOString(),
    dailyLimit: input.dailyLimit,
  };
  // Reapproval never clears an outstanding lease or the separate daily usage counter.
  await sql().unsafe(
    "INSERT INTO kaia_configuration(key,data) VALUES($1,$2::text::jsonb) ON CONFLICT(key) DO UPDATE SET data=excluded.data || CASE WHEN kaia_configuration.data ? 'lease' THEN jsonb_build_object('lease',kaia_configuration.data->'lease') ELSE '{}'::jsonb END,updated_at=now()",
    [grantKey(ownerId), JSON.stringify(grant)],
  );
  return {
    granted: true,
    provider: provider.id,
    expiresAt: grant.expiresAt,
    dailyLimit: grant.dailyLimit,
  };
}

export async function revokeLiveAccessForOwner(ownerId: string) {
  await sql().unsafe(
    "UPDATE kaia_configuration SET data=jsonb_set(data,'{revokedAt}',to_jsonb($2::text)),updated_at=now() WHERE key=$1",
    [grantKey(ownerId), new Date().toISOString()],
  );
  // The existing request watcher also stops paid work on an active durable request.
  await sql().unsafe(
    "UPDATE kaia_analysis_requests SET state='cancelled',updated_at=now() WHERE owner_id=$1 AND state='running'",
    [ownerId],
  );
  return { revoked: true };
}

/** All public demo identities stay on Demo unless this exact server-bound identity was approved. */
export async function selectedProviderFor(user: AccessContext): Promise<ProviderConnection> {
  if (!user.userId.startsWith('demo:')) return activeProvider();
  const grant = await readGrant(user.userId);
  if (!grant) return getProvider('demo');
  const provider = await getProvider(grant.providerId);
  return matches(grant, provider) ? provider : getProvider('demo');
}

/** Workspace and execution use the very same choice, without revealing private connection details. */
export async function providersForUser(user: AccessContext): Promise<ProviderPublic[]> {
  if (!user.userId.startsWith('demo:')) return publicProviders();
  const selected = await selectedProviderFor(user);
  return [
    {
      id: selected.id,
      model: selected.model,
      configured: configured(selected),
      active: true,
      status:
        selected.id === 'demo'
          ? 'Klar · uden eksterne modelkald'
          : 'Privat live-adgang · højst 60 forespørgsler pr. døgn',
    },
  ];
}

/** A DB row lock serializes quota + lease acquisition across workers. Nothing is held during model calls. */
export async function acquireLiveAnalysis(
  user: AccessContext,
  provider: ProviderConnection,
): Promise<() => Promise<void>> {
  if (provider.id === 'demo' || !user.userId.startsWith('demo:')) return async () => {};
  const token = randomUUID();
  await sql().begin(async (tx) => {
    const [row] = await tx.unsafe<{ data: unknown }[]>(
      'SELECT data FROM kaia_configuration WHERE key=$1 FOR UPDATE',
      [grantKey(user.userId)],
    );
    const grant = validGrant(row?.data, user.userId);
    if (!grant || !matches(grant, provider))
      throw new ApiError(403, 'Den private live-tildeling er udløbet eller ændret.');
    if (grant.lease && Date.parse(grant.lease.expiresAt) > Date.now())
      throw new ApiError(
        429,
        'Der kører allerede et live-svar. Stop det, eller vent til det er færdigt.',
      );
    const used = await tx.unsafe(
      "INSERT INTO kaia_usage(user_id,window_start,count) VALUES($1,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1) ON CONFLICT(user_id,window_start) DO UPDATE SET count=kaia_usage.count+1 WHERE kaia_usage.count<$2 RETURNING count",
      [`live:${user.userId}`, grant.dailyLimit],
    );
    if (!used.length)
      throw new ApiError(
        429,
        'Den private live-kvote er brugt for i dag. Prøv igen efter kl. 00 UTC.',
      );
    await tx.unsafe(
      "UPDATE kaia_configuration SET data=jsonb_set(data,'{lease}',$2::text::jsonb),updated_at=now() WHERE key=$1",
      [
        grantKey(user.userId),
        JSON.stringify({ token, expiresAt: new Date(Date.now() + 180_000).toISOString() }),
      ],
    );
  });
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await sql().unsafe(
      "UPDATE kaia_configuration SET data=data-'lease',updated_at=now() WHERE key=$1 AND data->'lease'->>'token'=$2",
      [grantKey(user.userId), token],
    );
  };
}
