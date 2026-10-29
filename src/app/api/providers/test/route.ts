import { z } from 'zod';
import { requireUser, assertAdmin } from '@/server/auth';
import { testProvider } from '@/server/providers';
import { readJson } from '@/server/validation';
import { audit } from '@/server/repository';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAdmin(user);
    const input = await readJson(
      request,
      z.object({ id: z.enum(['demo', 'openai', 'azure', 'mistral', 'corti']) }).strict(),
    );
    const result = await testProvider(input.id);
    await audit(user, 'provider.test', input.id);
    return privateJson(result);
  } catch (e) {
    return errorResponse(e);
  }
}
