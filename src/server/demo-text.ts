import type { Analysis } from '@/domain/types';

const WORDS_PER_CHUNK = 5;
const INTERVAL_MS = 25;
const MAX_DELIVERY_MS = 1500;
type DemoTextBasis = Pick<Analysis, 'conclusion' | 'narrative'>;

/** Already calculated demo prose, not generated model output or a separate saved formulation. */
export function demoAnalysisText(analysis: DemoTextBasis): string {
  return [analysis.conclusion, ...analysis.narrative].filter((text) => text.trim()).join('\n\n');
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('Tekstleveringen blev stoppet.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Deliver existing prose in readable groups; pacing is bounded and immediately abortable. */
export async function* streamDemoAnalysis(
  analysis: DemoTextBasis,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  signal?.throwIfAborted();
  // Keep Danish amounts, punctuation, paragraph breaks and whitespace exactly as calculated.
  const words = demoAnalysisText(analysis).match(/\S+\s*|\s+/gu) || [];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += WORDS_PER_CHUNK)
    chunks.push(words.slice(index, index + WORDS_PER_CHUNK).join(''));
  const interval = Math.min(INTERVAL_MS, MAX_DELIVERY_MS / Math.max(1, chunks.length - 1));
  const deadline = Date.now() + MAX_DELIVERY_MS;
  for (let index = 0; index < chunks.length; index++) {
    signal?.throwIfAborted();
    if (index > 0) {
      const delay = Math.min(interval, deadline - Date.now());
      if (delay > 0) await pause(delay, signal);
    }
    signal?.throwIfAborted();
    yield chunks[index];
  }
}
