import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { analysisRequestIdSchema, cancelAnalysisRequest } from '@/server/analysis-requests';
import { consumeUsageBudget } from '@/server/repository';
import { readJson } from '@/server/validation';
import { privateJson, errorResponse } from '@/server/errors';

export const runtime = 'nodejs';
const schema = z.object({ requestId: analysisRequestIdSchema }).strict();
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(request, schema);
    await consumeUsageBudget(
      `cancel:${user.userId}`,
      120,
      'For mange stopforespørgsler. Prøv igen senere.',
    );
    return privateJson(await cancelAnalysisRequest(user, input.requestId));
  } catch (error) {
    return errorResponse(error);
  }
}
