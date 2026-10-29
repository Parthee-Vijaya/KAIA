import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { ownedAnalysis, lists, loadDataset, saveAnalysis } from '@/server/repository';
import { sql } from '@/server/db';
import { readJson, assumptionsSchema } from '@/server/validation';
import { analyze } from '@/domain/analysis';
import { DEFAULT_SCENARIO } from '@/domain/types';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return privateJson((await lists(await requireUser())).scenarios);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(
      request,
      z
        .object({
          analysisId: z.string().uuid(),
          title: z.string().trim().min(1).max(160),
          assumptions: assumptionsSchema.optional(),
        })
        .strict(),
    );
    const basis = await ownedAnalysis(user, input.analysisId);
    const assumptions = input.assumptions || basis.scenario?.assumptions || DEFAULT_SCENARIO;
    const result = analyze(
      'Vis baseline og scenarie i samme graf',
      user,
      basis.context,
      { scenario: assumptions },
      await loadDataset(user, basis.context, basis.datasetVersion),
    );
    const analysis = await saveAnalysis(user, result, basis.conversationId);
    const item = {
      id: randomUUID(),
      title: input.title,
      createdAt: new Date().toISOString(),
      context: analysis.context,
      assumptions,
      analysis,
    };
    await sql()`INSERT INTO kaia_scenarios(id,owner_id,title,analysis) VALUES(${item.id},${user.userId},${item.title},${sql().json(analysis as never)})`;
    return privateJson(item, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
