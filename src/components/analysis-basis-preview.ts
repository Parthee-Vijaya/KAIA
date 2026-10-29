import type { Analysis, ProviderId } from '@/domain/types';
import type {
  AnalysisEditor,
  AnalysisEditorResult,
  AnalysisEditorValues,
} from '@/domain/analysis-editor';
import {
  createAnalysisAttempt,
  cancelAnalysisAttempt,
  type AnalysisAttempt,
  type CancelConfirmation,
} from './analysis-request';

export interface AdjustmentEnvelope extends AnalysisEditorResult {
  baseAnalysisId?: string;
  ephemeral?: boolean;
  formulation?: { provider: ProviderId; model: string };
}
interface AdjustmentIdentity {
  previewKey?: string;
  baseAnalysisId?: string;
  ephemeral?: boolean;
  formulation?: AdjustmentEnvelope['formulation'];
}
export type AdjustmentEvent = (
  | ({ type: 'analysis' } & AdjustmentEnvelope)
  | { type: 'text'; text: string }
  | { type: 'status'; text: string }
  | {
      type: 'done';
      previewKey: string;
      ephemeral?: boolean;
      formulation?: AdjustmentEnvelope['formulation'];
    }
  | { type: 'error'; error: string; code?: string }
) &
  AdjustmentIdentity;
export class AdjustmentRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export interface BasisPreviewTransport {
  describe(analysisId: string, signal: AbortSignal): Promise<{ editor: AnalysisEditor }>;
  preview(
    analysisId: string,
    values: AnalysisEditorValues,
    signal: AbortSignal,
  ): Promise<AdjustmentEnvelope>;
  explain(
    analysisId: string,
    values: AnalysisEditorValues,
    attempt: AnalysisAttempt,
    onEvent: (event: AdjustmentEvent) => void,
  ): Promise<void>;
  cancel(attempt: AnalysisAttempt): Promise<CancelConfirmation>;
}
async function requestAdjustment(body: unknown, signal: AbortSignal) {
  const response = await fetch('/api/analysis-adjustments', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new AdjustmentRequestError(
      error.error || 'Forhåndsvisningen kunne ikke opdateres. Prøv igen.',
      response.status,
      error.code,
    );
  }
  return response;
}
export const basisPreviewTransport: BasisPreviewTransport = {
  async describe(analysisId, signal) {
    return (await requestAdjustment({ analysisId, values: {}, mode: 'describe' }, signal)).json();
  },
  async preview(analysisId, values, signal) {
    return (await requestAdjustment({ analysisId, values, mode: 'preview' }, signal)).json();
  },
  async explain(analysisId, values, attempt, onEvent) {
    const response = await requestAdjustment(
      { analysisId, values, mode: 'explain', requestId: attempt.requestId },
      attempt.controller.signal,
    );
    if (!response.body) throw new AdjustmentRequestError('Forklaringen returnerede ingen stream.');
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = '',
      done = false;
    const readEvent = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as AdjustmentEvent;
      if (event.type === 'error')
        throw new AdjustmentRequestError(event.error, undefined, event.code);
      onEvent(event);
      if (event.type === 'done') done = true;
    };
    try {
      while (!done) {
        attempt.controller.signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > 1_000_000)
          throw new AdjustmentRequestError('Forklaringens stream var for stor.');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) readEvent(line);
      }
      if (buffer.trim()) readEvent(buffer);
      attempt.controller.signal.throwIfAborted();
      if (!done) throw new AdjustmentRequestError('Forklaringen blev afbrudt. Prøv igen.');
    } finally {
      await reader.cancel().catch(() => {});
    }
  },
  cancel: cancelAnalysisAttempt,
};

export interface BasisPreviewState {
  phase: 'loading' | 'idle' | 'debouncing' | 'calculating' | 'ready' | 'error';
  editor?: AnalysisEditor;
  values: AnalysisEditorValues;
  analysis: Analysis;
  changed: boolean;
  previewKey?: string;
  error?: string;
  explanation: {
    phase: 'idle' | 'waiting' | 'streaming' | 'complete' | 'error';
    text: string;
    formulation?: AdjustmentEnvelope['formulation'];
    error?: string;
  };
}
const valueKey = (values: AnalysisEditorValues) =>
  JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
