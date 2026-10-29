import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessContext, Analysis, IllustrationSpec } from '../src/domain/types';
import { ApiError } from '../src/server/errors';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadDatasetShell: vi.fn(),
  loadDataset: vi.fn(),
  conversation: vi.fn(),
  saveAnalysis: vi.fn(),
  consumeAnalysisBudget: vi.fn(),
  parseQuestion: vi.fn(),
  assertAnalysisContext: vi.fn(),
  analyze: vi.fn(),
  analyzeResolvedContext: vi.fn(),
  buildIllustration: vi.fn(),
  planLiveAnalysis: vi.fn(),
  resolveDemoAnalysis: vi.fn(),
  selectedProviderFor: vi.fn(),
  acquireLiveAnalysis: vi.fn(),
  releaseLive: vi.fn(),
  planQuery: vi.fn(),
  enrichAnalysisWithContext: vi.fn(),
  getProvider: vi.fn(),
  activeProvider: vi.fn(),
  complete: vi.fn(),
  streamText: vi.fn(),
  scopedTools: vi.fn(),
  beginAnalysisRequest: vi.fn(),
  cancelAnalysisRequest: vi.fn(),
  watchAnalysisRequest: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/repository', () => ({
  loadDatasetShell: mocks.loadDatasetShell,
  loadDataset: mocks.loadDataset,
  conversation: mocks.conversation,
  saveAnalysis: mocks.saveAnalysis,
  consumeAnalysisBudget: mocks.consumeAnalysisBudget,
}));
vi.mock('@/domain/analysis', () => ({
  parseQuestion: mocks.parseQuestion,
  assertAnalysisContext: mocks.assertAnalysisContext,
  analyze: mocks.analyze,
  analyzeResolvedContext: mocks.analyzeResolvedContext,
}));
vi.mock('@/server/analysis-planner', () => ({ planLiveAnalysis: mocks.planLiveAnalysis }));
vi.mock('@/domain/demo-analysis-plan', () => ({
  resolveDemoAnalysis: mocks.resolveDemoAnalysis,
  DemoAnalysisPlanError: class extends Error {
    readonly status = 422;
  },
}));
vi.mock('@/domain/illustrations', () => ({
  buildIllustration: mocks.buildIllustration,
  IllustrationInputError: class extends Error {
    readonly status = 422;
  },
}));
vi.mock('@/server/live-access', () => ({
  selectedProviderFor: mocks.selectedProviderFor,
  acquireLiveAnalysis: mocks.acquireLiveAnalysis,
}));
vi.mock('@/integrations', () => ({
  planQuery: mocks.planQuery,
  enrichAnalysisWithContext: mocks.enrichAnalysisWithContext,
}));
vi.mock('@/server/providers', () => ({
  getProvider: mocks.getProvider,
  activeProvider: mocks.activeProvider,
  complete: mocks.complete,
  streamText: mocks.streamText,
}));
vi.mock('@/server/tools', () => ({ scopedTools: mocks.scopedTools }));
vi.mock('@/server/analysis-requests', async () => {
  const { z } = await import('zod');
  return {
    analysisRequestIdSchema: z.string().uuid(),
    beginAnalysisRequest: mocks.beginAnalysisRequest,
    cancelAnalysisRequest: mocks.cancelAnalysisRequest,
    watchAnalysisRequest: mocks.watchAnalysisRequest,
  };
});
vi.mock('@/server/db', () => {
  throw new Error('Stream contract tests must not access a database.');
});

import { demoAnalysisText, streamDemoAnalysis } from '../src/server/demo-text';
import { POST } from '../src/app/api/analyze/route';
import { DemoAnalysisPlanError } from '../src/domain/demo-analysis-plan';

