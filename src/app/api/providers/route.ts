import { requireUser, assertAdmin } from '@/server/auth';
import { publicProviders, saveProvider, providerSchema } from '@/server/providers';
import { readJson } from '@/server/validation';
import { audit } from '@/server/repository';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await requireUser();
    assertAdmin(user);
    return privateJson(await publicProviders());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAdmin(user);
    const input = await readJson(request, providerSchema);
    await saveProvider(input);
    await audit(user, 'provider.updated', input.id);
    return privateJson(await publicProviders());
  } catch (e) {
    return errorResponse(e);
  }
}
