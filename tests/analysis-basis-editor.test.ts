import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisEditor, AnalysisEditorValues } from '../src/domain/analysis-editor';
import { DEFAULT_SCENARIO, type Analysis } from '../src/domain/types';
import {
  AnalysisBasisEditorView,
  BasisEditorField,
  editorRange,
  formatEditorValue,
} from '../src/components/analysis-basis-editor';
import {
  AdjustmentRequestError,
  BasisPreviewController,
  type AdjustmentEnvelope,
  type AdjustmentEvent,
  type BasisPreviewTransport,
} from '../src/components/analysis-basis-preview';
import type { AnalysisAttempt, CancelConfirmation } from '../src/components/analysis-request';

vi.mock('../src/components/chart', () => ({
  AnalysisChart: ({ chart }: { chart: { title: string } }) =>
    createElement('div', { 'data-chart-fixture': true }, chart.title),
}));
const basis: Analysis = {
  analysisId: '33333333-3333-4333-8333-333333333333',
  datasetVersion: 'EDITOR-FIXTURE-v4',
  question: 'Vis udgift pr. elev.',
  title: 'Udgift pr. elev',
  conclusion: 'Det gemte grundlag.',
  narrative: [],
  context: {
    area: 'schools',
    entityIds: ['school-fixture'],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    intent: 'comparison',
    metric: 'perPupil',
  },
  formulation: { provider: 'demo', model: 'Deterministisk analyse' },
  metrics: [{ label: 'Udgift pr. elev', value: 12345, unit: 'ore', sourceIds: ['BASE'] }],
  sources: [
    {
      id: 'BASE',
      type: 'demo',
      title: 'Gemte tal',
      datasetVersion: 'EDITOR-FIXTURE-v4',
      period: '2026',
      excerpt: 'Det oprindelige grundlag.',
    },
  ],
  chart: {
    title: 'Oprindelig figur',
    subtitle: 'Samme måneder',
    type: 'bar',
    unit: 'ore',
    series: [{ key: 'value', label: 'Nøgletal', color: '#006f71' }],
    rows: [{ label: 'Skole', value: 12345 }],
    sourceIds: ['BASE'],
  },
  assumptions: [],
  followups: [],
};
const editor: AnalysisEditor = {
  basisAnalysisId: basis.analysisId,
  datasetVersion: basis.datasetVersion,
  basisFingerprint: 'fixed-owned-basis',
  kind: 'scenario',
  values: { 'scenario.energyPercent': 0, 'scenario.horizon': 'remaining' },
  fields: [
    {
      id: 'scenario.energyPercent',
      label: 'Energipris',
      kind: 'number',
      value: 0,
      scale: 1,
      displayUnit: '%',
      min: -100,
      max: 200,
      step: 0.1,
      help: 'Kun energiposter.',
    },
    {
      id: 'scenario.horizon',
      label: 'Virkningsperiode',
      kind: 'choice',
      value: 'remaining',
      scale: 1,
      displayUnit: '',
      options: [
        { value: 'remaining', label: 'Resten af året' },
        { value: 'annual', label: 'Helårsvirkning' },
      ],
      help: 'Helårsbaseline bevares.',
    },
  ],
};
function envelope(values: AnalysisEditorValues, label = 'Nyt scenarie'): AdjustmentEnvelope {
  const energy = Number(values['scenario.energyPercent']);
  return {
    baseAnalysisId: basis.analysisId,
    previewKey: `preview:${energy}:${values['scenario.horizon']}`,
    ephemeral: true,
    editor: {
      ...editor,
      values: { ...values },
      fields: editor.fields.map((field) => ({ ...field, value: values[field.id] })),
    },
    formulation: { provider: 'corti', model: 'corti-s1-instant' },
    analysis: {
      ...structuredClone(basis),
      title: label,
      renderedText: undefined,
      context: { ...basis.context, intent: 'scenario', metric: 'net' },
      scenario: {
        assumptions: {
          ...DEFAULT_SCENARIO,
          energyPercent: energy,
          horizon: values['scenario.horizon'] as 'annual' | 'remaining',
        },
        baselineOre: 1000,
        scenarioOre: 1100,
        deltaOre: 100,
      },
      metrics: [
        { label: 'Baseline', value: 1000, unit: 'ore', sourceIds: ['PREVIEW'] },
        { label: 'Scenarie', value: 1100, unit: 'ore', sourceIds: ['PREVIEW'] },
        { label: 'Ændring', value: 100, unit: 'ore', sourceIds: ['PREVIEW'] },
      ],
      sources: [{ ...basis.sources[0], id: 'PREVIEW', title: 'Scenarieberegning' }],
      chart: { ...basis.chart!, title: label, sourceIds: ['PREVIEW'] },
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function stream(values: AnalysisEditorValues, event: (value: AdjustmentEvent) => void) {
  const result = envelope(values),
    identity = {
      previewKey: result.previewKey,
      baseAnalysisId: basis.analysisId,
      ephemeral: true,
      formulation: result.formulation,
    };
  event({ type: 'analysis', ...result });
  event({ type: 'text', text: 'Ny forklaring [1]', ...identity });
  event({ type: 'done', ...identity });
}
function setup() {
  const transport: BasisPreviewTransport = {
    describe: vi.fn(async () => ({ editor: structuredClone(editor) })),
    preview: vi.fn(async (_id, values) => envelope(values)),
    explain: vi.fn(async (_id, values, _attempt, event) => stream(values, event)),
    cancel: vi.fn(async () => ({ status: 'cancelled' as const })),
  };
  const controller = new BasisPreviewController(basis, transport);
  return { transport, controller };
}
const activeControllers: BasisPreviewController[] = [];
async function started() {
  const result = setup();
  activeControllers.push(result.controller);
  await result.controller.start();
  return result;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  activeControllers.splice(0).forEach((controller) => controller.dispose());
  vi.useRealTimers();
});

describe('Preview-controller fra den uændrede ejede basis', () => {
  it('henter kun metadata ved åbning og kalder aldrig model eller preview af sig selv', async () => {
    const { controller, transport } = await started();
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.describe).toHaveBeenCalledOnce();
    expect(transport.preview).not.toHaveBeenCalled();
    expect(transport.explain).not.toHaveBeenCalled();
    expect(controller.getSnapshot().analysis).toBe(basis);
  });
  it('debouncer beregning200ms og forklaring1000ms, med aktuelle providermetadata', async () => {
    const { controller, transport } = await started();
    controller.change('scenario.energyPercent', 15.5);
    await vi.advanceTimersByTimeAsync(199);
    expect(transport.preview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.preview).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().analysis.context.metric).toBe('net');
    expect(controller.getSnapshot().explanation.formulation?.provider).toBe('corti');
    await vi.advanceTimersByTimeAsync(799);
    expect(transport.explain).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.explain).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().explanation).toMatchObject({
      phase: 'complete',
      text: 'Ny forklaring [1]',
      formulation: { provider: 'corti' },
    });
    expect(basis.formulation?.provider).toBe('demo');
  });
  it('samler hurtige sliderændringer til én beregning med seneste værdier', async () => {
    const { controller, transport } = await started();
    for (const value of [10, 20, 30]) {
      controller.change('scenario.energyPercent', value);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(149);
    expect(transport.preview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.preview).toHaveBeenCalledOnce();
    expect(vi.mocked(transport.preview).mock.calls[0][1]['scenario.energyPercent']).toBe(30);
  });
  it('afviser et sent A-resultat efter A→B→A selv med samme valueskey', async () => {
    const { controller, transport } = await started(),
      old = deferred<AdjustmentEnvelope>();
    vi.mocked(transport.preview).mockImplementationOnce(() => old.promise);
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(200);
    const oldSignal = vi.mocked(transport.preview).mock.calls[0][2];
    controller.change('scenario.energyPercent', 20);
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(200);
    expect(oldSignal.aborted).toBe(true);
    expect(controller.getSnapshot().analysis.title).toBe('Nyt scenarie');
    old.resolve(envelope({ ...editor.values, 'scenario.energyPercent': 10 }, 'FORÆLDET A'));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().analysis.title).toBe('Nyt scenarie');
  });
  it.each(['version', 'owner', 'fingerprint', 'scope', 'period', 'values'] as const)(
    'viser ikke et preview med forkert %s',
    async (wrong) => {
      const { controller, transport } = await started();
      vi.mocked(transport.preview).mockImplementationOnce(async (_id, values) => {
        const result = structuredClone(envelope(values));
        if (wrong === 'version') result.analysis.datasetVersion = 'OTHER';
        if (wrong === 'owner') result.baseAnalysisId = 'other-owner-analysis';
        if (wrong === 'fingerprint') result.editor.basisFingerprint = 'OTHER';
        if (wrong === 'scope') result.analysis.context.entityIds = ['not-permitted'];
        if (wrong === 'period') result.analysis.context.period.year = 2025;
        if (wrong === 'values') result.editor.values['scenario.energyPercent'] = 99;
        return result;
      });
      controller.change('scenario.energyPercent', 10);
      await vi.advanceTimersByTimeAsync(1200);
      expect(controller.getSnapshot().phase).toBe('error');
      expect(controller.getSnapshot().analysis).toBe(basis);
      expect(transport.explain).not.toHaveBeenCalled();
    },
  );
  it('skjuler gammel forklaring straks og dispatchercancel før streamabort', async () => {
    const { controller, transport } = await started();
    let callback!: (event: AdjustmentEvent) => void;
    let attempt!: AnalysisAttempt;
    vi.mocked(transport.explain).mockImplementationOnce(async (_id, values, current, event) => {
      attempt = current;
      callback = event;
      const result = envelope(values);
      event({ type: 'analysis', ...result });
      event({
        type: 'text',
        text: 'GAMMEL TEKST',
        previewKey: result.previewKey,
        baseAnalysisId: basis.analysisId,
        ephemeral: true,
      });
      await new Promise<void>(() => {});
    });
    vi.mocked(transport.cancel).mockImplementationOnce(async (old) => {
      expect(old.controller.signal.aborted).toBe(false);
      return { status: 'cancelled' };
    });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getSnapshot().explanation.text).toBe('GAMMEL TEKST');
    controller.change('scenario.energyPercent', 20);
    expect(controller.getSnapshot().explanation.text).toBe('');
    expect(transport.cancel).toHaveBeenCalledOnce();
    expect(attempt.controller.signal.aborted).toBe(true);
    callback({
      type: 'text',
      text: 'SENT GAMMELT SVAR',
      previewKey: 'preview:10:remaining',
      baseAnalysisId: basis.analysisId,
      ephemeral: true,
    });
    expect(controller.getSnapshot().explanation.text).toBe('');
  });
  it('nulstiller straks til samme oprindelige analyse og afbryder alt uden ekstra modelkald', async () => {
    const { controller, transport } = await started();
    vi.mocked(transport.explain).mockImplementationOnce(async (_id, values, _attempt, event) => {
      event({ type: 'analysis', ...envelope(values) });
      await new Promise<void>(() => {});
    });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    controller.reset();
    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'idle',
      changed: false,
      values: editor.values,
      explanation: { phase: 'idle', text: '' },
    });
    expect(controller.getSnapshot().analysis).toBe(basis);
    expect(transport.explain).toHaveBeenCalledOnce();
    expect(transport.preview).toHaveBeenCalledOnce();
    expect(transport.cancel).toHaveBeenCalledOnce();
  });
  it('venter på eksplicit cancelack før en ny forklaring, mens beregningen gerne må fortsætte', async () => {
    const { controller, transport } = await started(),
      cancellation = deferred<CancelConfirmation>();
    vi.mocked(transport.explain).mockImplementationOnce(async () => {
      await new Promise<void>(() => {});
    });
    vi.mocked(transport.cancel).mockReturnValueOnce(cancellation.promise);
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    controller.change('scenario.energyPercent', 20);
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.preview).toHaveBeenCalledTimes(2);
    expect(transport.explain).toHaveBeenCalledOnce();
    cancellation.resolve({ status: 'completed' });
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.explain).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().explanation.text).not.toContain('gemt');
  });
  it('starter ikke en ny automatisk forklaring efter ubekræftet cancel', async () => {
    const { controller, transport } = await started();
    vi.mocked(transport.explain).mockImplementationOnce(async () => {
      await new Promise<void>(() => {});
    });
    vi.mocked(transport.cancel).mockResolvedValueOnce({ status: 'unconfirmed' });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    controller.change('scenario.energyPercent', 20);
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.explain).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().explanation.phase).toBe('error');
  });
  it('annullerer også et midstream transportbrud og lader retry afvente serverack uden dobbeltstart', async () => {
    const { controller, transport } = await started(),
      cancellation = deferred<CancelConfirmation>();
    let interrupted!: AnalysisAttempt;
    vi.mocked(transport.cancel).mockReturnValueOnce(cancellation.promise);
    vi.mocked(transport.explain).mockImplementationOnce(async (_id, values, attempt, event) => {
      interrupted = attempt;
      const result = envelope(values);
      event({ type: 'analysis', ...result });
      event({
        type: 'text',
        text: 'Ufuldstændigt svar',
        previewKey: result.previewKey,
        baseAnalysisId: basis.analysisId,
        ephemeral: true,
      });
      throw new Error('Transport afbrudt, mens serveren fortsætter.');
    });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.cancel).toHaveBeenCalledExactlyOnceWith(interrupted);
    expect(interrupted.controller.signal.aborted).toBe(true);
    expect(controller.getSnapshot().explanation).toMatchObject({ phase: 'error', text: '' });
    controller.retryExplanation();
    controller.retryExplanation();
    await Promise.resolve();
    expect(transport.explain).toHaveBeenCalledOnce();
    cancellation.resolve({ status: 'cancelled' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.explain).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().explanation.phase).toBe('complete');
  });
  it('gentager kun LIVE_BUSY maksimalt to gange efter bekræftet cancel, med nye requestIds', async () => {
    const { controller, transport } = await started();
    vi.mocked(transport.explain).mockImplementationOnce(async () => {
      await new Promise<void>(() => {});
    });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    vi.mocked(transport.explain).mockRejectedValue(
      new AdjustmentRequestError('Optaget', 429, 'LIVE_BUSY'),
    );
    controller.change('scenario.energyPercent', 20);
    await vi.advanceTimersByTimeAsync(2000);
    expect(transport.explain).toHaveBeenCalledTimes(4);
    const ids = vi.mocked(transport.explain).mock.calls.map((call) => call[2].requestId);
    expect(new Set(ids).size).toBe(4);
    expect(controller.getSnapshot().explanation.phase).toBe('error');
  });
  it.each([undefined, 'DAILY_LIMIT'] as const)(
    'gentager aldrig en almindelig429 medkode %s',
    async (code) => {
      const { controller, transport } = await started();
      vi.mocked(transport.explain).mockRejectedValue(
        new AdjustmentRequestError('Dagens kvote er brugt', 429, code),
      );
      controller.change('scenario.energyPercent', 10);
      await vi.advanceTimersByTimeAsync(5000);
      expect(transport.explain).toHaveBeenCalledOnce();
    },
  );
  it('lukning af panelet aborter preview og ignorerer sene svar', async () => {
    const { controller, transport } = await started(),
      pending = deferred<AdjustmentEnvelope>();
    vi.mocked(transport.preview).mockReturnValueOnce(pending.promise);
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(200);
    controller.dispose();
    expect(vi.mocked(transport.preview).mock.calls[0][2].aborted).toBe(true);
    pending.resolve(envelope({ ...editor.values, 'scenario.energyPercent': 10 }));
    await Promise.resolve();
    expect(controller.getSnapshot().analysis).toBe(basis);
  });
  it('afviser tekst fra et andet previewKey frem for at sætte den på nye tal', async () => {
    const { controller, transport } = await started();
    vi.mocked(transport.explain).mockImplementationOnce(async (_id, values, _attempt, event) => {
      event({ type: 'analysis', ...envelope(values) });
      event({
        type: 'text',
        text: 'Forkert tekst',
        previewKey: 'OTHER',
        baseAnalysisId: basis.analysisId,
        ephemeral: true,
      });
    });
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getSnapshot().explanation).toMatchObject({ phase: 'error', text: '' });
  });
});