const emptyExplanation = (): BasisPreviewState['explanation'] => ({ phase: 'idle', text: '' });
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Forhåndsvisningen kunne ikke opdateres. Prøv igen.';
}

/** All calculations stay on the server. This controller only schedules/identifies ephemeral results. */
export class BasisPreviewController {
  private state: BasisPreviewState;
  private listeners = new Set<() => void>();
  private active = false;
  private sequence = 0;
  private previewAbort?: AbortController;
  private attempt?: AnalysisAttempt;
  private cancellation?: Promise<CancelConfirmation>;
  private previewTimer?: ReturnType<typeof setTimeout>;
  private explainTimer?: ReturnType<typeof setTimeout>;
  private retryWake?: () => void;
  private changedAt = 0;
  private explanationRun?: object;
  constructor(
    readonly basis: Analysis,
    private transport: BasisPreviewTransport = basisPreviewTransport,
  ) {
    this.state = {
      phase: 'loading',
      values: {},
      analysis: basis,
      changed: false,
      explanation: emptyExplanation(),
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<BasisPreviewState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  private clearTimers() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    if (this.explainTimer) clearTimeout(this.explainTimer);
    this.retryWake?.();
    this.retryWake = undefined;
  }
  private stopExplanation() {
    if (!this.attempt) return;
    const previous = this.attempt;
    this.attempt = undefined;
    // Explicit cancellation is dispatched separately before aborting the streamed transport.
    this.cancellation = this.transport
      .cancel(previous)
      .catch(() => ({ status: 'unconfirmed' as const }));
    previous.controller.abort();
  }
  private invalidate() {
    ++this.sequence;
    this.explanationRun = undefined;
    this.clearTimers();
    this.previewAbort?.abort();
    this.stopExplanation();
  }
  private current(sequence: number, key: string) {
    return this.active && this.sequence === sequence && valueKey(this.state.values) === key;
  }
  async start() {
    if (this.active) return;
    this.active = true;
    await this.describe();
  }
  async describe() {
    this.invalidate();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.previewAbort = controller;
    this.publish({ phase: 'loading', error: undefined });
    try {
      const { editor } = await this.transport.describe(this.basis.analysisId, controller.signal);
      if (!this.active || controller.signal.aborted || sequence !== this.sequence) return;
      if (
        editor.basisAnalysisId !== this.basis.analysisId ||
        editor.datasetVersion !== this.basis.datasetVersion
      )
        throw new AdjustmentRequestError(
          'Forudsætningerne tilhører et andet svar eller en anden dataversion.',
        );
      this.publish({
        editor,
        values: { ...editor.values },
        phase: 'idle',
        changed: false,
        analysis: this.basis,
        explanation: emptyExplanation(),
      });
    } catch (error) {
      if (this.active && !controller.signal.aborted && sequence === this.sequence)
        this.publish({ phase: 'error', error: message(error) });
    }
  }
  change(id: string, value: AnalysisEditorValues[string]) {
    const editor = this.state.editor,
      field = editor?.fields.find((item) => item.id === id);
    if (!editor || !field) return;
    if (
      field.kind === 'choice'
        ? !field.options?.some((option) => option.value === value && !option.disabled)
        : typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (!field.id.startsWith('scenario.') && !Number.isSafeInteger(value)) ||
          (field.min !== undefined && value < field.min) ||
          (field.max !== undefined && value > field.max)
    )
      return;
    if (this.state.values[id] === value) return;
    this.invalidate();
    const values = { ...this.state.values, [id]: value };
    const changed = valueKey(values) !== valueKey(editor.values);
    this.changedAt = Date.now();
    this.publish({
      values,
      changed,
      phase: changed ? 'debouncing' : 'idle',
      error: undefined,
      ...(changed ? {} : { analysis: this.basis, previewKey: undefined }),
      explanation: emptyExplanation(),
    });
    if (!changed) return;
    const sequence = this.sequence,
      key = valueKey(values);
    this.previewTimer = setTimeout(() => {
      void this.calculate(sequence, key, values);
    }, 200);
  }
  reset() {
    this.invalidate();
    this.publish({
      values: { ...this.state.editor?.values },
      analysis: this.basis,
      changed: false,
      phase: 'idle',
      previewKey: undefined,
      error: undefined,
      explanation: emptyExplanation(),
    });
  }
  retryPreview() {
    if (!this.state.editor) {
      void this.describe();
      return;
    }
    if (!this.state.changed) return;
    this.invalidate();
    void this.calculate(this.sequence, valueKey(this.state.values), { ...this.state.values });
  }
  retryExplanation() {
    if (!this.state.changed || !this.state.previewKey || this.state.phase !== 'ready') return;
    if (this.explainTimer) clearTimeout(this.explainTimer);
    this.stopExplanation();
    void this.explain(
      this.sequence,
      valueKey(this.state.values),
      { ...this.state.values },
      this.state.previewKey,
    );
  }
  private validateEnvelope(result: AdjustmentEnvelope) {
    const expected = this.basis.context,
      actual = result.analysis?.context;
    if (
      !result.previewKey ||
      result.editor?.basisAnalysisId !== this.basis.analysisId ||
      result.editor.datasetVersion !== this.basis.datasetVersion ||
      result.editor.basisFingerprint !== this.state.editor?.basisFingerprint ||
      valueKey(result.editor.values) !== valueKey(this.state.values) ||
      result.analysis.datasetVersion !== this.basis.datasetVersion ||
      actual?.area !== expected.area ||
      JSON.stringify([...(actual?.entityIds || [])].sort()) !==
        JSON.stringify([...expected.entityIds].sort()) ||
      actual?.period.year !== expected.period.year ||
      actual.period.fromMonth !== expected.period.fromMonth ||
      actual.period.toMonth !== expected.period.toMonth ||
      (result.baseAnalysisId !== undefined && result.baseAnalysisId !== this.basis.analysisId)
    )
      throw new AdjustmentRequestError(
        'Forhåndsvisningen matcher ikke det valgte svar og datagrundlag.',
      );
  }
  private async calculate(sequence: number, key: string, values: AnalysisEditorValues) {
    if (!this.current(sequence, key)) return;
    const controller = new AbortController();
    this.previewAbort = controller;
    this.publish({ phase: 'calculating', error: undefined });
    try {
      const result = await this.transport.preview(this.basis.analysisId, values, controller.signal);
      if (controller.signal.aborted || !this.current(sequence, key)) return;
      this.validateEnvelope(result);
      this.publish({
        phase: 'ready',
        analysis: result.analysis,
        previewKey: result.previewKey,
        explanation: { phase: 'waiting', text: '', formulation: result.formulation },
      });
      this.explainTimer = setTimeout(
        () => {
          void this.explain(sequence, key, values, result.previewKey);
        },
        Math.max(0, 1000 - (Date.now() - this.changedAt)),
      );
    } catch (error) {
      if (!controller.signal.aborted && this.current(sequence, key))
        this.publish({ phase: 'error', error: message(error), explanation: emptyExplanation() });
    }
  }
  private async explain(
    sequence: number,
    key: string,
    values: AnalysisEditorValues,
    previewKey: string,
  ) {
    if (!this.current(sequence, key) || this.explanationRun) return;
    const run = {};
    this.explanationRun = run;
    try {
      await this.explainCurrent(sequence, key, values, previewKey);
    } finally {
      if (this.explanationRun === run) this.explanationRun = undefined;
    }
  }
  private async explainCurrent(
    sequence: number,
    key: string,
    values: AnalysisEditorValues,
    previewKey: string,
  ) {
    if (!this.current(sequence, key)) return;
    this.publish({
      explanation: { ...this.state.explanation, phase: 'waiting', text: '', error: undefined },
    });
    let confirmedCancellation = false;
    if (this.cancellation) {
      const pending = this.cancellation;
      const confirmation = await pending;
      if (!this.current(sequence, key)) return;
      if (this.cancellation === pending) this.cancellation = undefined;
      if (confirmation.status === 'unconfirmed') {
        this.publish({
          explanation: {
            phase: 'error',
            text: '',
            error:
              'Den forrige forklaring kunne ikke bekræftes stoppet. Tallene er opdateret; prøv forklaringen igen.',
          },
        });
        return;
      }
      confirmedCancellation = true;
    }
    for (let retry = 0; retry <= 2; retry++) {
      if (!this.current(sequence, key)) return;
      const attempt = createAnalysisAttempt();
      this.attempt = attempt;
      let accepted = false,
        completed = false,
        text = '';
      this.publish({
        explanation: {
          phase: 'waiting',
          text: '',
          formulation: this.state.explanation.formulation,
        },
      });
      try {
        await this.transport.explain(this.basis.analysisId, values, attempt, (event) => {
          if (
            attempt.controller.signal.aborted ||
            this.attempt !== attempt ||
            !this.current(sequence, key)
          )
            return;
          if (
            ['analysis', 'text', 'done'].includes(event.type) &&
            (event.previewKey !== previewKey ||
              event.baseAnalysisId !== this.basis.analysisId ||
              event.ephemeral !== true)
          )
            throw new AdjustmentRequestError('Forklaringen bruger et andet beregningsgrundlag.');
          if (event.type === 'analysis') {
            this.validateEnvelope(event);
            if (event.previewKey !== previewKey || event.ephemeral !== true)
              throw new AdjustmentRequestError('Forklaringen bruger et andet beregningsgrundlag.');
            accepted = true;
            this.publish({
              analysis: event.analysis,
              explanation: { phase: 'streaming', text: '', formulation: event.formulation },
            });
          } else if (event.type === 'text') {
            if (!accepted)
              throw new AdjustmentRequestError('Forklaringen mangler sit beregningsgrundlag.');
            text += event.text;
            if (text.length > 24000)
              throw new AdjustmentRequestError('Forklaringen overskrider længdegrænsen.');
            this.publish({ explanation: { ...this.state.explanation, phase: 'streaming', text } });
          } else if (event.type === 'done') {
            if (!accepted || event.previewKey !== previewKey || event.ephemeral !== true)
              throw new AdjustmentRequestError(
                'Forklaringen kunne ikke afsluttes på det aktuelle grundlag.',
              );
            if (!text.trim())
              throw new AdjustmentRequestError('Forklaringen indeholdt ingen tekst. Prøv igen.');
            completed = true;
            this.publish({
              explanation: {
                phase: 'complete',
                text,
                formulation: event.formulation || this.state.explanation.formulation,
              },
            });
          }
        });
        if (!this.current(sequence, key) || attempt.controller.signal.aborted) return;
        if (!completed) throw new AdjustmentRequestError('Forklaringen blev afbrudt. Prøv igen.');
        return;
      } catch (error) {
        if (attempt.controller.signal.aborted || !this.current(sequence, key)) return;
        const busy =
          error instanceof AdjustmentRequestError &&
          error.status === 429 &&
          error.code === 'LIVE_BUSY';
        if (busy && confirmedCancellation && retry < 2) {
          await new Promise<void>((resolve) => {
            this.retryWake = resolve;
            this.explainTimer = setTimeout(
              () => {
                this.retryWake = undefined;
                resolve();
              },
              300 * (retry + 1),
            );
          });
          continue;
        }
        this.publish({ explanation: { phase: 'error', text: '', error: message(error) } });
        return;
      } finally {
        if (this.attempt === attempt) {
          if (!completed) {
            this.cancellation = this.transport
              .cancel(attempt)
              .catch(() => ({ status: 'unconfirmed' as const }));
            attempt.controller.abort();
          }
          this.attempt = undefined;
        }
      }
    }
  }
  dispose() {
    this.invalidate();
    this.active = false;
  }
}
