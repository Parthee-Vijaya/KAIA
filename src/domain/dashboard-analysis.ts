import { analyze, assertAnalysisContext } from './analysis';
import { applyYearComparison, applyMunicipalBenchmark } from './comparisons';
import { applyMultiYearProjection } from './projections';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  CATEGORIES,
  hash,
  pupilsForYear,
  type Dataset,
} from './data';
import {
  allowedEntities,
  assertScope,
  canAccessDocument,
  canUseDetailedData,
  AccessDeniedError,
} from './policy';
import { suggestions } from './questions';
import { money } from './format';
import {
  dashboardAssumptionsSchema,
  dashboardQuerySchema,
  dashboardScopeSchema,
  type DashboardData,
  type DashboardPanel,
  type DashboardQuery,
  type DashboardScope,
} from './dashboard';
import type {
  AccessContext,
  Analysis,
  Category,
  ChartRow,
  ChartSpec,
  LedgerRow,
  Period,
  ScenarioAssumptions,
  SourceRef,
} from './types';

const months = [
  'januar',
  'februar',
  'marts',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'december',
];
const coverage = (dataset: Dataset) => dataset.coverage || { fromYear: 2023, toYear: 2028 };
const periodText = (period: Period) =>
  `${months[period.fromMonth - 1]}–${months[period.toMonth - 1]} ${period.year}`;
const missing = (
  reason: string,
  code = 'MISSING_COVERAGE',
  analysis?: Analysis,
): DashboardPanel => ({ status: 'missing', code, reason, ...(analysis ? { analysis } : {}) });
const unsupported = (reason: string, code: string): DashboardPanel => ({
  status: 'unsupported',
  code,
  reason,
});
const ready = (analysis: Analysis): DashboardPanel =>
  analysis.missingData
    ? missing(analysis.missingData, 'MISSING_COVERAGE', analysis)
    : {
        status: 'ready',
        analysis: {
          ...analysis,
          formulation: { provider: 'demo', model: 'Deterministisk analyse' },
        },
      };

/** The caller may request a scope, but only the validated server identity can authorize it. */
export function resolveDashboardScope(
  access: AccessContext,
  dataset: Dataset,
  input: DashboardQuery = {},
): DashboardScope {
  const query = dashboardQuerySchema.parse(input);
  if (query.datasetVersion && query.datasetVersion !== dataset.version)
    throw new Error('Dashboardet og datasættet skal bruge samme dataversion.');
  const available = allowedEntities(access, dataset.entities).filter(
    (entity) => entity.type !== 'committee',
  );
  const area =
    query.area ||
    (available.some((entity) => entity.area === 'schools') ? 'schools' : available[0]?.area);
  if (!area || !access.areas.includes(area) || !available.some((entity) => entity.area === area))
    throw new AccessDeniedError();
  const referenceYear = Number(dataset.referenceDate.slice(0, 4));
  const year = query.year ?? referenceYear;
  const scope = dashboardScopeSchema.parse({
    area,
    entityIds: [
      ...new Set(
        query.entityIds ||
          available.filter((entity) => entity.area === area).map((entity) => entity.id),
      ),
    ].sort(),
    period: {
      year,
      fromMonth: query.fromMonth ?? 1,
      toMonth:
        query.toMonth ?? (year > referenceYear ? 12 : Number(dataset.referenceDate.slice(5, 7))),
    },
  });
  validateScope(access, dataset, scope);
  return scope;
}

function validateScope(access: AccessContext, dataset: Dataset, input: DashboardScope): void {
  const scope = dashboardScopeSchema.parse(input);
  assertScope(access, scope.entityIds, dataset.entities, scope.area);
  if (
    new Set(scope.entityIds).size !== scope.entityIds.length ||
    scope.entityIds.some(
      (id) =>
        !dataset.entities.some(
          (entity) => entity.id === id && entity.area === scope.area && entity.type !== 'committee',
        ),
    )
  )
    throw new AccessDeniedError('Dashboardet kræver tilladte driftsenheder fra samme fagområde.');
  assertAnalysisContext(access, { ...scope, intent: 'budget' }, dataset.entities);
}

