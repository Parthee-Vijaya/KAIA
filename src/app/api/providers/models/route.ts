import { requireUser, assertAdmin } from '@/server/auth';
import { getProvider, listModels } from '@/server/providers';
import { errorResponse, privateJson, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertAdmin(user);
    const id = new URL(request.url).searchParams.get('id');
    if (id !== 'mistral' && id !== 'openai' && id !== 'azure' && id !== 'corti')
      throw new ApiError(400, 'Vælg en udbyder.');
    return privateJson({ models: await listModels(await getProvider(id)) });
  } catch (e) {
    return errorResponse(e);
  }
}
