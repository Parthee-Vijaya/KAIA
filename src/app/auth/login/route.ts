import { beginLogin } from '@/server/auth';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return Response.redirect(await beginLogin());
  } catch {
    return Response.redirect(
      new URL('/?loginError=failed', process.env.KAIA_APP_URL || 'http://127.0.0.1:3210'),
    );
  }
}
