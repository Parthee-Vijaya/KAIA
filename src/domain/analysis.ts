import { buildMobilityAnalysis, isMobilityQuestion, mobilityQuestionAssumptions } from './mobility';
import { AREA_LABELS, CATEGORY_LABELS, CATEGORIES, getDataset, hash, pupilsForYear } from './data';
import type { Dataset } from './data';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  Area,
  ChartRow,
  ChartSpec,
  DemoDocument,
  Entity,
  LedgerRow,
  Period,
  ScenarioAssumptions,
  SourceRef,
} from './types';
import { DEFAULT_SCENARIO } from './types';
import { applyYearComparison, applyMunicipalBenchmark } from './comparisons';
import { applyMultiYearProjection } from './projections';
import { MUNICIPAL_NAME_REGISTRY } from './municipalities';
import { percentageEffectOre } from './arithmetic';
import {
  allowedEntities,
  assertScope,
  canAccessDocument,
  canUseDetailedData,
  isCouncilOnly,
  AccessDeniedError,
} from './policy';
export { demonstrationQuestions, preparedScenarios, suggestions } from './questions';
export const ANALYSIS_INTENTS = [
  'budget',
  'comparison',
  'energy',
  'trend',
  'forecast',
  'composition',
  'category',
  'heatmap',
  'documents',
  'scenario',
  'pricequantity',
  'demography',
  'mobilityCapacity',
  'yearComparison',
  'municipalBenchmark',
  'projection',
  'missing',
] as const;
const colors = ['#bc4d30', '#006f71', '#464f5e', '#c18b49', '#75999a', '#9b4028'];
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
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .replaceAll('−', '-')
    .replaceAll('sammennlign', 'sammenlign');
const money = (n: number) =>
  new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    maximumFractionDigits: 0,
  }).format(n / 100);
const pct = (n: number) => new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 }).format(n);
const sum = (rows: LedgerRow[]) => rows.reduce((s, r) => s + r.amountOre, 0);
const inPeriod = (r: LedgerRow, p: Period) =>
  r.year === p.year && r.month >= p.fromMonth && r.month <= p.toMonth;
function observed(r: LedgerRow, dataset: Dataset) {
  const y = Number(dataset.referenceDate.slice(0, 4)),
    m = Number(dataset.referenceDate.slice(5, 7));
  return r.year < y || (r.year === y && r.month <= m);
}
function selectedRows(
  rows: LedgerRow[],
  p: Period,
  kind: 'budget' | 'actual' | 'outlook',
  dataset: Dataset,
): LedgerRow[] {
  return rows.filter(
    (r) =>
      inPeriod(r, p) &&
      (kind === 'outlook'
        ? r.kind === (observed(r, dataset) ? 'actual' : 'forecast')
        : r.kind === kind),
  );
}
const periodText = (p: Period) =>
  `${p.fromMonth === p.toMonth ? months[p.fromMonth - 1] : `${months[p.fromMonth - 1]}–${months[p.toMonth - 1]}`} ${p.year}`;
