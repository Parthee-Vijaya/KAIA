import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { readJson } from '@/server/validation';
import { privateJson, errorResponse, ApiError } from '@/server/errors';
import { getPlanDraft, preparePlanDraft, approvePlanDraft } from '@/server/plan-drafts';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('analysisId'));
    if (!id.success) throw new ApiError(400, 'Vælg en gemt analyse.');
    return privateJson({ plan: await getPlanDraft(await requireUser(), id.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('prepare'), analysisId: z.string().uuid() }).strict(),
  z
    .object({
      mode: z.literal('approve'),
      id: z.string().uuid(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const user = await requireUser(),
      input = await readJson(request, schema);
    return privateJson({
      plan:
        input.mode === 'prepare'
          ? await preparePlanDraft(user, input.analysisId)
          : await approvePlanDraft(user, input.id, input.fingerprint),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
