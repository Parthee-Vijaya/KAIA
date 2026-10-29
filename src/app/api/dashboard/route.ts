import { requireUser } from '@/server/auth';
import { parseDashboardQuery } from '@/domain/dashboard';
import { getDashboard } from '@/server/dashboard';
import { consumePreviewBudget } from '@/server/repository';
import { ApiError, errorResponse, privateJson } from '@/server/errors';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    let query;
    try {
      query = parseDashboardQuery(new URL(request.url).searchParams);
    } catch {
      throw new ApiError(400, 'Kontrollér dashboardets parametre, periode og enheder.');
    }
    await consumePreviewBudget(user);
    return privateJson(await getDashboard(user, query));
  } catch (error) {
    return errorResponse(error);
  }
}
