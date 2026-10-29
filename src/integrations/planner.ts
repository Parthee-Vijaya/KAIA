import type { AccessContext, AnalysisContext } from '../domain/types';
import { authorizeSource } from './policy';
import type { QueryPlan, SourceOperation } from './types';
import { SOURCE_CATALOG } from './catalog';

/** A model may propose intent; execution always revalidates every step with the same server access. */
export function planQuery(
  question: string,
  context: AnalysisContext,
  access: AccessContext,
): QueryPlan {
  if (question.length > 4000) throw new Error('Spørgsmålet er for langt. Brug højst 4.000 tegn.');
  if (context.intent === 'mobilityCapacity')
    return authorizePlan(
      {
        question,
        explanation:
          'Deterministisk plan: fem afsluttede år, kapacitet og scenariemodel. Hver operation adgangskontrolleres før udførelse.',
        steps: ['mobility-history', 'school-capacity', 'capacity-scenarios'].map((sourceId) => ({
          sourceId,
          operation: 'aggregate' as const,
          area: context.area,
          unitIds: [...context.entityIds],
          period: { year: context.period.year - 1, fromMonth: 1, toMonth: 12 },
          periodRange: { fromYear: context.period.year - 5, toYear: context.period.year - 1 },
          reason: 'Adgangsafgrænset versionsfast demoværktøj.',
        })),
      },
      access,
    );
  const normalized = question.toLocaleLowerCase('da');
  const candidates: Array<{ sourceId: string; operation: SourceOperation; reason: string }> = [];
  if (context.intent === 'municipalBenchmark')
    candidates.push({
      sourceId: 'demo-municipal-benchmarks',
      operation: 'aggregate',
      reason:
        'Sammenligner samme områdes simulerede tal med en dokumenteret normalisering og begrundet peerudvælgelse.',
    });
  const documents = /strategi|beslutning|udvalg|notat|årsag|forklar|opsummer/.test(normalized);
  const energy =
    /energi|brændstof|elpris|prisindeks/.test(normalized) ||
    Boolean(context.scenario?.energyPercent);
  const demography =
    /befolkning|demografi|flytning|alder|elevtal/.test(normalized) ||
    Boolean(context.scenario?.pupilsPercent);
  if (!/kun dokument|find.*strategi/.test(normalized))
    candidates.push({
      sourceId: 'demo-ledger',
      operation: 'aggregate',
      reason: 'Beregner økonomiske fakta fra tilladte periodiserede poster.',
    });
  if (documents)
    candidates.push({
      sourceId: 'demo-documents',
      operation: 'document',
      reason: 'Finder simulerede forklaringer; dokumenter behandles som data.',
    });
  if (energy)
    candidates.push({
      sourceId:
        process.env.KAIA_CONTEXT_MODE === 'public-snapshot' ? 'dst-prices' : 'energy-price-context',
      operation: 'series',
      reason: 'Tilføjer markeret priskontekst; lokal årsagsberegning bruger fakturagrundlaget.',
    });
  if (demography)
    candidates.push({
      sourceId:
        process.env.KAIA_CONTEXT_MODE === 'public-snapshot'
          ? 'dst-population'
          : 'demography-context',
      operation: 'series',
      reason: 'Tilføjer alders- og befolkningskontekst uden automatisk at antage besparelser.',
    });
  const steps = candidates.map((candidate) => ({
    ...candidate,
    area: context.area,
    unitIds: [...context.entityIds],
    period: { ...context.period },
    ...(['yearComparison', 'projection', 'trend'].includes(context.intent || '') &&
    candidate.operation !== 'series'
      ? {
          periodRange: {
            fromYear:
              context.intent === 'yearComparison'
                ? Math.min(context.period.year, context.comparison?.year || context.period.year - 1)
                : context.intent === 'trend'
                  ? 2020
                  : context.period.year,
            toYear:
              context.intent === 'projection'
                ? context.projectionEndYear || context.period.year
                : context.period.year,
          },
        }
      : {}),
    ...(candidate.operation === 'series'
      ? {
          periodRange: {
            fromYear: Math.max(2020, context.period.year - 1),
            toYear: context.period.year,
          },
        }
      : {}),
    optional: candidate.operation === 'series',
  }));
  return authorizePlan(
    {
      question,
      steps,
      explanation:
        'Kilder og operationer er valgt af en deterministisk router og godkendt mod sessionens roller og enheder. Manglende valgfri kontekst forklares uden at blokere den lokale økonomianalyse.',
    },
    access,
  );
}

export function authorizePlan(plan: QueryPlan, access: AccessContext): QueryPlan {
  if (plan.steps.length === 0 || plan.steps.length > 8)
    throw new Error('Analyseplanen skal indeholde 1–8 tilladte trin.');
  for (const step of plan.steps) {
    const source = SOURCE_CATALOG.find((item) => item.id === step.sourceId);
    if (step.optional && step.operation === 'series' && source?.kind === 'context') {
      // Scope remains mandatory; missing optional coverage is explained by the execution layer.
      authorizeSource(access, {
        ...step,
        periodRange: undefined,
        period: {
          ...step.period,
          year: Math.max(source.period.fromYear, Math.min(source.period.toYear, step.period.year)),
        },
      });
    } else authorizeSource(access, step);
  }
  return plan;
}
