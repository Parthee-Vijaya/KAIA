import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { ownedAnalysis, lists } from '@/server/repository';
import { sql } from '@/server/db';
import { readJson } from '@/server/validation';
import { errorResponse, privateJson } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return privateJson((await lists(await requireUser())).insights);
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
          title: z.string().trim().min(1).max(160).optional(),
        })
        .strict(),
    );
    const analysis = await ownedAnalysis(user, input.analysisId);
    const item = {
      id: randomUUID(),
      title: input.title || analysis.title,
      createdAt: new Date().toISOString(),
      analysis,
    };
    await sql()`INSERT INTO kaia_insights(id,owner_id,title,analysis) VALUES(${item.id},${user.userId},${item.title},${sql().json(analysis as never)})`;
    return privateJson(item, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