const origin = 'https://kaia-stream.example';
const user: AccessContext = {
  userId: 'demo:stream-fixture',
  objectId: 'fixture-object',
  tenantId: 'fixture-tenant',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
};
const analysis: Analysis = {
  analysisId: 'DEMO-stream-fixture',
  datasetVersion: 'KAIA-STREAM-FIXTURE-v1',
  question: 'Vis budgetstatus for Høng Skole.',
  title: 'Budgetstatus',
  conclusion: 'Nettoforbruget er 948.593,70 kr. over periodens simulerede budget. [1]',
  narrative: [
    'De valgte måneder er januar–september 2026. Alle kommunale beløb er simulerede. [1]',
    'Regnskab og periodiseret budget omfatter samme skole, konti og måneder.',
  ],
  context: {
    area: 'schools',
    entityIds: ['school-hoeng'],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    intent: 'budget',
    metric: 'net',
  },
  metrics: [{ label: 'Afvigelse', value: 94859370, unit: 'ore', sourceIds: ['DEMO-CALC'] }],
  sources: [
    {
      id: 'DEMO-CALC',
      title: 'Simuleret beregningsgrundlag',
      type: 'demo',
      status: 'simulated',
      datasetVersion: 'KAIA-STREAM-FIXTURE-v1',
      period: 'januar–september 2026',
      excerpt: 'Simulerede testtal i heltalsøre: 94859370.',
    },
  ],
  assumptions: ['Alle kommunale beløb er simulerede.'],
  followups: ['Vis samme analyse for 2025.'],
};
const illustrationSpec: IllustrationSpec = {
  kind: 'process',
  title: 'Forslag til skoletrivsel',
  steps: [
    { label: 'Afgræns', description: 'Aftal formålet.' },
    { label: 'Undersøg', description: 'Indhent et aggregeret grundlag.' },
    { label: 'Afprøv', description: 'Afprøv mulige tiltag.' },
  ],
  assumptions: ['Alle trin er et procesforslag.'],
};
const illustrative: Analysis = {
  ...analysis,
  basisKind: 'illustration',
  illustration: {
    version: 1,
    spec: illustrationSpec,
    calculation: { kind: 'process', stepCount: 3 },
  },
  context: { ...analysis.context, intent: 'illustration', metric: 'net' },
  metrics: [],
  sources: [
    {
      ...analysis.sources[0],
      id: 'DEMO-ASSUMPTIONS',
      origin: 'assumption',
      title: 'Modeludkastets antagelser',
    },
    { ...analysis.sources[0], origin: 'calculation' },
  ],
  chart: {
    type: 'flow',
    title: 'Illustrativt forløb',
    subtitle: 'Ingen målte effekter',
    unit: 'number',
    displayUnit: 'rækkefølge',
    rows: illustrationSpec.steps.map((step, index) => ({ ...step, order: index + 1 })),
    series: [{ key: 'order', label: 'Trin', color: '#006f71' }],
    sourceIds: ['DEMO-CALC'],
  },
};

