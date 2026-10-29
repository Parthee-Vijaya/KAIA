import type { Analysis, Metric } from '@/domain/types';
import { ApiError } from './errors';

export interface EvidenceValue {
  raw: number;
  rawUnit: 'ore' | 'percent' | 'number';
  formatted: string;
  unit: string;
}
const moneyFormat = new Intl.NumberFormat('da-DK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimalFormat = new Intl.NumberFormat('da-DK', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const countFormat = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 3 });
const normalization = (analysis: Analysis) =>
  analysis.context.metric === 'perPupil'
    ? 'kr./elev'
    : analysis.context.metric === 'perCapita'
      ? 'kr./indbygger'
      : 'kr.';

function value(
  raw: number,
  rawUnit: Metric['unit'],
  unit: EvidenceValue['unit'] = rawUnit === 'ore' ? 'kr.' : rawUnit === 'percent' ? '%' : 'antal',
): EvidenceValue {
  if (!Number.isFinite(raw))
    throw new ApiError(422, 'Beregningsgrundlaget indeholder et ugyldigt tal.');
  return {
    raw,
    rawUnit,
    unit,
    formatted:
      rawUnit === 'ore'
        ? `${moneyFormat.format(raw / 100)} ${unit}`
        : rawUnit === 'percent'
          ? `${decimalFormat.format(raw)} %`
          : `${countFormat.format(raw)}${unit === 'antal' ? '' : ` ${unit}`}`,
  };
}
function metricUnit(metric: Metric, analysis: Analysis): EvidenceValue['unit'] {
  if (metric.unit !== 'ore') return metric.unit === 'percent' ? '%' : metric.displayUnit || 'antal';
  const label = `${metric.label} ${metric.description || ''}`;
  if (/pr\.?\s*elev|kr\.\/elev/i.test(label)) return 'kr./elev';
  if (/pr\.?\s*indbygger|kr\.\/indbygger/i.test(label)) return 'kr./indbygger';
  // Comparison result metrics (including the difference) share the normalized denominator.
  if (['yearComparison', 'municipalBenchmark'].includes(analysis.context.intent || ''))
    return normalization(analysis);
  return 'kr.';
}
/** Format existing server results; the only derived fact is an exact difference between two displayed institutions. */
export function buildAnswerEvidence(analysis: Analysis, previous?: Analysis) {
  if (analysis.basisKind === 'illustration' && !analysis.illustration)
    throw new ApiError(
      422,
      'Illustrationen mangler sine gemte antagelser og beregningsresultater.',
    );
  const compatible = new Set(
    analysis.sources
      .filter(
        (source) => source.datasetVersion === analysis.datasetVersion && source.type !== 'name',
      )
      .map((source) => source.id),
  );
  const check = (ids: string[]) => {
    if (ids.some((id) => !compatible.has(id)))
      throw new ApiError(
        422,
        'Talgrundlaget mangler en kompatibel demokilde fra samme dataversion.',
      );
  };
  analysis.metrics.forEach((metric) => check(metric.sourceIds));
  if (analysis.chart) check(analysis.chart.sourceIds);
  const chart = analysis.chart
    ? {
        type: analysis.chart.type,
        title: analysis.chart.title,
        subtitle: analysis.chart.subtitle,
        rawUnit: analysis.chart.unit,
        unit:
          analysis.chart.unit === 'ore'
            ? normalization(analysis)
            : analysis.chart.displayUnit || analysis.chart.unit,
        sourceIds: analysis.chart.sourceIds,
        series: analysis.chart.series.map(({ key, label, dashed }) => ({ key, label, dashed })),
        rowCount: analysis.chart.rows.length,
        rowsOmitted: Math.max(0, analysis.chart.rows.length - 100),
        // Non-series extras can mix totals, normalized amounts and counts. They are deliberately excluded.
        rows: analysis.chart.rows.slice(0, 100).map((row) => ({
          label: row.label,
          values: Object.fromEntries(
            analysis.chart!.series.map(({ key }) => {
              const cell = row[key];
              return [
                key,
                typeof cell === 'number'
                  ? value(
                      cell,
                      analysis.chart!.unit,
                      analysis.chart!.unit === 'ore'
                        ? normalization(analysis)
                        : analysis.chart!.displayUnit,
                    )
                  : (cell ?? null),
              ];
            }),
          ),
          ...(typeof row.pupils === 'number' ? { pupils: value(row.pupils, 'number') } : {}),
        })),
      }
    : undefined;
  const pairedComparisons =
    analysis.context.intent === 'comparison' &&
    analysis.chart?.unit === 'ore' &&
    analysis.chart.rows.length === 2
      ? analysis.chart.series.flatMap(({ key, label }) => {
          const [left, right] = analysis.chart!.rows;
          const a = left[key],
            b = right[key];
          if (
            typeof a !== 'number' ||
            typeof b !== 'number' ||
            !Number.isSafeInteger(a) ||
            !Number.isSafeInteger(b)
          )
            return [];
          const difference = Number(BigInt(a) - BigInt(b));
          if (!Number.isSafeInteger(difference))
            throw new ApiError(
              422,
              'Sammenligningen overskrider den præcise beløbsrepræsentation.',
            );
          return [
            {
              label,
              calculation: `${left.label} minus ${right.label}`,
              difference: value(difference, 'ore', normalization(analysis)),
              sourceIds: analysis.chart!.sourceIds,
            },
          ];
        })
      : [];
  return {
    analysisId: analysis.analysisId,
    datasetVersion: analysis.datasetVersion,
    basisKind: analysis.basisKind || 'dataset',
    title: analysis.title,
    conclusion: analysis.conclusion,
    narrative: analysis.narrative,
    context: analysis.context,
    metrics: analysis.metrics.map((metric) => ({
      label: metric.label,
      value: value(metric.value, metric.unit, metricUnit(metric, analysis)),
      description: metric.description,
      sourceIds: metric.sourceIds,
    })),
    chart,
    ...(analysis.mobility
      ? {
          mobility: {
            version: analysis.mobility.version,
            historicPeriod: `${analysis.mobility.anchorYear - 5}–${analysis.mobility.anchorYear - 1}`,
            forecastPeriod: `${analysis.mobility.anchorYear}–${analysis.mobility.anchorYear + 4}`,
            assumptions: analysis.mobility.assumptions,
            familyNet: analysis.mobility.familyNet,
            schoolChildrenNet: analysis.mobility.schoolChildrenNet,
            baseline: analysis.mobility.baseline,
            scenario: analysis.mobility.scenario,
            costDelta: value(analysis.mobility.costDeltaOre, 'ore'),
            interpretation:
              'Forenklet deterministisk kohortemodel. Familiers flytninger er ikke lig med elever. Øvrig kohortebalance er en afstemt rest, ikke en dokumenteret årsag. Kapacitetspres summeres pr. skole uden udligning af ledige pladser på andre skoler. Ingen faktisk politisk beslutning eller ekstern handling påstås.',
          },
        }
      : {}),
    ...(pairedComparisons.length ? { pairedComparisons } : {}),
    assumptions: analysis.assumptions,
    ...(analysis.illustration ? { illustration: illustrationEvidence(analysis.illustration) } : {}),
    ...illustrationHistoryEvidence(analysis, previous),
    ...(analysis.missingData ? { missingData: analysis.missingData } : {}),
    ...(analysis.scenario
      ? {
          scenario: {
            assumptions: analysis.scenario.assumptions,
            baseline: value(analysis.scenario.baselineOre, 'ore'),
            scenario: value(analysis.scenario.scenarioOre, 'ore'),
            delta: value(analysis.scenario.deltaOre, 'ore'),
          },
        }
      : {}),
    citations: analysis.sources.map((source, index) => ({
      citation: `[${index + 1}]`,
      id: source.id,
      title: source.title,
      type: source.type,
      status: source.status,
      origin: source.origin,
      datasetVersion: source.datasetVersion,
      period: source.period,
      excerpt: index < 10 ? source.excerpt.slice(0, 2000) : '',
      rowCount: source.rowIds?.length,
      rowIds: source.rowIds?.slice(0, 20),
      ...(source.type === 'name'
        ? { purpose: 'Kun officiel navnestavning. Ingen belæg for økonomital.' }
        : {}),
    })),
  };
}

function priorIllustrationSources(analysis: Analysis, previous?: Analysis) {
  if (
    analysis.basisKind !== 'illustration' ||
    !analysis.illustration ||
    previous?.basisKind !== 'illustration' ||
    !previous.illustration
  )
    return [];
  if (analysis.datasetVersion !== previous.datasetVersion)
    throw new ApiError(409, 'En illustrationsopfølgning skal bruge samme dataversion.');
  const compatible = previous.sources.filter(
    (source) =>
      source.type === 'demo' &&
      source.status === 'simulated' &&
      source.datasetVersion === analysis.datasetVersion &&
      !source.documentId &&
      !source.rowIds?.length,
  );
  const assumption = compatible.find((source) => source.origin === 'assumption');
  const calculation = compatible.find((source) => source.origin === 'calculation');
  return assumption && calculation ? [assumption, calculation] : [];
}

/** Add only the immediate owned predecessor's two illustration sources, keeping every current citation stable. */
export function withIllustrationHistorySources(analysis: Analysis, previous?: Analysis): Analysis {
  const priorSources = priorIllustrationSources(analysis, previous);
  const existing = new Set(analysis.sources.map((source) => source.id));
  const additions = priorSources.filter((source) => !existing.has(source.id));
  return additions.length
    ? {
        ...analysis,
        sources: [
          ...analysis.sources,
          ...additions.map((source) => ({
            ...source,
            title: `Tidligere illustration · ${source.title}`,
          })),
        ],
      }
    : analysis;
}

function illustrationHistoryEvidence(analysis: Analysis, previous?: Analysis) {
  const sources = priorIllustrationSources(analysis, previous);
  if (!sources.length || !previous?.illustration) return {};
  if (sources.some((source) => !analysis.sources.some((current) => current.id === source.id)))
    throw new ApiError(
      422,
      'Den tidligere illustrations kildehenvisninger mangler i opfølgningen.',
    );
  const sameScope =
    analysis.context.area === previous.context.area &&
    [...analysis.context.entityIds].sort().join('\n') ===
      [...previous.context.entityIds].sort().join('\n');
  const a = analysis.context.period,
    b = previous.context.period;
  return {
    previousQuestion: previous.question.slice(0, 2000),
    previousIllustration: {
      meaning:
        'Den umiddelbart foregående ejede illustration, ikke nødvendigvis samtalens oprindelige model.',
      context: previous.context,
      datasetVersion: previous.datasetVersion,
      sourceIds: sources.map((source) => source.id),
      sameScope,
      samePeriod: a.year === b.year && a.fromMonth === b.fromMonth && a.toMonth === b.toMonth,
      ...illustrationEvidence(previous.illustration),
    },
  };
}

/** Milli quantities and basis points are display scaling only; results were calculated by the domain builder. */
function illustrationEvidence(illustration: NonNullable<Analysis['illustration']>) {
  const { spec, calculation } = illustration;
  if (spec.kind === 'investment' && calculation.kind === 'investment')
    return {
      kind: spec.kind,
      title: spec.title,
      years: spec.years,
      assumptions: spec.assumptions,
      terms: spec.terms.map((term) => ({
        label: term.label,
        kind: term.kind,
        quantityUnit: term.quantityUnit,
        quantityFactors: term.quantityFactors.map((factor) => ({
          label: factor.label,
          value: value(factor.valueMilli / 1000, 'number'),
        })),
        divisor: term.divisor,
        unitValue: value(term.unitValueOre, 'ore'),
        cashRealization: value((term.cashRealizationBps || 0) / 100, 'percent'),
      })),
      calculation: {
        upfrontCost: value(calculation.upfrontCostOre, 'ore'),
        annualCost: value(calculation.annualCostOre, 'ore'),
        annualBenefitValue: value(calculation.annualBenefitValueOre, 'ore'),
        annualCashBenefit: value(calculation.annualCashBenefitOre, 'ore'),
        annualCapacityValue: value(calculation.annualCapacityValueOre, 'ore'),
        breakEvenYear: calculation.breakEvenYear,
        terms: calculation.terms.map((term) => ({
          label: term.label,
          kind: term.kind,
          quantity: value(term.quantityMilli / 1000, 'number', term.quantityUnit || 'antal'),
          amount: value(term.amountOre, 'ore'),
          cashAmount: value(term.cashAmountOre, 'ore'),
          capacityAmount: value(term.capacityAmountOre, 'ore'),
        })),
      },
    };
  if (spec.kind === 'activity' && calculation.kind === 'activity')
    return {
      kind: spec.kind,
      title: spec.title,
      years: spec.years,
      unit: spec.unit,
      assumptions: spec.assumptions,
      initialQuantity: value(spec.initialQuantityMilli / 1000, 'number', spec.unit),
      annualChange: value(spec.annualChangeBps / 100, 'percent'),
      calculation: {
        points: calculation.points.map((point) => ({
          year: point.year,
          quantity: value(point.quantityMilli / 1000, 'number', spec.unit),
        })),
      },
    };
  if (spec.kind === 'process' && calculation.kind === 'process')
    return {
      kind: spec.kind,
      title: spec.title,
      steps: spec.steps,
      assumptions: spec.assumptions,
      calculation: {
        stepCount: calculation.stepCount,
        meaning: 'Kun foreslået rækkefølge. Ingen målte effekter eller økonomiske beregninger.',
      },
    };
  throw new ApiError(422, 'Illustrationens model og beregningsresultat stemmer ikke overens.');
}
