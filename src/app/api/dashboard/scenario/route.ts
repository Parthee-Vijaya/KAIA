import { requireUser } from '@/server/auth';
import { dashboardScenarioSchema } from '@/domain/dashboard';
import { getDashboardScenario } from '@/server/dashboard';
import { consumePreviewBudget } from '@/server/repository';
import { readJson } from '@/server/validation';
import { errorResponse, privateJson } from '@/server/errors';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(request, dashboardScenarioSchema);
    await consumePreviewBudget(user);
    return privateJson(await getDashboardScenario(user, input));
  } catch (error) {
    return errorResponse(error);
  }
}
