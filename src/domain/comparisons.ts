import { AREA_LABELS, CATEGORIES, hash, pupilsForYear, type Dataset } from './data';
import { KALUNDBORG_MUNICIPALITY_ID, selectMunicipalPeers } from './municipalities';
import { AccessDeniedError, allowedEntities, assertScope, isCouncilOnly } from './policy';
import type { AccessContext, Analysis, AnalysisContext, Entity, Metric, SourceRef } from './types';

type ComparisonMetric = 'net' | 'energy' | 'perPupil' | 'perCapita';
type ComparisonContext = AnalysisContext & {
  metric?: ComparisonMetric;
  comparison?: { kind: 'year' | 'municipality'; year?: number; municipalityId?: string };
};
interface Facts {
  year: number;
  totalOre: number;
  actualOre: number;
  forecastOre: number;
  budgetOre: number;
  denominator: number;
  valueOre: number;
  budgetValueOre: number;
  state: string;
  rowIds: string[];
}
const monthNames = [
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
const integer = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 });
const money = (ore: number) =>
  new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    maximumFractionDigits: 0,
  }).format(ore / 100);
const normalize = (text: string) =>
  text
    .toLocaleLowerCase('da')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .trim();
const safeSum = (values: number[]) => {
  const result = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value))
      throw new Error('Beregningsgrundlaget kræver sikre heltal i øre.');
    return sum + value;
  }, 0);
  if (!Number.isSafeInteger(result)) throw new Error('Beløbssummen overstiger sikre heltal i øre.');
  return result;
};
function coverage(context: AnalysisContext) {
  const { fromMonth, toMonth } = context.period;
  return fromMonth === toMonth
    ? monthNames[fromMonth - 1]
    : `${monthNames[fromMonth - 1]}–${monthNames[toMonth - 1]}`;
}
function metricOf(base: Analysis): ComparisonMetric {
  const context = base.context as ComparisonContext;
  if (context.metric) return context.metric;
  const text = normalize(
    [
      base.question,
      base.title,
      base.chart?.title,
      ...base.metrics.map((metric) => metric.label),
    ].join(' '),
  );
  if (/pr\.?\s*elev|elevudgift/.test(text)) return 'perPupil';
  if (/pr\.?\s*indbygger|indbyggerudgift/.test(text)) return 'perCapita';
  if (context.intent === 'energy' || /energi/.test(text)) return 'energy';
  return 'net';
}
function unitLabel(metric: ComparisonMetric) {
  return metric === 'perPupil'
    ? 'kr. pr. syntetisk elev'
    : metric === 'perCapita'
      ? 'kr. pr. syntetisk indbygger'
      : 'kr.';
}
function metricLabel(metric: ComparisonMetric) {
  return metric === 'energy'
    ? 'Energiudgift'
    : metric === 'perPupil'
      ? 'Nettoudgift pr. elev'
      : metric === 'perCapita'
        ? 'Nettoudgift pr. indbygger'
        : 'Nettoudgift';
}
function checkedEntities(base: Analysis, dataset: Dataset, access: AccessContext) {
  if (base.datasetVersion !== dataset.version)
    throw new Error('Sammenligningen og analysen skal bruge samme dataversion.');
  const context = base.context;
  assertScope(access, context.entityIds, dataset.entities, context.area);
  const { year, fromMonth, toMonth } = context.period;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(fromMonth) ||
    !Number.isInteger(toMonth) ||
    fromMonth < 1 ||
    toMonth > 12 ||
    fromMonth > toMonth
  )
    throw new Error('Sammenligningen kræver en gyldig periode.');
  const ids = new Set(context.entityIds);
  const entities = dataset.entities.filter((entity) => ids.has(entity.id));
  if (entities.some((entity) => entity.area !== context.area || entity.type === 'committee'))
    throw new AccessDeniedError('Afgrænsningen skal indeholde driftsenheder fra samme fagområde.');
  if (isCouncilOnly(access)) {
    const available = allowedEntities(access, dataset.entities).filter(
      (entity) => entity.area === context.area && entity.type !== 'committee',
    );
    if (available.some((entity) => !ids.has(entity.id)))
      throw new AccessDeniedError(
        'Den politiske sammenligning kræver det samlede tilladte område.',
      );
  }
  return entities;
}
function missing(
  base: Analysis,
  title: string,
  explanation: string,
  followups: string[],
): Analysis {
  return {
    ...base,
    title,
    conclusion: explanation,
    narrative: [],
    metrics: [],
    sources: [],
    chart: undefined,
    contextSeries: undefined,
    scenario: undefined,
    renderedText: undefined,
    missingData: explanation,
    followups,
    assumptions: [
      ...base.assumptions,
      'Manglende perioder eller normaliseringsgrundlag erstattes ikke af nul eller af modelgæt.',
    ],
  };
}
function denominator(dataset: Dataset, entities: Entity[], year: number, metric: ComparisonMetric) {
  if (metric === 'perPupil')
    return entities.length && entities.every((entity) => entity.type === 'school')
      ? entities.reduce((sum, entity) => sum + pupilsForYear(entity, year), 0)
      : 0;
  if (metric === 'perCapita') {
    const cohorts = (dataset.demography || []).filter((row) => row.year === year);
    if (cohorts.length !== 4 || new Set(cohorts.map((row) => row.ageGroup)).size !== 4) return 0;
    return cohorts.every((row) => Number.isSafeInteger(row.population) && row.population >= 0)
      ? cohorts.reduce((sum, row) => sum + row.population, 0)
      : 0;
  }
  return 1;
}
function facts(
  dataset: Dataset,
  entities: Entity[],
  context: AnalysisContext,
  year: number,
  metric: ComparisonMetric,
): Facts | undefined {
  const ids = new Set(entities.map((entity) => entity.id));
  const { fromMonth, toMonth } = context.period;
  const refYear = Number(dataset.referenceDate.slice(0, 4)),
    refMonth = Number(dataset.referenceDate.slice(5, 7));
  const rows = dataset.rows.filter(
    (row) =>
      ids.has(row.entityId) &&
      row.year === year &&
      row.month >= fromMonth &&
      row.month <= toMonth &&
      (metric !== 'energy' || row.category === 'energy'),
  );
  if (rows.some((row) => row.datasetVersion !== dataset.version))
    throw new Error('Rækker fra forskellige dataversioner kan ikke blandes.');
  const categories = metric === 'energy' ? ['energy'] : CATEGORIES;
  const observed = (month: number) => year < refYear || (year === refYear && month <= refMonth);
  const selected = rows.filter((row) => row.kind === (observed(row.month) ? 'actual' : 'forecast'));
  const budgets = rows.filter((row) => row.kind === 'budget');
  const keys = new Set(selected.map((row) => `${row.entityId}:${row.month}:${row.category}`));
  const budgetKeys = new Set(budgets.map((row) => `${row.entityId}:${row.month}:${row.category}`));
  for (const entity of entities)
    for (let month = fromMonth; month <= toMonth; month++)
      for (const category of categories) {
        const key = `${entity.id}:${month}:${category}`;
        if (!keys.has(key) || !budgetKeys.has(key)) return undefined;
      }
  const d = denominator(dataset, entities, year, metric);
  if (!Number.isSafeInteger(d) || d <= 0) return undefined;
  const actual = selected.filter((row) => row.kind === 'actual'),
    forecast = selected.filter((row) => row.kind === 'forecast');
  const totalOre = safeSum(selected.map((row) => row.amountOre)),
    budgetOre = safeSum(budgets.map((row) => row.amountOre));
  return {
    year,
    totalOre,
    actualOre: safeSum(actual.map((row) => row.amountOre)),
    forecastOre: safeSum(forecast.map((row) => row.amountOre)),
    budgetOre,
    denominator: d,
    valueOre: Math.round(totalOre / d),
    budgetValueOre: Math.round(budgetOre / d),
    state: actual.length ? (forecast.length ? 'regnskab og prognose' : 'regnskab') : 'prognose',
    rowIds: selected.map((row) => row.id).sort(),
  };
}
function differenceMetrics(current: number, prior: number, sourceId: string): Metric[] {
  const metrics: Metric[] = [
    {
      label: 'Forskel',
      value: current - prior,
      unit: 'ore',
      description: 'Aktuelt år minus sammenligningsåret; nominelt niveau i samme afgrænsning.',
      sourceIds: [sourceId],
    },
  ];
  if (prior !== 0)
    metrics.push({
      label: 'Ændring',
      value: ((current - prior) / Math.abs(prior)) * 100,
      unit: 'percent',
      description: 'Forskel divideret med sammenligningsårets absolutte værdi.',
      sourceIds: [sourceId],
    });
  return metrics;
}
function factsText(f: Facts, metric: ComparisonMetric) {
  return `${f.year}: ${metricLabel(metric)} ${f.valueOre} øre; rå periodesum ${f.totalOre} øre; regnskab ${f.actualOre} øre; prognose ${f.forecastOre} øre; periodiseret budget ${f.budgetOre} øre; divisor ${f.denominator}; ${f.rowIds.length} udvalgte posteringer. Normaliseret budget ${f.budgetValueOre} øre. Status: ${f.state}.`;
}

