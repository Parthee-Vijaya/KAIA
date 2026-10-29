import { currentUser, setupStatus } from '@/server/auth';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const [setup, user] = await Promise.all([setupStatus(), currentUser()]);
    return privateJson({ setup, user });
  } catch (error) {
    return errorResponse(error);
  }
}
