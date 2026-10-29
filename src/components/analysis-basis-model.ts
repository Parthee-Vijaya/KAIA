import type { Analysis, ChartSpec, Metric, PublicEntity, SourceRef } from '@/domain/types';
import { sourceLabel } from './source-label';

export interface BasisValue {
  label: string;
  value: number;
  unit: 'ore' | 'number' | 'percent' | 'perPupil' | 'perCapita';
  displayUnit?: string;
}
export interface BasisFormula {
  title: string;
  expression: string;
  values: BasisValue[];
  result?: BasisValue;
  note?: string;
  sourceIds: string[];
}
export interface BasisSource {
  source: SourceRef;
  citation: number;
  compatible: boolean;
  kind: string;
}
export interface AnalysisBasisModel {
  family: string;
  area: string;
  selectedPeriod: string;
  calculationPeriod: string;
  version: string;
  units: { id: string; name?: string }[];
  sources: BasisSource[];
  formulas: BasisFormula[];
  metrics: BasisValue[];
  parameters: { label: string; value: number }[];
  coverage: { label: string; actual: number; forecast: number }[];
  assumptions: string[];
  notes: string[];
  problems: string[];
  chart?: ChartSpec;
  missing?: string;
}

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
const areas = {
  schools: 'Skoleområdet',
  facilities: 'Kultur og idræt',
  social: 'Social og beskæftigelse',
  health: 'Ældre og sundhed',
  environment: 'Teknik, natur og miljø',
  administration: 'Administration',
  preparedness: 'Samfundssikkerhed og beredskab',
};
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const normalizedUnit = (analysis: Analysis): BasisValue['unit'] =>
  analysis.context.metric === 'perPupil'
    ? 'perPupil'
    : analysis.context.metric === 'perCapita'
      ? 'perCapita'
      : 'ore';
function period(analysis: Analysis, year = analysis.context.period.year) {
  const { fromMonth, toMonth } = analysis.context.period;
  const from = months[fromMonth - 1],
    to = months[toMonth - 1];
  return `${from === to ? from : `${from}–${to}`} ${year}`;
}
function sum(values: unknown[]): number | undefined {
  if (!values.every(integer)) return;
  const result = Number(
    values.reduce<bigint>((total, value) => total + BigInt(value as number), 0n),
  );
  return Number.isSafeInteger(result) ? result : undefined;
}
function money(label: string, value: number, unit: BasisValue['unit'] = 'ore'): BasisValue {
  return { label, value, unit };
}
function metricValue(metric: Metric): BasisValue {
  const normalization = `${metric.label} ${metric.description || ''}`;
  return {
    label: metric.label,
    value: metric.value,
    ...(metric.displayUnit ? { displayUnit: metric.displayUnit } : {}),
    unit:
      metric.unit === 'ore'
        ? /pr\.?\s*elev|kr\.\/elev/i.test(normalization)
          ? 'perPupil'
          : /pr\.?\s*indbygger|kr\.\/indbygger/i.test(normalization)
            ? 'perCapita'
            : 'ore'
        : metric.unit,
  };
}
function family(analysis: Analysis): string {
  if (analysis.missingData) return 'missing';
  if (analysis.basisKind === 'illustration')
    return `illustration-${analysis.illustration?.spec.kind || 'missing'}`;
  if (analysis.context.intent === 'documents') return 'documents';
  if (analysis.scenario) return 'scenario';
  if (analysis.context.intent === 'projection') return 'projection';
  if (analysis.context.comparison?.kind === 'municipality') return 'peer';
  if (analysis.context.comparison?.kind === 'year') return 'year';
  if (analysis.context.intent === 'category') return 'category';
  if (analysis.context.intent === 'pricequantity') return 'pricequantity';
  if (analysis.context.intent === 'demography') return 'demography';
  if (analysis.context.metric === 'perPupil' || analysis.context.metric === 'perCapita')
    return 'normalized';
  if (analysis.context.intent === 'forecast') return 'forecast';
  return 'budget';
}