function exactAdd(total: number, amount: number) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total + amount))
    throw new Error('Dashboardets beløb kræver sikre heltal i øre.');
  return total + amount;
}

/** One request-local pass supplies all ordinary panel aggregates and completeness checks. */
function indexDataset(dataset: Dataset, scope: DashboardScope) {
  const ids = new Set(scope.entityIds),
    byYear = new Map<number, LedgerRow[]>(),
    amounts = new Map<string, number>();
  const referenceYear = Number(dataset.referenceDate.slice(0, 4)),
    referenceMonth = Number(dataset.referenceDate.slice(5, 7));
  const key = (
    entityId: string,
    year: number,
    month: number,
    category: Category,
    kind: LedgerRow['kind'],
  ) => `${entityId}|${year}|${month}|${category}|${kind}`;
  for (const row of dataset.rows) {
    if (!ids.has(row.entityId)) continue;
    if (row.datasetVersion !== dataset.version)
      throw new Error('Dashboardet må ikke blande dataversioner.');
    const group = byYear.get(row.year) || [];
    group.push(row);
    byYear.set(row.year, group);
    const k = key(row.entityId, row.year, row.month, row.category, row.kind);
    amounts.set(k, exactAdd(amounts.get(k) || 0, row.amountOre));
  }
  const observed = (year: number, month: number) =>
    year < referenceYear || (year === referenceYear && month <= referenceMonth);
  const complete = (period: Period, selected = scope.entityIds): boolean =>
    period.year >= coverage(dataset).fromYear &&
    period.year <= coverage(dataset).toYear &&
    selected.every((id) => {
      for (let month = period.fromMonth; month <= period.toMonth; month++)
        for (const category of CATEGORIES) {
          if (
            !amounts.has(key(id, period.year, month, category, 'budget')) ||
            !amounts.has(
              key(
                id,
                period.year,
                month,
                category,
                observed(period.year, month) ? 'actual' : 'forecast',
              ),
            )
          )
            return false;
        }
      return true;
    });
  const total = (
    period: Period,
    kind: 'budget' | 'outlook',
    selected = scope.entityIds,
    category?: Category,
  ): number => {
    let sum = 0;
    for (const id of selected)
      for (let month = period.fromMonth; month <= period.toMonth; month++)
        for (const c of category ? [category] : CATEGORIES)
          sum = exactAdd(
            sum,
            amounts.get(
              key(
                id,
                period.year,
                month,
                c,
                kind === 'budget' ? 'budget' : observed(period.year, month) ? 'actual' : 'forecast',
              ),
            ) || 0,
          );
    return sum;
  };
  const selected = (years: number[]): Dataset => ({
    ...dataset,
    rows: [...new Set(years)].flatMap((year) => byYear.get(year) || []),
    documents: [],
  });
  // Documents are attached only after the caller has applied its full role and unit policy.
  return { complete, total, selected, byYear };
}

function skeleton(dataset: Dataset, access: AccessContext, scope: DashboardScope): Analysis {
  return {
    analysisId: `DEMO-DASHBOARD-${hash(JSON.stringify({ user: access.userId, version: dataset.version, scope })).toString(16)}`,
    datasetVersion: dataset.version,
    question: 'Vis budgetstatus for den valgte afgrænsning.',
    title: `Budgetstatus · ${AREA_LABELS[scope.area].toLowerCase()}`,
    conclusion: '',
    narrative: [],
    metrics: [],
    sources: [],
    context: { ...scope, intent: 'budget', metric: 'net' },
    assumptions: [
      `Alle kommunale tal er simulerede. Dataversion ${dataset.version}; reference ${dataset.referenceDate}.`,
    ],
    followups: [],
  };
}