/** Exact, same-coverage year comparison; no forecast fallback for missing historical actuals. */
export function applyYearComparison(
  base: Analysis,
  dataset: Dataset,
  access: AccessContext,
): Analysis {
  const entities = checkedEntities(base, dataset, access);
  const context = base.context as ComparisonContext;
  const metric = metricOf(base);
  const priorYear =
    context.comparison?.kind === 'year'
      ? (context.comparison.year ?? context.period.year - 1)
      : context.period.year - 1;
  if (!Number.isInteger(priorYear) || priorYear === context.period.year)
    return missing(
      base,
      'Vælg to forskellige år',
      'Årssammenligningen kræver to forskellige, hele årstal.',
      [`Sammenlign med ${context.period.year - 1}.`],
    );
  const current = facts(dataset, entities, context, context.period.year, metric),
    prior = facts(dataset, entities, context, priorYear, metric);
  if (!current || !prior)
    return missing(
      base,
      'Sammenligningen mangler et komplet grundlag',
      `Der mangler sammenlignelige budget-/regnskabs-/prognoseposter eller ${metric === 'perPupil' ? 'syntetiske elevtal' : metric === 'perCapita' ? 'syntetiske befolkningstal' : 'fuld dækning'} for ${coverage(context)} i ${priorYear} og ${context.period.year}. De to år sammenlignes ikke med forskellig dækning.`,
      [
        'Vis budgetstatus for den valgte periode.',
        'Vis sammenligningen for et år med et foregående år i datasættet.',
      ],
    );
  const sourceId = `DEMO-YEAR-${hash(JSON.stringify({ version: dataset.version, ids: context.entityIds.slice().sort(), period: context.period, priorYear, metric })).toString(16)}`;
  const source: SourceRef = {
    id: sourceId,
    title: 'Simuleret beregningsgrundlag · år mod år',
    type: 'demo',
    status: 'simulated',
    datasetVersion: dataset.version,
    period: `${coverage(context)} ${priorYear} og ${context.period.year}`,
    unit: unitLabel(metric),
    excerpt: `ALLE TAL ER SIMULEREDE. Reference ${dataset.referenceDate}; seed ${dataset.seed}. Identiske enheder: ${entities.map((entity) => entity.name).join(', ')}. Identiske måneder ${context.period.fromMonth}–${context.period.toMonth}. ${factsText(prior, metric)} ${factsText(current, metric)} Forskel ${current.valueOre - prior.valueOre} øre. Der vælges præcis regnskab til referencedato og prognose efter referencedato; de summeres aldrig dobbelt.`,
    ...(!isCouncilOnly(access)
      ? { rowIds: [...prior.rowIds.slice(0, 5), ...current.rowIds.slice(0, 5)] }
      : {}),
  };
  const delta = current.valueOre - prior.valueOre;
  const annualDenominators = metric === 'perPupil' || metric === 'perCapita';
  return {
    ...base,
    title: `${metricLabel(metric)} · ${context.period.year} mod ${priorYear}`,
    context: {
      ...context,
      scenario: undefined,
      metric,
      comparison: { kind: 'year', year: priorYear },
    },
    renderedText: undefined,
    scenario: undefined,
    contextSeries: undefined,
    missingData: undefined,
    conclusion: `${metricLabel(metric)} er ${money(current.valueOre)} i ${context.period.year}, mod ${money(prior.valueOre)} i ${priorYear}: ${money(Math.abs(delta))} ${delta >= 0 ? 'højere' : 'lavere'} for samme måneder. ${current.year}: ${current.state}; ${prior.year}: ${prior.state}. [1]`,
    narrative: [
      `Afgrænsningen er ${entities.length === 1 ? entities[0].name : AREA_LABELS[context.area].toLocaleLowerCase('da')} i ${coverage(context)} begge år. Periodiseret budget er ${money(prior.budgetValueOre)} i ${priorYear} og ${money(current.budgetValueOre)} i ${current.year}${annualDenominators ? ` (${unitLabel(metric)})` : ''}. [1]`,
      ...(annualDenominators
        ? [
            `Normalisering bruger hvert års eget syntetiske ${metric === 'perPupil' ? 'elevtal' : 'befolkningstal'}: ${integer.format(prior.denominator)} i ${priorYear} og ${integer.format(current.denominator)} i ${current.year}. Rå udgiftssummer er ${money(prior.totalOre)} og ${money(current.totalOre)}. [1]`,
          ]
        : []),
      ...(prior.valueOre === 0
        ? ['En procentændring kan ikke beregnes med nul i sammenligningsåret.']
        : []),
    ],
    metrics: [
      {
        label: `${priorYear} · ${prior.state}`,
        value: prior.valueOre,
        unit: 'ore',
        description: unitLabel(metric),
        sourceIds: [sourceId],
      },
      {
        label: `${current.year} · ${current.state}`,
        value: current.valueOre,
        unit: 'ore',
        description: unitLabel(metric),
        sourceIds: [sourceId],
      },
      ...differenceMetrics(current.valueOre, prior.valueOre, sourceId),
    ],
    chart: {
      type: 'bar',
      title: `${metricLabel(metric)} · samme månedsspænd`,
      subtitle: `${coverage(context)} begge år · ${unitLabel(metric)} · simulerede data`,
      unit: 'ore',
      rows: [
        {
          label: `${priorYear} · ${prior.state}`,
          value: prior.valueOre,
          budget: prior.budgetValueOre,
        },
        {
          label: `${current.year} · ${current.state}`,
          value: current.valueOre,
          budget: current.budgetValueOre,
        },
      ],
      series: [
        { key: 'budget', label: 'Periodiseret budget', color: '#464f5e' },
        { key: 'value', label: 'Regnskab / prognose', color: '#bc4d30' },
      ],
      sourceIds: [sourceId],
    },
    sources: [source],
    assumptions: [
      ...base.assumptions,
      `Samme enheder, kontokategorier og måneder i begge år. ${unitLabel(metric)}. Sammenligningen er nominel og er ikke korrigeret for inflation. Baseline sammenlignes; et eventuelt ændret scenarie medregnes ikke som realiseret historik.`,
      `Regnskab vælges til ${dataset.referenceDate}; senere måneder bruger prognose. En prognose sammenlignet med historisk regnskab er en forventning, ikke en observeret ændring.`,
      ...(annualDenominators
        ? [
            'Normalisering sker én gang på periodens præcise øresum med det relevante års divisor; afrunding til hele øre sker efter division.',
          ]
        : []),
    ],
    followups: [
      `Vis samme sammenligning for ${context.period.year + 1}.`,
      'Hvilke typer udgifter bidrager mest til ændringen?',
      'Sammenlign med en lignende kommune i demoen.',
    ],
  };
}

