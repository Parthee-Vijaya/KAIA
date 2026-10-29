import { AREA_LABELS, CATEGORY_LABELS, hash, pupilsForYear } from './data';
import type { Dataset } from './data';
import { money, number } from './format';
import {
  AccessDeniedError,
  allowedEntities,
  assertScope,
  canAccessDocument,
  isCouncilOnly,
} from './policy';
import type { AccessContext, Analysis, Category, ChartRow, LedgerRow, SourceRef } from './types';

type ProjectionMetric = 'net' | 'energy' | 'perPupil' | 'perCapita';
type ProjectionContext = Analysis['context'] & {
  metric?: ProjectionMetric;
  projectionEndYear?: number;
};
const LAST_PROJECTION_YEAR = 2032;
const SENSITIVITY_PERCENT = 1;
const COST_CATEGORIES: Category[] = ['salary', 'energy', 'substitute', 'maintenance', 'activity'];

function exactSum(values: number[]): number {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value))
      throw new Error('Prognosebeløb skal være sikre heltal i øre.');
    total += BigInt(value);
  }
  const result = Number(total);
  if (!Number.isSafeInteger(result))
    throw new Error('Prognosebeløbet overstiger præcis øreberegning.');
  return result;
}

function roundedRatio(numerator: bigint, denominator: bigint): number {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude + denominator / 2n) / denominator;
  const result = Number(numerator < 0n ? -rounded : rounded);
  if (!Number.isSafeInteger(result))
    throw new Error('Prognosebeløbet overstiger præcis øreberegning.');
  return result;
}

function sensitivity(amountOre: number, direction: -1 | 1, steps: number): number {
  return roundedRatio(
    BigInt(amountOre) * BigInt(100 + direction * SENSITIVITY_PERCENT) ** BigInt(steps),
    100n ** BigInt(steps),
  );
}

