import { installDemoSession, isDemoLoginEnabled } from '@/server/auth';
import { ApiError, errorResponse } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const origin = new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').origin;
  if (!isDemoLoginEnabled())
    return errorResponse(new ApiError(404, 'Demologin er ikke aktiveret.'));
  if (request.headers.get('origin') !== origin)
    return errorResponse(new ApiError(403, 'Ugyldig forespørgselsoprindelse.'));
  try {
    if (Number(request.headers.get('content-length') || 0) > 2000)
      throw new ApiError(413, 'Forespørgslen er for stor.');
    const form = await request.formData();
    if ([...form.keys()].some((key) => key !== 'profile') || form.getAll('profile').length !== 1)
      throw new ApiError(400, 'Vælg en demoprofil.');
    await installDemoSession(form.get('profile'));
    return Response.redirect(new URL('/', origin), 303);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return errorResponse(error);
    return Response.redirect(new URL('/?loginError=failed', origin), 303);
  }
}
