import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backendOrigin,
  forwardToBackend,
  signedHeaders,
  verifyGateway,
  sessionCookies,
} from '../src/server/gateway';
const now = 1_800_000_000_000;
const body = new TextEncoder().encode('{"profile":"school"}');
function request(path = '/auth/demo', data = body) {
  return new Request('https://kaia.example' + path, {
    method: 'POST',
    headers: {
      origin: 'https://kaia.example',
      cookie: 'kaia_session=fixture; another_product=private',
      'content-type': 'application/json',
    },
    body: data,
  });
}
function signed(original = request(), data = body) {
  return new Request(original.url, {
    method: original.method,
    headers: signedHeaders(original, data, now),
    body: data,
  });
}
beforeEach(() => {
  vi.stubEnv('KAIA_REMOTE_GATEWAY_KEY', 'fixture-only-key'.repeat(6));
  vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('signed hybrid backend boundary', () => {
  it('accepts an exact request and never forwards other product cookies', () => {
    expect(verifyGateway(signed(), body, now)).toBe(true);
    expect(sessionCookies('kaia_session=fixture; vercel=secret; kaia_oidc=flow')).toBe(
      'kaia_session=fixture; kaia_oidc=flow',
    );
    expect(signed().headers.get('cookie')).toBe('kaia_session=fixture');
  });
  it('rejects unsigned, stale, future, body, path, origin and cookie tampering', () => {
    expect(verifyGateway(request(), body, now)).toBe(false);
    expect(verifyGateway(signed(), body, now + 31_000)).toBe(false);
    expect(verifyGateway(signed(), body, now - 31_000)).toBe(false);
    expect(verifyGateway(signed(), new TextEncoder().encode('changed'), now)).toBe(false);
    const s = signed();
    for (const [name, value] of [
      ['cookie', 'kaia_session=other'],
      ['origin', 'https://evil.example'],
    ]) {
      const headers = new Headers(s.headers);
      headers.set(name, value);
      expect(verifyGateway(new Request(s.url, { method: 'POST', headers, body }), body, now)).toBe(
        false,
      );
    }
    expect(
      verifyGateway(
        new Request('https://kaia.example/api/access', {
          method: 'POST',
          headers: s.headers,
          body,
        }),
        body,
        now,
      ),
    ).toBe(false);
  });
  it('rejects missing short keys and private or credentialed backend origins', () => {
    vi.stubEnv('KAIA_REMOTE_GATEWAY_KEY', 'short');
    expect(() => signedHeaders(request(), body, now)).toThrow('GATEWAY_NOT_CONFIGURED');
    for (const value of [
      'http://public.example',
      'https://127.0.0.1',
      'https://10.0.0.1',
      'https://name.local',
      'https://user:password@public.example',
      'https://public.example/private',
    ]) {
      vi.stubEnv('KAIA_REMOTE_BACKEND_URL', value);
      expect(() => backendOrigin()).toThrow();
    }
    vi.stubEnv('KAIA_REMOTE_BACKEND_URL', 'https://public.example:10000');
    expect(backendOrigin()).toBe('https://public.example:10000');
  });
  it('blocks cross-site writes before contacting the backend', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const r = request();
    r.headers.set('origin', 'https://evil.example');
    expect((await forwardToBackend(r)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('relays streaming responses and Secure cookies without exposing gateway credentials', async () => {
    vi.stubEnv('KAIA_REMOTE_BACKEND_URL', 'https://backend.example');
    const fetcher = vi.fn(
      async () =>
        new Response('{"type":"status"}\n{"type":"done"}\n', {
          headers: {
            'content-type': 'application/x-ndjson',
            'set-cookie': 'kaia_session=opaque; Secure; HttpOnly; SameSite=Lax; Path=/',
          },
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const response = await forwardToBackend(request());
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('x-kaia-gateway-signature')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    expect(await response.text()).toContain('done');
    expect(fetcher.mock.calls[0]?.length).toBe(2);
  });
  it('delivers an upstream text chunk before the analysis stream closes', async () => {
    vi.stubEnv('KAIA_REMOTE_BACKEND_URL', 'https://backend.example');
    let upstream: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        upstream = controller;
        controller.enqueue(encoder.encode('{"type":"text","text":"Forbruget "}\n'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }),
      ),
    );
    const response = await forwardToBackend(request());
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toContain('Forbruget ');
    upstream!.enqueue(encoder.encode('{"type":"analysis"}\n'));
    upstream!.close();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('analysis');
    expect((await reader.read()).done).toBe(true);
  });
  it('returns a clear offline error and rejects oversized bodies', async () => {
    vi.stubEnv('KAIA_REMOTE_BACKEND_URL', 'https://backend.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect((await forwardToBackend(request())).status).toBe(503);
    expect((await forwardToBackend(request('/api/analyze', new Uint8Array(33_000)))).status).toBe(
      413,
    );
  });
});
