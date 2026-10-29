export const TRACE_LABELS = [
  'Opgave',
  'Værktøjer',
  'Adgang',
  'Beregning',
  'Svar',
  'Handling',
] as const;
export type TraceState = 'pending' | 'running' | 'completed' | 'available' | 'blocked' | 'error';
export interface TraceStep {
  index: number;
  label: string;
  state: TraceState;
  startedAt?: string;
  finishedAt?: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
  sourceIds?: string[];
}
export interface AnalysisTrace {
  version: 1;
  runId: string;
  startedAt: string;
  steps: TraceStep[];
}
/** Request-local recording only. No timers, fabricated progress or model reasoning. */
export function createTrace(runId: string) {
  const trace: AnalysisTrace = {
    version: 1,
    runId,
    startedAt: new Date().toISOString(),
    steps: TRACE_LABELS.map((label, index) => ({
      index,
      label,
      state: 'pending',
      summary: 'Afventer',
      details: [],
    })),
  };
  const update = (
    index: number,
    state: TraceState,
    summary: string,
    details: TraceStep['details'] = [],
    sourceIds?: string[],
  ) => {
    const step = trace.steps[index];
    if (!step) throw new Error('Unknown trace step');
    if (state === 'running') step.startedAt = new Date().toISOString();
    if (['completed', 'error', 'blocked'].includes(state))
      step.finishedAt = new Date().toISOString();
    Object.assign(step, { state, summary, details, ...(sourceIds ? { sourceIds } : {}) });
    return structuredClone(trace);
  };
  return { trace, update, snapshot: () => structuredClone(trace) };
}
