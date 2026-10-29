export interface AnalysisAttempt {
  requestId: string;
  controller: AbortController;
  cancellation?: Promise<CancelConfirmation>;
}
export interface CancelConfirmation {
  status: 'cancelled' | 'completed' | 'unconfirmed';
}

/** Transport identity is fresh even when the same analysis context is retried. */
export function createAnalysisAttempt(): AnalysisAttempt {
  return { requestId: crypto.randomUUID(), controller: new AbortController() };
}

/** A separate request survives cancellation of the answer stream and page navigation. */
export function cancelAnalysisAttempt(attempt: AnalysisAttempt): Promise<CancelConfirmation> {
  if (!attempt.cancellation)
    attempt.cancellation = (async () => {
      try {
        const response = await fetch('/api/analyze/cancel', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: attempt.requestId }),
          keepalive: true,
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return { status: 'unconfirmed' };
        const result = (await response.json()) as { status?: string };
        return result.status === 'cancelled' || result.status === 'completed'
          ? { status: result.status }
          : { status: 'unconfirmed' };
      } catch {
        return { status: 'unconfirmed' };
      }
    })();
  return attempt.cancellation;
}