function peerFacts(
  dataset: Dataset,
  context: AnalysisContext,
  municipalityId: string,
  metric: 'perPupil' | 'perCapita',
): Facts | undefined {
  const rows = (dataset.municipalBenchmarks || []).filter(
    (row) =>
      row.municipalityId === municipalityId &&
      row.area === context.area &&
      row.year === context.period.year &&
      row.month >= context.period.fromMonth &&
      row.month <= context.period.toMonth,
  );
  if (rows.some((row) => row.status !== 'simulated' || row.datasetVersion !== dataset.version))
    throw new Error('Kommune-benchmarket kræver simulerede rækker fra samme dataversion.');
  const referenceYear = Number(dataset.referenceDate.slice(0, 4)),
    referenceMonth = Number(dataset.referenceDate.slice(5, 7));
  const selected = rows.filter(
    (row) =>
      row.kind ===
      (row.year < referenceYear || (row.year === referenceYear && row.month <= referenceMonth)
        ? 'actual'
        : 'forecast'),
  );
  const budget = rows.filter((row) => row.kind === 'budget');
  for (let month = context.period.fromMonth; month <= context.period.toMonth; month++)
    if (
      selected.filter((row) => row.month === month).length !== 1 ||
      budget.filter((row) => row.month === month).length !== 1
    )
      return undefined;
  const denominators = new Set(
    selected.map((row) => (metric === 'perPupil' ? row.pupils : row.population)),
  );
  if (denominators.size !== 1) return undefined;
  const d = [...denominators][0];
  if (!Number.isSafeInteger(d) || d <= 0) return undefined;
  const actual = selected.filter((row) => row.kind === 'actual'),
    forecast = selected.filter((row) => row.kind === 'forecast');
  const totalOre = safeSum(selected.map((row) => row.amountOre)),
    budgetOre = safeSum(budget.map((row) => row.amountOre));
  return {
    year: context.period.year,
    totalOre,
    actualOre: safeSum(actual.map((row) => row.amountOre)),
    forecastOre: safeSum(forecast.map((row) => row.amountOre)),
    budgetOre,
    denominator: d,
    valueOre: Math.round(totalOre / d),
    budgetValueOre: Math.round(budgetOre / d),
    state: actual.length ? (forecast.length ? 'regnskab og prognose' : 'regnskab') : 'prognose',
    rowIds: selected.map((row) => row.id).sort(),
  };
}