function withChart(
  base: Analysis,
  key: string,
  title: string,
  conclusion: string,
  rows: ChartRow[],
  type: ChartSpec['type'],
  series: ChartSpec['series'],
  access: AccessContext,
): Analysis {
  const id = `DEMO-DASHBOARD-${hash(JSON.stringify({ base: base.analysisId, key, rows })).toString(16)}`;
  const source: SourceRef = {
    id,
    title: `Simuleret beregningsgrundlag · ${title}`,
    type: 'demo',
    status: 'simulated',
    period: periodText(base.context.period),
    datasetVersion: base.datasetVersion,
    excerpt: `ALLE TAL ER SIMULEREDE. Samme tilladte enheder og periode som dashboardets budgetpanel. Dataversion ${base.datasetVersion}. Netto = udgifter + negative indtægter; afvigelse = regnskab/prognose minus periodiseret budget. Figurens eksakte værdier i øre: ${JSON.stringify(rows)}.`,
    ...(canUseDetailedData(access) && base.sources[0]?.rowIds
      ? { rowIds: base.sources[0].rowIds }
      : {}),
  };
  return {
    ...base,
    analysisId: id,
    title,
    conclusion: conclusion.replace(/\[1\]/g, `[${base.sources.length + 1}]`),
    question:
      key === 'category'
        ? 'Hvilke typer udgifter bidrager mest til afvigelsen?'
        : key === 'heatmap'
          ? 'Vis et heatmap over månedlige afvigelser.'
          : 'Sammenlign de valgte enheder.',
    renderedText: undefined,
    conversationId: undefined,
    context: { ...base.context, intent: key },
    metrics: base.metrics,
    sources: [...base.sources, source],
    chart: {
      type,
      title,
      rows,
      series,
      subtitle: `${periodText(base.context.period)} · kr. · simulerede data`,
      unit: 'ore',
      sourceIds: [id],
    },
  };
}