describe('Editorens kompakte præsentation og rå enheder', () => {
  const props = {
    onChange: vi.fn(),
    onReset: vi.fn(),
    onRetryPreview: vi.fn(),
    onRetryExplanation: vi.fn(),
    onSource: vi.fn(),
  };
  it('viser scenarie, helårsbaseline og aktuelle providermetadata ved samme figur uden duplikat', async () => {
    const { controller } = await started();
    controller.change('scenario.energyPercent', 15);
    await vi.advanceTimersByTimeAsync(1000);
    const html = renderToStaticMarkup(
      createElement(AnalysisBasisEditorView, { ...props, state: controller.getSnapshot() }),
    );
    expect(html).toContain('Forhåndsvisning – det gemte svar bevares');
    expect(html).toContain('Scenarie · helårsbaseline og virkning');
    expect(html).toContain('Scenariet omfatter hele 2026');
    expect(html).toContain('scenarie i kroner');
    expect(html).toContain('Corti Models');
    expect(html.match(/data-chart-fixture/g)).toHaveLength(1);
    expect(html).not.toContain('Simulerede data');
    expect(html).toContain('Åbn kilde 1');
    expect(html).not.toContain('Udgift pr. elev</span>');
  });
  it('viser ingen kunstige sliders for kvalitative procesforløb', async () => {
    const { controller, transport } = await started();
    vi.mocked(transport.describe).mockResolvedValueOnce({
      editor: { ...editor, kind: 'process', fields: [], values: {} },
    });
    await controller.describe();
    const html = renderToStaticMarkup(
      createElement(AnalysisBasisEditorView, { ...props, state: controller.getSnapshot() }),
    );
    expect(html).toContain('ingen numeriske forudsætninger');
    expect(html).not.toContain('type="range"');
  });
  it('viser ærlig seneste-beregningstatus uden gammel modeltekst mens nye værdier venter', async () => {
    const { controller } = await started();
    controller.change('scenario.energyPercent', 10);
    await vi.advanceTimersByTimeAsync(1000);
    controller.change('scenario.energyPercent', 20);
    const html = renderToStaticMarkup(
      createElement(AnalysisBasisEditorView, { ...props, state: controller.getSnapshot() }),
    );
    expect(html).toContain('endnu ikke bekræftet');
    expect(html).not.toContain('Ny forklaring');
  });
  it('bevarer præcise decimalprocenter og giver en praktisk minuttidsrange med hårde grænser i talfeltet', () => {
    expect(formatEditorValue(editor.fields[0], 15.5)).toBe('15,5');
    const field = {
      ...editor.fields[0],
      id: 'illustration.terms.0.quantityFactors.0.valueMilli',
      value: 15000,
      scale: 1000,
      displayUnit: 'min.',
      min: 0,
      max: 1_000_000_000,
      step: 1,
    };
    expect(editorRange(field, 15000)).toEqual({ min: 0, max: 30000 });
    const html = renderToStaticMarkup(
      createElement(BasisEditorField, { field, value: 15000, onChange: () => {} }),
    );
    expect(html).toContain('aria-valuetext="15 min."');
    expect(html).toContain('max="1000000"');
    expect(html).toContain('max="30000"');
  });
});
