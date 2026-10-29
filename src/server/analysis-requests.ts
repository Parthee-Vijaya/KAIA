import { z } from 'zod';
import type { AccessContext } from '@/domain/types';
import { sql } from './db';
import { ApiError } from './errors';

export const analysisRequestIdSchema = z.string().uuid();
type RequestState = 'running' | 'cancelled' | 'completed';
type RequestKind = 'analysis' | 'explanation';
interface RequestRow {
  request_id: string;
  owner_id: string;
  state: RequestState;
  analysis_id: string | null;
  job_kind: RequestKind;
}
type RequestSql = Pick<ReturnType<typeof sql>, 'unsafe'>;
export interface AnalysisRequestStatus {
  requestId: string;
  status: RequestState;
  analysisId?: string;
  conversationId?: string;
}
export class AnalysisRequestCancelledError extends ApiError {
  readonly code = 'ANALYSIS_CANCELLED';
  constructor() {
    super(409, 'Analysen er stoppet og bliver ikke gemt.');
  }
}
function requestId(value: string): string {
  const parsed = analysisRequestIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'Analysens anmodnings-ID er ugyldigt.');
  return parsed.data;
}
function assertOwner(row: RequestRow | undefined, user: AccessContext): asserts row is RequestRow {
  if (!row || row.owner_id !== user.userId)
    throw new ApiError(404, 'Analysens anmodning blev ikke fundet.');
}
async function publicStatus(query: RequestSql, row: RequestRow): Promise<AnalysisRequestStatus> {
  const result: AnalysisRequestStatus = { requestId: row.request_id, status: row.state };
  if (row.state === 'completed' && row.analysis_id) {
    result.analysisId = row.analysis_id;
    // A separate statement after locking sees the committed analysis even if cancel waited on save.
    const [analysis] = await query.unsafe<{ conversation_id: string }[]>(
      'SELECT conversation_id FROM kaia_analyses WHERE id=$1 AND owner_id=$2',
      [row.analysis_id, row.owner_id],
    );
    if (analysis) result.conversationId = analysis.conversation_id;
  }
  return result;
}

/** First claim wins. A cancellation can already exist before this request reaches the server. */
export async function beginAnalysisRequest(
  user: AccessContext,
  id: string,
): Promise<AnalysisRequestStatus> {
  return beginRequest(user, id, 'analysis');
}
export async function beginExplanationRequest(
  user: AccessContext,
  id: string,
): Promise<AnalysisRequestStatus> {
  return beginRequest(user, id, 'explanation');
}
async function beginRequest(
  user: AccessContext,
  id: string,
  kind: RequestKind,
): Promise<AnalysisRequestStatus> {
  const key = requestId(id);
  return sql().begin(async (tx) => {
    const inserted = await tx.unsafe(
      "INSERT INTO kaia_analysis_requests(request_id,owner_id,state,job_kind) VALUES($1,$2,'running',$3) ON CONFLICT(request_id) DO NOTHING RETURNING request_id",
      [key, user.userId, kind],
    );
    const [row] = await tx.unsafe<RequestRow[]>(
      'SELECT * FROM kaia_analysis_requests WHERE request_id=$1 FOR UPDATE',
      [key],
    );
    assertOwner(row, user);
    if (row.state === 'cancelled') throw new AnalysisRequestCancelledError();
    if (row.job_kind !== kind) throw new ApiError(409, 'Anmodningen tilhører en anden opgavetype.');
    if (!inserted.length)
      throw new ApiError(
        409,
        'Anmodningen er allerede startet eller afsluttet. Prøv igen med en ny anmodning.',
      );
    return publicStatus(tx, row);
  });
}