function explicitArea(q: string): Area | undefined {
  const map: [RegExp, Area][] = [
    [/skole|\belev|herred|nyrup|rynkevang/, 'schools'],
    [/facilitet|haller|hallen|bygning|kultur|idraet|spiralen/, 'facilities'],
    [/social|beskaeftig|jobcenter/, 'social'],
    [/aeldre|sundhed|hjemmepleje|aeldrepleje|pleje/, 'health'],
    [/teknik|miljo|natur|cykelsti|\bvej(?:e|en|ene)?\b/, 'environment'],
    [/administration|okonomistab|okonomikonsulent|organisation/, 'administration'],
    [/beredskab|samfundssikker/, 'preparedness'],
  ];
  return map.find(([regex]) => regex.test(q))?.[1];
}
function parsePeriod(q: string, dataset: Dataset, previous?: AnalysisContext): Period {
  const refYear = Number(dataset.referenceDate.slice(0, 4)),
    refMonth = Number(dataset.referenceDate.slice(5, 7));
  const years = [...q.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const year = years.at(-1) || previous?.period.year || refYear;
  const p: Period = {
    year,
    fromMonth: previous?.period.fromMonth || 1,
    toMonth: previous?.period.toMonth || (year > refYear ? 12 : refMonth),
  };
  if (/hele aret|helar|arsbudget|arsprognose/.test(q)) p.toMonth = 12;
  const quarter = q.match(/([1-4])\.?\s*kvartal/);
  if (quarter) {
    p.fromMonth = (Number(quarter[1]) - 1) * 3 + 1;
    p.toMonth = p.fromMonth + 2;
  }
  const named = months
    .map((m, i) => (normalize(q).includes(normalize(m)) ? i + 1 : 0))
    .filter(Boolean);
  if (named.length === 1) {
    p.toMonth = named[0];
    p.fromMonth = /til|januar|opfolg|status|budget/.test(q) ? 1 : named[0];
  }
  if (named.length >= 2) {
    p.fromMonth = Math.min(...named);
    p.toMonth = Math.max(...named);
  }
  return p;
}
function detectIntent(q: string, previous?: AnalysisContext, referenceYear = 2026): string {
  if (
    /(?:faktisk|rigtig|virkelig|officiel|autentisk).*(?:budget|regnskab|okonomi|beslut)|(?:budget|regnskab).*(?:virkelighed|faktisk|rigtig|officiel)/.test(
      q,
    )
  )
    return 'missing';
  if (
    /cpr|individuel|personoplys|borger.*bevilling|i gar|personale.*navn|weather|vejr|fodboldresultat/.test(
      q,
    )
  )
    return 'missing';
  if (
    isMobilityQuestion(q) ||
    (previous?.intent === 'mobilityCapacity' &&
      /samme analyse|vis det|vis samme|scenar|baseline|ekstra.*klass/.test(q))
  )
    return 'mobilityCapacity';
  const years = [...q.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const comparison = /sammenlign|benchmark|op mod|hold.*op|i forhold|versus|\bvs\b|\bog med\b/.test(
    q,
  );
  const municipality =
    /kommune|kommuner/.test(q) ||
    MUNICIPAL_NAME_REGISTRY.some(
      (item) => item.id !== 'municipality-kalundborg' && q.includes(normalize(item.name)),
    );
  // An explicit previous-year request takes precedence over the broad "kommunens" match.
  if (
    /\b(?:sidste|forrige) ars?\b|aret for|ar til ar|year.over.year/.test(q) &&
    /sammenlign|op mod|\bmed\b|\bmod\b|forskel|aendring/.test(q)
  )
    return 'yearComparison';
  if ((comparison && municipality) || /kommunebenchmark/.test(q)) return 'municipalBenchmark';
  if (comparison && years.length > 1) return 'yearComparison';
  if (
    /prognos|fremskriv|budgetoverslag|forvent.*udvikling/.test(q) &&
    !/maanedsprognose/.test(q) &&
    (years.some((year) => year > referenceYear) || /frem|flerar|kommende|naeste.*ar/.test(q))
  )
    return 'projection';
  if (previous && /^(?:vis|gentag)\s+(?:den\s+)?samme\s+sammenlign/.test(q))
    return previous.intent || 'comparison';
  if (/hvad (hvis|sker)|scenari|baseline|forudsaetning/.test(q)) return 'scenario';
  if (/demograf|befolk|nettoflyt|aldersgrup|indvand|fodsl/.test(q)) return 'demography';
  if (/pris.*maengde|maengde.*pris|samspil|forklar.*energi|hvorfor.*energi|energi.*arsag/.test(q))
    return 'pricequantity';
  if (/beslut|strategi|referat|dokument/.test(q)) return 'documents';
  if (/heatmap|varmekort|maanedlige afvig|pa tvaers af.*maaned/.test(q)) return 'heatmap';
  if (/sammensaet|stablet|fordeling/.test(q)) return 'composition';
  if (/typer udgift|udgiftsty|bidrag|kategori/.test(q)) return 'category';
  if (/sammenlign|storste|hvilke skoler|hvilke enheder/.test(q))
    return /energi/.test(q) ? 'energy' : 'comparison';
  if (/udvikling|fra 20\d{2}|over tid|forklar beregning|nogletal/.test(q)) return 'trend';
  if (/prognose/.test(q)) return 'forecast';
  if (/energi/.test(q)) return 'energy';
  if (/samme analyse|vis det|vis samme|anden periode/.test(q)) return previous?.intent || 'budget';
  if (previous && /^vis.*20\d{2}|^sammenlign med/.test(q)) return previous.intent || 'budget';
  if (/budget|regnskab|forbrug|afvig|opsummer|okonomi|udgift/.test(q)) return 'budget';
  return 'missing';
}
export function parseQuestion(
  question: string,
  access: AccessContext,
  dataset: Dataset,
  previous?: AnalysisContext,
  overrides?: Partial<AnalysisContext>,
): AnalysisContext {
  const q = normalize(question),
    naturalArea = explicitArea(q) || (isMobilityQuestion(q) ? 'schools' : undefined);
  const referenceYear = Number(dataset.referenceDate.slice(0, 4));
  const intent = detectIntent(q, previous, referenceYear);
  const area =
    naturalArea ||
    overrides?.area ||
    previous?.area ||
    (access.areas.includes('schools') ? 'schools' : access.areas[0]) ||
    'schools';
  const operating = dataset.entities.filter((e) => e.type !== 'committee');
  const exact = operating.filter(
    (e) =>
      !(intent === 'municipalBenchmark' && e.id === 'org-kommune') && q.includes(normalize(e.name)),
  );
  const candidates = exact.length
    ? exact
    : operating.filter(
        (e) =>
          e.area === area &&
          e.aliases.some(
            (a) =>
              normalize(a).length >= 3 &&
              new RegExp(
                `(^|[^a-z])${normalize(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`,
              ).test(q),
          ),
      );
  const allowedDefault = allowedEntities(access, dataset.entities)
    .filter((e) => e.type !== 'committee' && e.area === area)
    .map((e) => e.id);
  const previousIds =
    previous?.area === area &&
    previous.entityIds.length &&
    !/alle|skolerne|bygninger|faciliteterne|skoleomradet/.test(q)
      ? previous.entityIds
      : allowedDefault;
  // Empty UI selection means all allowed units. A natural-language area change discards a stale filter scope.
  const hasUnitFilter = overrides && Object.prototype.hasOwnProperty.call(overrides, 'entityIds');
  const staleAreaFilter = naturalArea && overrides?.area && naturalArea !== overrides.area;
  const filterIds =
    hasUnitFilter && !staleAreaFilter
      ? overrides.entityIds?.length
        ? overrides.entityIds
        : allowedDefault
      : previousIds;
  const ids = candidates.length
    ? /^sammenlign med/.test(q) && previous?.area === area
      ? [...previous.entityIds, ...candidates.map((e) => e.id)]
      : candidates.map((e) => e.id)
    : filterIds;
  const periodFallback = overrides?.period || previous?.period;
  const fallbackContext = periodFallback
    ? { period: periodFallback, area, entityIds: ids }
    : undefined;
  const context: AnalysisContext = {
    period: parsePeriod(q, dataset, fallbackContext),
    entityIds: [...new Set(ids)],
    area,
    intent,
  };
  const years = [...q.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  context.metric = /pr\.?\s*elev|elevudgift/.test(q)
    ? 'perPupil'
    : /pr\.?\s*indbygger/.test(q)
      ? 'perCapita'
      : /energi|braendstof/.test(q)
        ? 'energy'
        : /netto|budgetstatus|overblik over budget/.test(q)
          ? 'net'
          : previous?.area === area
            ? previous.metric || 'net'
            : 'net';
  if (intent === 'yearComparison') {
    if (years.length > 1) context.period.year = Math.max(...years);
    context.comparison = {
      kind: 'year',
      year: years.length > 1 ? Math.min(...years) : context.period.year - 1,
    };
  } else if (intent === 'municipalBenchmark') {
    const peer = MUNICIPAL_NAME_REGISTRY.find(
      (item) => item.id !== 'municipality-kalundborg' && q.includes(normalize(item.name)),
    );
    const unknown = q.match(
      /\b(?:med|mod|versus)\s+(?!en\b|den\b|kommunen\b|sidste\b|forrige\b)([a-z\s-]{2,40})\s+kommune\b/,
    );
    const preservePeer =
      previous?.comparison?.kind === 'municipality' &&
      (!/en sammenlignelig|en lignende|anden kommune/.test(q) || /^hvorfor/.test(q));
    context.comparison = {
      kind: 'municipality',
      ...(peer
        ? { municipalityId: peer.id }
        : unknown
          ? { municipalityId: `unknown:${unknown[1].trim()}` }
          : preservePeer
            ? { municipalityId: previous?.comparison?.municipalityId }
            : {}),
    };
  } else if (intent === 'projection') {
    const wordYears = q.match(/naeste\s+(\d|to|tre|fire|fem|seks)\s+ar/);
    const length = wordYears
      ? { to: 2, tre: 3, fire: 4, fem: 5, seks: 6 }[wordYears[1]] || Number(wordYears[1])
      : undefined;
    context.projectionEndYear =
      years.at(-1) ||
      (length
        ? referenceYear + length
        : previous?.projectionEndYear || Math.min(referenceYear + 4, 2032));
    context.period = { year: referenceYear, fromMonth: 1, toMonth: 12 };
  } else if (/sidste ar|forrige ar/.test(q)) context.period.year -= 1;
  if (overrides?.scenario) context.scenario = { ...DEFAULT_SCENARIO, ...overrides.scenario };
  else if (context.intent === 'scenario') context.scenario = parseScenario(q, previous?.scenario);
  if (intent === 'mobilityCapacity') {
    context.period = { year: context.period.year, fromMonth: 1, toMonth: 12 };
    context.mobilityAssumptions = mobilityQuestionAssumptions(
      question,
      overrides?.mobilityAssumptions || previous?.mobilityAssumptions,
    );
  }
  return context;
}
export function parseScenario(
  question: string,
  previous?: ScenarioAssumptions,
): ScenarioAssumptions {
  const q = normalize(question);
  const out = { ...DEFAULT_SCENARIO, ...previous };
  if (/nulstil|baseline alene/.test(q)) return { ...DEFAULT_SCENARIO };
  const clauses = q.split(/\s+(?:og|mens|samt)\s+|;|,(?!\d)/);
  const categoryKey = (word: string): keyof Omit<ScenarioAssumptions, 'horizon'> =>
    /energi|braendstof/.test(word)
      ? 'energyPercent'
      : /^lon/.test(word)
        ? 'salaryPercent'
        : /^vikar/.test(word)
          ? 'substitutePercent'
          : /^elev/.test(word)
            ? 'pupilsPercent'
            : /budget/.test(word)
              ? 'budgetPercent'
              : 'maintenancePercent';
  const negative = (text: string) =>
    /fald|reduc|reduk|ned|mindre|lavere|minus|bespar|saenk|skaer/.test(text);
  const percentage = (text: string) => {
    const match = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:procent|pct\.?|%)/);
    return match ? Number(match[1].replace(',', '.')) : undefined;
  };
  let pending: { key: keyof Omit<ScenarioAssumptions, 'horizon'>; text: string }[] = [];
  for (const clause of clauses) {
    const tokens = [
      ...clause.matchAll(
        /\b(energi\w*|braendstof\w*|lon\w*|vikar\w*|elev\w*|budget\w*|demobudget\w*|vedligehold\w*)/g,
      ),
    ];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i],
        key = categoryKey(token[1]),
        segment = clause.slice(token.index, tokens[i + 1]?.index || clause.length);
      const prefix = i === 0 ? clause.slice(0, token.index) : '';
      const amount = percentage(segment) ?? percentage(prefix);
      if (amount === undefined) {
        pending.push({ key, text: segment });
        continue;
      }
      out[key] = negative(segment + ' ' + prefix) ? -Math.abs(amount) : amount;
      for (const item of pending) out[item.key] = negative(item.text) ? -Math.abs(amount) : amount;
      pending = [];
    }
  }

  if (/hele aret|helar/.test(q)) out.horizon = 'annual';
  else if (/resten|restar/.test(q)) out.horizon = 'remaining';
  return validateScenario(out);
}
export function validateScenario(input: ScenarioAssumptions): ScenarioAssumptions {
  if (!['remaining', 'annual'].includes(input.horizon)) throw new Error('Ugyldig scenariehorisont');
  for (const [key, value] of Object.entries(input))
    if (
      key !== 'horizon' &&
      (!Number.isFinite(value) || Number(value) < -100 || Number(value) > 200)
    )
      throw new Error('Scenarieændringer skal være mellem −100 og 200 procent.');
  return { ...input };
}
export interface ScenarioResult {
  baselineOre: number;
  scenarioOre: number;
  deltaOre: number;
  budgetBaselineOre: number;
  budgetScenarioOre: number;
  budgetDeltaOre: number;
  rows: ChartRow[];
  effects: Record<string, number>;
}
export function calculateScenario(
  rows: LedgerRow[],
  period: Period,
  assumptions: ScenarioAssumptions,
  dataset: Dataset,
): ScenarioResult {
  const a = validateScenario(assumptions);
  const annual = { ...period, fromMonth: 1, toMonth: 12 };
  const baseline = selectedRows(rows, annual, 'outlook', dataset);
  const budgets = selectedRows(rows, annual, 'budget', dataset);
  const effects: Record<string, number> = {
    energy: 0,
    salary: 0,
    substitute: 0,
    pupils: 0,
    maintenance: 0,
  };
  const deltas = new Map<string, number>();
  for (const row of baseline) {
    const applies = a.horizon === 'annual' || !observed(row, dataset);
    let percent = 0;
    if (applies) {
      if (row.category === 'energy') percent = a.energyPercent;
      else if (row.category === 'salary') percent = a.salaryPercent;
      else if (row.category === 'substitute') percent = a.substitutePercent;
      else if (row.category === 'maintenance') percent = a.maintenancePercent;
      else if (row.category === 'activity') percent = a.pupilsPercent;
    }
    const delta = percentageEffectOre(
      row.amountOre,
      percent,
      row.category === 'activity' ? { numerator: 28, denominator: 100 } : undefined,
    );
    const effectKey = row.category === 'activity' ? 'pupils' : row.category;
    if (effectKey in effects) effects[effectKey] += delta;
    deltas.set(row.id, delta);
  }
  let budgetDelta = 0;
  for (const row of budgets)
    if (a.horizon === 'annual' || !observed(row, dataset))
      budgetDelta += percentageEffectOre(row.amountOre, a.budgetPercent);
  const baselineOre = sum(baseline),
    deltaOre = [...deltas.values()].reduce((s, n) => s + n, 0),
    budgetBaselineOre = sum(budgets);
  const chartRows: ChartRow[] = Array.from({ length: 12 }, (_, i) => {
    const monthRows = baseline.filter((r) => r.month === i + 1);
    const amount = sum(monthRows);
    return {
      label: months[i],
      baseline: amount,
      scenario: amount + monthRows.reduce((s, r) => s + (deltas.get(r.id) || 0), 0),
      observed: observed({ year: period.year, month: i + 1 } as LedgerRow, dataset) ? 1 : 0,
    };
  });
  return {
    baselineOre,
    scenarioOre: baselineOre + deltaOre,
    deltaOre,
    budgetBaselineOre,
    budgetScenarioOre: budgetBaselineOre + budgetDelta,
    budgetDeltaOre: budgetDelta,
    rows: chartRows,
    effects,
  };
}
export interface PriceQuantityResult {
  baselineOre: number;
  currentOre: number;
  priceEffectOre: number;
  quantityEffectOre: number;
  interactionOre: number;
  unexplainedOre: number;
  matchedInvoices: number;
}
export function decomposePriceQuantity(
  rows: LedgerRow[],
  period: Period,
  dataset: Dataset,
): PriceQuantityResult {
  const current = selectedRows(rows, period, 'outlook', dataset).filter(
    (r) => r.category === 'energy',
  );
  const previousPeriod = { ...period, year: period.year - 1 };
  const prior = selectedRows(rows, previousPeriod, 'outlook', dataset).filter(
    (r) => r.category === 'energy',
  );
  const key = (r: LedgerRow) => `${r.entityId}:${r.month}:${r.id.split('-').at(-1)}`;
  const priorMap = new Map(prior.map((r) => [key(r), r]));
  const baselineOre = sum(prior),
    currentOre = sum(current);
  let priceEffectOre = 0,
    quantityEffectOre = 0,
    interactionOre = 0,
    matchedInvoices = 0;
  for (const r of current) {
    const b = priorMap.get(key(r));
    if (
      !b ||
      r.quantity === undefined ||
      b.quantity === undefined ||
      r.unitPriceOre === undefined ||
      b.unitPriceOre === undefined
    )
      continue;
    const dp = r.unitPriceOre - b.unitPriceOre,
      dq = r.quantity - b.quantity;
    priceEffectOre += dp * b.quantity;
    quantityEffectOre += dq * b.unitPriceOre;
    interactionOre += dp * dq;
    matchedInvoices++;
  }
  return {
    baselineOre,
    currentOre,
    priceEffectOre,
    quantityEffectOre,
    interactionOre,
    unexplainedOre: currentOre - baselineOre - priceEffectOre - quantityEffectOre - interactionOre,
    matchedInvoices,
  };
}
export function searchDocuments(
  question: string,
  context: AnalysisContext,
  access: AccessContext,
  dataset: Dataset,
): DemoDocument[] {
  const q = normalize(question),
    tokens = q.split(/\W+/).filter((t) => t.length > 3);
  const wantsStrategy = /strategi/.test(q),
    wantsDecision = /politisk|beslut/.test(q);
  return dataset.documents
    .filter(
      (d) =>
        Number(d.period) <= context.period.year &&
        canAccessDocument(access, d, dataset.entities) &&
        d.area === context.area &&
        d.entityIds.some((id) => context.entityIds.includes(id)),
    )
    .map((d) => ({
      d,
      score:
        (d.period === String(context.period.year) ? 8 : 0) +
        (wantsStrategy && d.type === 'strategy' ? 20 : 0) +
        (wantsDecision && d.type === 'decision' ? 20 : 0) +
        tokens.reduce((n, t) => n + (normalize(d.title + ' ' + d.text).includes(t) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
    .slice(0, 4)
    .map(({ d }) => d);
}
function sourceEvidence(
  rows: LedgerRow[],
  context: AnalysisContext,
  dataset: Dataset,
  access: AccessContext,
  question: string,
): SourceRef {
  const p = context.period;
  const periodRows = rows.filter(
    (r) => r.year === p.year && r.month >= p.fromMonth && r.month <= p.toMonth,
  );
  const annualBudget = sum(
    selectedRows(rows, { ...p, fromMonth: 1, toMonth: 12 }, 'budget', dataset),
  );
  const budget = sum(selectedRows(rows, p, 'budget', dataset)),
    outlook = sum(selectedRows(rows, p, 'outlook', dataset));
  return {
    id: `DEMO-CALC-${hash(JSON.stringify({ context, version: dataset.version, question })).toString(16)}`,
    title: `Simuleret beregningsgrundlag · ${AREA_LABELS[context.area]}`,
    type: 'demo',
    excerpt: `SIMULEREDE TAL. Version ${dataset.version}; seed ${dataset.seed}; reference ${dataset.referenceDate}. Afgrænsning: ${context.entityIds.join(', ')}. Periode ${periodText(p)}. ${periodRows.length} posteringer i udsnittet. Budget: ${budget} øre; realiseret/prognose i perioden: ${outlook} øre; helårsbudget: ${annualBudget} øre. Netto = positive udgifter + negative indtægter. Der vælges præcis én serie pr. måned: regnskab til reference og prognose efter reference; budget indgår separat.`,
    period: periodText(p),
    datasetVersion: dataset.version,
    ...(!isCouncilOnly(access) ? { rowIds: periodRows.slice(0, 10).map((r) => r.id) } : {}),
  };
}
function docSources(documents: DemoDocument[]): SourceRef[] {
  return documents.map((d) => ({
    id: d.id,
    title: d.title,
    type: 'demo',
    documentId: d.id,
    excerpt: d.text,
    period: d.period,
    datasetVersion: d.datasetVersion,
  }));
}
function finalizeAnalysis(analysis: Analysis): Analysis {
  const clean = (value: string) => value.replaceAll('kr..', 'kr.');
  return {
    ...analysis,
    title: clean(analysis.title),
    conclusion: clean(analysis.conclusion),
    narrative: analysis.narrative.map(clean),
    assumptions: analysis.assumptions.map(clean),
    sources: analysis.sources.map((source) => ({
      ...source,
      title: clean(source.title),
      excerpt: clean(source.excerpt),
    })),
  };
}
export function assertAnalysisContext(
  access: AccessContext,
  context: AnalysisContext,
  entities: Entity[],
): void {
  assertScope(access, context.entityIds, entities, context.area);
  if (
    !Number.isInteger(context.period.year) ||
    context.period.year < 2020 ||
    context.period.year > 2032 ||
    !Number.isInteger(context.period.fromMonth) ||
    !Number.isInteger(context.period.toMonth) ||
    context.period.fromMonth < 1 ||
    context.period.toMonth > 12 ||
    context.period.fromMonth > context.period.toMonth
  )
    throw new Error('Perioden skal være inden for 2020–2032 med gyldige måneder.');
  if (
    !canUseDetailedData(access) &&
    (['comparison', 'energy', 'heatmap'].includes(context.intent || '') ||
      context.entityIds.length <
        allowedEntities(access, entities).filter(
          (e) => e.area === context.area && e.type !== 'committee',
        ).length)
  )
    throw new AccessDeniedError(
      'Din politiske adgang omfatter aggregerede oplysninger og politiske demodokumenter. Vælg et samlet område.',
    );
}
export function analyze(
  question: string,
  access: AccessContext,
  previous?: AnalysisContext,
  overrides?: Partial<AnalysisContext>,
  inputDataset?: Dataset,
): Analysis {
  const dataset = inputDataset || getDataset();
  if (typeof question !== 'string' || question.trim().length === 0 || question.length > 4000)
    throw new Error('Skriv et spørgsmål på højst 4.000 tegn.');
  const context = parseQuestion(question, access, dataset, previous, overrides);
  assertAnalysisContext(access, context, dataset.entities);
  return calculateAnalysis(question, access, context, dataset, false);
}

/** Data classes absent from every simulated snapshot cannot be authorized by a model plan. */
export function unavailableQuestionReason(question: string): string | undefined {
  const q = normalize(question);
  if (
    /(?:faktisk|rigtig|virkelig|officiel|autentisk).*(?:budget|regnskab|okonomi|beslut)|(?:budget|regnskab).*(?:virkelighed|faktisk|rigtig|officiel)/.test(
      q,
    )
  )
    return 'K.A.I.A. indeholder simulerede kommunale tal og beslutninger. Faktiske kommunale økonomital og beslutninger findes ikke i dette datagrundlag.';
  if (
    /cpr|personoplys|individuel.*(?:borger|sag|person|elev)|borger.*bevilling|personale.*navn/.test(
      q,
    )
  )
    return 'Datagrundlaget indeholder kun aggregerede oplysninger om enheder. Personoplysninger og individuelle borgersager kan ikke undersøges.';
  if (/i gar|weather|vejr|fodboldresultat/.test(q))
    return 'Spørgsmålet kræver dagsaktuelle oplysninger uden for det versionsfaste kommunale datagrundlag.';
  return undefined;
}

/** Server entry point for an already selected plan. It never reinterprets the question. */
export function analyzeResolvedContext(
  question: string,
  access: AccessContext,
  inputContext: AnalysisContext,
  dataset: Dataset,
): Analysis {
  if (typeof question !== 'string' || !question.trim() || question.length > 4000)
    throw new Error('Skriv et spørgsmål på højst 4.000 tegn.');
  const unavailable = unavailableQuestionReason(question);
  if (unavailable) throw new Error(unavailable);
  const context: AnalysisContext = {
    ...inputContext,
    period: { ...inputContext.period },
    entityIds: [...inputContext.entityIds],
    ...(inputContext.comparison ? { comparison: { ...inputContext.comparison } } : {}),
    ...(inputContext.scenario ? { scenario: { ...inputContext.scenario } } : {}),
  };
  if (!ANALYSIS_INTENTS.includes(context.intent as (typeof ANALYSIS_INTENTS)[number]))
    throw new Error('Analysetypen understøttes ikke.');
  if (context.metric && !['net', 'energy', 'perPupil', 'perCapita'].includes(context.metric))
    throw new Error('Analysens nøgletal understøttes ikke.');
  if (new Set(context.entityIds).size !== context.entityIds.length)
    throw new Error('Den samme enhed må kun indgå én gang.');
  assertAnalysisContext(access, context, dataset.entities);
  if (
    context.entityIds.some(
      (id) =>
        !dataset.entities.some(
          (entity) =>
            entity.id === id && entity.area === context.area && entity.type !== 'committee',
        ),
    )
  )
    throw new AccessDeniedError('Analysen skal bruge tilladte driftsenheder fra samme område.');
  if (context.scenario) validateScenario(context.scenario);
  return calculateAnalysis(question, access, context, dataset, true);
}

function calculateAnalysis(
  question: string,
  access: AccessContext,
  context: AnalysisContext,
  dataset: Dataset,
  resolved: boolean,
): Analysis {
  if (context.intent === 'mobilityCapacity') {
    const reason = unavailableQuestionReason(question);
    if (reason) throw new Error(reason);
    return buildMobilityAnalysis(question, access, context, dataset, context.mobilityAssumptions);
  }
  const q = normalize(question),
    intent = context.intent || 'budget';
  const entities = dataset.entities.filter(
    (e) => context.entityIds.includes(e.id) && e.type !== 'committee',
  );
  const rows = dataset.rows.filter((r) => context.entityIds.includes(r.entityId));
  const p = context.period,
    allYear = { ...p, fromMonth: 1, toMonth: 12 };
  const budgetRows = selectedRows(rows, p, 'budget', dataset),
    actualRows = selectedRows(rows, p, 'actual', dataset),
    outlookRows = selectedRows(rows, p, 'outlook', dataset);
  const budget = sum(budgetRows),
    actual = sum(actualRows),
    outlook = sum(outlookRows),
    annualBudget = sum(selectedRows(rows, allYear, 'budget', dataset)),
    annualForecast = sum(selectedRows(rows, allYear, 'outlook', dataset));
  const docs = searchDocuments(question, context, access, dataset);
  const source = sourceEvidence(rows, context, dataset, access, question),
    sources = [source, ...docSources(docs.slice(0, 2))];
  const sid = [source.id],
    scope = entities.length === 1 ? entities[0].name : AREA_LABELS[context.area].toLowerCase();
  const base: Analysis = {
    analysisId: `DEMO-A-${hash(JSON.stringify({ question, context, version: dataset.version, userId: access.userId })).toString(16)}`,
    datasetVersion: dataset.version,
    question,
    title: `Budgetstatus · ${scope}`,
    conclusion: `Nettoforbruget for ${periodText(p)} er ${money(outlook)}, svarende til ${money(Math.abs(outlook - budget))} ${outlook >= budget ? 'over' : 'under'} periodens demobudget. [1]`,
    narrative: [],
    metrics: [
      { label: 'Periodiseret budget', value: budget, unit: 'ore', sourceIds: sid },
      {
        label: 'Forbrug / prognose',
        value: outlook,
        unit: 'ore',
        description: 'Regnskab til referencedato; prognose derefter.',
        sourceIds: sid,
      },
      {
        label: 'Afvigelse',
        value: outlook - budget,
        unit: 'ore',
        description: 'Positivt tal betyder merforbrug på nettobudgettet.',
        sourceIds: sid,
      },
      { label: 'Årsprognose', value: annualForecast, unit: 'ore', sourceIds: sid },
    ],
    sources,
    context,
    assumptions: [
      `Alle kommunale tal, elevtal og dokumenters beslutninger er simulerede. Dataversion ${dataset.version}.`,
      `Periode: ${periodText(p)}. Reference: ${dataset.referenceDate}. Afsluttede år er realiserede; fremtidige måneder er prognoser.`,
      `Udgifter er positive; indtægter negative. Nettoafvigelse = forbrug minus budget. Skoler og faciliteter er adskilte udgiftsbærere uden overførte dobbeltposter.`,
    ],
    followups: [
      'Sammenlign op mod sidste års data.',
      'Sammenlign med en sammenlignelig kommune.',
      'Vis prognosen frem mod 2030.',
    ],
  };
  const chart = (
    type: ChartSpec['type'],
    title: string,
    chartRows: ChartRow[],
    series: ChartSpec['series'],
    unit: ChartSpec['unit'] = 'ore',
  ): ChartSpec => ({
    type,
    title,
    subtitle: `${periodText(p)} · ${unit === 'ore' ? 'kr.' : unit === 'number' ? 'antal' : 'procent'} · simulerede data`,
    unit,
    rows: chartRows,
    series,
    sourceIds: sid,
  });
  base.chart = chart(
    'bar',
    'Periodens budget og forbrug',
    [{ label: 'Nettoudgifter', budget, actual: outlook }],
    [
      { key: 'budget', label: 'Periodiseret budget', color: colors[2] },
      { key: 'actual', label: 'Forbrug / prognose', color: colors[0] },
    ],
  );
  base.narrative = [
    `Helårsbudgettet er ${money(annualBudget)}. Årsprognosen er ${money(annualForecast)}; forventet nettoafvigelse er ${money(annualForecast - annualBudget)}. [1]`,
    actualRows.length
      ? `Realiseret forbrug inden for den valgte periode udgør ${money(actual)}. Prognosemåneder indgår kun én gang i periodens samlede forbrug. [1]`
      : 'Der er endnu ingen realiserede posteringer i den valgte periode. Periodens forventede forbrug bygger på prognoser og skal ikke læses som et realiseret nulforbrug. [1]',
  ];
  const coverage = dataset.coverage || { fromYear: 2023, toYear: 2028 };
  if (p.year < coverage.fromYear || p.year > coverage.toYear)
    return {
      ...base,
      title: 'Dataversionen dækker ikke perioden',
      conclusion: `Denne samtales dataversion dækker ${coverage.fromYear}–${coverage.toYear}. Der er ikke et beregningsgrundlag for ${p.year}.`,
      narrative: [
        'Vælg Ny samtale for at bruge det nyeste datasnapshot. Gemte svar og kilder beholder deres oprindelige dataversion.',
      ],
      metrics: [],
      sources: [],
      chart: undefined,
      missingData: 'Den valgte periode findes ikke i dette versionsfaste snapshot.',
      followups: [`Vis budgetstatus for ${Number(dataset.referenceDate.slice(0, 4))}.`],
    };
  if (intent === 'yearComparison') return applyYearComparison(base, dataset, access);
  if (intent === 'municipalBenchmark')
    return applyMunicipalBenchmark(base, dataset, access, context.comparison?.municipalityId);
  if (intent === 'projection')
    return applyMultiYearProjection(
      base,
      dataset,
      access,
      context.projectionEndYear || Math.min(p.year + 4, 2032),
    );
  if (intent === 'missing')
    return {
      ...base,
      title: 'Demoen mangler et datagrundlag',
      conclusion: 'Det spørgsmål kan ikke besvares med det simulerede, aggregerede datagrundlag.',
      narrative: [
        'Alle kommunale budgetter, regnskaber, beslutninger og demografital i K.A.I.A. er simulerede. Demoen indeholder økonomi på enhedsniveau og simulerede dokumenter; faktiske kommunale tal, individuelle borgersager, personoplysninger og dagsaktuelle hændelser indgår ikke.',
      ],
      metrics: [],
      chart: undefined,
      sources: [],
      missingData: 'Ingen relevant tilladt dataserie eller fortolkerregel blev fundet.',
      followups: [
        `Giv mig et overblik over budgetstatus på ${scope}.`,
        'Vis udviklingen i udgifter fra 2023 til 2026.',
        'Hvad hvis energiprisen stiger 15 procent?',
      ],
    };
  if (intent === 'comparison' || intent === 'energy') {
    const energy = intent === 'energy',
      perPupil = context.metric === 'perPupil' || (!resolved && /pr\.?\s*elev/.test(q));
    const data = entities
      .map((e) => {
        const er = rows.filter((r) => r.entityId === e.id && (!energy || r.category === 'energy'));
        const b = sum(selectedRows(er, p, 'budget', dataset)),
          a = sum(selectedRows(er, p, 'outlook', dataset));
        const count = pupilsForYear(e, p.year);
        return {
          label: e.name,
          budget: perPupil && count ? Math.round(b / count) : b,
          actual: perPupil && count ? Math.round(a / count) : a,
          variance: a - b,
          pupils: count,
        };
      })
      .sort((a, b) => (perPupil ? b.actual - a.actual : b.variance - a.variance));
    base.title = energy
      ? 'Sammenligning af energiudgifter'
      : perPupil
        ? 'Sammenligning af udgift pr. elev'
        : 'Enhedernes budgetafvigelser';
    base.conclusion = data.length
      ? perPupil
        ? `${data[0].label} har den højeste nettoudgift pr. syntetisk elev: ${money(Number(data[0].actual))} i ${periodText(p)}. [1]`
        : `${data[0].label} har den største nettoafvigelse blandt de ${data.length} valgte enheder: ${money(data[0].variance)} i ${periodText(p)}. [1]`
      : 'Ingen enheder i afgrænsningen.';
    base.chart = chart(
      'bar',
      energy
        ? 'Energi · ens perioder'
        : perPupil
          ? 'Nettoudgift pr. syntetisk elev'
          : 'Budget og forbrug pr. enhed',
      data,
      [
        { key: 'budget', label: 'Budget', color: colors[2] },
        { key: 'actual', label: 'Forbrug / prognose', color: colors[0] },
      ],
    );
    if (perPupil)
      base.assumptions.push(
        'Udgift pr. elev = periodens nettoudgift i øre divideret med samme års syntetiske elevtal. Samme måneder sammenlignes; fuldårs- og delårsbeløb blandes ikke.',
      );
    if (energy) {
      base.metrics = [
        {
          label: 'Energibudget',
          value: data.reduce((s, r) => s + Number(r.budget), 0),
          unit: 'ore',
          sourceIds: sid,
        },
        {
          label: 'Energiudgifter',
          value: data.reduce((s, r) => s + Number(r.actual), 0),
          unit: 'ore',
          sourceIds: sid,
        },
      ];
      base.followups = [
        'Forklar energiudgifternes ændring med pris, mængde og samspil.',
        'Hvad hvis energiprisen stiger 15 procent resten af året?',
      ];
    }
  }
  if (intent === 'trend') {
    const years = [...q.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1])),
      start = years.length > 1 ? Math.min(...years) : 2023;
    const perPupil = context.metric === 'perPupil' || (!resolved && /elev|nogletal/.test(q)),
      count = entities.reduce((s, e) => s + pupilsForYear(e, p.year), 0);
    if (perPupil && !count)
      return {
        ...base,
        chart: undefined,
        metrics: [],
        missingData: 'Elevtal findes kun for skoler.',
        conclusion: 'Der findes ingen syntetiske elevtal for den valgte afgrænsning.',
      };
    const data: ChartRow[] = Array.from({ length: p.year - start + 1 }, (_, i) => {
      const year = start + i,
        pp = { ...p, year };
      const v = sum(selectedRows(rows, pp, 'outlook', dataset));
      const pupils = entities.reduce((s, e) => s + pupilsForYear(e, year), 0);
      return {
        label: String(year),
        value: perPupil ? Math.round(v / pupils) : v,
        pupils,
        amountOre: v,
      };
    });
    base.title = perPupil ? 'Udvikling i udgift pr. elev' : 'Udvikling i nettoudgifter';
    base.chart = chart('line', base.title, data, [
      { key: 'value', label: perPupil ? 'Udgift pr. elev' : 'Nettoudgift', color: colors[0] },
    ]);
    base.chart.subtitle = `${start}–${p.year} · ${months[p.fromMonth - 1]}–${months[p.toMonth - 1]} hvert år · kr. · simulerede data`;
    base.conclusion = `${perPupil ? 'Nettoudgiften pr. syntetisk elev' : 'Nettoudgiften'} er ${money(Number(data.at(-1)?.value || 0))} i ${p.year}, mod ${money(Number(data[0]?.value || 0))} i ${start}. Dækningen er ens: ${months[p.fromMonth - 1]}–${months[p.toMonth - 1]}. [1]`;
    base.metrics = [
      {
        label: perPupil ? 'Udgift pr. elev' : 'Nettoudgift',
        value: Number(data.at(-1)?.value || 0),
        unit: 'ore',
        sourceIds: sid,
      },
      ...(perPupil
        ? [{ label: 'Syntetiske elever', value: count, unit: 'number' as const, sourceIds: sid }]
        : []),
    ];
    base.assumptions.push(
      'Nøgletal beregnes i heltal øre; visning afrundes til kroner. Nettoudgift / elevtal for samme enheder og år. Tværsnit bruger altid samme månedsspænd.',
    );
  }
  if (intent === 'forecast') {
    const data: ChartRow[] = Array.from({ length: 12 }, (_, i) => {
      const mp = { year: p.year, fromMonth: i + 1, toMonth: i + 1 },
        past = observed({ year: p.year, month: i + 1 } as LedgerRow, dataset);
      return {
        label: months[i],
        budget: sum(selectedRows(rows, mp, 'budget', dataset)),
        actual: past ? sum(selectedRows(rows, mp, 'actual', dataset)) : null,
        forecast: !past ? sum(selectedRows(rows, mp, 'outlook', dataset)) : null,
      };
    });
    base.title = 'Årsprognose mod demobudget';
    base.conclusion = `Årsprognosen er ${money(annualForecast)}, ${money(Math.abs(annualForecast - annualBudget))} ${annualForecast >= annualBudget ? 'over' : 'under'} det simulerede helårsbudget på ${money(annualBudget)}. [1]`;
    base.chart = chart('line', base.title, data, [
      { key: 'budget', label: 'Budget', color: colors[2] },
      { key: 'actual', label: 'Realiseret', color: colors[1] },
      { key: 'forecast', label: 'Prognose', color: colors[0], dashed: true },
    ]);
    base.chart.subtitle = `Januar–december ${p.year} · kr. · realiseret til ${dataset.referenceDate}`;
    base.metrics = [
      { label: 'Helårsbudget', value: annualBudget, unit: 'ore', sourceIds: sid },
      { label: 'Årsprognose', value: annualForecast, unit: 'ore', sourceIds: sid },
      {
        label: 'Forventet afvigelse',
        value: annualForecast - annualBudget,
        unit: 'ore',
        sourceIds: sid,
      },
    ];
  }
  if (intent === 'category') {
    const data = CATEGORIES.map((category) => ({
      label: CATEGORY_LABELS[category],
      budget: sum(budgetRows.filter((r) => r.category === category)),
      actual: sum(outlookRows.filter((r) => r.category === category)),
      value:
        sum(outlookRows.filter((r) => r.category === category)) -
        sum(budgetRows.filter((r) => r.category === category)),
    }));
    let running = 0;
    const waterfall = data.map((r) => {
      const row = { ...r, start: running };
      running += r.value;
      return row;
    });
    const top = [...data].sort((a, b) => b.value - a.value)[0];
    base.title = 'Bidrag til nettoafvigelsen';
    base.conclusion = `${top.label} bidrager mest til nettoafvigelsen med ${money(top.value)}. De seks kategorier summerer til ${money(outlook - budget)}. [1]`;
    base.chart = chart('waterfall', base.title, waterfall, [
      { key: 'value', label: 'Bidrag til afvigelse', color: colors[0] },
    ]);
  }
  if (intent === 'composition') {
    const data = isCouncilOnly(access)
      ? [
          {
            label: AREA_LABELS[context.area],
            ...Object.fromEntries(
              CATEGORIES.map((c) => [c, sum(outlookRows.filter((r) => r.category === c))]),
            ),
          },
        ]
      : entities.map((e) => {
          const er = outlookRows.filter((r) => r.entityId === e.id);
          return {
            label: e.name,
            ...Object.fromEntries(
              CATEGORIES.map((c) => [c, sum(er.filter((r) => r.category === c))]),
            ),
          };
        });
    base.title = 'Udgifternes sammensætning';
    base.chart = chart(
      'stacked',
      base.title,
      data,
      CATEGORIES.map((c, i) => ({ key: c, label: CATEGORY_LABELS[c], color: colors[i] })),
    );
    base.conclusion = `De simulerede udgifter er opdelt i fem positive udgiftskategorier og negative indtægter. Netto: ${money(outlook)}. [1]`;
  }
  if (intent === 'heatmap') {
    if (!canUseDetailedData(access))
      throw new AccessDeniedError('Varmekort på enhedsniveau kræver detaljeret adgang.');
    const data = entities.map((e) => ({
      label: e.name,
      ...Object.fromEntries(
        Array.from({ length: p.toMonth - p.fromMonth + 1 }, (_, i) => {
          const month = p.fromMonth + i,
            mp = { year: p.year, fromMonth: month, toMonth: month };
          const er = rows.filter((r) => r.entityId === e.id);
          return [
            `month${month}`,
            sum(selectedRows(er, mp, 'outlook', dataset)) -
              sum(selectedRows(er, mp, 'budget', dataset)),
          ];
        }),
      ),
    }));
    base.title = 'Afvigelser pr. enhed og måned';
    base.chart = chart(
      'heatmap',
      base.title,
      data,
      Array.from({ length: p.toMonth - p.fromMonth + 1 }, (_, i) => ({
        key: `month${p.fromMonth + i}`,
        label: months[p.fromMonth + i - 1],
        color: colors[i % colors.length],
      })),
    );
    base.conclusion = `Varmekortet viser regnskab/prognose minus samme måneds budget. Positivt beløb er merforbrug; samlet afvigelse er ${money(outlook - budget)}. [1]`;
  }
  if (intent === 'documents') {
    base.title = /strategi/.test(q)
      ? 'Simulerede strategier'
      : 'Simulerede beslutninger og grundlag';
    base.chart = undefined;
    base.metrics = [];
    base.sources = docSources(docs);
    base.conclusion = docs.length
      ? `Der er fundet ${docs.length} relevante, tilladte demodokumenter for ${scope}. Alle beslutninger og tal i dokumenterne er fiktive. [1]`
      : 'Der er ingen dokumenter med din klassifikation og enhedsscope i den valgte periode.';
    if (docs.length && docs.every((d) => d.period !== String(p.year)))
      base.conclusion = `Der findes ingen direkte matchende demodokumenter for ${p.year}; her vises ${docs.length} tidligere, tilladte dokumenter. Deres perioder fremgår af kilderne. [1]`;
    base.narrative = docs.map(
      (d, i) =>
        `${d.title}: ${d.type === 'decision' ? 'Udvalgssekretariatets simulerede prioritering af energi og vikarforbrug.' : d.type === 'strategy' ? 'Simulerede mål og økonomiske antagelser bag opfølgningen.' : 'Budgetgrundlag og opfølgning for det samme simulerede datagrundlag.'} [${i + 1}]`,
    );
    if (!docs.length)
      base.missingData = 'Dokumenter med bredere eller intern klassifikation udleveres ikke.';
  }
  if (intent === 'scenario') {
    const assumptions = context.scenario || { ...DEFAULT_SCENARIO };
    const result = calculateScenario(rows, p, assumptions, dataset);
    base.title = 'Hvad nu hvis?';
    base.scenario = {
      assumptions,
      baselineOre: result.baselineOre,
      scenarioOre: result.scenarioOre,
      deltaOre: result.deltaOre,
    };
    base.conclusion = `Årsprognosen ændres fra ${money(result.baselineOre)} til ${money(result.scenarioOre)}: en ${result.deltaOre >= 0 ? 'stigning' : 'reduktion'} på ${money(Math.abs(result.deltaOre))}. [1]`;
    base.metrics = [
      { label: 'Baseline · årsprognose', value: result.baselineOre, unit: 'ore', sourceIds: sid },
      { label: 'Scenarie · årsprognose', value: result.scenarioOre, unit: 'ore', sourceIds: sid },
      { label: 'Ændring i forbrug', value: result.deltaOre, unit: 'ore', sourceIds: sid },
      {
        label: 'Ny budgetramme',
        value: result.budgetScenarioOre,
        unit: 'ore',
        description: 'Budgetændring påvirker rammen; den ændrer ikke forbruget automatisk.',
        sourceIds: sid,
      },
    ];
    base.chart = chart('scenario', 'Baseline og scenarie · måned for måned', result.rows, [
      { key: 'baseline', label: 'Baseline', color: colors[2] },
      { key: 'scenario', label: 'Scenarie', color: colors[0], dashed: true },
    ]);
    base.chart.subtitle = `Januar–december ${p.year} · kr. · ${assumptions.horizon === 'annual' ? 'illustrativ helårsvirkning' : 'virkning i resterende prognosemåneder'}`;
    base.assumptions.push(
      `Horisont: ${assumptions.horizon === 'annual' ? 'alle årets måneder som illustrativ helårsvirkning; regnskabshistorikken omskrives ikke' : 'kun årets prognosemåneder efter reference'}. Baseline bevares uændret.`,
      `Energi ${pct(assumptions.energyPercent)} %, løn ${pct(assumptions.salaryPercent)} %, vikarer ${pct(assumptions.substitutePercent)} %, elevtal ${pct(assumptions.pupilsPercent)} %, vedligehold ${pct(assumptions.maintenancePercent)} %. Hver kontokategori ændres højst én gang.`,
      `Elevtal påvirker kun 28 % af aktivitetsudgifterne. Løn, bygninger og faste udgifter følger ikke automatisk elevtallet. Budget ${pct(assumptions.budgetPercent)} % ændrer budgetrammen separat; ingen automatisk besparelse.`,
    );
    base.narrative = [
      `Forventet nettoafvigelse mod scenariets budgetramme: ${money(result.scenarioOre - result.budgetScenarioOre)}. [1]`,
      `Bidrag fra energi ${money(result.effects.energy)}, løn ${money(result.effects.salary)}, vikarer ${money(result.effects.substitute)}, variable elevaktiviteter ${money(result.effects.pupils)} og vedligehold ${money(result.effects.maintenance)}. [1]`,
    ];
    base.followups = [
      'Vis baseline og scenarie i samme graf.',
      'Hvad hvis energiprisen stiger 5 procent resten af året?',
      'Nulstil scenariet til baseline.',
    ];
  }
  if (intent === 'pricequantity') {
    const result = decomposePriceQuantity(rows, p, dataset);
    base.title = 'Energi · pris, mængde og samspil';
    if (!result.matchedInvoices) {
      base.chart = undefined;
      base.metrics = [];
      base.conclusion =
        'Der findes ikke to sammenlignelige perioder med lokale simulerede energifakturaer.';
      base.missingData =
        'Sammenligningen kræver et foregående år i datasættet og matchende kWh-fakturaer.';
      return finalizeAnalysis(base);
    }
    const changes = [
      { label: 'Priseffekt', value: result.priceEffectOre },
      { label: 'Mængdeeffekt', value: result.quantityEffectOre },
      { label: 'Samspil', value: result.interactionOre },
      { label: 'Uforklaret rest', value: result.unexplainedOre },
    ];
    let running = result.baselineOre;
    const points: ChartRow[] = [
      { label: `Energi ${p.year - 1}`, value: result.baselineOre, start: 0 },
      ...changes.map((r) => {
        const point = { ...r, start: running };
        running += r.value;
        return point;
      }),
      { label: `Energi ${p.year}`, value: result.currentOre, start: 0 },
    ];
    base.chart = chart('waterfall', base.title, points, [
      { key: 'value', label: 'Energiudgift / bidrag', color: colors[0] },
    ]);
    base.conclusion = `I simuleringen kan ændringen på ${money(result.currentOre - result.baselineOre)} henføres til pris ${money(result.priceEffectOre)}, mængde ${money(result.quantityEffectOre)} og samspil ${money(result.interactionOre)}. Uforklaret rest: ${money(result.unexplainedOre)}. [1]`;
    base.metrics = [
      { label: 'Priseffekt', value: result.priceEffectOre, unit: 'ore', sourceIds: sid },
      { label: 'Mængdeeffekt', value: result.quantityEffectOre, unit: 'ore', sourceIds: sid },
      { label: 'Samspil', value: result.interactionOre, unit: 'ore', sourceIds: sid },
      { label: 'Uforklaret rest', value: result.unexplainedOre, unit: 'ore', sourceIds: sid },
    ];
    base.assumptions.push(
      'For hver matchet lokal energifaktura: priseffekt = (P1−P0) × Q0; mængdeeffekt = (Q1−Q0) × P0; samspil = (P1−P0) × (Q1−Q0). Summen er præcis P1×Q1−P0×Q0.',
      'kWh og øre/kWh, ens måneder og enhed/produktlot, ens momsgrundlag. Der er ét energiprodukt; ingen varesammensætningsændring. Generelle eksterne prisindeks er kontekst, ikke dokumentation for en lokal årsag.',
    );
    base.narrative = [
      `${result.matchedInvoices} lokale simulerede fakturapar dækker ${periodText(p)} og samme måneder i ${p.year - 1}. Samlet udgift går fra ${money(result.baselineOre)} til ${money(result.currentOre)}. [1]`,
      'Dette er en eksakt regneforklaring af det modellerede energiprodukt. Dokumentforklaringer og antagelser om virkelige økonomiske årsager er adskilte.',
    ];
  }
  if (intent === 'demography') {
    const demography = dataset.demography || [],
      current = demography.find((r) => r.year === p.year && r.ageGroup === '6-16'),
      prior = demography.find((r) => r.year === p.year - 1 && r.ageGroup === '6-16');
    if (context.area !== 'schools' || !current || !prior) {
      base.chart = undefined;
      base.metrics = [];
      base.conclusion =
        'Denne forklaringsmodel kræver skoleområdets simulerede aldersgrupper og to sammenlignelige år.';
      base.missingData = 'Demografimodellen er afgrænset til 6–16-årige og skoleaktivitet.';
      return finalizeAnalysis(base);
    }
    const activity = sum(
      selectedRows(rows, allYear, 'outlook', dataset).filter((r) => r.category === 'activity'),
    );
    const ratio = (current.population - prior.population) / prior.population,
      variableBase = Math.round(activity * 0.28),
      effect = Math.round(variableBase * ratio),
      fixed = annualForecast - variableBase;
    base.title = 'Demografi og variable skoleudgifter';
    base.conclusion = `Den simulerede gruppe 6–16 år ændres fra ${prior.population.toLocaleString('da-DK')} til ${current.population.toLocaleString('da-DK')} personer (${pct(ratio * 100)} %). En illustrativ aktivitetsvirkning er ${money(effect)}; faste udgifter ændres ikke automatisk. [1]`;
    base.chart = chart(
      'waterfall',
      'Illustrativ ændring · variable aktiviteter',
      [
        { label: 'Baseline', value: annualForecast, start: 0 },
        { label: 'Faste udgifter', value: 0, start: annualForecast },
        { label: 'Variable aktiviteter', value: effect, start: annualForecast },
        { label: 'Illustrativt scenarie', value: annualForecast + effect, start: 0 },
      ],
      [{ key: 'value', label: 'Nettoudgift / virkning', color: colors[0] }],
    );
    base.metrics = [
      {
        label: 'Ændring · 6–16 år',
        value: current.population - prior.population,
        unit: 'number',
        sourceIds: sid,
      },
      { label: 'Variable omkostninger', value: variableBase, unit: 'ore', sourceIds: sid },
      { label: 'Faste øvrige udgifter', value: fixed, unit: 'ore', sourceIds: sid },
      { label: 'Illustrativ virkning', value: effect, unit: 'ore', sourceIds: sid },
    ];
    base.narrative = [
      `Demografisnapshot: ${JSON.stringify(demography.filter((r) => r.year === p.year))}. Kategorierne viser fødsler, dødsfald, nettoflytning indenlands og international nettovandring separat. Aldersovergange ind og ud af hver gruppe er særskilte felter. Årsbestanden afstemmes som sidste års bestand + fødsler − dødsfald + indenlandsk nettoflytning + international nettovandring + aldersovergang ind − aldersovergang ud. [1]`,
      'Der beregnes hverken en automatisk skatte- eller udligningseffekt. Kapacitet, flyttemønstre, kohorteskift og en antaget forsinkelse på ét budgetår kan ændre den faktiske effekt.',
    ];
    base.assumptions.push(
      'Forenklet illustrativ model: ændring i 6–16-årige → samme procentuelle ændring i aktivitet → 28 % af aktivitetsudgifterne er variable. Øvrige udgifter holdes faste. Ingen kapacitetslukning er forudsat.',
      'Demografihændelser og aldersovergange er simulerede, aggregerede snapshotværdier. Kapacitet og tidsforsinkelse skal analyseres før en faktisk budgetbeslutning.',
    );
    source.excerpt += ` Demografisnapshot for 6–16-årige: basis ${prior.population}, aktuelt ${current.population}; aktivitetsudgift ${activity} øre, variabel andel 28 %, virkning ${effect} øre. Alle simulerede kohorter og separate hændelser: ${JSON.stringify(demography.filter((r) => r.year === p.year || r.year === p.year - 1))}.`;
  }
  if (
    (['comparison', 'energy'].includes(intent) || entities.length <= 3) &&
    base.sources.length > 0
  ) {
    const byUrl = new Map<string, typeof entities>();
    for (const entity of entities)
      byUrl.set(entity.nameSourceUrl, [...(byUrl.get(entity.nameSourceUrl) || []), entity]);
    for (const [url, group] of byUrl)
      base.sources.push({
        id: `NAME-${hash(url + group.map((e) => e.id).join(',')).toString(16)}`,
        title: `Officiel navnekilde · ${group[0].type === 'school' ? 'skoler' : group[0].type === 'facility' ? 'faciliteter' : 'organisation'}`,
        type: 'name',
        url,
        excerpt: `Denne officielle kilde verificerer kun eksistens og stavning af navnene: ${group.map((e) => e.name).join('; ')}. Verificeret ${group[0].verifiedAt}. Den dokumenterer ingen af analysens økonomital, elevtal eller beslutninger; disse er simulerede og har særskilte demokilder.`,
        period: `Navne verificeret ${group[0].verifiedAt}`,
        datasetVersion: dataset.version,
      });
  }
  source.excerpt += ` Fælles beregningsresultat: ${JSON.stringify({ metrics: base.metrics.map((m) => ({ label: m.label, value: m.value, unit: m.unit })), chart: base.chart?.rows, scenario: base.scenario })}.`;
  if (isCouncilOnly(access))
    base.assumptions.push(
      'Politisk adgang: kun aggregerede økonomiresultater og politiske demodokumenter. Individuelle posteringer udleveres ikke.',
    );
  return finalizeAnalysis(base);
}
