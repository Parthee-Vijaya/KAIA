import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 32_000;
const SIGNATURE = 'x-kaia-gateway-signature';
const TIMESTAMP = 'x-kaia-gateway-time';
const PATH = /^\/(api|auth)\//;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function key() {
  const value = process.env.KAIA_REMOTE_GATEWAY_KEY;
  if (!value || value.length < 48) throw new Error('GATEWAY_NOT_CONFIGURED');
  return value;
}
export function backendOrigin() {
  const value = process.env.KAIA_REMOTE_BACKEND_URL;
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname) ||
    url.hostname.endsWith('.local') ||
    url.hostname.includes(':')
  )
    throw new Error('INVALID_GATEWAY_ORIGIN');
  return url.origin;
}
export function sessionCookies(value: string | null) {
  return (value || '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => /^kaia_(session|oidc)=/.test(v))
    .join('; ');
}
function digest(request: Request, body: Uint8Array, timestamp: string) {
  const url = new URL(request.url);
  const payload = [
    request.method,
    url.pathname + url.search,
    timestamp,
    createHash('sha256').update(body).digest('hex'),
    sessionCookies(request.headers.get('cookie')),
    request.headers.get('origin') || '',
  ].join('\n');
  return createHmac('sha256', key()).update(payload).digest('hex');
}
export function signedHeaders(request: Request, body: Uint8Array, now = Date.now()) {
  const headers = new Headers();
  for (const name of ['origin', 'content-type', 'accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = sessionCookies(request.headers.get('cookie'));
  if (cookie) headers.set('cookie', cookie);
  const timestamp = String(now);
  headers.set(TIMESTAMP, timestamp);
  headers.set(SIGNATURE, digest(request, body, timestamp));
  return headers;
}
export function verifyGateway(request: Request, body: Uint8Array, now = Date.now()) {
  try {
    const timestamp = request.headers.get(TIMESTAMP) || '';
    const signature = request.headers.get(SIGNATURE) || '';
    if (
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp)) > 30_000 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      return false;
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(digest(request, body, timestamp), 'hex'),
    );
  } catch {
    return false;
  }
}
export function gatewayError(
  message = 'Den lokale backend kan ikke nås. Kontrollér, at Mac’en er tændt og online.',
  status = 503,
) {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function gatewayBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY)
    throw new Error('GATEWAY_BODY_LIMIT');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BODY) throw new Error('GATEWAY_BODY_LIMIT');
  return bytes;
}
export async function forwardToBackend(request: Request) {
  const url = new URL(request.url);
  if (!PATH.test(url.pathname)) return gatewayError('Ukendt backendrute.', 404);
  const expected = new URL(process.env.KAIA_APP_URL || request.url).origin;
  if (MUTATING.has(request.method) && request.headers.get('origin') !== expected)
    return gatewayError('Ugyldig forespørgselsoprindelse.', 403);
  try {
    const body = await gatewayBody(request);
    const origin = backendOrigin();
    if (!origin) return gatewayError();
    const upstream = await fetch(origin + url.pathname + url.search, {
      method: request.method,
      headers: signedHeaders(request, body),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(125_000)]),
    });
    const headers = new Headers({
      'Cache-Control': 'private, no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['content-type', 'content-disposition', 'location']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) headers.append('set-cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'GATEWAY_BODY_LIMIT')
      return gatewayError('Forespørgslen er for stor.', 413);
    return gatewayError();
  }
}
