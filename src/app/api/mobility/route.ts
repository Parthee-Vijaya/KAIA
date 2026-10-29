import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/server/auth';
import {
  ownedAnalysis,
  loadDatasetShell,
  saveAnalysis,
  consumeAnalysisBudget,
} from '@/server/repository';
import { readJson } from '@/server/validation';
import { privateJson, errorResponse, ApiError } from '@/server/errors';
import { buildMobilityAnalysis, mobilityAssumptionsSchema, MobilityError } from '@/domain/mobility';
import { SOURCE_CATALOG } from '@/integrations/catalog';
import { planQuery } from '@/integrations';
import { createTrace } from '@/domain/trace';
export const runtime = 'nodejs';
const schema = z
  .object({
    mode: z.enum(['preview', 'save']),
    analysisId: z.string().uuid(),
    assumptions: mobilityAssumptionsSchema,
  })
  .strict();
export async function POST(request: Request) {
  try {
    const user = await requireUser(),
      input = await readJson(request, schema);
    await consumeAnalysisBudget(user);
    const basis = await ownedAnalysis(user, input.analysisId);
    if (!basis.mobility) throw new ApiError(422, 'Vælg et gemt skolekapacitetsforløb.');
    const trace = createTrace(randomUUID());
    trace.update(0, 'running', 'Indlæser den valgte analyses kontekst');
    const shell = await loadDatasetShell(user, basis.datasetVersion);
    trace.update(0, 'completed', 'Det gemte snapshots afgrænsning bevares', [
      { label: 'Analysens dataversion', value: basis.datasetVersion },
    ]);
    trace.update(1, 'running', 'Vælger demoforløbets værktøjer');
    const plan = planQuery(basis.question, basis.context, user);
    trace.update(
      1,
      'completed',
      'Versionsfaste værktøjer valgt',
      plan.steps.map((s) => ({
        label: SOURCE_CATALOG.find((source) => source.id === s.sourceId)?.title || s.sourceId,
        value: s.reason,
      })),
    );
    trace.update(2, 'running', 'Kontrollerer aktuelle rettigheder');
    // ownedAnalysis and planQuery checked ownership, scope and every source operation above.
    trace.update(2, 'completed', 'Ejerskab, kilder og enhedsscope er kontrolleret');
    trace.update(3, 'running', 'Genberegner fra det gemte historikgrundlag');
    const analysis = buildMobilityAnalysis(
      basis.question,
      user,
      basis.context,
      shell,
      input.assumptions,
      basis.mobility,
    );
    trace.update(
      3,
      'completed',
      'Graf, kapacitet og drift er genberegnet',
      [],
      analysis.sources.map((s) => s.id),
    );
    trace.update(4, 'running', 'Formulerer den beregnede forklaring');
    analysis.formulation = { provider: 'demo', model: 'Deterministisk kapacitetsmodel' };
    trace.update(4, 'completed', 'Demosvaret bruger den nye beregning', [
      { label: 'Model', value: 'Deterministisk kapacitetsmodel · ingen eksterne modelkald' },
    ]);
    trace.update(
      5,
      input.mode === 'save' ? 'available' : 'blocked',
      input.mode === 'save'
        ? 'Nyt planudkast kan forberedes'
        : 'Gem scenariet før et nyt planudkast kan oprettes',
      [{ label: 'Original', value: 'Det tidligere svar og dets godkendelse bevares uændret.' }],
    );
    analysis.trace = trace.snapshot();
    return privateJson({
      analysis:
        input.mode === 'save' ? await saveAnalysis(user, analysis, basis.conversationId) : analysis,
    });
  } catch (error) {
    return errorResponse(error instanceof MobilityError ? new ApiError(422, error.message) : error);
  }
}
