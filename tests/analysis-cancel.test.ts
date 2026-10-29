import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '../src/domain/types';
import { ApiError } from '../src/server/errors';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  consumeUsageBudget: vi.fn(),
  unsafe: vi.fn(),
  begin: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/repository', () => ({ consumeUsageBudget: mocks.consumeUsageBudget }));
vi.mock('@/server/db', () => ({ sql: () => ({ unsafe: mocks.unsafe, begin: mocks.begin }) }));

import { watchAnalysisRequest, analysisRequestStatus } from '../src/server/analysis-requests';
import { POST } from '../src/app/api/analyze/cancel/route';

const origin = 'https://kaia-cancel.example';
const requestId = '44444444-4444-4444-8444-444444444444';
const user: AccessContext = {
  userId: 'cancel-fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
};
function row(state: 'running' | 'cancelled' | 'completed') {
  return {
    request_id: requestId,
    owner_id: user.userId,
    state,
    analysis_id: state === 'completed' ? 'owned-analysis' : null,
  };
}
function request(input: unknown = { requestId }, headers: Record<string, string> = {}) {
  return new Request(origin + '/api/analyze/cancel', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubEnv('KAIA_APP_URL', origin);
  mocks.requireUser.mockResolvedValue(user);
  mocks.consumeUsageBudget.mockResolvedValue(undefined);
  mocks.begin.mockImplementation(async (work) => work({ unsafe: mocks.unsafe }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('authenticated durable cancellation endpoint', () => {
  it('returns a private cancelled acknowledgement for an owner-bound preemptive tombstone', async () => {
    mocks.unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([row('cancelled')]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ requestId, status: 'cancelled' });
    expect(mocks.consumeUsageBudget).toHaveBeenCalledExactlyOnceWith(
      `cancel:${user.userId}`,
      120,
      expect.any(String),
    );
    expect(mocks.unsafe.mock.calls[0][1]).toEqual([requestId, user.userId]);
  });
  it('reports an already committed analysis honestly without changing it back to cancelled', async () => {
    mocks.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row('completed')])
      .mockResolvedValueOnce([{ conversation_id: 'owned-conversation' }]);
    const response = await POST(request());
    expect(await response.json()).toEqual({
      requestId,
      status: 'completed',
      analysisId: 'owned-analysis',
      conversationId: 'owned-conversation',
    });
    expect(mocks.unsafe.mock.calls.some(([query]) => String(query).startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it('does not disclose another owner or completed analysis IDs', async () => {
    mocks.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row('completed'), owner_id: 'another-owner' }]);
    const response = await POST(request());
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).not.toContain('another-owner');
    expect(text).not.toContain('owned-analysis');
  });
  it('requires a validated session before any budget or job query', async () => {
    mocks.requireUser.mockRejectedValueOnce(new ApiError(401, 'Log ind først.'));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.consumeUsageBudget).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it.each([
    { requestId, ownerId: 'another-owner' },
    { requestId, role: 'KAIA.Admin' },
    { requestId, analysisId: 'owned-analysis' },
    { requestId: 'not-a-uuid' },
    {},
  ])('rejects invalid authority fields and identifiers %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.consumeUsageBudget).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('checks Origin, JSON content type and actual input size', async () => {
    expect(
      (await POST(request({ requestId }, { origin: 'https://attacker.example' }))).status,
    ).toBe(403);
    expect((await POST(request({ requestId }, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await POST(request({ requestId, extra: 'x'.repeat(25000) }))).status).toBe(413);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('returns a clear 429 when the owner-specific cancellation budget is exhausted', async () => {
    mocks.consumeUsageBudget.mockRejectedValueOnce(
      new ApiError(429, 'For mange stopforespørgsler.'),
    );
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain('stopforespørgsler');
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});

describe('bounded persisted-cancellation watcher', () => {
  it('aborts provider work on persisted cancellation and clears the next poll', async () => {
    mocks.unsafe.mockResolvedValue([row('cancelled')]);
    const controller = new AbortController();
    watchAnalysisRequest(user, requestId, controller);
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.signal.aborted).toBe(true);
    expect(mocks.unsafe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up on normal completion and local request abort', async () => {
    const normal = new AbortController(),
      stop = watchAnalysisRequest(user, requestId, normal);
    stop();
    const aborted = new AbortController();
    watchAnalysisRequest(user, requestId, aborted);
    aborted.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.unsafe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never stacks slow DB polls or schedules another after cleanup', async () => {
    let finish!: (rows: unknown[]) => void;
    mocks.unsafe.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const stop = watchAnalysisRequest(user, requestId, new AbortController());
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.unsafe).toHaveBeenCalledOnce();
    stop();
    finish([row('running')]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.unsafe).toHaveBeenCalledOnce();
  });
  it('survives a failed poll without treating it as authorization to persist', async () => {
    mocks.unsafe
      .mockRejectedValueOnce(new Error('fixture database temporarily unavailable'))
      .mockResolvedValueOnce([row('cancelled')]);
    const controller = new AbortController();
    watchAnalysisRequest(user, requestId, controller);
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not expose status for an unknown or differently owned request', async () => {
    mocks.unsafe.mockResolvedValue([]);
    expect(await analysisRequestStatus(user, requestId)).toBeUndefined();
    expect(mocks.unsafe.mock.calls[0][1]).toEqual([requestId, user.userId]);
  });
});