export function buildDashboard(
  dataset: Dataset,
  access: AccessContext,
  scope: DashboardScope,
): DashboardData {
  validateScope(access, dataset, scope);
  const index = indexDataset(dataset, scope);
  const scopedDocuments = dataset.documents.filter(
    (document) =>
      document.datasetVersion === dataset.version &&
      document.entityIds.every((id) => scope.entityIds.includes(id)) &&
      canAccessDocument(access, document, dataset.entities),
  );
  const dataFor = (years: number[]) => ({ ...index.selected(years), documents: scopedDocuments });
  const entities = dataset.entities.filter((entity) => scope.entityIds.includes(entity.id));
  const detail = canUseDetailedData(access),
    perPupil = scope.area === 'schools' && entities.every((entity) => entity.type === 'school');
  const selectedPupilCoverage = entities.every(
    (entity) =>
      Number.isSafeInteger(pupilsForYear(entity, scope.period.year)) &&
      pupilsForYear(entity, scope.period.year) > 0,
  );
  const areaIds = dataset.entities
    .filter((entity) => entity.area === scope.area && entity.type !== 'committee')
    .map((entity) => entity.id);
  const municipalBenchmark =
    areaIds.length === scope.entityIds.length &&
    areaIds.every((id) => scope.entityIds.includes(id));
  const annual = { ...scope.period, fromMonth: 1, toMonth: 12 };
  const periodComplete = index.complete(scope.period),
    annualComplete = index.complete(annual);
  const base =
    periodComplete && annualComplete
      ? analyze('Vis budgetstatus.', access, undefined, scope, dataFor([scope.period.year]))
      : skeleton(dataset, access, scope);
  const missingPeriod = missing(
    `Der mangler komplette budget- og regnskabs-/prognoseposter for alle tilladte enheder og udgiftskategorier i ${periodText(scope.period)}. Manglende data vises ikke som nul.`,
  );
  const budget =
    periodComplete && annualComplete
      ? ready(base)
      : !periodComplete
        ? missingPeriod
        : missing(
            'Helårsgrundlaget er ufuldstændigt. Budgetpanelets årsprognose kan derfor ikke beregnes sikkert.',
          );
  const priorPeriod = { ...scope.period, year: scope.period.year - 1 };
  const year =
    periodComplete && index.complete(priorPeriod)
      ? ready(
          applyYearComparison(
            {
              ...base,
              question: 'Sammenlign med sidste års data.',
              context: {
                ...scope,
                intent: 'yearComparison',
                metric: 'net',
                comparison: { kind: 'year', year: priorPeriod.year },
              },
            },
            dataFor([scope.period.year, priorPeriod.year]),
            access,
          ),
        )
      : missing(
          `Årssammenligningen kræver samme enheder, kontokategorier og måneder i ${priorPeriod.year} og ${scope.period.year}. Mindst én af perioderne mangler et komplet grundlag.`,
        );
  const referenceYear = Number(dataset.referenceDate.slice(0, 4)),
    endYear = 2032;
  const forecastYears = Array.from(
    { length: Math.max(0, endYear - referenceYear + 1) },
    (_, index) => referenceYear + index,
  );
  const forecastComplete =
    forecastYears.length > 0 &&
    forecastYears.every((year) => index.complete({ year, fromMonth: 1, toMonth: 12 }));
  const forecastContext = {
    ...scope,
    period: { year: referenceYear, fromMonth: 1, toMonth: 12 },
    intent: 'projection',
    projectionEndYear: endYear,
  };
  const forecast = forecastComplete
    ? ready(
        applyMultiYearProjection(
          {
            ...base,
            question: `Vis prognosen frem mod ${endYear}.`,
            context: { ...forecastContext, metric: 'net' },
          },
          dataFor(forecastYears),
          access,
          endYear,
        ),
      )
    : missing(
        `Dataversion ${dataset.version} mangler et komplet helårsgrundlag for prognosen ${referenceYear}–${endYear}. Prognosen følger referencedatoen og ikke budgetpanelets periodefilter.`,
      );
  const pupilCoverage = forecastYears.every((year) =>
    entities.every(
      (entity) =>
        Number.isSafeInteger(pupilsForYear(entity, year)) && pupilsForYear(entity, year) > 0,
    ),
  );
  const pupilForecast = !perPupil
    ? unsupported(
        'Udgift pr. elev findes kun for skoler med et syntetisk elevgrundlag.',
        'METRIC_UNAVAILABLE',
      )
    : !pupilCoverage
      ? missing(
          'Der mangler et gyldigt syntetisk elevtal for mindst én valgt skole i prognoseperioden.',
        )
      : forecastComplete
        ? ready(
            applyMultiYearProjection(
              {
                ...base,
                question: `Vis prognosen for udgift pr. elev frem til ${endYear}.`,
                context: { ...forecastContext, metric: 'perPupil' },
              },
              dataFor(forecastYears),
              access,
              endYear,
            ),
          )
        : missing(
            `Der mangler et komplet helårsgrundlag for prognosen pr. elev ${referenceYear}–${endYear}.`,
          );
  let waterfall = missingPeriod,
    heatmap: DashboardPanel = !detail
      ? unsupported(
          'Din politiske adgang omfatter aggregerede oplysninger. Varmekort på institutionsniveau vises ikke.',
          'ROLE_RESTRICTED',
        )
      : missingPeriod;
  let comparison: DashboardPanel = !detail
    ? unsupported(
        'Din politiske adgang omfatter aggregerede oplysninger. Institutionssammenligninger vises ikke.',
        'ROLE_RESTRICTED',
      )
    : missingPeriod;
  if (periodComplete) {
    let running = 0;
    const categories = CATEGORIES.map((category) => {
      const budget = index.total(scope.period, 'budget', scope.entityIds, category),
        actual = index.total(scope.period, 'outlook', scope.entityIds, category),
        value = actual - budget;
      const row = { label: CATEGORY_LABELS[category], budget, actual, value, start: running };
      running += value;
      return row;
    });
    const top = [...categories].sort((a, b) => b.value - a.value)[0];
    waterfall = ready(
      withChart(
        base,
        'category',
        'Bidrag til nettoafvigelsen',
        `${top.label} bidrager mest med ${money(top.value)}. Alle seks kategorier summerer til ${money(running)}. [1]`,
        categories,
        'waterfall',
        [{ key: 'value', label: 'Bidrag til afvigelse', color: '#bc4d30' }],
        access,
      ),
    );
    if (detail) {
      const heatRows = entities.map((entity) => ({
        label: entity.name,
        ...Object.fromEntries(
          Array.from({ length: scope.period.toMonth - scope.period.fromMonth + 1 }, (_, offset) => {
            const month = scope.period.fromMonth + offset,
              period = { ...scope.period, fromMonth: month, toMonth: month };
            return [
              `month${month}`,
              index.total(period, 'outlook', [entity.id]) -
                index.total(period, 'budget', [entity.id]),
            ];
          }),
        ),
      }));
      heatmap = ready(
        withChart(
          base,
          'heatmap',
          'Afvigelser pr. enhed og måned',
          `Varmekortet viser nettoafvigelser for de ${entities.length} tilladte driftsenheder. Positivt beløb betyder merforbrug. [1]`,
          heatRows,
          'heatmap',
          Array.from(
            { length: scope.period.toMonth - scope.period.fromMonth + 1 },
            (_, offset) => ({
              key: `month${scope.period.fromMonth + offset}`,
              label: months[scope.period.fromMonth + offset - 1],
              color: '#bc4d30',
            }),
          ),
          access,
        ),
      );
      const invalidPupils = perPupil && !selectedPupilCoverage;
      if (invalidPupils)
        comparison = missing(
          'Der mangler et gyldigt syntetisk elevtal for mindst én af de valgte skoler.',
        );
      else {
        const schoolYearFacts: Record<string, string | number | null>[] = [];
        const priorCompleteIds = new Set<string>();
        const compareRows = entities
          .map((entity) => {
            const budget = index.total(scope.period, 'budget', [entity.id]),
              actual = index.total(scope.period, 'outlook', [entity.id]);
            const variance = exactAdd(actual, -budget);
            const pupils = pupilsForYear(entity, scope.period.year);
            let history: Record<string, number | string | null> = {};
            if (perPupil) {
              const priorComplete = index.complete(priorPeriod, [entity.id]);
              const priorBudget = priorComplete
                ? index.total(priorPeriod, 'budget', [entity.id])
                : null;
              const priorOutlook = priorComplete
                ? index.total(priorPeriod, 'outlook', [entity.id])
                : null;
              const priorVariance =
                priorBudget !== null && priorOutlook !== null
                  ? exactAdd(priorOutlook, -priorBudget)
                  : null;
              const priorVarianceReason = priorComplete
                ? null
                : priorPeriod.year < coverage(dataset).fromYear ||
                    priorPeriod.year > coverage(dataset).toYear
                  ? `Dataversion ${dataset.version} dækker ${coverage(dataset).fromYear}–${coverage(dataset).toYear} og har intet grundlag for ${periodText(priorPeriod)} for ${entity.name}.`
                  : `Der mangler komplette budget- og regnskabs-/prognoseposter i mindst én kategori eller måned for ${entity.name} i ${periodText(priorPeriod)}. Sidste års afvigelse og ændringer kan derfor ikke beregnes; manglende data er ikke nul.`;
              history = {
                priorYear: priorPeriod.year,
                priorVariance,
                varianceChange: priorVariance === null ? null : exactAdd(variance, -priorVariance),
                varianceMagnitudeChange:
                  priorVariance === null
                    ? null
                    : exactAdd(Math.abs(variance), -Math.abs(priorVariance)),
                priorVarianceReason,
              };
              if (priorComplete) priorCompleteIds.add(entity.id);
              schoolYearFacts.push({
                entityId: entity.id,
                name: entity.name,
                currentBudgetOre: budget,
                currentOutlookOre: actual,
                currentVarianceOre: variance,
                priorBudgetOre: priorBudget,
                priorOutlookOre: priorOutlook,
                ...history,
              });
            }
            return {
              label: entity.name,
              budget: perPupil ? Math.round(budget / pupils) : budget,
              actual: perPupil ? Math.round(actual / pupils) : actual,
              variance,
              ...history,
              ...(perPupil ? { pupils } : {}),
            };
          })
          .sort((a, b) => (perPupil ? b.actual - a.actual : b.variance - a.variance));
        const result = withChart(
          base,
          'comparison',
          perPupil ? 'Sammenligning af udgift pr. elev' : 'Enhedernes budgetafvigelser',
          `Sammenligningen omfatter kun de valgte, tilladte enheder i ${periodText(scope.period)}${perPupil ? ' og hvert års eget syntetiske elevtal' : ''}. [1]`,
          compareRows,
          'bar',
          [
            { key: 'budget', label: 'Periodiseret budget', color: '#464f5e' },
            { key: 'actual', label: 'Forbrug / prognose', color: '#bc4d30' },
          ],
          access,
        );
        result.context.metric = perPupil ? 'perPupil' : 'net';
        if (perPupil) {
          result.chart!.subtitle += ' · pr. elev';
          result.question = 'Sammenlign udgift pr. elev på de valgte skoler.';
          const source = result.sources.find((item) => result.chart!.sourceIds.includes(item.id))!;
          const samples = new Map<string, string[]>();
          const counts = new Map<string, number>();
          for (const period of [priorPeriod, scope.period])
            for (const row of index.byYear.get(period.year) || []) {
              if (
                row.month < period.fromMonth ||
                row.month > period.toMonth ||
                (period.year === priorPeriod.year && !priorCompleteIds.has(row.entityId))
              )
                continue;
              const isObserved =
                row.year < referenceYear ||
                (row.year === referenceYear &&
                  row.month <= Number(dataset.referenceDate.slice(5, 7)));
              if (row.kind !== 'budget' && row.kind !== (isObserved ? 'actual' : 'forecast'))
                continue;
              const series = `${period.year}:${row.kind}`;
              counts.set(series, (counts.get(series) || 0) + 1);
              const examples = samples.get(series) || [];
              if (examples.length < 2) examples.push(row.id);
              samples.set(series, examples);
            }
          source.period = `${periodText(priorPeriod)} og ${periodText(scope.period)}`;
          source.rowIds = [...new Set([...samples.values()].flat())];
          source.observedAt = dataset.referenceDate;
          source.excerpt += ` Skolernes historiksammenligning bruger præcis samme tilladte skole-ID og måneder i begge år: ${periodText(priorPeriod)} mod ${periodText(scope.period)}, samme dataversion ${dataset.version}. Alle historikbeløb samt variance er rå samlede skolebeløb i heltalsøre, ikke pr. elev; figurens budget og actual for skoler er særskilt normaliseret med det aktuelle års elevtal. Afvigelse = regnskab/prognose minus periodiseret budget. varianceChange = årets afvigelse minus sidste års afvigelse, med fortegn. varianceMagnitudeChange = absolutværdien af årets afvigelse minus absolutværdien af sidste års afvigelse: positiv betyder større afvigelse fra budget, negativ betyder mindre afvigelse, også ved mindreforbrug eller fortegnsskift. Der bruges actual til og med reference ${dataset.referenceDate} og forecast derefter, aldrig begge i samme måned; budget udvælges separat. Manglende eller ufuldstændig historik er null med en konkret forklaring, aldrig et nulbeløb. Beregningsgrundlag pr. skole i øre, med null ved ufuldstændig historik: ${JSON.stringify(schoolYearFacts)}. Antal relevante posteringer pr. år og serie: ${JSON.stringify(Object.fromEntries(counts))}. rowIds er et repræsentativt udsnit af tilladte budget-/regnskabs-/prognoseposter fra perioderne med komplet grundlag; de er ikke hele udtrækket. Ufuldstændige historikperioder er ikke medtaget som et fuldt grundlag.`;
        }
        comparison = ready(result);
      }
    }
  }
  const peer = !municipalBenchmark
    ? unsupported(
        'Et kommunebenchmark kræver hele fagområdet. En institutionsafgrænsning opskaleres ikke til en fiktiv kommune.',
        'WHOLE_AREA_REQUIRED',
      )
    : !periodComplete
      ? missingPeriod
      : perPupil && !selectedPupilCoverage
        ? missing(
            'Der mangler et gyldigt syntetisk elevtal for mindst én skole i kommunebenchmarkets lokale grundlag.',
          )
        : ready(
            applyMunicipalBenchmark(
              {
                ...base,
                question: 'Sammenlign med en sammenlignelig kommune.',
                context: {
                  ...scope,
                  intent: 'municipalBenchmark',
                  metric: perPupil ? 'perPupil' : 'perCapita',
                  comparison: { kind: 'municipality' },
                },
              },
              dataFor([scope.period.year]),
              access,
            ),
          );
  return {
    dataset: {
      version: dataset.version,
      referenceDate: dataset.referenceDate,
      coverage: coverage(dataset),
      status: 'simulated',
    },
    scope,
    capabilities: { detail, perPupil, municipalBenchmark },
    suggestions: suggestions({ ...access, areas: [scope.area], unitIds: scope.entityIds }),
    panels: {
      budget,
      year,
      forecast,
      perPupil: pupilForecast,
      waterfall,
      heatmap,
      peer,
      comparison,
    },
  };
}

