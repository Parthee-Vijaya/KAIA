import { cookies } from 'next/headers';
import { randomBytes, randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import { sql } from './db';
import { encryptSecret, decryptSecret, hashSession } from './crypto';
import { ApiError } from './errors';
import { roles as roleSchema } from './validation';
import { consumeDemoLoginBudget } from './repository';
import { DATASET_VERSION } from '@/domain/data';
import type { AccessContext, Role, Area } from '@/domain/types';
export const SESSION_COOKIE = 'kaia_session';
const FLOW_COOKIE = 'kaia_oidc';
const DEMO_TENANT = 'kaia-demo';
export const DEMO_PROFILES = {
  executive: {
    displayName: 'Parthee',
    title: 'AI Program Lead',
    role: 'KAIA.Executive',
    areas: [
      'schools',
      'facilities',
      'social',
      'health',
      'environment',
      'administration',
      'preparedness',
    ],
  },
  school: {
    displayName: 'Anne Dandanell',
    title: 'Chef',
    role: 'KAIA.DepartmentHead',
    areas: ['schools'],
  },
  council: {
    displayName: 'Udvalgsmedlem',
    title: 'Kommunalbestyrelsesmedlem',
    role: 'KAIA.Council',
    areas: ['schools'],
  },
} as const;
export type DemoProfile = keyof typeof DEMO_PROFILES;
export function authenticationMode(): 'demo' | 'entra' {
  return process.env.KAIA_AUTH_MODE === 'demo' ? 'demo' : 'entra';
}
export function isDemoLoginEnabled() {
  return authenticationMode() === 'demo';
}
export function demoProfile(value: unknown): DemoProfile {
  if (value !== 'executive' && value !== 'school' && value !== 'council')
    throw new ApiError(400, 'Vælg en gyldig demoprofil.');
  return value;
}
async function demoScope(profile: DemoProfile): Promise<{ unitIds: string[]; areas: Area[] }> {
  const definition = DEMO_PROFILES[profile];
  const areas: Area[] = [...definition.areas];
  const rows =
    await sql()`SELECT id,area FROM kaia_entities WHERE dataset_version=${DATASET_VERSION} AND area IN ${sql()(areas)}`;
  const unitIds = rows
    .filter((row) => profile !== 'council' || row.id === 'committee-boern-familie')
    .map((row) => String(row.id));
  if (!unitIds.length) throw new ApiError(503, 'Demodatasættet skal indlæses før login.');
  return { unitIds, areas };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isLocalTest() {
  return (
    process.env.KAIA_TEST_MODE === '1' &&
    !process.env.VERCEL &&
    process.env.NODE_ENV !== 'production' &&
    ['127.0.0.1', 'localhost'].includes(
      new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').hostname,
    )
  );
}
function callbackUrl() {
  return `${(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').replace(/\/$/, '')}/auth/callback`;
}
export async function setupStatus() {
  let database = false;
  if (process.env.DATABASE_URL) {
    try {
      const [row] =
        await sql()`SELECT version FROM kaia_datasets WHERE version=${DATASET_VERSION} LIMIT 1`;
      database = !!row;
    } catch {
      database = false;
    }
  }
  const encryption =
    !!process.env.KAIA_ENCRYPTION_KEY &&
    Buffer.from(process.env.KAIA_ENCRYPTION_KEY, 'base64').length === 32;
  const entra = !!(
    process.env.KAIA_ENTRA_TENANT_ID &&
    UUID.test(process.env.KAIA_ENTRA_TENANT_ID) &&
    process.env.KAIA_ENTRA_CLIENT_ID &&
    UUID.test(process.env.KAIA_ENTRA_CLIENT_ID) &&
    process.env.KAIA_ENTRA_CLIENT_SECRET &&
    process.env.KAIA_SESSION_SECRET &&
    process.env.KAIA_SESSION_SECRET.length >= 32 &&
    encryption
  );
  const session = !!process.env.KAIA_SESSION_SECRET && process.env.KAIA_SESSION_SECRET.length >= 32;
  const authMode = authenticationMode();
  return {
    database,
    entra,
    session,
    authMode,
    demoEnabled: isDemoLoginEnabled(),
    encryption,
    localTest: isLocalTest(),
    callbackUrl: callbackUrl(),
    ready: database && session && (authMode === 'demo' || entra),
  };
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' ||
      new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').protocol === 'https:',
    sameSite: 'lax' as const,
    path: '/',
  };
}
export function validateIdentity(claims: Record<string, unknown>) {
  const tenant = process.env.KAIA_ENTRA_TENANT_ID;
  if (!tenant || claims.tid !== tenant || typeof claims.oid !== 'string' || !UUID.test(claims.oid))
    throw new ApiError(403, 'Identiteten tilhører ikke den konfigurerede organisation.');
  const roles = Array.isArray(claims.roles)
    ? claims.roles.filter((r): r is Role => roleSchema.safeParse(r).success)
    : [];
  return { tenantId: tenant, objectId: claims.oid, roles };
}
export async function createSession(userId: string, testOnly = false) {
  if (testOnly && !isLocalTest()) throw new ApiError(403, 'Testidentiteter er deaktiveret.');
  const token = randomBytes(32).toString('base64url');
  await sql()`INSERT INTO kaia_sessions(id_hash,user_id,expires_at,test_only) VALUES(${hashSession(token)},${userId},${new Date(Date.now() + 8 * 3600_000)},${testOnly ? 1 : 0})`;
  return token;
}
export async function accessForToken(token: string | undefined): Promise<AccessContext | null> {
  if (!token || !process.env.DATABASE_URL || !process.env.KAIA_SESSION_SECRET || token.length > 200)
    return null;
  const [r] =
    await sql()`SELECT u.*, g.unit_ids,g.areas,s.test_only,s.demo_only,s.demo_profile FROM kaia_sessions s JOIN kaia_users u ON u.id=s.user_id LEFT JOIN kaia_grants g ON g.user_id=u.id WHERE s.id_hash=${hashSession(token)} AND s.expires_at>now()`;
  if (!r || (r.test_only && !isLocalTest())) return null;
  if (r.demo_only) {
    if (!isDemoLoginEnabled() || r.test_only || r.tenant_id !== DEMO_TENANT) return null;
    let profile: DemoProfile;
    try {
      profile = demoProfile(r.demo_profile);
    } catch {
      return null;
    }
    const definition = DEMO_PROFILES[profile];
    const scope = await demoScope(profile);
    // Public demo rights are projected from the fixed server profile; stored or submitted role labels never grant administration.
    return {
      userId: r.id,
      tenantId: r.tenant_id,
      objectId: r.object_id,
      roles: [definition.role],
      unitIds: (r.unit_ids || []).filter((id: string) => scope.unitIds.includes(id)),
      areas: (r.areas || []).filter((area: Area) => scope.areas.includes(area)),
      displayName: definition.displayName,
      title: definition.title,
    };
  }
  if (
    !r.test_only &&
    (authenticationMode() !== 'entra' || r.tenant_id !== process.env.KAIA_ENTRA_TENANT_ID)
  )
    return null;
  return {
    userId: r.id,
    tenantId: r.tenant_id,
    objectId: r.object_id,
    roles: r.roles,
    unitIds: r.unit_ids || [],
    areas: r.areas || [],
    displayName: r.display_name,
    title: r.title,
  };
}
export async function currentUser() {
  try {
    return await accessForToken((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
export async function requireUser() {
  const user = await currentUser();
  if (!user)
    throw new ApiError(
      401,
      isDemoLoginEnabled()
        ? 'Vælg en demoprofil for at fortsætte.'
        : 'Log ind med Microsoft for at fortsætte.',
    );
  if (!user.roles.length || !user.areas.length || !user.unitIds.length)
    throw new ApiError(
      403,
      'Din identitet mangler en app-rolle eller et tildelt adgangsområde. Kontakt administratoren.',
    );
  return user;
}
export function assertAdmin(user: AccessContext) {
  if (!user.roles.includes('KAIA.Admin'))
    throw new ApiError(403, 'Handlingen kræver administratoradgang.');
}
async function configuration() {
  const tenant = process.env.KAIA_ENTRA_TENANT_ID;
  if (
    authenticationMode() !== 'entra' ||
    !(await setupStatus()).ready ||
    !tenant ||
    !UUID.test(tenant)
  )
    throw new ApiError(503, 'Microsoft-login afventer tenant-, klient- og databaseopsætning.');
  return oidc.discovery(
    new URL(`https://login.microsoftonline.com/${tenant}/v2.0`),
    process.env.KAIA_ENTRA_CLIENT_ID!,
    process.env.KAIA_ENTRA_CLIENT_SECRET!,
  );
}
export async function beginLogin() {
  const config = await configuration();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const store = await cookies();
  store.set(
    FLOW_COOKIE,
    encryptSecret(JSON.stringify({ verifier, state, nonce, createdAt: Date.now() })),
    { ...cookieOptions(), maxAge: 600 },
  );
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: 'openid profile',
    response_type: 'code',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
}
function profileFor(tenantId: string, objectId: string, roles: Role[]) {
  // Display labels never affect authorization. Only explicitly configured stable identities receive personal labels.
  if (`${tenantId}:${objectId}` === process.env.KAIA_PARTHEE_IDENTITY)
    return { displayName: 'Partheepan Vijayamohan', title: 'AI Program Lead' };
  if (`${tenantId}:${objectId}` === process.env.KAIA_ANNE_IDENTITY)
    return { displayName: 'Anne Dandanell', title: 'Chef' };
  if (roles.includes('KAIA.Admin')) return { displayName: 'Administrator', title: 'Administrator' };
  if (roles.includes('KAIA.Executive')) return { displayName: 'Direktion', title: 'Direktion' };
  if (roles.includes('KAIA.Finance'))
    return { displayName: 'Økonomikonsulent', title: 'Økonomikonsulent' };
  if (roles.includes('KAIA.Council'))
    return { displayName: 'Udvalgsmedlem', title: 'Kommunalbestyrelsesmedlem' };
  return { displayName: 'Fagchef', title: 'Fagchef' };
}
export async function completeLogin(url: URL) {
  const callback = new URL(callbackUrl());
  if (url.origin !== callback.origin || url.pathname !== callback.pathname)
    throw new ApiError(400, 'Ugyldig callback-URL.');
  const store = await cookies();
  const encoded = store.get(FLOW_COOKIE)?.value;
  store.delete(FLOW_COOKIE);
  if (!encoded) throw new ApiError(400, 'Loginforsøget er udløbet. Prøv igen.');
  const flow = JSON.parse(decryptSecret(encoded)) as {
    verifier: string;
    state: string;
    nonce: string;
    createdAt: number;
  };
  if (Date.now() - flow.createdAt > 600_000) throw new ApiError(400, 'Loginforsøget er udløbet.');
  const tokens = await oidc.authorizationCodeGrant(await configuration(), url, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new ApiError(403, 'ID-token mangler.');
  const identity = validateIdentity(claims);
  const id = `${identity.tenantId}:${identity.objectId}`;
  const profile = profileFor(identity.tenantId, identity.objectId, identity.roles);
  await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${id},${identity.tenantId},${identity.objectId},${sql().json(identity.roles)},${profile.displayName},${profile.title}) ON CONFLICT(id) DO UPDATE SET roles=excluded.roles,display_name=excluded.display_name,title=excluded.title,updated_at=now()`;
  const token = await createSession(id);
  store.set(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: 8 * 3600 });
}
export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && process.env.DATABASE_URL)
    await sql()`DELETE FROM kaia_sessions WHERE id_hash=${hashSession(token)}`;
  store.delete(SESSION_COOKIE);
  store.delete(FLOW_COOKIE);
}
export async function installTestSession(profile = 'admin') {
  if (!isLocalTest()) throw new ApiError(404, 'Ikke fundet.');
  const all = (await import('@/domain/data')).getDataset().entities;
  const selected = profile === 'school' ? all.filter((e) => e.area === 'schools') : all;
  const id = `local-test:${profile}`;
  const role: Role =
    profile === 'school'
      ? 'KAIA.DepartmentHead'
      : profile === 'council'
        ? 'KAIA.Council'
        : 'KAIA.Admin';
  await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${id},'local-test',${profile},${sql().json([role])},${profile === 'admin' ? 'Partheepan Vijayamohan' : profile === 'school' ? 'Anne Dandanell' : 'Udvalgsmedlem'},${profile === 'admin' ? 'AI Program Lead' : 'Chef'}) ON CONFLICT(id) DO UPDATE SET roles=excluded.roles,display_name=excluded.display_name,title=excluded.title`;
  await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${id},${sql().json(selected.map((e) => e.id))},${sql().json([...new Set(selected.map((e) => e.area))])}) ON CONFLICT(user_id) DO UPDATE SET unit_ids=excluded.unit_ids,areas=excluded.areas`;
  const token = await createSession(id, true);
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: 8 * 3600 });
  return token;
}

/** Explicit public demo login. Every login receives a fresh identity and private, owner-bound storage. */
export async function createDemoIdentity(
  value: unknown,
): Promise<{ token: string; user: AccessContext }> {
  if (!isDemoLoginEnabled()) throw new ApiError(404, 'Demologin er ikke aktiveret.');
  const profile = demoProfile(value);
  if (!process.env.KAIA_SESSION_SECRET || process.env.KAIA_SESSION_SECRET.length < 32)
    throw new ApiError(503, 'Sessionsopsætningen mangler.');
  const definition = DEMO_PROFILES[profile];
  await consumeDemoLoginBudget();
  const scope = await demoScope(profile);
  const objectId = randomUUID();
  const userId = `demo:${objectId}`;
  const token = randomBytes(32).toString('base64url');
  const user: AccessContext = {
    userId,
    tenantId: DEMO_TENANT,
    objectId,
    roles: [definition.role],
    ...scope,
    displayName: definition.displayName,
    title: definition.title,
  };
  await sql().begin(async (tx) => {
    await tx`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${userId},${DEMO_TENANT},${objectId},${tx.json(user.roles)},${user.displayName},${user.title})`;
    await tx`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${userId},${tx.json(scope.unitIds)},${tx.json(scope.areas)})`;
    await tx`INSERT INTO kaia_sessions(id_hash,user_id,expires_at,test_only,demo_only,demo_profile) VALUES(${hashSession(token)},${userId},${new Date(Date.now() + 8 * 3600_000)},0,1,${profile})`;
  });
  return { token, user };
}
export async function installDemoSession(value: unknown) {
  const result = await createDemoIdentity(value);
  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous && previous.length <= 200)
    await sql()`DELETE FROM kaia_sessions WHERE id_hash=${hashSession(previous)}`;
  store.delete(FLOW_COOKIE);
  store.set(SESSION_COOKIE, result.token, { ...cookieOptions(), maxAge: 8 * 3600 });
  return result.user;
}
