import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisAttempt, cancelAnalysisAttempt } from '../src/components/analysis-request';

afterEach(() => vi.unstubAllGlobals());

describe('serverbekræftet stop uafhængigt af browserens stream', () => {
  it('giver hver genafsendelse en ny requestidentitet', () => {
    const first = createAnalysisAttempt(),
      retry = createAnalysisAttempt();
    expect(first.requestId).not.toBe(retry.requestId);
    expect(first.controller).not.toBe(retry.controller);
  });
  it('sender idempotent annullering med sit eget signal, selv efter streamabort', async () => {
    const fetcher = vi.fn(async () => Response.json({ status: 'cancelled' }));
    vi.stubGlobal('fetch', fetcher);
    const attempt = createAnalysisAttempt();
    attempt.controller.abort();
    const first = cancelAnalysisAttempt(attempt);
    expect(cancelAnalysisAttempt(attempt)).toBe(first);
    expect(await first).toEqual({ status: 'cancelled' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/analyze/cancel');
    expect(JSON.parse(String(init.body))).toEqual({ requestId: attempt.requestId });
    expect(init.keepalive).toBe(true);
    expect(init.signal).not.toBe(attempt.controller.signal);
    expect(init.signal?.aborted).toBe(false);
  });
  it('bevarer serverens besked om at beregningen allerede er gemt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'completed', analysisId: 'existing' })),
    );
    expect(await cancelAnalysisAttempt(createAnalysisAttempt())).toEqual({ status: 'completed' });
  });
  it.each([
    async () => Response.json({ error: 'Ingen adgang' }, { status: 404 }),
    async () => Response.json({ status: 'unknown' }),
    async () => new Response('afbrudt svar'),
    async () => {
      throw new TypeError('Forbindelsen blev afbrudt');
    },
  ])('lover ikke at serveren er stoppet ved fejl eller ukendt svar', async (fetcher) => {
    vi.stubGlobal('fetch', fetcher);
    expect(await cancelAnalysisAttempt(createAnalysisAttempt())).toEqual({ status: 'unconfirmed' });
  });
});