/** Presentation only: uses the saved analysis and never loads data, infers rights or reconstructs missing inputs. */
export function buildAnalysisBasis(
  analysis: Analysis,
  entities: PublicEntity[] = [],
): AnalysisBasisModel {
  const problems: string[] = [];
  const illustrative = analysis.basisKind === 'illustration';
  const sources = analysis.sources.map((source, index) => ({
    source,
    citation: index + 1,
    compatible: source.datasetVersion === analysis.datasetVersion,
    kind: source.origin
      ? sourceLabel(source)
      : source.type === 'name'
        ? 'Navnekilde'
        : source.type === 'context'
          ? 'Kontekst'
          : source.documentId
            ? 'Dokument'
            : 'Beregningsgrundlag',
  }));
  const evidence = new Set(
    sources
      .filter(
        (item) =>
          item.compatible &&
          item.source.type !== 'name' &&
          (illustrative
            ? item.source.origin === 'assumption' || item.source.origin === 'calculation'
            : !item.source.origin) &&
          sources.filter((candidate) => candidate.source.id === item.source.id).length === 1,
      )
      .map((item) => item.source.id),
  );
  const hasAssumptions = sources.some(
    (item) => evidence.has(item.source.id) && item.source.origin === 'assumption',
  );
  const supported = (ids: string[]) =>
    ids.length > 0 &&
    ids.every((id) => evidence.has(id)) &&
    (!illustrative ||
      (hasAssumptions &&
        ids.some((id) =>
          sources.some((item) => item.source.id === id && item.source.origin === 'calculation'),
        )));
  if (sources.some((item) => !item.compatible))
    problems.push('En kilde tilhører en anden dataversion og bruges ikke i forklaringen.');
  if (new Set(sources.map((item) => item.source.id)).size !== sources.length)
    problems.push(
      'Gentagne kilde-ID’er gør henvisningerne tvetydige og bruges ikke i beregningerne.',
    );
  const chart = analysis.chart;
  let validChart = chart;
  if (
    chart &&
    (!supported(chart.sourceIds) ||
      (chart.type === 'flow'
        ? !illustrative ||
          chart.rows.some(
            (row) => typeof row.label !== 'string' || typeof row.description !== 'string',
          )
        : chart.rows.some((row) =>
            chart.series.some(
              (series) =>
                row[series.key] !== null &&
                (chart.unit === 'ore' ? !integer(row[series.key]) : !number(row[series.key])),
            ),
          )))
  ) {
    validChart = undefined;
    problems.push(
      'Figurens værdier eller kildehenvisninger kan ikke bekræftes i denne dataversion.',
    );
  }
  const validMetrics = analysis.metrics.filter(
    (metric) =>
      supported(metric.sourceIds) &&
      (metric.unit === 'ore' ? integer(metric.value) : number(metric.value)),
  );
  if (!analysis.missingData && validMetrics.length !== analysis.metrics.length)
    problems.push('Nøgletal uden et gyldigt beregningsgrundlag er udeladt.');
  const kind = family(analysis);
  const rows = validChart?.rows || [];
  const ids = validChart?.sourceIds || validMetrics.flatMap((metric) => metric.sourceIds);
  const formulas: BasisFormula[] = [];
  const notes: string[] = [];
  const unit = normalizedUnit(analysis);
  const coverage: AnalysisBasisModel['coverage'] = [];
  for (const row of rows)
    if (
      integer(row.actualMonths) &&
      integer(row.forecastMonths) &&
      row.actualMonths >= 0 &&
      row.forecastMonths >= 0 &&
      row.actualMonths + row.forecastMonths === 12
    )
      coverage.push({ label: row.label, actual: row.actualMonths, forecast: row.forecastMonths });
  if (
    !coverage.length &&
    rows.length &&
    rows.every((row) => months.includes(row.label.toLocaleLowerCase('da-DK')))
  ) {
    const actual = rows.filter(
      (row) => row.observed === 1 || (integer(row.actual) && row.forecast === null),
    ).length;
    const forecast = rows.filter(
      (row) => row.observed === 0 || (integer(row.forecast) && row.actual === null),
    ).length;
    if (actual + forecast === rows.length)
      coverage.push({ label: String(analysis.context.period.year), actual, forecast });
  }
  let calculationPeriod = illustrative ? 'Ingen beregningsperiode medsendt' : period(analysis);
  let validIllustration = !illustrative;
  if (
    kind === 'projection' &&
    rows.length &&
    /^20\d{2}$/.test(rows[0].label) &&
    /^20\d{2}$/.test(rows.at(-1)!.label)
  )
    calculationPeriod = `${rows[0].label}–${rows.at(-1)!.label} · hele kalenderår`;
  else if (
    (kind === 'scenario' || kind === 'forecast') &&
    rows.length === 12 &&
    rows.every((row) => months.includes(row.label.toLocaleLowerCase('da-DK')))
  )
    calculationPeriod = `januar–december ${analysis.context.period.year}`;
  else if (kind === 'year' && integer(analysis.context.comparison?.year))
    calculationPeriod = `${period(analysis, analysis.context.comparison!.year)} og ${period(analysis)}`;

  if (illustrative && !analysis.missingData) {
    const illustration = analysis.illustration;
    if (
      !illustration ||
      illustration.version !== 1 ||
      illustration.spec.kind !== illustration.calculation.kind ||
      !hasAssumptions ||
      !supported(ids)
    )
      problems.push('Illustrationen mangler et entydigt antagelses- og beregningsgrundlag.');
    else if (
      illustration.spec.kind === 'investment' &&
      illustration.calculation.kind === 'investment'
    ) {
      const spec = illustration.spec,
        calculation = illustration.calculation;
      validIllustration =
        spec.terms.length === calculation.terms.length &&
        [
          calculation.upfrontCostOre,
          calculation.annualCostOre,
          calculation.annualBenefitValueOre,
          calculation.annualCashBenefitOre,
          calculation.annualCapacityValueOre,
        ].every(integer);
      for (const [index, term] of spec.terms.entries()) {
        const result = calculation.terms[index];
        if (
          !result ||
          result.label !== term.label ||
          result.kind !== term.kind ||
          ![
            result.amountOre,
            result.cashAmountOre,
            result.capacityAmountOre,
            term.unitValueOre,
          ].every(integer) ||
          term.quantityFactors.some((factor) => !integer(factor.valueMilli))
        ) {
          problems.push('En beregningsterm kan ikke knyttes entydigt til sine forudsætninger.');
          continue;
        }
        formulas.push({
          title: term.label,
          expression:
            term.quantityFactors
              .map((factor) =>
                formatBasisValue({ value: factor.valueMilli / 1000, unit: 'number' }),
              )
              .join(' × ') +
            (term.divisor === 1 ? '' : ` ÷ ${term.divisor}`) +
            ` × ${formatBasisValue({ value: term.unitValueOre, unit: 'ore' })}`,
          values: [
            ...term.quantityFactors.map((factor) => ({
              label: factor.label,
              value: factor.valueMilli / 1000,
              unit: 'number' as const,
            })),
            ...(integer(result.quantityMilli)
              ? [
                  {
                    label: 'Beregnet mængde',
                    value: result.quantityMilli / 1000,
                    unit: 'number' as const,
                    ...(result.quantityUnit ? { displayUnit: result.quantityUnit } : {}),
                  },
                ]
              : []),
            money('Værdi pr. enhed', term.unitValueOre),
          ],
          result: money('Beregnet beløb', result.amountOre),
          sourceIds: ids,
          note:
            term.kind === 'annualBenefit'
              ? `Kontant realisering: ${formatBasisValue({ value: result.cashAmountOre, unit: 'ore' })}. Øvrig kapacitetsværdi: ${formatBasisValue({ value: result.capacityAmountOre, unit: 'ore' })}. Kapacitetsværdi er ikke automatisk en budgetbesparelse.`
              : term.kind === 'upfrontCost'
                ? 'Engangsomkostning ved illustrationens start.'
                : 'Tilbagevendende omkostning pr. år i illustrationen.',
        });
        if (term.kind === 'annualBenefit')
          formulas.push({
            title: `${term.label} · kontant effekt`,
            expression:
              term.quantityFactors
                .map((factor) =>
                  formatBasisValue({ value: factor.valueMilli / 1000, unit: 'number' }),
                )
                .join(' × ') +
              (term.divisor === 1 ? '' : ` ÷ ${term.divisor}`) +
              ` × ${formatBasisValue({ value: term.unitValueOre, unit: 'ore' })} × ${formatBasisValue({ value: (term.cashRealizationBps || 0) / 100, unit: 'percent' })}`,
            values: [
              {
                label: 'Antaget kontant realiseringsandel',
                value: (term.cashRealizationBps || 0) / 100,
                unit: 'percent',
              },
            ],
            result: money('Antaget kontant effekt', result.cashAmountOre),
            note: 'Serveren bruger det samme uafrundede produkt og afrunder først efter realiseringsandelen. Den afrundede gevinstværdi ovenfor genbruges ikke som beregningsinput.',
            sourceIds: ids,
          });
      }
      const last = rows.at(-1);
      if (
        [
          calculation.upfrontCostOre,
          calculation.annualCostOre,
          calculation.annualCashBenefitOre,
          calculation.annualCapacityValueOre,
        ].every(integer) &&
        integer(last?.cumulative)
      )
        formulas.push({
          title: 'Samlet kontant forløb',
          expression:
            '− startomkostning + sum af årlige kontante gevinster − sum af årlige driftsomkostninger',
          values: [
            money('Startomkostning', calculation.upfrontCostOre),
            money('Årlig driftsomkostning', calculation.annualCostOre),
            money('Årlig kontant gevinst', calculation.annualCashBenefitOre),
            money('Årlig kapacitetsværdi, holdt særskilt', calculation.annualCapacityValueOre),
          ],
          result: money(`${last.label} · akkumuleret kontant resultat`, last.cumulative),
          note: 'Resultatet leveres af serverberegningen. Kapacitetsværdi indgår ikke i den kontante tilbagebetaling.',
          sourceIds: ids,
        });
      calculationPeriod = rows.length
        ? `${rows[0].label}–${rows.at(-1)!.label} · ${spec.years} år`
        : `${spec.years} år fra illustrationens start`;
    } else if (
      illustration.spec.kind === 'activity' &&
      illustration.calculation.kind === 'activity'
    ) {
      const spec = illustration.spec,
        last = illustration.calculation.points.at(-1);
      if (
        integer(spec.initialQuantityMilli) &&
        integer(spec.annualChangeBps) &&
        integer(last?.quantityMilli)
      ) {
        validIllustration = true;
        formulas.push({
          title: 'Aktivitet fra år til år',
          expression: 'Niveau i år t = startmængde × (1 + årlig ændring / 100)^t',
          values: [
            {
              label: 'Startmængde',
              value: spec.initialQuantityMilli / 1000,
              unit: 'number',
              displayUnit: spec.unit,
            },
            { label: 'Årlig ændring', value: spec.annualChangeBps / 100, unit: 'percent' },
          ],
          result: {
            label: `År ${last.year}`,
            value: last.quantityMilli / 1000,
            unit: 'number',
            displayUnit: spec.unit,
          },
          note: `t = 0 er startåret. Hvert punkt beregnes direkte fra startmængden og afrundes til 0,001 ${spec.unit}; tidligere afrundede punkter genbruges ikke. Der er ikke hentet en observeret aktivitetsserie.`,
          sourceIds: ids,
        });
      }
      calculationPeriod = illustration.calculation.points.length
        ? `${illustration.calculation.points[0].year}–${last!.year} · ${spec.years} år`
        : `${spec.years} år fra illustrationens start`;
    } else if (
      illustration.spec.kind === 'process' &&
      illustration.calculation.kind === 'process'
    ) {
      validIllustration = illustration.calculation.stepCount === illustration.spec.steps.length;
      if (validIllustration)
        formulas.push({
          title: 'Kvalitativt procesforløb',
          expression: 'De beskrevne trin følges i den viste rækkefølge.',
          values: [],
          note: 'Pile viser rækkefølge. Figuren indeholder ingen målte effekter, økonomiske resultater eller scores.',
          sourceIds: ids,
        });
      calculationPeriod = 'Ingen måleperiode · kvalitativt forløb';
    }
    notes.push(
      'Forudsætningerne er foreslået til denne illustration. De dokumenterer ikke kommunens faktiske økonomi eller observerede aktiviteter.',
    );
    if (!validIllustration && !problems.length)
      problems.push('Illustrationens strukturerede resultat kan ikke bekræftes.');
  } else if (!analysis.missingData && kind === 'scenario' && analysis.scenario) {
    const scenario = analysis.scenario;
    if (
      supported(ids) &&
      [scenario.baselineOre, scenario.scenarioOre, scenario.deltaOre].every(integer) &&
      sum([scenario.baselineOre, scenario.deltaOre]) === scenario.scenarioOre
    )
      formulas.push({
        title: 'Fra baseline til scenarie',
        expression: 'Baseline + ændring = scenarie',
        values: [money('Baseline', scenario.baselineOre), money('Ændring', scenario.deltaOre)],
        result: money('Scenarie', scenario.scenarioOre),
        note:
          scenario.assumptions.horizon === 'remaining'
            ? 'Ændringen gælder de resterende prognosemåneder. Baseline dækker hele året.'
            : 'Helårsvirkningen er et særskilt scenarie. Det oprindelige regnskab bevares.',
        sourceIds: ids,
      });
    else problems.push('Scenariets baseline, ændring og resultat kan ikke afstemmes.');
    notes.push(
      'Procentændringer påvirker de relevante konti. Budgettilpasningen ændrer rammen særskilt og er ikke i sig selv en besparelse.',
    );
  } else if (
    !analysis.missingData &&
    (kind === 'year' || kind === 'peer') &&
    rows.length === 2 &&
    rows.every((row) => integer(row.value))
  ) {
    const left = kind === 'year' ? rows[1] : rows[0],
      right = kind === 'year' ? rows[0] : rows[1];
    const delta = sum([left.value, -Number(right.value)]);
    if (delta !== undefined)
      formulas.push({
        title: kind === 'year' ? 'Forskel for de samme måneder' : 'Forskel mellem de to grundlag',
        expression: `${left.label} − ${right.label}`,
        values: [
          money(left.label, Number(left.value), unit),
          money(right.label, Number(right.value), unit),
        ],
        result: money('Forskel', delta, unit),
        sourceIds: ids,
      });
    notes.push(
      kind === 'year'
        ? 'Begge år bruger den samme enhedsafgrænsning og de samme måneder.'
        : 'De to kommuner sammenlignes for samme område og måneder. Normalisering og strukturantagelser fremgår af grundlaget.',
    );
    if (unit !== 'ore')
      notes.push(
        'Hver periode normaliseres med sit eget elev- eller indbyggertal. En nævner, der ikke er medsendt som et felt, aflæses i beregningskilden.',
      );
  } else if (
    !analysis.missingData &&
    kind === 'category' &&
    rows.length &&
    rows.every((row) => integer(row.value))
  ) {
    const total = sum(rows.map((row) => row.value));
    if (total !== undefined)
      formulas.push({
        title: 'Kontiene forklarer beløbsforskellen',
        expression: 'Sum af kontobidrag = nettoafvigelse',
        values: rows.map((row) => money(row.label, Number(row.value))),
        result: money('Nettoafvigelse', total),
        note: 'Et kontobidrag er regnskab/prognose minus samme kontos periodiserede budget. Det er en regneforklaring, ikke i sig selv en dokumenteret årsag.',
        sourceIds: ids,
      });
  } else if (!analysis.missingData && kind === 'projection' && rows.length) {
    const first = rows[0];
    formulas.push({
      title: unit === 'perPupil' ? 'Årsbasis pr. elev' : 'Årsbasis',
      expression:
        unit === 'perPupil'
          ? '(Realiseret netto + forventet netto) / årets elever'
          : 'Realiseret netto + forventet netto = årsbase',
      values: [],
      ...(integer(first.base)
        ? { result: money(`${first.label} · årsbase`, first.base, unit) }
        : {}),
      sourceIds: ids,
      note:
        unit === 'perPupil'
          ? 'Der divideres efter sammenlægning af årets rå nettobeløb. Afrundede delserier må ikke bruges til at rekonstruere nettosummen.'
          : 'Realiserede og forventede poster hører til forskellige måneder; samme måned tælles én gang.',
    });
    if (
      unit === 'ore' &&
      integer(first.actual) &&
      integer(first.forecast) &&
      sum([first.actual, first.forecast]) === first.base
    )
      formulas[0].values = [money('Realiseret', first.actual), money('Forventet', first.forecast)];
    if (unit === 'perPupil' && integer(first.pupils))
      formulas[0].values = [
        { label: `${first.label} · elever`, value: first.pupils, unit: 'number' },
      ];
    notes.push(
      'Budget, basis, lavt og højt er separate, leverede serier. Lavt/højt følger følsomhedsantagelserne; de udgør ikke et statistisk konfidensinterval.',
    );
  } else if (!analysis.missingData && kind === 'normalized') {
    const row = rows.at(-1);
    const normalized = row?.value ?? row?.actual;
    const numerator = row?.amountOre;
    const divisor = unit === 'perPupil' ? row?.pupils : undefined;
    formulas.push({
      title: unit === 'perPupil' ? 'Nettoudgift pr. elev' : 'Nettoudgift pr. indbygger',
      expression:
        unit === 'perPupil' ? 'Nettoudgift / årets elevtal' : 'Nettoudgift / årets indbyggertal',
      values: [
        ...(integer(numerator) ? [money('Nettoudgift før division', numerator)] : []),
        ...(integer(divisor) && divisor > 0
          ? [{ label: 'Elever', value: divisor, unit: 'number' as const }]
          : []),
      ],
      ...(integer(normalized) ? { result: money(row?.label || 'Nøgletal', normalized, unit) } : {}),
      note:
        !integer(numerator) || !integer(divisor)
          ? 'Ikke alle rå input er medsendt som selvstændige felter. De aflæses i beregningskilden; et afrundet nøgletal bruges ikke til at genskabe den manglende nettosum.'
          : 'Samme enheder, måneder og års elevtal bruges i tæller og nævner. Resultatet er afrundet efter division.',
      sourceIds: ids,
    });
  } else if (!analysis.missingData && kind === 'pricequantity') {
    formulas.push({
      title: 'Pris, mængde og samspil',
      expression: 'Priseffekt + mængdeeffekt + samspil + øvrig forskel',
      values: validMetrics.filter((metric) => metric.unit === 'ore').map(metricValue),
      sourceIds: ids,
      note: 'De lokale fakturapar og deres priser/mængder aflæses i kilden. Et generelt prisindeks er kontekst og erstatter ikke fakturagrundlaget.',
    });
  } else if (!analysis.missingData && kind === 'demography') {
    formulas.push({
      title: 'Aktivitet og variable udgifter',
      expression: 'Ændret relevant aldersgruppe → aktivitet → variable omkostninger',
      values: validMetrics.map(metricValue),
      sourceIds: ids,
      note: 'Faste udgifter og kapacitet er særskilte forhold. Befolkningsændringen omsættes ikke automatisk til en proportional budgetbesparelse.',
    });
  } else if (!analysis.missingData && kind !== 'documents') {
    const budget = validMetrics.find((metric) =>
      /^(periodiseret budget|helårsbudget|energibudget)$/i.test(metric.label),
    );
    const consumption = validMetrics.find((metric) =>
      /^(forbrug \/ prognose|årsprognose|energiudgifter)$/i.test(metric.label),
    );
    const expectedDelta =
      budget && consumption ? sum([consumption.value, -budget.value]) : undefined;
    if (budget && consumption && expectedDelta !== undefined)
      formulas.push({
        title: 'Afvigelse fra budgettet',
        expression: 'Forbrug / prognose − budget = afvigelse',
        values: [metricValue(consumption), metricValue(budget)],
        result: money('Afvigelse', expectedDelta),
        sourceIds: [...new Set([...budget.sourceIds, ...consumption.sourceIds])],
        note: 'Positive udgifter og negative indtægter indgår i netto. Positiv afvigelse betyder merforbrug.',
      });
  }
  if (!analysis.missingData && kind !== 'documents' && !formulas.length)
    notes.push(
      'Svaret indeholder ingen fuld, struktureret regneformel. De medsendte nøgletal og kilder vises uden at opfinde manglende input.',
    );
  const parameters: AnalysisBasisModel['parameters'] = [];
  const assumptions = analysis.scenario?.assumptions;
  if (assumptions) {
    const labels = {
      energyPercent: 'Energipris',
      salaryPercent: 'Lønomkostninger',
      substitutePercent: 'Vikarforbrug',
      pupilsPercent: 'Elevtal',
      budgetPercent: 'Budgetramme',
      maintenancePercent: 'Vedligehold',
    };
    for (const [key, label] of Object.entries(labels)) {
      const value = assumptions[key as keyof typeof labels];
      if (number(value)) parameters.push({ label, value });
    }
  }
  return {
    family: kind,
    area: illustrative ? 'Illustrationens afgrænsning' : areas[analysis.context.area],
    selectedPeriod: illustrative ? calculationPeriod : period(analysis),
    calculationPeriod,
    version: analysis.datasetVersion,
    units: (illustrative ? [] : [...new Set(analysis.context.entityIds)]).map((id) => ({
      id,
      name: entities.find((entity) => entity.id === id)?.name,
    })),
    sources,
    formulas: validIllustration ? formulas : [],
    metrics:
      analysis.missingData || !validIllustration || kind === 'illustration-process'
        ? []
        : validMetrics.map((metric) => {
            const value = metricValue(metric);
            // Comparison differences inherit their normalized series unit; other totals stay raw.
            return (kind === 'year' || kind === 'peer') &&
              metric.label === 'Forskel' &&
              metric.unit === 'ore' &&
              (unit === 'perPupil' || unit === 'perCapita')
              ? { ...value, unit }
              : value;
          }),
    parameters,
    coverage,
    assumptions: [...analysis.assumptions],
    notes,
    problems,
    chart: analysis.missingData || !validIllustration ? undefined : validChart,
    ...(analysis.missingData ? { missing: analysis.missingData } : {}),
  };
}

export function formatBasisValue(
  value: Pick<BasisValue, 'value' | 'unit' | 'displayUnit'>,
): string {
  const monetary = ['ore', 'perPupil', 'perCapita'].includes(value.unit);
  const formatted = new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: monetary ? 2 : 0,
    maximumFractionDigits:
      monetary || value.unit === 'percent' ? 2 : !Number.isInteger(value.value) ? 3 : 0,
  }).format(monetary ? value.value / 100 : value.value);
  return (
    formatted +
    (value.unit === 'perPupil'
      ? ' kr./elev'
      : value.unit === 'perCapita'
        ? ' kr./indbygger'
        : value.unit === 'ore'
          ? ' kr.'
          : value.unit === 'percent'
            ? ' %'
            : value.displayUnit
              ? ` ${value.displayUnit}`
              : '')
  );
}
