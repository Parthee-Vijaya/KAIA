import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/server/errors';
import type { AccessContext, Analysis } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ownedAnalysis: vi.fn(),
  loadDatasetShell: vi.fn(),
  loadDataset: vi.fn(),
  consumePreviewBudget: vi.fn(),
  consumeAnalysisBudget: vi.fn(),
  describeAnalysisEditor: vi.fn(),
  recalculateAnalysisEditor: vi.fn(),
  selectedProviderFor: vi.fn(),
  acquireLiveAnalysis: vi.fn(),
  release: vi.fn(),
  beginExplanationRequest: vi.fn(),
  completeExplanationRequest: vi.fn(),
  cancelAnalysisRequest: vi.fn(),
  watchAnalysisRequest: vi.fn(),
  stopWatching: vi.fn(),
  streamText: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/repository', () => ({
  ownedAnalysis: mocks.ownedAnalysis,
  loadDatasetShell: mocks.loadDatasetShell,
  loadDataset: mocks.loadDataset,
  consumePreviewBudget: mocks.consumePreviewBudget,
  consumeAnalysisBudget: mocks.consumeAnalysisBudget,
}));
vi.mock('@/domain/analysis-editor', () => ({
  describeAnalysisEditor: mocks.describeAnalysisEditor,
  recalculateAnalysisEditor: mocks.recalculateAnalysisEditor,
}));
vi.mock('@/server/live-access', () => ({
  selectedProviderFor: mocks.selectedProviderFor,
  acquireLiveAnalysis: mocks.acquireLiveAnalysis,
}));
vi.mock('@/server/providers', () => ({ streamText: mocks.streamText }));
vi.mock('@/server/analysis-requests', async () => {
  const { z } = await import('zod');
  return {
    analysisRequestIdSchema: z.string().uuid(),
    beginExplanationRequest: mocks.beginExplanationRequest,
    completeExplanationRequest: mocks.completeExplanationRequest,
    cancelAnalysisRequest: mocks.cancelAnalysisRequest,
    watchAnalysisRequest: mocks.watchAnalysisRequest,
  };
});
vi.mock('@/server/db', () => {
  throw new Error('No database in HTTP fixtures.');
});
import { POST } from '../src/app/api/analysis-adjustments/route';
const origin = 'https://kaia-adjustments.example';
const id = 'fd7a98ab-b807-4880-95a5-316bdc41d3a5';
const requestId = '80f92a1b-f2ac-450a-b446-03ff55376fac';
const user = {
  userId: 'fixture-adjustments-owner',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
} as AccessContext;
const basis: Analysis = {
  analysisId: id,
  datasetVersion: 'ADJUSTMENTS-FIXTURE',
  question: 'Et regneeksempel',
  title: 'En beregning',
  conclusion: 'Et beregnet resultat. [1]',
  narrative: ['Tallene er simulerede. [1]'],
  context: {
    area: 'schools',
    entityIds: ['school-hoeng'],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    intent: 'illustration',
  },
  metrics: [{ label: 'Beløb', unit: 'ore', value: 1200, sourceIds: ['DEMO-CALC'] }],
  sources: [
    {
      id: 'DEMO-CALC',
      title: 'Beregning',
      type: 'demo',
      datasetVersion: 'ADJUSTMENTS-FIXTURE',
      period: '2026',
      excerpt: 'Et beregnet beløb.',
    },
  ],
  assumptions: [],
  followups: [],
};
const shell = { version: basis.datasetVersion, rows: [], documents: [], entities: [] };
const editor = {
  basisAnalysisId: id,
  datasetVersion: basis.datasetVersion,
  basisFingerprint: 'fingerprint',
  kind: 'investment',
  fields: [{ id: 'illustration.years', kind: 'number', value: 3 }],
  values: { 'illustration.years': 3 },
};
function req(body: unknown, options: RequestInit = {}) {
  return new Request(origin + '/api/analysis-adjustments', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...options,
  });
}
const body = (mode = 'preview') => ({
  analysisId: id,
  values: { 'illustration.years': 5 },
  mode,
  ...(mode === 'explain' ? { requestId } : {}),
});
async function events(response: Response) {
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('KAIA_APP_URL', origin);
  mocks.requireUser.mockResolvedValue(user);
  mocks.ownedAnalysis.mockResolvedValue(basis);
  mocks.loadDatasetShell.mockResolvedValue(shell);
  mocks.describeAnalysisEditor.mockReturnValue(editor);
  mocks.recalculateAnalysisEditor.mockReturnValue({
    analysis: { ...basis, metrics: [{ ...basis.metrics[0], value: 1500 }] },
    editor,
    previewKey: 'preview-key',
  });
  mocks.selectedProviderFor.mockResolvedValue({ id: 'demo', model: 'Deterministisk analyse' });
  mocks.acquireLiveAnalysis.mockResolvedValue(mocks.release);
  mocks.release.mockResolvedValue(undefined);
  mocks.cancelAnalysisRequest.mockResolvedValue({ status: 'cancelled', requestId });
  mocks.watchAnalysisRequest.mockReturnValue(mocks.stopWatching);
  mocks.completeExplanationRequest.mockResolvedValue({ status: 'completed', requestId });
  mocks.streamText.mockImplementation(async function* () {
    yield 'Den justerede beregning ';
    yield 'er et forslag. [1]';
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('ejer- og versionsbundet forhåndsvisning uden autosave', () => {
  it('beskriver felter uden posteringer, modelvalg eller genberegning', async () => {
    const response = await POST(req({ analysisId: id, values: {}, mode: 'describe' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ editor });
    expect(mocks.ownedAnalysis).toHaveBeenCalledWith(user, id);
    expect(mocks.loadDatasetShell).toHaveBeenCalledWith(user, basis.datasetVersion);
    expect(mocks.loadDataset).not.toHaveBeenCalled();
    expect(mocks.recalculateAnalysisEditor).not.toHaveBeenCalled();
    expect(mocks.selectedProviderFor).not.toHaveBeenCalled();
  });
  it('returnerer deterministisk preview fra fast owned basis uden job/model/lagring', async () => {
    const response = await POST(req(body()));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      baseAnalysisId: id,
      previewKey: 'preview-key',
      ephemeral: true,
      formulation: { provider: 'demo' },
    });
    expect(result.analysis.metrics[0].value).toBe(1500);
    expect(result.analysis.sources).toHaveLength(2);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.recalculateAnalysisEditor).toHaveBeenCalledWith(basis, user, shell, body().values);
    expect(mocks.beginExplanationRequest).not.toHaveBeenCalled();
    expect(mocks.acquireLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.consumeAnalysisBudget).not.toHaveBeenCalled();
  });
  it('henter kun versions- og scopeafgrænsede scenarieposteringer', async () => {
    mocks.describeAnalysisEditor.mockReturnValue({ ...editor, kind: 'scenario' });
    mocks.loadDataset.mockResolvedValue({ ...shell, rows: ['allowed-fixture'] });
    expect((await POST(req(body()))).status).toBe(200);
    expect(mocks.loadDataset).toHaveBeenCalledWith(
      user,
      { ...basis.context, intent: 'scenario' },
      basis.datasetVersion,
    );
  });
  it.each([401, 403, 404])(
    'respekterer auth/ejer/scopefejl %s før metadata og model',
    async (status) => {
      (status === 401 ? mocks.requireUser : mocks.ownedAnalysis).mockRejectedValue(
        new ApiError(status, 'Ingen adgang'),
      );
      expect((await POST(req(body()))).status).toBe(status);
      expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
      expect(mocks.streamText).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...body(), userId: 'other' },
    { ...body(), analysis: basis },
    { ...body(), context: basis.context },
    { ...body('explain'), requestId: undefined },
    { ...body(), values: { x: 'title' } },
    { ...body(), values: { x: null } },
    { ...body(), analysisId: 'ephemeral-id' },
    { ...body('describe') },
  ])('afviser ukendt authority/input før opslag', async (input) => {
    expect((await POST(req(input))).status).toBe(400);
    expect(mocks.ownedAnalysis).not.toHaveBeenCalled();
  });
  it('afviser forkert Origin og store input', async () => {
    expect(
      (
        await POST(
          req(body(), {
            headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await POST(req({ ...body(), values: { ['x'.repeat(25000)]: 1 } }))).status).toBe(413);
  });
  it('videresender domænefeltfejl som422 uden model', async () => {
    mocks.recalculateAnalysisEditor.mockImplementation(() => {
      throw Object.assign(new Error('Ukendt felt.'), { status: 422 });
    });
    expect((await POST(req(body()))).status).toBe(422);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});

describe('én ephemeral forklaringsstream med durable stop', () => {
  it('forklarer Demo uden model og afslutter kun explanationjob', async () => {
    const response = await POST(req(body('explain')));
    const output = await events(response);
    expect(response.headers.get('cache-control')).toContain('no-transform');
    expect(output.map((event) => event.type)).toContain('analysis');
    expect(output.at(-1)).toMatchObject({
      type: 'done',
      previewKey: 'preview-key',
      ephemeral: true,
      formulation: { provider: 'demo' },
    });
    expect(
      output
        .filter((event) => event.type === 'text')
        .map((event) => event.text)
        .join(''),
    ).toBe(basis.conclusion + '\n\n' + basis.narrative.join('\n\n'));
    expect(output.every((event) => !event.conversationId)).toBe(true);
    expect(mocks.beginExplanationRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.completeExplanationRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('bruger ét live streamkald og begge formatterede grundlag, aldrig planner', async () => {
    mocks.selectedProviderFor.mockResolvedValue({
      id: 'corti',
      model: 's1-instant',
      tested: true,
      maxTokens: 2400,
    });
    const output = await events(await POST(req(body('explain'))));
    expect(mocks.streamText).toHaveBeenCalledOnce();
    const [provider, messages] = mocks.streamText.mock.calls[0];
    expect(provider.maxTokens).toBe(1200);
    const evidence = JSON.parse(messages[1].content);
    expect(evidence.selectedBasis.metrics[0].value.formatted).toBe('12,00 kr.');
    expect(evidence.current.metrics[0].value.formatted).toBe('15,00 kr.');
    expect(output.at(-1).formulation.provider).toBe('corti');
    expect(mocks.completeExplanationRequest).toHaveBeenCalledOnce();
  });
  it('giver særskilt LIVE_BUSY og rydder et startet job ved leasekonflikt', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 's1-instant', tested: true });
    mocks.acquireLiveAnalysis.mockRejectedValue(
      new ApiError(
        429,
        'Der kører allerede et live-svar. Stop det, eller vent til det er færdigt.',
      ),
    );
    const response = await POST(req(body('explain')));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'LIVE_BUSY' });
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
  it('giver ikke busyretry ved opbrugt kvote', async () => {
    mocks.acquireLiveAnalysis.mockRejectedValue(
      new ApiError(429, 'Den private live-kvote er brugt for i dag.'),
    );
    const response = await POST(req(body('explain')));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBeUndefined();
  });
  it('præannullering stopper før beregning og model', async () => {
    mocks.beginExplanationRequest.mockRejectedValue(new ApiError(409, 'Annulleret.'));
    expect((await POST(req(body('explain')))).status).toBe(409);
    expect(mocks.recalculateAnalysisEditor).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
  it('tom live-stream fejler uden completed og uden gemt analyse', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 's1-instant', tested: true });
    mocks.streamText.mockImplementation(async function* () {});
    const output = await events(await POST(req(body('explain'))));
    expect(output.at(-1)).toMatchObject({ type: 'error' });
    expect(mocks.completeExplanationRequest).not.toHaveBeenCalled();
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
  });
  it('reader.cancel stopper leveringen og fuldfører ikke jobbet', async () => {
    const response = await POST(req(body('explain')));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.completeExplanationRequest).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('durable cancelled completion giver ingen done selv hvis proxyen fortsatte streamen', async () => {
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 's1-instant', tested: true });
    mocks.completeExplanationRequest.mockRejectedValue(new ApiError(409, 'Annulleret.'));
    const output = await events(await POST(req(body('explain'))));
    expect(output.some((event) => event.type === 'done')).toBe(false);
    expect(output.at(-1).type).toBe('error');
  });
  it('en allerede afbrudt transport får ingen modellease eller beregning', async () => {
    const abort = new AbortController();
    abort.abort();
    expect((await POST(req(body('explain'), { signal: abort.signal }))).status).toBe(409);
    expect(mocks.beginExplanationRequest).not.toHaveBeenCalled();
    expect(mocks.recalculateAnalysisEditor).not.toHaveBeenCalled();
    expect(mocks.acquireLiveAnalysis).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
  it('deadline stopper providerarbejde og markerer jobbet annulleret', async () => {
    vi.useFakeTimers();
    mocks.selectedProviderFor.mockResolvedValue({ id: 'corti', model: 's1-instant', tested: true });
    mocks.streamText.mockImplementation(async function* (
      _provider,
      _messages,
      signal: AbortSignal,
    ) {
      yield 'Et påbegyndt svar.';
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    const response = await POST(req(body('explain')));
    await vi.advanceTimersByTimeAsync(120_001);
    const output = await events(response);
    expect(output.at(-1)).toMatchObject({
      type: 'error',
      error: 'Forklaringen tog for lang tid. Prøv igen.',
    });
    expect(output.some((event) => event.type === 'done')).toBe(false);
    expect(mocks.cancelAnalysisRequest).toHaveBeenCalledWith(user, requestId);
    expect(mocks.completeExplanationRequest).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