/** A transient, server-computed scenario; an ordinary analyze request is required before saving it. */
export function buildDashboardScenario(
  dataset: Dataset,
  access: AccessContext,
  scope: DashboardScope,
  assumptions: ScenarioAssumptions,
): Analysis {
  validateScope(access, dataset, scope);
  const validated = dashboardAssumptionsSchema.parse(assumptions);
  const referenceYear = Number(dataset.referenceDate.slice(0, 4)),
    referenceMonth = Number(dataset.referenceDate.slice(5, 7));
  if (
    validated.horizon === 'remaining' &&
    (scope.period.year < referenceYear ||
      (scope.period.year === referenceYear && referenceMonth === 12))
  )
    throw new Error(
      'Der er ingen resterende prognosemåneder i det valgte år. Vælg en eksplicit helårsvirkning for et historisk år.',
    );
  const index = indexDataset(dataset, scope),
    annual = { ...scope.period, fromMonth: 1, toMonth: 12 };
  if (!index.complete(annual))
    throw new Error(
      'Scenariet mangler komplette budget- og regnskabs-/prognoseposter for hele det valgte år. Manglende data erstattes ikke af nul.',
    );
  const scoped = {
    ...index.selected([scope.period.year]),
    documents: dataset.documents.filter(
      (document) =>
        document.datasetVersion === dataset.version &&
        document.entityIds.every((id) => scope.entityIds.includes(id)) &&
        canAccessDocument(access, document, dataset.entities),
    ),
  };
  const analysis = analyze(
    'Vis baseline og scenarie i samme graf.',
    access,
    undefined,
    { ...scope, scenario: validated },
    scoped,
  );
  return {
    ...analysis,
    conversationId: undefined,
    formulation: { provider: 'demo', model: 'Deterministisk analyse' },
  };
}
