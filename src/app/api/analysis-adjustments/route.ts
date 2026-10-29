import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { ApiError, errorResponse, privateJson } from '@/server/errors';
import { readJson } from '@/server/validation';
import {
  ownedAnalysis,
  loadDatasetShell,
  loadDataset,
  consumePreviewBudget,
  consumeAnalysisBudget,
} from '@/server/repository';
import { describeAnalysisEditor, recalculateAnalysisEditor } from '@/domain/analysis-editor';
import {
  analysisRequestIdSchema,
  beginExplanationRequest,
  completeExplanationRequest,
  cancelAnalysisRequest,
  watchAnalysisRequest,
} from '@/server/analysis-requests';
import { selectedProviderFor, acquireLiveAnalysis } from '@/server/live-access';
import { streamText } from '@/server/providers';
import { streamDemoAnalysis } from '@/server/demo-text';
import { ADJUSTMENT_SYSTEM_PROMPT, prepareAdjustmentEvidence } from '@/server/adjustment-evidence';

export const runtime = 'nodejs';
export const maxDuration = 120;
const schema = z
  .object({
    analysisId: z.string().uuid(),
    values: z
      .record(
        z.string().min(1).max(160),
        z.union([z.number().finite(), z.enum(['annual', 'remaining'])]),
      )
      .refine((values) => Object.keys(values).length <= 100),
    mode: z.enum(['describe', 'preview', 'explain']),
    requestId: analysisRequestIdSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.mode === 'explain' && !input.requestId)
      ctx.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'Forklaringen kræver et anmodnings-ID.',
      });
    if (input.mode === 'describe' && Object.keys(input.values).length)
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'Beskrivelsen accepterer ingen justeringer.',
      });
  });

export async function POST(request: Request) {
  let cleanup: (() => Promise<void>) | undefined;
  let failJob: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const input = await readJson(request, schema);
    const basis = await ownedAnalysis(user, input.analysisId);
    const shell = await loadDatasetShell(user, basis.datasetVersion);
    await consumePreviewBudget(user);
    request.signal.throwIfAborted();
    const editor = describeAnalysisEditor(basis, shell);
    if (input.mode === 'describe') return privateJson({ editor });
    if (!editor.fields.length)
      throw new ApiError(422, 'Dette beregningsgrundlag har ingen justerbare tal.');
    if (input.mode === 'explain') await consumeAnalysisBudget(user);
    const abort = new AbortController();
    let cancelled = false;
    let completed = false;
    const id = input.mode === 'explain' ? input.requestId! : undefined;
    if (id) await beginExplanationRequest(user, id);
    failJob = async () => {
      if (id && !completed) await cancelAnalysisRequest(user, id).catch(() => {});
    };
    const onAbort = () => {
      abort.abort();
      void failJob?.();
    };
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener('abort', onAbort, { once: true });
    const stopWatching = id ? watchAnalysisRequest(user, id, abort) : undefined;
    const deadline = id
      ? setTimeout(() => {
          abort.abort(new ApiError(504, 'Forklaringen tog for lang tid. Prøv igen.'));
          void failJob?.();
        }, 120_000)
      : undefined;
    deadline?.unref?.();
    let releaseLive: () => Promise<void> = async () => {};
    let cleaned = false;
    cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      if (deadline) clearTimeout(deadline);
      stopWatching?.();
      request.signal.removeEventListener('abort', onAbort);
      await releaseLive().catch(() => {});
    };
    abort.signal.throwIfAborted();
    const dataset =
      editor.kind === 'scenario'
        ? await loadDataset(user, { ...basis.context, intent: 'scenario' }, basis.datasetVersion)
        : shell;
    abort.signal.throwIfAborted();
    const result = recalculateAnalysisEditor(basis, user, dataset, input.values);
    const selected = await selectedProviderFor(user);
    abort.signal.throwIfAborted();
    const formulation = { provider: selected.id, model: selected.model };
    const identity = {
      previewKey: result.previewKey,
      baseAnalysisId: basis.analysisId,
      ephemeral: true,
      formulation,
    };
    const prepared = prepareAdjustmentEvidence(basis, result.analysis);
    const response = { ...result, analysis: prepared.analysis, ...identity };
    if (input.mode === 'preview') {
      await cleanup();
      return privateJson(response);
    }
    if (selected.id !== 'demo' && !selected.tested)
      throw new ApiError(503, 'AI-forbindelsen skal testes, før forklaringen kan anvendes.');
    releaseLive = await acquireLiveAnalysis(user, selected);
    abort.signal.throwIfAborted();
    const provider =
      selected.id === 'demo'
        ? selected
        : { ...selected, maxTokens: Math.min(selected.maxTokens || 1200, 1200) };
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>, afterDeadline = false) => {
          if (!cancelled && (!abort.signal.aborted || afterDeadline))
            controller.enqueue(encoder.encode(JSON.stringify({ ...event, ...identity }) + '\n'));
        };
        try {
          abort.signal.throwIfAborted();
          emit({ type: 'status', text: 'Forhåndsvisningen er beregnet' });
          emit({ type: 'analysis', ...response });
          emit({
            type: 'status',
            text:
              provider.id === 'demo'
                ? 'Forklarer det beregnede demoresultat'
                : 'Forklarer ændringen med ' + provider.id + ' · ' + provider.model,
          });
          let text = '';
          const output =
            provider.id === 'demo'
              ? streamDemoAnalysis(result.analysis, abort.signal)
              : streamText(
                  provider,
                  [
                    { role: 'system', content: ADJUSTMENT_SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify(prepared.evidence) },
                  ],
                  abort.signal,
                );
          for await (const chunk of output) {
            abort.signal.throwIfAborted();
            text += chunk;
            emit({ type: 'text', text: chunk });
          }
          if (!text.trim())
            throw new ApiError(502, 'Forbindelsen leverede ingen forklaring. Prøv igen.');
          abort.signal.throwIfAborted();
          await completeExplanationRequest(user, id!);
          completed = true;
          emit({ type: 'done' });
        } catch (error) {
          await failJob?.();
          const timedOut =
            abort.signal.reason instanceof ApiError && abort.signal.reason.status === 504;
          const failure = timedOut ? abort.signal.reason : error;
          if (!cancelled && (!abort.signal.aborted || timedOut))
            emit(
              {
                type: 'error',
                error:
                  failure instanceof ApiError
                    ? failure.message
                    : 'Forklaringen kunne ikke gennemføres. Prøv igen.',
              },
              timedOut,
            );
        } finally {
          await cleanup?.();
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        onAbort();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'private, no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    await failJob?.();
    await cleanup?.();
    if (
      error instanceof ApiError &&
      error.status === 429 &&
      error.message.startsWith('Der kører allerede et live-svar.')
    )
      return Response.json(
        { error: error.message, code: 'LIVE_BUSY' },
        {
          status: 429,
          headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '1' },
        },
      );
    if (error instanceof Error && error.name === 'AbortError')
      return errorResponse(
        new ApiError(409, 'Forklaringen er stoppet. Der er ikke gemt en ny analyse.'),
      );
    if (error instanceof Error && 'status' in error && error.status === 422)
      return errorResponse(new ApiError(422, error.message));
    return errorResponse(error);
  }
}
