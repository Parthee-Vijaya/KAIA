import { logout } from '@/server/auth';
import { errorResponse, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (
      request.headers.get('origin') !==
      new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').origin
    )
      throw new ApiError(403, 'Ugyldig oprindelse.');
    await logout();
    return Response.redirect(new URL('/', process.env.KAIA_APP_URL || request.url), 303);
  } catch (error) {
    return errorResponse(error);
  }
}
