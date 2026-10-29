import { requireUser } from '@/server/auth';
import { sql } from '@/server/db';
import { DATASET_VERSION } from '@/domain/data';
import { canAccessDocument } from '@/domain/policy';
import { allEntities } from '@/server/repository';
import { errorResponse, privateJson, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const version = new URL(request.url).searchParams.get('version') || DATASET_VERSION;
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(version)) throw new ApiError(400, 'Ugyldig dataversion.');
    const [row] =
      await sql()`SELECT data FROM kaia_documents WHERE dataset_version=${version} AND id=${id} AND area IN ${sql()(user.areas)}`;
    if (!row || !canAccessDocument(user, row.data, await allEntities(version)))
      throw new ApiError(404, 'Dokumentet blev ikke fundet.');
    return privateJson(row.data);
  } catch (error) {
    return errorResponse(error);
  }
}
