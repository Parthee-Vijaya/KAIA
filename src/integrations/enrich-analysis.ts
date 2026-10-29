import type { AccessContext, Analysis, ContextSeries, SourceRef } from '../domain/types';
import { getDataset } from '../domain/data';
import type { Dataset } from '../domain/data';
import type { QueryPlan } from './types';
import { contextSeries } from './context';
import { authorizePlan } from './planner';
import { SOURCE_CATALOG } from './catalog';

const number = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });
function sourceForSeries(series: ContextSeries): SourceRef {
  const observations = series.observations
    .map((row) => `${row.period}: ${number.format(row.value)} ${series.unit}`)
    .join('; ');
  return {
    id: `CONTEXT-${series.id}`,
    title: series.title,
    type: 'context',
    url: series.sourceUrl.startsWith('https://') ? series.sourceUrl : undefined,
    excerpt: `${series.status === 'simulated' ? 'SIMULERET KONTEKST' : 'VERIFICERET OFFENTLIGT SNAPSHOT'}. ${series.geography}. ${observations}. Observeret: ${series.observedAt}. Hentet: ${series.retrievedAt}. ${series.assumptions.join(' ')}`,
    period: series.observations.map((row) => row.period).join(', '),
    datasetVersion: series.datasetVersion,
    status: series.status,
    observedAt: series.observedAt,
    retrievedAt: series.retrievedAt,
    geography: series.geography,
    unit: series.unit,
  };
}

/** Adds executed, scoped context evidence to the same object used by text, chart, export and persistence. */
export function enrichAnalysisWithContext(
  analysis: Analysis,
  access: AccessContext,
  plan: QueryPlan,
  dataset: Dataset = getDataset(),
): Analysis {
  authorizePlan(plan, access);
  if (analysis.datasetVersion !== dataset.version)
    throw new Error('Analysen og kontekstberigelsen skal bruge samme dataversion.');
  if (analysis.missingData) return analysis;
  const series: ContextSeries[] = [];
  const explanations: string[] = [];
  for (const step of plan.steps.filter((item) => item.operation === 'series')) {
    if (
      step.area !== analysis.context.area ||
      step.unitIds.some((id) => !analysis.context.entityIds.includes(id))
    )
      throw new Error('Kontekstplanen matcher ikke analysens afgrænsning.');
    try {
      const result = contextSeries(access, step, analysis.datasetVersion, dataset);
      if (result.length === 0)
        throw new Error('Kilden har ingen observationer i den valgte dækning.');
      series.push(...result);
    } catch (error) {
      if (!step.optional) throw error;
      const source = SOURCE_CATALOG.find((item) => item.id === step.sourceId);
      explanations.push(
        `Supplerende kontekst fra ${source?.title || 'den valgte kilde'} er ikke tilgængelig for den valgte dækning. Kildens årsdækning er ${source?.period.fromYear || 'ukendt'}–${source?.period.toYear || 'ukendt'}. Den lokale simulerede økonomianalyse er bevaret; der udledes ingen ekstern årsagsforklaring.`,
      );
    }
  }
  if (!series.length && !explanations.length) return analysis;
  const additions = series.filter(
    (item) => !analysis.contextSeries?.some((existing) => existing.id === item.id),
  );
  const sources = [...analysis.sources];
  const narrative = [...analysis.narrative];
  for (const item of additions) {
    sources.push(sourceForSeries(item));
    const first = item.observations[0],
      last = item.observations.at(-1)!;
    const values =
      first.period === last.period
        ? `${last.period}: ${number.format(last.value)} ${item.unit}`
        : `${first.period}: ${number.format(first.value)} → ${last.period}: ${number.format(last.value)} ${item.unit}`;
    narrative.push(
      `${item.title} (${item.status === 'simulated' ? 'simuleret kontekst' : 'offentligt snapshot'}, ${item.geography}): ${values}. Det er kontekst, ikke i sig selv belæg for en lokal økonomisk årsag. [${sources.length}]`,
    );
  }
  return {
    ...analysis,
    sources,
    narrative,
    contextSeries: [...(analysis.contextSeries || []), ...additions],
    assumptions: [
      ...analysis.assumptions,
      ...explanations,
      ...(additions.length
        ? [
            'Supplerende kontekst er hentet af kildeplanens godkendte serieværktøj. Offentlige og simulerede serier har særskilt status, periode, geografi, enhed og kildeversion. Et prisindeks dokumenterer ikke en lokal årsag; lokale energibidrag kommer fra den simulerede fakturamodel.',
          ]
        : []),
    ],
  };
}