async function collect(generator: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const text of generator) chunks.push(text);
  return chunks;
}
type Event = { type: string; text?: string; analysis?: Analysis; error?: string };
async function events(response: Response): Promise<Event[]> {
  return (await response.text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
function request(signal?: AbortSignal, patch: Record<string, unknown> = {}) {
  return new Request(origin + '/api/analyze', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ question: analysis.question, ...patch }),
    signal,
  });
}
async function firstText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error('Expected a text event before completion.');
    const event = JSON.parse(decoder.decode(chunk.value).trim()) as Event;
    if (event.type === 'text') return event.text;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('KAIA_APP_URL', origin);
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.loadDatasetShell.mockResolvedValue({ version: analysis.datasetVersion });
  mocks.loadDataset.mockResolvedValue({ version: analysis.datasetVersion });
  mocks.consumeAnalysisBudget.mockResolvedValue(undefined);
  mocks.parseQuestion.mockReturnValue(analysis.context);
  mocks.assertAnalysisContext.mockReturnValue(undefined);
  mocks.analyze.mockReturnValue(analysis);
  mocks.analyzeResolvedContext.mockReturnValue(analysis);
  mocks.resolveDemoAnalysis.mockImplementation(({ currentContext }) => ({
    outcome: 'analysis',
    context: currentContext,
  }));
  mocks.buildIllustration.mockReturnValue(illustrative);
  mocks.planLiveAnalysis.mockResolvedValue({ outcome: 'analysis', context: analysis.context });
  mocks.selectedProviderFor.mockResolvedValue({
    id: 'demo',
    model: 'Deterministisk analyse',
    tested: true,
  });
  mocks.releaseLive.mockResolvedValue(undefined);
  mocks.acquireLiveAnalysis.mockResolvedValue(mocks.releaseLive);
  mocks.planQuery.mockReturnValue({});
  mocks.enrichAnalysisWithContext.mockImplementation((value) => value);
  mocks.getProvider.mockResolvedValue({
    id: 'demo',
    model: 'Deterministisk analyse',
    tested: true,
  });
  mocks.activeProvider.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
  mocks.beginAnalysisRequest.mockResolvedValue({ status: 'running' });
  mocks.cancelAnalysisRequest.mockResolvedValue({ status: 'cancelled' });
  mocks.watchAnalysisRequest.mockReturnValue(() => undefined);
  mocks.saveAnalysis.mockImplementation(async (_access, value) => ({
    ...value,
    analysisId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('deterministic demo text delivery', () => {
  it('reconstructs the exact calculated conclusion and paragraphs in readable chunks', async () => {
    const original = structuredClone(analysis);
    const result = collect(streamDemoAnalysis(analysis));
    await vi.runAllTimersAsync();
    const chunks = await result;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((text) => text.trim().split(/\s+/u).length <= 5)).toBe(true);
    expect(chunks.join('')).toBe([analysis.conclusion, ...analysis.narrative].join('\n\n'));
    expect(chunks.join('')).toContain('948.593,70 kr.');
    expect(analysis).toEqual(original);
  });
  it('preserves whitespace, punctuation and Danish Unicode without adding text', async () => {
    const basis = {
      conclusion: '  Ændring: −2,5 %\n',
      narrative: ['', '  Øre, År og kilder. [2]  '],
    };
    const result = collect(streamDemoAnalysis(basis));
    await vi.runAllTimersAsync();
    expect((await result).join('')).toBe(demoAnalysisText(basis));
    expect(demoAnalysisText(basis)).toBe('  Ændring: −2,5 %\n\n\n  Øre, År og kilder. [2]  ');
  });
  it('delivers the first words immediately and needs no timer for an empty or short answer', async () => {
    const iterator = streamDemoAnalysis({ conclusion: 'Et kort, beregnet svar.', narrative: [] });
    expect(await iterator.next()).toEqual({ value: 'Et kort, beregnet svar.', done: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
    expect(await collect(streamDemoAnalysis({ conclusion: '', narrative: ['', '  '] }))).toEqual(
      [],
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it('caps pacing for a long answer instead of adding an unbounded typewriter delay', async () => {
    const basis = {
      conclusion: Array.from({ length: 1500 }, (_, i) => `ord${i}`).join(' '),
      narrative: [],
    };
    const result = collect(streamDemoAnalysis(basis));
    await vi.advanceTimersByTimeAsync(1500);
    expect((await result).join('')).toBe(basis.conclusion);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('immediately cancels an active pause and clears its timer', async () => {
    const controller = new AbortController();
    const iterator = streamDemoAnalysis(analysis, controller.signal);
    await iterator.next();
    const next = iterator.next();
    expect(vi.getTimerCount()).toBe(1);
    const aborted = expect(next).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await aborted;
    expect(vi.getTimerCount()).toBe(0);
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
  it('does not deliver any text or use a model when already stopped', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    await expect(collect(streamDemoAnalysis(analysis, controller.signal))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('analyze route NDJSON contract', () => {
  it('uses the shared deterministic illustration branch in Demo without ledger or model calls', async () => {
    mocks.resolveDemoAnalysis.mockReturnValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
      trigger: 'open-topic',
    });
    const response = await POST(
      request(undefined, { question: 'Hvordan kan vi forbedre skoletrivslen?' }),
    );
    const pending = events(response);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.filter((event) => event.type === 'status').map((event) => event.text)).toEqual([
      'Opstiller antagelser',
      'Beregner illustration',
      'Leverer beregnet demosvar',
    ]);
    expect(result.find((event) => event.type === 'analysis')?.analysis).toMatchObject({
      basisKind: 'illustration',
      chart: { type: 'flow' },
      formulation: { provider: 'demo' },
    });
    expect(mocks.resolveDemoAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Hvordan kan vi forbedre skoletrivslen?',
        user,
        dataset: { version: analysis.datasetVersion },
        currentContext: analysis.context,
      }),
    );
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.planQuery).not.toHaveBeenCalled();
    expect(mocks.enrichAnalysisWithContext).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.planLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).toHaveBeenCalledOnce();
  });
  it('passes the exact owned snapshot to deterministic illustrative followups', async () => {
    mocks.conversation.mockResolvedValue({ analyses: [illustrative] });
    mocks.resolveDemoAnalysis.mockReturnValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
      trigger: 'followup',
    });
    const response = await POST(
      request(undefined, {
        question: 'Vis samme eksempel over fem år.',
        conversationId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    const pending = events(response);
    await vi.runAllTimersAsync();
    await pending;
    expect(mocks.resolveDemoAnalysis.mock.calls[0][0].previous).toEqual(illustrative);
    expect(mocks.loadDatasetShell).toHaveBeenCalledWith(user, illustrative.datasetVersion);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis.mock.calls[0][2]).toBe('22222222-2222-4222-8222-222222222222');
  });
  it('preserves a deterministic hard or coverage failure as422 rather than inventing a successful answer', async () => {
    mocks.resolveDemoAnalysis.mockImplementation(() => {
      throw new DemoAnalysisPlanError('Dette spørgsmål kan ikke undersøges i snapshotgrundlaget.');
    });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Dette spørgsmål kan ikke undersøges i snapshotgrundlaget.',
    });
    expect(mocks.buildIllustration).not.toHaveBeenCalled();
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('annuls an owned durable request before cleanup when deterministic resolution fails before streaming', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.resolveDemoAnalysis.mockImplementation(() => {
      throw new DemoAnalysisPlanError('Datagrundlaget afviser spørgsmålet.');
    });
    const response = await POST(request(undefined, { requestId }));
    expect(response.status).toBe(422);
    expect(mocks.beginAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
    expect(mocks.cancelAnalysisRequest.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.releaseLive.mock.invocationCallOrder[0],
    );
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not claim or cancel another owners job when begin fails', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.beginAnalysisRequest.mockRejectedValueOnce(
      new ApiError(404, 'Anmodningen blev ikke fundet.'),
    );
    expect((await POST(request(undefined, { requestId }))).status).toBe(404);
    expect(mocks.cancelAnalysisRequest).not.toHaveBeenCalled();
    expect(mocks.acquireLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.resolveDemoAnalysis).not.toHaveBeenCalled();
  });
  it('closes a started durable request when paid planning fails without inventing a fallback', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.planLiveAnalysis.mockRejectedValueOnce(new ApiError(502, 'Udbyderen svarede ikke.'));
    expect((await POST(request(undefined, { requestId }))).status).toBe(502);
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.buildIllustration).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never saves a stopped deterministic illustrative fallback', async () => {
    mocks.resolveDemoAnalysis.mockReturnValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
      trigger: 'open-topic',
    });
    const requestId = '33333333-3333-4333-8333-333333333333';
    const response = await POST(request(undefined, { requestId }));
    const reader = response.body!.getReader();
    await firstText(reader);
    await reader.cancel();
    await vi.runAllTimersAsync();
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.loadDataset).not.toHaveBeenCalled();
  });
  it('binds the transport request ID to the server user and guards the actual save', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    const stopWatching = vi.fn();
    mocks.watchAnalysisRequest.mockReturnValue(stopWatching);
    const response = await POST(request(undefined, { requestId }));
    const result = events(response);
    await vi.runAllTimersAsync();
    expect((await result).at(-1)?.type).toBe('done');
    expect(mocks.beginAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
    expect(mocks.watchAnalysisRequest).toHaveBeenCalledWith(
      user,
      requestId,
      expect.any(AbortController),
    );
    expect(mocks.saveAnalysis).toHaveBeenCalledExactlyOnceWith(
      user,
      expect.objectContaining({ datasetVersion: analysis.datasetVersion }),
      undefined,
      requestId,
    );
    expect(stopWatching).toHaveBeenCalledOnce();
  });
  it('does not start a stream after a preemptive persisted cancellation or replay', async () => {
    mocks.beginAnalysisRequest.mockRejectedValueOnce(new ApiError(409, 'Analysen er stoppet.'));
    const response = await POST(
      request(undefined, { requestId: '33333333-3333-4333-8333-333333333333' }),
    );
    expect(response.status).toBe(409);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.watchAnalysisRequest).not.toHaveBeenCalled();
  });
  it('never emits analysis or done if the atomic persistence guard rejects a late cancellation', async () => {
    mocks.saveAnalysis.mockRejectedValueOnce(
      new ApiError(409, 'Analysen er stoppet og bliver ikke gemt.'),
    );
    const response = await POST(
      request(undefined, { requestId: '33333333-3333-4333-8333-333333333333' }),
    );
    const result = events(response);
    await vi.runAllTimersAsync();
    const delivered = await result;
    expect(delivered.at(-1)).toMatchObject({
      type: 'error',
      error: 'Analysen er stoppet og bliver ikke gemt.',
    });
    expect(delivered.some((event) => event.type === 'analysis' || event.type === 'done')).toBe(
      false,
    );
  });
  it('stops text and persistence when the watcher aborts a still-connected request', async () => {
    let jobController!: AbortController;
    const stopWatching = vi.fn();
    mocks.watchAnalysisRequest.mockImplementation((_user, _requestId, controller) => {
      jobController = controller;
      return stopWatching;
    });
    const response = await POST(
      request(undefined, { requestId: '33333333-3333-4333-8333-333333333333' }),
    );
    const reader = response.body!.getReader();
    await firstText(reader);
    jobController.abort();
    expect((await reader.read()).done).toBe(true);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(stopWatching).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('streams actual demo prose before the unchanged saved analysis without renderedText duplication', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const delivered = events(response);
    await vi.runAllTimersAsync();
    const result = await delivered;
    const textEvents = result.filter((event) => event.type === 'text');
    expect(textEvents.length).toBeGreaterThan(1);
    expect(textEvents.map((event) => event.text).join('')).toBe(demoAnalysisText(analysis));
    const finalIndex = result.findIndex((event) => event.type === 'analysis');
    expect(result.slice(finalIndex).map((event) => event.type)).toEqual(['analysis', 'done']);
    expect(result.slice(0, finalIndex).some((event) => event.type === 'text')).toBe(true);
    expect(result.filter((event) => event.type === 'status').map((event) => event.text)).toEqual([
      'Henter budgettal',
      'Sammenholder kilder',
      'Leverer beregnet demosvar',
    ]);
    expect(mocks.saveAnalysis).toHaveBeenCalledExactlyOnceWith(
      user,
      {
        ...analysis,
        formulation: { provider: 'demo', model: 'Deterministisk analyse' },
        trace: expect.objectContaining({
          version: 1,
          steps: expect.arrayContaining([
            expect.objectContaining({ label: 'Beregning', state: 'completed' }),
            expect.objectContaining({ label: 'Svar', state: 'completed' }),
          ]),
        }),
      },
      undefined,
    );
    expect(result[finalIndex].analysis).toMatchObject({
      conclusion: analysis.conclusion,
      narrative: analysis.narrative,
      metrics: analysis.metrics,
      sources: analysis.sources,
      formulation: { provider: 'demo', model: 'Deterministisk analyse' },
    });
    expect(result[finalIndex].analysis).not.toHaveProperty('renderedText');
    expect(mocks.activeProvider).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.scopedTools).not.toHaveBeenCalled();
  });
  it('does not save or emit completion when the request is stopped during text delivery', async () => {
    const controller = new AbortController();
    const response = await POST(request(controller.signal));
    const reader = response.body!.getReader();
    expect(await firstText(reader)).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    const remaining = await reader.read();
    expect(remaining.done).toBe(true);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('cleans up pacing and prevents saving when the downstream stream is cancelled', async () => {
    const response = await POST(request());
    const reader = response.body!.getReader();
    await firstText(reader);
    await reader.cancel();
    await vi.runAllTimersAsync();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not calculate or save if the request was stopped before streaming starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await POST(request(controller.signal));
    expect(await events(response)).toEqual([]);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });
  it('checks cancellation again after an outstanding dataset query', async () => {
    let finish!: () => void;
    mocks.loadDataset.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new AbortController();
    const response = await POST(request(controller.signal));
    const result = events(response);
    controller.abort();
    finish();
    expect((await result).map((event) => event.type)).toEqual(['trace', 'status']);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });
  it('keeps the existing real-provider stream and saved formulation contract', async () => {
    mocks.requireUser.mockResolvedValue({ ...user, userId: 'entra:fixture' });
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.complete.mockResolvedValue({ content: 'Forberedelse', tool_calls: [] });
    mocks.scopedTools.mockReturnValue({ definitions: [], currentAnalysis: () => analysis });
    mocks.streamText.mockImplementation(async function* () {
      yield 'Et model';
      yield 'formuleret svar.';
    });
    const response = await POST(request());
    const result = await events(response);
    expect(result.filter((event) => event.type === 'text').map((event) => event.text)).toEqual([
      'Et model',
      'formuleret svar.',
    ]);
    expect(result.some((event) => event.text === 'Leverer beregnet demosvar')).toBe(false);
    expect(result.find((event) => event.type === 'analysis')?.analysis).toMatchObject({
      renderedText: 'Et modelformuleret svar.',
      formulation: { provider: 'corti', model: 'corti-s1' },
      conclusion: analysis.conclusion,
      narrative: analysis.narrative,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.planLiveAnalysis).toHaveBeenCalledOnce();
    expect(mocks.analyzeResolvedContext).toHaveBeenCalledExactlyOnceWith(
      analysis.question,
      { ...user, userId: 'entra:fixture' },
      analysis.context,
      { version: analysis.datasetVersion },
    );
    expect(mocks.streamText).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('starts durable cancellation before live planning and loads only the validated plan context', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    const context = { ...analysis.context, period: { year: 2025, fromMonth: 1, toMonth: 9 } };
    mocks.selectedProviderFor.mockResolvedValue({
      id: 'corti',
      model: 'corti-s1',
      tested: true,
      maxTokens: 4096,
    });
    mocks.planLiveAnalysis.mockImplementation(async (_provider, _input, signal) => {
      expect(mocks.beginAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
      expect(mocks.watchAnalysisRequest).toHaveBeenCalledOnce();
      expect(signal).toBeInstanceOf(AbortSignal);
      return { outcome: 'analysis', context };
    });
    mocks.streamText.mockImplementation(async function* () {
      yield 'Et beregnet svar. [1]';
    });
    const response = await POST(request(undefined, { requestId }));
    const result = await events(response);
    expect(result.at(-1)?.type).toBe('done');
    expect(mocks.loadDataset).toHaveBeenCalledExactlyOnceWith(
      user,
      context,
      analysis.datasetVersion,
    );
    expect(mocks.analyzeResolvedContext).toHaveBeenCalledWith(
      analysis.question,
      user,
      context,
      expect.any(Object),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.planLiveAnalysis.mock.calls[0][0].maxTokens).toBe(2400);
    const prompt = JSON.parse(mocks.streamText.mock.calls[0][1][1].content);
    expect(prompt.citations[0]).toMatchObject({ citation: '[1]', id: 'DEMO-CALC' });
    expect(prompt.metrics[0].value).toMatchObject({
      raw: analysis.metrics[0].value,
      formatted: '948.593,70 kr.',
    });
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it.each(['clarify', 'unsupported'] as const)(
    'returns an honest 422 for %s without data loading or persistence',
    async (outcome) => {
      mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
      mocks.planLiveAnalysis.mockResolvedValue({
        outcome,
        reason: 'Præcisér spørgsmålets periode.',
      });
      const response = await POST(request());
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'Præcisér spørgsmålets periode.' });
      expect(mocks.loadDataset).not.toHaveBeenCalled();
      expect(mocks.saveAnalysis).not.toHaveBeenCalled();
      expect(mocks.streamText).not.toHaveBeenCalled();
      expect(mocks.releaseLive).toHaveBeenCalledOnce();
    },
  );
  it('aborts a watched live planner before any facts or answer are generated', async () => {
    const stopWatching = vi.fn();
    let controller!: AbortController;
    mocks.watchAnalysisRequest.mockImplementation((_user, _id, abort) => {
      controller = abort;
      return stopWatching;
    });
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.planLiveAnalysis.mockImplementation(async (_provider, _input, signal) => {
      controller.abort();
      signal.throwIfAborted();
    });
    const response = await POST(
      request(undefined, { requestId: '33333333-3333-4333-8333-333333333333' }),
    );
    expect(response.status).toBe(409);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(stopWatching).toHaveBeenCalledOnce();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('keeps the conversation snapshot bound before any paid planning', async () => {
    mocks.conversation.mockResolvedValue({ analyses: [analysis] });
    const response = await POST(
      request(undefined, {
        conversationId: '22222222-2222-4222-8222-222222222222',
        datasetVersion: 'OTHER-VERSION',
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.planLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.acquireLiveAnalysis).not.toHaveBeenCalled();
  });
  it('does not save an empty live formulation even if the provider finishes its stream normally', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.streamText.mockImplementation(async function* () {
      yield '  ';
    });
    const response = await POST(request());
    const result = await events(response);
    expect(result.at(-1)).toMatchObject({
      type: 'error',
      error: 'AI-forbindelsen leverede intet svar. Prøv igen.',
    });
    expect(result.some((event) => event.type === 'analysis' || event.type === 'done')).toBe(false);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('persists cancellation when the live deadline expires during planning and releases the lease', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    let started!: () => void;
    const planning = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.planLiveAnalysis.mockImplementation(async (_provider, _input, signal) => {
      started();
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    });
    const pending = POST(request(undefined, { requestId }));
    await planning;
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await pending).status).toBe(504);
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledExactlyOnceWith(user, requestId);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('streams a server-built illustration without financial data loading, document searches or ledger routing', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.planLiveAnalysis.mockResolvedValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
    });
    mocks.streamText.mockImplementation(async function* () {
      yield 'Dette er et forslag til et forløb. [1]';
    });
    const response = await POST(request(undefined, { requestId }));
    const result = await events(response);
    expect(result.filter((event) => event.type === 'status').map((event) => event.text)).toEqual([
      'Opstiller antagelser',
      'Beregner illustration',
      'Formulerer svaret',
    ]);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.planQuery).not.toHaveBeenCalled();
    expect(mocks.enrichAnalysisWithContext).not.toHaveBeenCalled();
    expect(mocks.analyzeResolvedContext).not.toHaveBeenCalled();
    expect(mocks.buildIllustration).toHaveBeenCalledExactlyOnceWith(
      analysis.question,
      user,
      illustrative.context,
      illustrationSpec,
      { version: analysis.datasetVersion },
    );
    expect(mocks.saveAnalysis).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        basisKind: 'illustration',
        illustration: illustrative.illustration,
        formulation: { provider: 'corti', model: 'corti-s1' },
      }),
      undefined,
      requestId,
    );
    const payload = JSON.parse(mocks.streamText.mock.calls[0][1][1].content);
    expect(payload.basisKind).toBe('illustration');
    expect(payload.illustration).toMatchObject({ kind: 'process', steps: illustrationSpec.steps });
    expect(result.at(-1)?.type).toBe('done');
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('passes only the owned previous illustration to the next planner call', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.conversation.mockResolvedValue({ analyses: [illustrative] });
    mocks.planLiveAnalysis.mockResolvedValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
    });
    mocks.streamText.mockImplementation(async function* () {
      yield 'Et opdateret forslag.';
    });
    const response = await POST(
      request(undefined, { conversationId: '22222222-2222-4222-8222-222222222222' }),
    );
    await events(response);
    expect(mocks.planLiveAnalysis.mock.calls[0][1].previousIllustration).toEqual(
      illustrative.illustration,
    );
    const payload = JSON.parse(mocks.streamText.mock.calls[0][1][1].content);
    expect(payload.previousQuestion).toBe(illustrative.question);
    expect(payload.previousIllustration).toMatchObject({
      kind: 'process',
      steps: illustrationSpec.steps,
    });
    expect(payload.previousIllustration.sourceIds).toEqual(['DEMO-ASSUMPTIONS', 'DEMO-CALC']);
    expect(JSON.stringify(payload.previousIllustration)).not.toContain('renderedText');
    expect(mocks.conversation).toHaveBeenCalledExactlyOnceWith(
      user,
      '22222222-2222-4222-8222-222222222222',
    );
  });
  it('rejects client-supplied illustrative answers or previous models before paid planning', async () => {
    const response = await POST(
      request(undefined, { previousIllustration: illustrative.illustration }),
    );
    expect(response.status).toBe(400);
    expect(mocks.planLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });
  it('does not convert a planner failure into a successful process proposal', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.planLiveAnalysis.mockRejectedValue(new ApiError(502, 'Udbyderen afviste kaldet.'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(mocks.buildIllustration).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('keeps the same durable cancellation path while an illustration formulation is streaming', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 'corti-s1', tested: true });
    mocks.planLiveAnalysis.mockResolvedValue({
      outcome: 'illustration',
      context: illustrative.context,
      spec: illustrationSpec,
    });
    mocks.streamText.mockImplementation(async function* (_provider, _messages, signal) {
      yield 'Et foreslået forløb';
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    });
    const stop = new AbortController();
    const response = await POST(request(stop.signal, { requestId }));
    const reader = response.body!.getReader();
    await firstText(reader);
    stop.abort();
    expect((await reader.read()).done).toBe(true);
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.releaseLive).toHaveBeenCalledOnce();
  });
  it('preserves authentication and scope checks before any streamed content', async () => {
    mocks.requireUser.mockRejectedValueOnce(new ApiError(401, 'Log ind først.'));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    mocks.assertAnalysisContext.mockImplementationOnce(() => {
      throw Object.assign(new Error('Du har ikke adgang.'), { code: 'ACCESS_DENIED' });
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  });
});
