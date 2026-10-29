import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { ownedAnalysis, loadDataset, consumePreviewBudget } from '@/server/repository';
import { readJson, assumptionsSchema } from '@/server/validation';
import { analyze } from '@/domain/analysis';
import { planQuery, enrichAnalysisWithContext } from '@/integrations';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(
      request,
      z.object({ analysisId: z.string().uuid(), assumptions: assumptionsSchema }).strict(),
    );
    const basis = await ownedAnalysis(user, input.analysisId);
    await consumePreviewBudget(user);
    const context = { ...basis.context, intent: 'scenario', scenario: input.assumptions };
    const dataset = await loadDataset(user, context, basis.datasetVersion);
    const question = input.assumptions.energyPercent
      ? 'Vis baseline og scenarie med ændret energipris'
      : 'Vis baseline og scenarie i samme graf';
    const result = analyze(question, user, basis.context, context, dataset);
    const analysis = {
      ...enrichAnalysisWithContext(
        result,
        user,
        planQuery(question, result.context, user),
        dataset,
      ),
      formulation: { provider: 'demo' as const, model: 'Deterministisk analyse' },
    };
    return privateJson({ analysis });
  } catch (error) {
    return errorResponse(error);
  }
}
