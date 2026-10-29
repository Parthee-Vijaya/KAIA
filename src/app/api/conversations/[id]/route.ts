import { requireUser } from '@/server/auth';
import { conversation } from '@/server/repository';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return privateJson(await conversation(await requireUser(), (await params).id));
  } catch (error) {
    return errorResponse(error);
  }
}
