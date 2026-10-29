import { requireUser } from '@/server/auth';
import { errorResponse, privateJson } from '@/server/errors';
import { listAllowedCatalog, integrationStatus } from '@/integrations';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await requireUser();
    return privateJson({ sources: listAllowedCatalog(user), integrations: integrationStatus() });
  } catch (e) {
    return errorResponse(e);
  }
}
