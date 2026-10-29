import { completeLogin } from '@/server/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await completeLogin(new URL(request.url));
    return Response.redirect(new URL('/', process.env.KAIA_APP_URL));
  } catch {
    return Response.redirect(
      new URL('/?loginError=failed', process.env.KAIA_APP_URL || 'http://127.0.0.1:3210'),
    );
  }
}