/** Compares whole permitted areas; a school's figures are never scaled up into a fictional municipality. */
export function applyMunicipalBenchmark(
  base: Analysis,
  dataset: Dataset,
  access: AccessContext,
  requestedMunicipality?: string,
): Analysis {
  const entities = checkedEntities(base, dataset, access);
  const context = base.context as ComparisonContext;
  const allArea = dataset.entities.filter(
    (entity) => entity.area === context.area && entity.type !== 'committee',
  );
  const permitted = new Set(entities.map((entity) => entity.id));
  if (allArea.length !== permitted.size || allArea.some((entity) => !permitted.has(entity.id)))
    return missing(
      base,
      'Benchmark kræver et samlet fagområde',
      'Kommunernes demotal er områdeaggregater. Den valgte institutionsafgrænsning kan ikke sammenlignes med en hel kommune. Vælg hele fagområdet, hvis din adgang omfatter det.',
      [`Vis et kommunebenchmark for hele ${AREA_LABELS[context.area].toLocaleLowerCase('da')}.`],
    );
  const originalMetric = metricOf(base);
  if (originalMetric === 'energy')
    return missing(
      base,
      'Benchmark mangler separate energiposter',
      'Kommunebenchmarket indeholder simulerede nettoudgifter for hele fagområder. Det indeholder ikke et sammenligneligt energiregnskab for andre kommuner. Energi sammenlignes derfor ikke med et opfundet delbeløb.',
      [
        'Sammenlign skoleområdets nettoudgift pr. elev med en lignende kommune.',
        'Sammenlign energiudgifter med sidste år.',
      ],
    );
  const profiles = dataset.municipalities || [];
  const kalundborg = profiles.find((profile) => profile.id === KALUNDBORG_MUNICIPALITY_ID);
  if (!kalundborg || !dataset.municipalBenchmarks?.length)
    return missing(
      base,
      'Denne dataversion har intet kommunebenchmark',
      'Dataversionen mangler et versionsfast, simuleret kommunebenchmark og et dokumenteret normaliseringsgrundlag. Der hentes ingen faktiske kommunale økonomital som erstatning.',
      ['Start en ny samtale på et snapshot med kommunebenchmark.'],
    );
  if (profiles.some((profile) => profile.status !== 'simulated'))
    throw new Error('Kommunernes strukturforudsætninger skal være markeret som simulerede.');
  const selection = selectMunicipalPeers(profiles, KALUNDBORG_MUNICIPALITY_ID, 5);
  const requested = requestedMunicipality || context.comparison?.municipalityId;
  const named = selection.filter((item) =>
    item.municipality.aliases.some((alias) => normalize(base.question).includes(normalize(alias))),
  );
  const chosen = requested
    ? selection.find(
        (item) =>
          item.municipality.id === requested ||
          item.municipality.code === requested ||
          [item.municipality.name, ...item.municipality.aliases].some(
            (alias) => normalize(alias) === normalize(requested),
          ),
      )
    : named[0] || selection[0];
  if (!chosen)
    return missing(
      base,
      'Vælg en kommune fra demoens register',
      'Den ønskede kommune findes ikke som en separat, verificeret navneprofil med simulerede benchmarkdata i denne dataversion.',
      selection.slice(0, 3).map((item) => `Sammenlign med ${item.municipality.name} Kommune.`),
    );
  const metric: 'perPupil' | 'perCapita' =
    originalMetric === 'perCapita'
      ? 'perCapita'
      : context.area === 'schools'
        ? 'perPupil'
        : 'perCapita';
  if (originalMetric === 'perPupil' && context.area !== 'schools')
    return missing(
      base,
      'Elevnøgletallet findes kun på skoleområdet',
      'Der er ikke et sammenligneligt elevgrundlag for det valgte fagområde. Vælg udgift pr. indbygger eller skoleområdet.',
      ['Sammenlign udgift pr. indbygger med en lignende kommune.'],
    );
  const local = facts(dataset, entities, context, context.period.year, metric),
    peer = peerFacts(dataset, context, chosen.municipality.id, metric);
  if (!local || !peer)
    return missing(
      base,
      'Kommunebenchmarket mangler sammenlignelig dækning',
      `Der mangler komplette poster eller et entydigt syntetisk normaliseringsgrundlag for ${coverage(context)} ${context.period.year}. Sammenligningen gennemføres ikke med forskellige måneder eller ved at udfylde manglende tal med nul.`,
      ['Vælg en periode med fuld dækning i begge demokommuner.'],
    );
  const peerProfile = chosen.municipality;
  const sourceId = `DEMO-MUNICIPAL-${hash(JSON.stringify({ version: dataset.version, area: context.area, period: context.period, metric, peer: peerProfile.id })).toString(16)}`;
  const delta = local.valueOre - peer.valueOre;
  const economics: SourceRef = {
    id: sourceId,
    title: 'Simuleret beregningsgrundlag · kommunebenchmark',
    type: 'demo',
    status: 'simulated',
    datasetVersion: dataset.version,
    period: `${coverage(context)} ${context.period.year}`,
    unit: unitLabel(metric),
    excerpt: `ALLE ØKONOMI-, BEFOLKNINGS- OG ELEVTAL ER SIMULEREDE. Fagområde ${AREA_LABELS[context.area]}, samme måneder ${context.period.fromMonth}–${context.period.toMonth}, reference ${dataset.referenceDate}, seed ${dataset.seed}. Kalundborg beregnes udelukkende af K.A.I.A.s egne tilladte posteringer, ikke af en parallel benchmarkkopi. Kalundborg: ${factsText(local, metric)} ${peerProfile.name}: ${factsText(peer, metric)} Forskel Kalundborg minus ${peerProfile.name}: ${delta} øre pr. ${metric === 'perPupil' ? 'elev' : 'indbygger'}. Peerudvælgelse: ${chosen.explanation} Strukturreference ${kalundborg.structureYear}. Komponenter: ${JSON.stringify(chosen.components)}. Nominel sammenligning, uden effektivitetsslutning.`,
    ...(!isCouncilOnly(access)
      ? { rowIds: [...local.rowIds.slice(0, 5), ...peer.rowIds.slice(0, 5)] }
      : {}),
  };
  const nameSources: SourceRef[] = [kalundborg, peerProfile].map((profile) => ({
    id: `OFFICIAL-NAME-${profile.code}`,
    title: `Officiel navnekilde · ${profile.name} Kommune`,
    type: 'name',
    status: 'official-name',
    url: profile.nameSourceUrl,
    excerpt: `Kilden dokumenterer kun kommunenavnet ${profile.name} og det officielle kommuneregister. Navnet blev verificeret ${profile.verifiedAt}. Kilden dokumenterer ikke demoens økonomi, struktur, indbyggertal eller elevtal.`,
    period: `Navn verificeret ${profile.verifiedAt}`,
    datasetVersion: dataset.version,
  }));
  return {
    ...base,
    title: `Kommunebenchmark · ${AREA_LABELS[context.area].toLocaleLowerCase('da')}`,
    context: {
      ...context,
      scenario: undefined,
      metric,
      comparison: {
        kind: 'municipality',
        municipalityId: peerProfile.id,
        year: context.period.year,
      },
    },
    scenario: undefined,
    renderedText: undefined,
    contextSeries: undefined,
    missingData: undefined,
    conclusion: `I simuleringen er Kalundborgs ${metricLabel(metric).toLocaleLowerCase('da')} ${money(local.valueOre)}, mod ${money(peer.valueOre)} i ${peerProfile.name}: ${money(Math.abs(delta))} ${delta >= 0 ? 'højere' : 'lavere'} for samme periode. Det er en sammenligning af demotal og dokumenterer ikke forskelle i effektivitet. [1]`,
    narrative: [
      `Begge kommuner dækker ${coverage(context)} ${context.period.year}: ${local.state}. ${requested || named.length ? `${peerProfile.name} er valgt i forespørgslen; den fiktive strukturscore er ${decimal.format(chosen.score)} af 100` : `${peerProfile.name} foreslås ud fra fiktiv strukturlighed (${decimal.format(chosen.score)} af 100)`}. Udvælgelsen bruger indbyggertal, 65+-andel, skolebørnsandel og et simuleret landlighedsindeks; ingen økonomital indgår i udvælgelsen. [1]`,
      `Kalundborg: rå nettoudgift ${money(local.totalOre)} divideret med ${integer.format(local.denominator)} syntetiske ${metric === 'perPupil' ? 'elever' : 'indbyggere'}. ${peerProfile.name}: ${money(peer.totalOre)} divideret med ${integer.format(peer.denominator)}. Forskellige kommunestørrelser forklarer skalaforskelle i rå totaler; normalisering er heller ikke et mål for kvalitet eller effektivitet. [1]`,
    ],
    metrics: [
      {
        label: 'Kalundborg',
        value: local.valueOre,
        unit: 'ore',
        description: unitLabel(metric),
        sourceIds: [sourceId],
      },
      {
        label: peerProfile.name,
        value: peer.valueOre,
        unit: 'ore',
        description: unitLabel(metric),
        sourceIds: [sourceId],
      },
      ...differenceMetrics(local.valueOre, peer.valueOre, sourceId).map((metric) => ({
        ...metric,
        description: `Kalundborg minus ${peerProfile.name}, normaliseret for samme periode.`,
      })),
    ],
    chart: {
      type: 'bar',
      title: `${metricLabel(metric)} · simulerede kommuner`,
      subtitle: `${coverage(context)} ${context.period.year} · ${unitLabel(metric)} · ${local.state}`,
      unit: 'ore',
      rows: [
        { label: 'Kalundborg', value: local.valueOre },
        { label: peerProfile.name, value: peer.valueOre },
      ],
      series: [{ key: 'value', label: unitLabel(metric), color: '#006f71' }],
      sourceIds: [sourceId],
    },
    sources: [economics, ...nameSources],
    assumptions: [
      ...base.assumptions,
      'Alle økonomi-, elev-, befolknings- og strukturværdier for samtlige kommuner er simulerede. Kun kommunenavn og kommunekode er verificeret fra officielle kilder.',
      'Områdeafgrænsning, regnskabsdefinition og månedsspænd holdes ens. Kommunernes faktiske konteringspraksis, serviceniveau, geografi og opgavefordeling er ikke dokumenteret af denne demo.',
      `Peerudvælgelsen bruger syntetiske strukturtræk pr. ${kalundborg.structureYear}; score ${decimal.format(chosen.score)}/100 er ingen officiel sammenlignelighedsvurdering.`,
      ...(dataset.municipalMetadata?.assumptions || []),
      'Normalisering: periodens nettosum i øre divideret med samme års syntetiske elev-/indbyggertal; afrunding sker efter division. Nominelle forskelle må ikke kaldes effektiviseringspotentiale, årsagsforklaring eller en faktisk kommunerangering.',
    ],
    followups: [
      `Vis samme kommunebenchmark for ${context.period.year - 1}.`,
      `Sammenlign med ${selection.find((item) => item.municipality.id !== peerProfile.id)?.municipality.name || 'en anden'} Kommune.`,
      'Sammenlign med sidste års data i samme afgrænsning.',
    ],
  };
}
