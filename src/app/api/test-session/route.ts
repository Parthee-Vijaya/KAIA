import { installTestSession, isLocalTest } from '@/server/auth';
import { errorResponse, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (!isLocalTest()) throw new ApiError(404, 'Ikke fundet.');
    const origin = new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').origin;
    if (request.headers.get('origin') !== origin) throw new ApiError(403, 'Ugyldig oprindelse.');
    const form = await request.formData();
    const profile = String(form.get('profile') || 'admin');
    if (!['admin', 'school', 'council'].includes(profile))
      throw new ApiError(400, 'Ugyldig testprofil.');
    await installTestSession(profile);
    return Response.redirect(new URL('/', origin), 303);
  } catch (error) {
    return errorResponse(error);
  }
}