function growth(current: number, baseline: number): number | null {
  return baseline === 0 ? null : ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Recomputes a complete annual projection from authorized ledger rows. The model may
 * choose this operation, but cannot supply values, rights or an uncertainty interval.
 */
export function applyMultiYearProjection(
  base: Analysis,
  dataset: Dataset,
  access: AccessContext,
  endYear: number,
): Analysis {
  const referenceYear = Number(dataset.referenceDate.slice(0, 4));
  const referenceMonth = Number(dataset.referenceDate.slice(5, 7));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dataset.referenceDate) ||
    !Number.isFinite(Date.parse(dataset.referenceDate)) ||
    referenceMonth < 1 ||
    referenceMonth > 12
  )
    throw new Error('Dataversionens referencedato er ugyldig.');
  if (!Number.isInteger(endYear) || endYear < referenceYear || endYear > LAST_PROJECTION_YEAR)
    throw new Error(
      `Prognosens slutår skal være et helt år fra ${referenceYear} til ${LAST_PROJECTION_YEAR}.`,
    );
  if (base.datasetVersion !== dataset.version)
    throw new Error('Analysen og prognosens datagrundlag skal have samme dataversion.');

  const previousContext = base.context as ProjectionContext;
  const metric = previousContext.metric || 'net';
  const requestedIds = [...new Set(base.context.entityIds)];
  assertScope(access, requestedIds, dataset.entities, base.context.area);
  const entities = dataset.entities.filter((entity) => requestedIds.includes(entity.id));
  if (entities.some((entity) => entity.area !== base.context.area || entity.type === 'committee'))
    throw new AccessDeniedError(
      'Prognosen skal afgrænses til tilladte driftsenheder i samme område.',
    );
  const council = isCouncilOnly(access);
  const permittedAreaIds = allowedEntities(access, dataset.entities)
    .filter((entity) => entity.area === base.context.area && entity.type !== 'committee')
    .map((entity) => entity.id);
  if (council && permittedAreaIds.some((id) => !requestedIds.includes(id)))
    throw new AccessDeniedError(
      'Din politiske adgang omfatter kun prognoser for det samlede tilladte område.',
    );

  const context: ProjectionContext = {
    ...base.context,
    period: { year: referenceYear, fromMonth: 1, toMonth: 12 },
    intent: 'projection',
    metric,
    projectionEndYear: endYear,
    scenario: undefined,
  };
  const scope =
    council || entities.length !== 1 ? AREA_LABELS[context.area].toLowerCase() : entities[0].name;
  const metricLabel =
    metric === 'energy'
      ? 'energiudgifter'
      : metric === 'perPupil'
        ? 'nettoudgift pr. elev'
        : 'nettoudgifter';
  const unitLabel = metric === 'perPupil' ? 'kr./elev' : 'kr.';
  const period = `${referenceYear}–${endYear}`;
  const sourceId = `DEMO-CALC-PROJECTION-${hash(JSON.stringify({ version: dataset.version, seed: dataset.seed, reference: dataset.referenceDate, ids: requestedIds.sort(), metric, endYear })).toString(16)}`;
  const retainedSources = base.sources.filter((source) => {
    if (source.datasetVersion !== dataset.version || source.id.startsWith('DEMO-CALC-'))
      return false;
    if (council && source.rowIds?.length) return false;
    if (source.documentId) {
      const document = dataset.documents.find((item) => item.id === source.documentId);
      return Boolean(document && canAccessDocument(access, document, dataset.entities));
    }
    return (
      source.type === 'context' ||
      (source.type === 'name' && entities.some((entity) => entity.nameSourceUrl === source.url))
    );
  });
  const missing = (reason: string): Analysis => ({
    ...base,
    analysisId: `${base.analysisId}-projection-${hash(sourceId).toString(16)}`,
    title: 'Prognosen mangler et datagrundlag',
    conclusion: reason,
    narrative: [
      `Alle kommunale tal er simulerede. Dataversion ${dataset.version}, reference ${dataset.referenceDate}. Der vises ingen nulværdier som erstatning for manglende prognoseposter.`,
      'En gemt analyse beholder sin oprindelige dataversion. Start en ny analyse på det aktuelle datasnapshot for at undersøge en længere prognoseperiode.',
    ],
    metrics: [],
    chart: undefined,
    sources: retainedSources,
    context,
    assumptions: [
      'Fremtidige regnskabstal konstrueres ikke. Manglende belæg giver ingen beregnet prognose.',
    ],
    followups: [
      'Start en ny analyse af budgetstatus.',
      'Vis årsprognosen for det aktuelle referenceår.',
    ],
    missingData: reason,
    renderedText: undefined,
    formulation: undefined,
    scenario: undefined,
  });
  if (!['net', 'energy', 'perPupil', 'perCapita'].includes(metric))
    return missing('Det valgte nøgletal understøttes ikke af flerårsprognosen.');
  if (metric === 'perCapita')
    return missing(
      'Der mangler en befolkningsserie med dokumenteret sammenhæng til præcis dette områdes afgrænsning. En kommunal befolkningstotal bruges ikke som områdets eget aktivitetsmål.',
    );
  if (metric === 'perPupil' && entities.some((entity) => entity.type !== 'school'))
    return missing(
      'Prognose pr. elev kræver en afgrænsning, som udelukkende består af skoler med syntetiske elevtal.',
    );
  if (
    metric === 'perPupil' &&
    entities.some((entity) => !Number.isFinite(entity.synthetic.pupils) || !entity.synthetic.pupils)
  )
    return missing('En eller flere valgte skoler mangler et gyldigt syntetisk elevtal.');

  const selectedIds = new Set(requestedIds);
  const rows = dataset.rows.filter(
    (row) =>
      selectedIds.has(row.entityId) &&
      row.datasetVersion === dataset.version &&
      row.year >= referenceYear &&
      row.year <= endYear &&
      (metric !== 'energy' || row.category === 'energy'),
  );
  const observed = (row: LedgerRow) =>
    row.year < referenceYear || (row.year === referenceYear && row.month <= referenceMonth);
  const used = rows.filter(
    (row) => row.kind === 'budget' || row.kind === (observed(row) ? 'actual' : 'forecast'),
  );
  const coverage = new Map<string, Set<Category>>();
  for (const row of used) {
    const key = `${row.entityId}:${row.year}:${row.month}:${row.kind === 'budget' ? 'budget' : 'outlook'}`;
    const categories = coverage.get(key) || new Set<Category>();
    categories.add(row.category);
    coverage.set(key, categories);
  }
  const absent = new Set<string>();
  for (let year = referenceYear; year <= endYear; year++)
    for (const id of requestedIds)
      for (let month = 1; month <= 12; month++) {
        const budget = coverage.get(`${id}:${year}:${month}:budget`);
        const outlook = coverage.get(`${id}:${year}:${month}:outlook`);
        if (
          !budget?.size ||
          !outlook?.size ||
          budget.size !== outlook.size ||
          [...budget].some((category) => !outlook.has(category))
        )
          absent.add(`${year}-${String(month).padStart(2, '0')}`);
      }
  if (absent.size)
    return missing(
      `Dataversion ${dataset.version} har ikke et komplet budget- og prognosegrundlag for ${period}. Manglende eller ufuldstændige måneder: ${[...absent].slice(0, 12).join(', ')}${absent.size > 12 ? ' m.fl.' : ''}.`,
    );

  const annual = Array.from({ length: endYear - referenceYear + 1 }, (_, offset) => {
    const year = referenceYear + offset;
    const annualRows = used.filter((row) => row.year === year);
    const budget = annualRows.filter((row) => row.kind === 'budget');
    const outlook = annualRows.filter((row) => row.kind !== 'budget');
    const actual = outlook.filter((row) => row.kind === 'actual');
    const forecast = outlook.filter((row) => row.kind === 'forecast');
    const sumRows = (items: LedgerRow[]) => exactSum(items.map((row) => row.amountOre));
    const baseOre = sumRows(outlook);
    const lower = exactSum(
      outlook.map((row) =>
        row.kind === 'actual' || row.category === 'income'
          ? row.amountOre
          : sensitivity(row.amountOre, -1, offset + 1),
      ),
    );
    const upper = exactSum(
      outlook.map((row) =>
        row.kind === 'actual' || row.category === 'income'
          ? row.amountOre
          : sensitivity(row.amountOre, 1, offset + 1),
      ),
    );
    const pupils =
      metric === 'perPupil'
        ? entities.reduce((total, entity) => total + pupilsForYear(entity, year), 0)
        : 1;
    if (!Number.isSafeInteger(pupils) || pupils < 1)
      throw new Error(`Der mangler et gyldigt syntetisk elevtal for ${year}.`);
    const normalized = (amount: number) => roundedRatio(BigInt(amount), BigInt(pupils));
    return {
      year,
      outlook,
      budgetOre: sumRows(budget),
      baseOre,
      actualOre: sumRows(actual),
      forecastOre: sumRows(forecast),
      incomeOre: sumRows(outlook.filter((row) => row.category === 'income')),
      expensesOre: sumRows(outlook.filter((row) => row.category !== 'income')),
      lowOre: Math.min(lower, upper),
      highOre: Math.max(lower, upper),
      pupils,
      budget: normalized(sumRows(budget)),
      base: normalized(baseOre),
      low: normalized(Math.min(lower, upper)),
      high: normalized(Math.max(lower, upper)),
      actual: actual.length ? normalized(sumRows(actual)) : null,
      forecast: forecast.length ? normalized(sumRows(forecast)) : null,
    };
  });
  const first = annual[0],
    last = annual.at(-1)!;
  const cumulativeGrowth = growth(last.base, first.base);
  const chartRows: ChartRow[] = annual.map((year, index) => ({
    label: String(year.year),
    budget: year.budget,
    base: year.base,
    low: year.low,
    high: year.high,
    actual: year.actual,
    forecast: year.forecast,
    cumulativeGrowthPercent: growth(year.base, first.base),
    annualGrowthPercent: index ? growth(year.base, annual[index - 1].base) : null,
    actualMonths: year.year === referenceYear ? referenceMonth : 0,
    forecastMonths: year.year === referenceYear ? 12 - referenceMonth : 12,
    ...(metric === 'perPupil' ? { pupils: year.pupils } : {}),
  }));
  const categoryNotes = COST_CATEGORIES.flatMap((category) => {
    const start = exactSum(
      first.outlook.filter((row) => row.category === category).map((row) => row.amountOre),
    );
    const end = exactSum(
      last.outlook.filter((row) => row.category === category).map((row) => row.amountOre),
    );
    const change = growth(end, start);
    return change === null ? [] : [`${CATEGORY_LABELS[category]} ${number(change, 1)} %`];
  });
  const energyBasis = (outlook: LedgerRow[]) => {
    const invoices = outlook.filter((row) => row.category === 'energy');
    if (
      !invoices.length ||
      invoices.some(
        (row) =>
          !Number.isSafeInteger(row.quantity) ||
          !row.quantity ||
          !Number.isSafeInteger(row.unitPriceOre) ||
          row.amountOre !== row.quantity * row.unitPriceOre!,
      )
    )
      return undefined;
    const quantity = exactSum(invoices.map((row) => row.quantity!));
    return { quantity, price: exactSum(invoices.map((row) => row.amountOre)) / quantity };
  };
  const firstEnergy = energyBasis(first.outlook),
    lastEnergy = energyBasis(last.outlook);
  const activityNote =
    firstEnergy && lastEnergy
      ? `De simulerede energifakturaer viser ${number(growth(lastEnergy.quantity, firstEnergy.quantity)!, 1)} % ændring i kWh og ${number(growth(lastEnergy.price, firstEnergy.price)!, 1)} % i mængdevægtet øre/kWh fra ${referenceYear} til ${endYear}. Det er pris og mængde i demoens lokale fakturamodel; øvrige kategorier kan ikke opdeles tilsvarende uden separate aktivitetsdata.`
      : 'Forløbet afspejler de versionerede budget- og prognoseposter. Pris og aktivitet kan ikke adskilles, hvor ledgeren mangler dokumenterede mængder og enhedspriser.';
  const sensitivityText = `Lavt og højt er et illustrativt følsomhedsspænd med ±${SENSITIVITY_PERCENT} % ekstra årlig multiplikativ følsomhed omkring basisforløbet: fremtidige udgiftsposter skaleres med (1 ± ${SENSITIVITY_PERCENT}/100)^(år − ${referenceYear} + 1), afrundet pr. post til nærmeste øre. Det ændrer ikke hver kategoris vækstrate med præcis ±${SENSITIVITY_PERCENT} procentpoint. I ${referenceYear} påvirkes kun måneder efter reference ${dataset.referenceDate}. Realiserede poster og alle indtægter er uændrede. Spændet er en antagelse, ikke et statistisk konfidensinterval eller en certificeret prognose.`;
  const excerpt = [
    `SIMULEREDE KOMMUNALE TAL. Dataversion ${dataset.version}; seed ${dataset.seed}; reference ${dataset.referenceDate}.`,
    `Afgrænsning: ${council ? `${AREA_LABELS[context.area]}, ${entities.length} tilladte driftsenheder, kun årsaggregater` : requestedIds.join(', ')}. Nøgletal: ${metricLabel}.`,
    'Fuldt reproducerbart udtræk: vælg datasetVersion og de autoriserede entityId-værdier; år fra referenceåret til slutåret; måned 1–12. Budget vælges separat. Årsbasis er actual til og med referencemåneden og forecast derefter, aldrig begge for samme måned. Ingen actual efter reference anvendes.',
    ...(metric === 'energy'
      ? [
          'Filter: category = energy. Øvrige udgifter og indtægter indgår ikke i energi-nøgletallet.',
        ]
      : []),
    ...annual.map(
      (year) =>
        `${year.year}: helårsbudget ${year.budgetOre} øre; actual ${year.year === referenceYear ? `${year.actualOre} øre (${referenceMonth} måneder)` : 'ikke tilgængelig'}; forecast ${year.forecastOre} øre; årsnetto ${year.baseOre} øre = udgifter ${year.expensesOre} øre + indtægter ${year.incomeOre} øre; lavt ${year.lowOre} øre; højt ${year.highOre} øre${metric === 'perPupil' ? `; syntetiske elever ${year.pupils}; årsnetto pr. elev ${year.base} øre` : ''}.`,
    ),
    'Indtægter bogføres negativt. Positiv ændring i netto er en højere nettoudgift. Vækst = (årets værdi − referenceårets værdi) / |referenceårets værdi| × 100; nulnævner har ingen vækstrate.',
    sensitivityText,
    ...(!council
      ? [
          `Kategoriernes samlede ændring i basisforløbet: ${categoryNotes.join('; ')}. Det er ændringer i beløb, ikke dokumenterede årsager.`,
          activityNote,
        ]
      : []),
  ].join('\n');
  const source: SourceRef = {
    id: sourceId,
    title: `Simuleret flerårsberegning · ${period}`,
    type: 'demo',
    status: 'simulated',
    excerpt,
    period,
    datasetVersion: dataset.version,
    observedAt: dataset.referenceDate,
    unit: unitLabel,
    ...(!council ? { rowIds: used.slice(0, 10).map((row) => row.id) } : {}),
  };
  const sourceIds = [sourceId];
  return {
    ...base,
    analysisId: `${base.analysisId}-projection-${hash(sourceId).toString(16)}`,
    title: `Flerårsprognose · ${scope}`,
    conclusion: `I simuleringen er ${metricLabel} ${money(last.base, true)}${metric === 'perPupil' ? ' pr. elev' : ''} i ${endYear}, mod ${money(first.base, true)}${metric === 'perPupil' ? ' pr. elev' : ''} i ${referenceYear}${cumulativeGrowth === null ? '. Vækstprocent kan ikke beregnes fra en nulbasis' : `; samlet ændring ${number(cumulativeGrowth, 1)} %`}. [1]`,
    narrative: [
      `${referenceYear} kombinerer realiserede måneder til ${dataset.referenceDate} med prognose for resten af året. Senere år indeholder udelukkende budget og prognose. Hvert punkt omfatter et helt kalenderår. [1]`,
      `I ${endYear} er basis ${money(last.base, true)} mod helårsbudget ${money(last.budget, true)}${metric === 'perPupil' ? ' pr. elev' : ''}. Lavt/højt følsomhedsforløb er ${money(last.low, true)}–${money(last.high, true)}${metric === 'perPupil' ? ' pr. elev' : ''}. [1]`,
      metric === 'energy'
        ? 'Energiudgifterne er udvalgt fra energikategorien. Et prisfølsomhedsspænd ændrer ingen øvrige kontokategorier. [1]'
        : `Nettoudgiften i ${endYear} omfatter ${money(last.expensesOre, true)} i udgifter og ${money(last.incomeOre, true)} i indtægter${metric === 'perPupil' ? ', før division med årets syntetiske elevtal' : ''}. Indtægter holdes uændrede i følsomhedsspændet. [1]`,
      ...(!council
        ? [
            `Basisforløbets samlede beløbsændringer: ${categoryNotes.join('; ')}. De er afledt af ledgerens kategorier og dokumenterer ikke i sig selv årsager. [1]`,
            `${activityNote} [1]`,
          ]
        : []),
    ],
    metrics: [
      {
        label: `Årsbasis ${referenceYear}${metric === 'perPupil' ? ' pr. elev' : ''}`,
        value: first.base,
        unit: 'ore',
        sourceIds,
      },
      {
        label: `Basis ${endYear}${metric === 'perPupil' ? ' pr. elev' : ''}`,
        value: last.base,
        unit: 'ore',
        sourceIds,
      },
      ...(cumulativeGrowth === null
        ? []
        : [
            {
              label: 'Samlet ændring',
              value: cumulativeGrowth,
              unit: 'percent' as const,
              sourceIds,
            },
          ]),
      {
        label: `Lavt ${endYear}${metric === 'perPupil' ? ' pr. elev' : ''}`,
        value: last.low,
        unit: 'ore',
        sourceIds,
      },
      {
        label: `Højt ${endYear}${metric === 'perPupil' ? ' pr. elev' : ''}`,
        value: last.high,
        unit: 'ore',
        sourceIds,
      },
    ],
    chart: {
      type: 'line',
      title: `Simuleret ${metricLabel} · ${period}`,
      subtitle: `Hele kalenderår · ${unitLabel} · basis = realiseret + prognose · stiplet = prognose/følsomhed · ${dataset.version}`,
      unit: 'ore',
      rows: chartRows,
      series: [
        { key: 'budget', label: 'Helårsbudget', color: '#464f5e' },
        { key: 'base', label: 'Basisprognose', color: '#bc4d30', dashed: true },
        { key: 'low', label: 'Lavt · følsomhed', color: '#006f71', dashed: true },
        { key: 'high', label: 'Højt · følsomhed', color: '#9b4028', dashed: true },
      ],
      sourceIds,
    },
    sources: [source, ...retainedSources],
    context,
    assumptions: [
      `Alle kommunale tal, elevtal og fremtidige budgetter er SIMULEREDE. Dataversion ${dataset.version}; seed ${dataset.seed}; reference ${dataset.referenceDate}.`,
      'Basisforløbet læser de eksisterende, versionerede budget- og prognoseposter. Det ekstrapolerer ikke kommunens faktiske økonomi og indfører ingen nye realiserede tal.',
      'Beløb summeres som sikre heltalsøre; følsomhed beregnes med heltalsbrøker og afrundes pr. post til nærmeste øre. Grafer og nøgletal bruger samme resultater.',
      sensitivityText,
      'Årlige beløbsændringer kan afspejle pris, aktivitet og sammensætning. En prisforklaring kræver lokale mængder og enhedspriser; en generel vækstrate beviser ingen årsag.',
      metric === 'perPupil'
        ? 'Hvert års netto i øre divideres med pupilsForYear for de samme valgte skoler og samme år, afrundet til nærmeste øre pr. elev. Skolernes faste udgifter reduceres ikke automatisk ved faldende elevtal.'
        : 'Netto = positive udgifter + negative indtægter. Et følsomhedsspænd påvirker kun fremtidige udgiftskategorier; ingen indtægtsskøn ændres.',
      ...(cumulativeGrowth === null
        ? ['Referenceårets årsnetto er nul; en kumuleret vækstprocent er derfor ikke defineret.']
        : []),
    ],
    followups: council
      ? [
          `Vis årsprognosen for ${endYear}.`,
          'Hvilke simulerede politiske beslutninger er relevante for området?',
          'Hvad hvis energiprisen stiger 15 procent resten af året?',
        ]
      : [
          `Vis årsprognosen for ${endYear}.`,
          `Vis prognosen for energiudgifter frem til ${endYear}.`,
          'Forklar energiudgifternes ændring med pris, mængde og samspil.',
        ],
    missingData: undefined,
    renderedText: undefined,
    formulation: undefined,
    scenario: undefined,
  };
}
