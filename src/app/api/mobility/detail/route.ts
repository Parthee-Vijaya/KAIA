import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { ownedAnalysis, loadDatasetShell } from '@/server/repository';
import { privateJson, errorResponse, ApiError } from '@/server/errors';
import { readJson } from '@/server/validation';
import { mobilityDetail } from '@/domain/mobility-detail';
import { MobilityError, buildMobilityAnalysis, mobilityAssumptionsSchema } from '@/domain/mobility';
export const runtime = 'nodejs';
const schema = z
  .object({
    analysisId: z.string().uuid(),
    entityId: z.string().max(100).optional(),
    assumptions: mobilityAssumptionsSchema.optional(),
    year: z.number().int().min(2020).max(2100),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const user = await requireUser(),
      input = await readJson(request, schema);
    let analysis = await ownedAnalysis(user, input.analysisId);
    if (!analysis.mobility) throw new ApiError(422, 'Vælg et skolekapacitetsforløb.');
    if (input.assumptions) {
      const shell = await loadDatasetShell(user, analysis.datasetVersion);
      analysis = buildMobilityAnalysis(
        analysis.question,
        user,
        analysis.context,
        shell,
        input.assumptions,
        analysis.mobility,
      );
    }
    return privateJson({ detail: mobilityDetail(analysis, input) });
  } catch (error) {
    return errorResponse(error instanceof MobilityError ? new ApiError(422, error.message) : error);
  }
}