/** Unknown IDs become owner-bound tombstones; neither a replay nor a late begin can reactivate them. */
export async function cancelAnalysisRequest(
  user: AccessContext,
  id: string,
): Promise<AnalysisRequestStatus> {
  const key = requestId(id);
  return sql().begin(async (tx) => {
    await tx.unsafe(
      "INSERT INTO kaia_analysis_requests(request_id,owner_id,state) VALUES($1,$2,'cancelled') ON CONFLICT(request_id) DO NOTHING",
      [key, user.userId],
    );
    const [row] = await tx.unsafe<RequestRow[]>(
      'SELECT * FROM kaia_analysis_requests WHERE request_id=$1 FOR UPDATE',
      [key],
    );
    assertOwner(row, user);
    if (row.state === 'running') {
      await tx.unsafe(
        "UPDATE kaia_analysis_requests SET state='cancelled',updated_at=now() WHERE request_id=$1 AND owner_id=$2",
        [key, user.userId],
      );
      row.state = 'cancelled';
    }
    return publicStatus(tx, row);
  });
}
export async function analysisRequestStatus(
  user: AccessContext,
  id: string,
): Promise<AnalysisRequestStatus | undefined> {
  const [row] = await sql().unsafe<RequestRow[]>(
    'SELECT * FROM kaia_analysis_requests WHERE request_id=$1 AND owner_id=$2',
    [requestId(id), user.userId],
  );
  return row ? publicStatus(sql(), row) : undefined;
}

/** Must execute inside the very same transaction that inserts the analysis and completes this job. */
export async function lockRunningAnalysisRequest(
  tx: RequestSql,
  user: AccessContext,
  id: string,
): Promise<void> {
  const [row] = await tx.unsafe<RequestRow[]>(
    'SELECT * FROM kaia_analysis_requests WHERE request_id=$1 FOR UPDATE',
    [requestId(id)],
  );
  if (!row) throw new ApiError(409, 'Analysens anmodning er ikke startet.');
  assertOwner(row, user);
  if (row.job_kind !== 'analysis')
    throw new ApiError(409, 'En forklaringsopgave kan ikke gemme en analyse.');
  if (row.state === 'cancelled') throw new AnalysisRequestCancelledError();
  if (row.state !== 'running') throw new ApiError(409, 'Anmodningens analyse er allerede gemt.');
}
export async function completeAnalysisRequest(
  tx: RequestSql,
  user: AccessContext,
  id: string,
  analysisId: string,
): Promise<void> {
  const rows = await tx.unsafe(
    "UPDATE kaia_analysis_requests SET state='completed',analysis_id=$3,updated_at=now() WHERE request_id=$1 AND owner_id=$2 AND state='running' AND job_kind='analysis' RETURNING request_id",
    [requestId(id), user.userId, analysisId],
  );
  if (rows.length !== 1) throw new ApiError(409, 'Anmodningen kunne ikke afsluttes.');
}

/** Ephemeral explanations finish under the same owner/state lock but never insert an analysis. */
export async function completeExplanationRequest(
  user: AccessContext,
  id: string,
): Promise<AnalysisRequestStatus> {
  const key = requestId(id);
  return sql().begin(async (tx) => {
    const [row] = await tx.unsafe<RequestRow[]>(
      'SELECT * FROM kaia_analysis_requests WHERE request_id=$1 FOR UPDATE',
      [key],
    );
    if (!row) throw new ApiError(409, 'Forklaringens anmodning er ikke startet.');
    assertOwner(row, user);
    if (row.state === 'cancelled') throw new AnalysisRequestCancelledError();
    if (row.job_kind !== 'explanation')
      throw new ApiError(409, 'Anmodningen er ikke en forklaringsopgave.');
    if (row.state !== 'running') throw new ApiError(409, 'Forklaringen er allerede afsluttet.');
    await tx.unsafe(
      "UPDATE kaia_analysis_requests SET state='completed',analysis_id=NULL,updated_at=now() WHERE request_id=$1 AND owner_id=$2 AND job_kind='explanation' AND state='running'",
      [key, user.userId],
    );
    row.state = 'completed';
    return publicStatus(tx, row);
  });
}

/** This stops provider work too; the transaction guard remains authoritative for persistence. */
export function watchAnalysisRequest(
  user: AccessContext,
  id: string,
  controller: AbortController,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller.signal.removeEventListener('abort', stop);
  };
  const poll = async () => {
    try {
      const current = await analysisRequestStatus(user, id);
      if (!stopped && current?.status === 'cancelled') controller.abort();
    } catch {
      // A failed poll cannot authorize a save; the locked DB guard still decides at commit.
    } finally {
      if (!stopped) schedule();
    }
  };
  const schedule = () => {
    timer = setTimeout(() => {
      void poll();
    }, 500);
    timer.unref?.();
  };
  if (controller.signal.aborted) return stop;
  controller.signal.addEventListener('abort', stop, { once: true });
  schedule();
  return stop;
}
