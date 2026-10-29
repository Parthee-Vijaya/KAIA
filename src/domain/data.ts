import type { Area, Category, DemoDocument, Entity, LedgerRow } from './types';
import {
  generateMunicipalBenchmarks,
  type MunicipalProfile,
  type MunicipalBenchmarkRow,
  type MunicipalBenchmarkMetadata,
  type KalundborgAggregateRow,
} from './municipalities';

export const DATASET_VERSION = process.env.KAIA_DATASET_VERSION || 'KAIA-DEMO-2026.09-v4';
export const DATASET_START_YEAR = 2020;
export const DATASET_END_YEAR = 2032;
export const DATASET_SEED = process.env.KAIA_DATASET_SEED || 'kaia-kalundborg-2026';
export const REFERENCE_DATE = process.env.KAIA_REFERENCE_DATE || '2026-09-30';
export const NAME_VERIFIED_AT = '2026-10-20';
export const NAME_SOURCES = {
  schools:
    'https://www.kalundborg.dk/service-and-selvbetjening/boern-unge-and-familie/skoler-sfo-og-uddannelser/folkeskoler',
  facilities:
    'https://www.kalundborg.dk/service-and-selvbetjening/kultur-and-fritid/idraetshaller-and-lokaler',
  committees:
    'https://www.kalundborg.dk/demokrati/kommunalbestyrelsen/styrelsesvedtaegt-for-kalundborg-kommune-2026',
  organisations: 'https://www.kalundborg.dk/kommunen/organisation',
};
export const AREA_LABELS: Record<Area, string> = {
  schools: 'Skoleområdet',
  facilities: 'Kultur og idræt',
  social: 'Social og beskæftigelse',
  health: 'Ældre og sundhed',
  environment: 'Teknik, natur og miljø',
  administration: 'Administration',
  preparedness: 'Samfundssikkerhed og beredskab',
};
export const CATEGORY_LABELS: Record<Category, string> = {
  salary: 'Løn',
  energy: 'Energi',
  substitute: 'Vikarer',
  maintenance: 'Vedligehold',
  activity: 'Aktivitet',
  income: 'Indtægter',
};
export const CATEGORIES: Category[] = [
  'salary',
  'energy',
  'substitute',
  'maintenance',
  'activity',
  'income',
];
const MONTH_NAMES = [
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
function humanMoney(ore: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    maximumFractionDigits: 0,
  }).format(ore / 100);
}
function humanCoverage(month: number): string {
  return month === 1 ? 'januar' : `januar–${MONTH_NAMES[month - 1]}`;
}
function documentParagraph(
  type: DemoDocument['type'],
  name: string,
  budget: number,
  actual: number,
  energyDelta: number,
  substituteDelta: number,
  committee: string,
): string {
  if (type === 'budget')
    return `Dette fiktive budgetnotat fastlægger en illustrativ ramme for ${name}. Budgettet periodiseres efter løn, vinterens energiforbrug og sommerens vedligehold. Indtægter bogføres negativt; nettobudgettet omfatter både udgifter og indtægter. Rammen er et modelleringsvalg og gengiver ikke kommunens faktiske bevilling.`;
  if (type === 'followup')
    return `Denne simulerede opfølgning viser en nettoafvigelse på ${humanMoney(actual - budget)} i forhold til samme periodes budget. Energi bidrager med ${humanMoney(energyDelta)}, og vikarforbrug med ${humanMoney(substituteDelta)}. De øvrige kontokategorier forklarer resten. I simuleringen varierer energipris, aktivitetsniveau og enhedens vikartræk; en observeret afvigelse beviser ikke alene en bestemt årsag.`;
  if (type === 'strategy')
    return `Den fiktive strategi for ${name} prioriterer et sammenhængende beslutningsgrundlag: energipris og forbrug undersøges hver for sig, vikarudgifter følges løbende, og vedligehold planlægges efter sæson. Ved ændret elevtal er kun 28 procent af aktivitetsudgifterne variable i den illustrative model. Bygninger, løn og øvrige faste udgifter ændres ikke automatisk. Strategien er simuleret og er ikke kommunens faktiske politik.`;
  if (type === 'decision')
    return `I dette fiktive beslutningsreferat for ${committee} fremlægger udvalgssekretariatet en simuleret opfølgning på ${name}. Den modellerede drøftelse prioriterer en gennemgang af energi og vikarforbrug før en eventuel budgettilpasning. Det er en forberedt demohændelse, ikke et faktisk møde, en vedtaget bevilling eller en udtalelse fra et udvalgsmedlem. Ingen personer tilskrives beslutninger eller underskrifter.`;
  return `Beregningsnotatet beskriver det simulerede datagrundlag for ${name}. Udgift pr. elev beregnes som nettoudgift divideret med samme års syntetiske elevtal for de valgte skoler. Sammenligninger bruger samme måneder. Pris- og mængdebidrag beregnes fra lokale simulerede kWh-fakturaer med ens momsgrundlag; pris, mængde og samspil afstemmes til udgiftsændringen. Manglende belæg må ikke erstattes af en årsagspåstand.`;
}
export interface DemographyRow {
  year: number;
  ageGroup: '0-5' | '6-16' | '17-64' | '65+';
  population: number;
  births: number;
  deaths: number;
  domesticNet: number;
  internationalNet: number;
  ageIn: number;
  ageOut: number;
}
export interface Dataset {
  version: string;
  seed: string;
  referenceDate: string;
  entities: Entity[];
  rows: LedgerRow[];
  documents: DemoDocument[];
  demography?: DemographyRow[];
  coverage?: { fromYear: number; toYear: number };
  municipalities?: MunicipalProfile[];
  municipalBenchmarks?: MunicipalBenchmarkRow[];
  municipalMetadata?: MunicipalBenchmarkMetadata;
  statistics?: {
    ledgerRows: number;
    documents: number;
    schools: number;
    facilities: number;
    committees: number;
  };
}
export interface DatasetConfig {
  version?: string;
  seed?: string;
  referenceDate?: string;
}
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function factor(seed: string, key: string, lower: number, upper: number) {
  return lower + (hash(`${seed}:${key}`) / 4294967295) * (upper - lower);
}
function splitExact(total: number, n: number): number[] {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / n);
  return Array.from({ length: n }, (_, i) => sign * (base + (i < abs % n ? 1 : 0)));
}
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((Math.abs(total) * w) / sum));
  let left = Math.abs(total) - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i++, left--) out[i % out.length]++;
  return out.map((x) => Math.sign(total) * x);
}
const schoolNames: [string, string, string[], number][] = [
  ['herredsaasen', 'Skolen på Herredsåsen', ['Herredsåsen', 'Herredsaasen'], 612],
  ['nyrup', 'Nyrupskolen', ['Nyrup'], 431],
  ['rynkevang', 'Rynkevangskolen og Inklusionscenter', ['Rynkevang', 'Rynkevangskolen'], 369],
  ['hvidebaek', 'Hvidebækskolen og Inklusionscenter', ['Hvidebæk', 'Hvidebækskolen'], 283],
  ['firhoej', 'Firhøjskolen', ['Firhøj'], 241],
  ['hoeng', 'Høng Skole', ['Høng', 'Hoeng'], 493],
  ['goerlev', 'Gørlev Skole og Inklusionscenter', ['Gørlev Skole', 'Gørlev'], 316],
  ['sveboelle', 'Svebølle Skole', ['Svebølle'], 334],
  ['buerup', 'Buerup Skole', ['Buerup'], 86],
  ['isk', 'International School of Kalundborg', ['ISK'], 161],
  ['kirke-helsinge', 'Kirke-Helsinge Skole', ['Kirke Helsinge'], 113],
  ['loeve', 'Løve Skole', ['Løve'], 104],
  ['roerby', 'Rørby Skole', ['Rørby'], 197],
  ['sejeroe', 'Sejerø Skole', ['Sejerø'], 39],
  ['toemmerup', 'Tømmerup Skole', ['Tømmerup'], 139],
  ['aarby', 'Årby Skole', ['Årby'], 162],
];
const facilityNames: [string, string, string[]][] = [
  ['kalundborg-hallerne', 'Kalundborg Hallerne', ['Kalundborg Haller']],
  ['goerlev-hallen', 'Gørlev Hallen', ['Gørlevhallen']],
  ['hvidebaek-hallen', 'Hvidebækhallen', ['Hvidebæk Hallen']],
  ['hoeng-hallen', 'Høng Hallen', ['Hønghallen']],
  ['firhoej-hallen', 'Firhøjhallen', ['Firhøj Hallen']],
  ['roerby-hallen', 'Rørbyhallen', ['Rørby Hallen']],
  ['spiralen', 'Spiralen', ['SPIRALEN']],
  ['sveboelle-hallen', 'Svebølle Hallen', ['Svebøllehallen']],
];
const orgNames: [string, string, Area][] = [
  ['oekonomi', 'Økonomistaben', 'administration'],
  ['organisation', 'Organisationsstaben', 'administration'],
  ['sundhed', 'Sundhed og Myndighed', 'health'],
  ['pleje', 'Aktivitet og Plejehjem', 'health'],
  ['veje', 'Vej, Ejendom og Affald', 'environment'],
  ['miljoe', 'Plan, Byg og Miljø', 'environment'],
  ['jobcenter', 'Jobcenter Kalundborg', 'social'],
  ['voksen', 'Voksenspecialenheden', 'social'],
  ['kommune', 'Kalundborg Kommune', 'preparedness'],
];
const committeeNames: [string, string, Area][] = [
  ['oekonomiudvalg', 'Økonomiudvalget', 'administration'],
  ['boern-familie', 'Børn- og Familieudvalget', 'schools'],
  ['kultur-fritid', 'Kultur- og Fritidsudvalget', 'facilities'],
  ['social-beskaeftigelse', 'Social- og Beskæftigelsesudvalget', 'social'],
  ['teknik-natur-miljoe', 'Teknik-, Natur- og Miljøudvalget', 'environment'],
  ['aeldre-sundhed', 'Ældre- og Sundhedsudvalget', 'health'],
  ['beredskab', 'Udvalg for Samfundssikkerhed og Beredskab', 'preparedness'],
];
export function pupilsForYear(entity: Entity, year: number): number {
  return entity.synthetic.pupils
    ? Math.max(1, Math.round(entity.synthetic.pupils * (1 + (year - 2026) * 0.008)))
    : 0;
}
function municipalData(
  rows: LedgerRow[],
  entities: Entity[],
  demography: DemographyRow[],
  seed: string,
  version: string,
  referenceDate: string,
) {
  const areas = new Map(entities.map((entity) => [entity.id, entity.area]));
  const yearly = new Map<number, { population: number; pupils: number; seniors: number }>();
  for (const row of demography) {
    const current = yearly.get(row.year) || {
      population: 0,
      pupils: entities.reduce((sum, entity) => sum + pupilsForYear(entity, row.year), 0),
      seniors: 0,
    };
    current.population += row.population;
    if (row.ageGroup === '65+') current.seniors += row.population;
    yearly.set(row.year, current);
  }
  const aggregated = new Map<string, KalundborgAggregateRow>();
  for (const row of rows) {
    const area = areas.get(row.entityId)!;
    const key = `${area}:${row.year}:${row.month}:${row.kind}`;
    if (!aggregated.has(key)) {
      const denominators = yearly.get(row.year)!;
      aggregated.set(key, {
        area,
        year: row.year,
        month: row.month,
        kind: row.kind,
        amountOre: 0,
        population: denominators.population,
        pupils: denominators.pupils,
      });
    }
    aggregated.get(key)!.amountOre += row.amountOre;
  }
  const year = Number(referenceDate.slice(0, 4));
  const structure = yearly.get(year)!;
  const { municipalities, municipalBenchmarks, metadata } = generateMunicipalBenchmarks(
    seed,
    version,
    referenceDate,
    {
      structure: {
        population: structure.population,
        population65Share: structure.seniors / structure.population,
        schoolchildren: structure.pupils,
        rurality: 0.58,
      },
      structureYear: year,
      rows: [...aggregated.values()],
    },
  );
  return { municipalities, municipalBenchmarks, municipalMetadata: metadata };
}
export function entityRegistry(): Entity[] {
  return [
    ...schoolNames.map(([id, name, aliases, pupils]) => ({
      id: `school-${id}`,
      name,
      aliases,
      type: 'school' as const,
      area: 'schools' as const,
      nameSourceUrl: NAME_SOURCES.schools,
      verifiedAt: NAME_VERIFIED_AT,
      synthetic: { pupils, annualBudgetOre: Math.round(pupils * 79200 * 100) },
    })),
    ...facilityNames.map(([id, name, aliases], i) => ({
      id: `facility-${id}`,
      name,
      aliases,
      type: 'facility' as const,
      area: 'facilities' as const,
      nameSourceUrl: NAME_SOURCES.facilities,
      verifiedAt: NAME_VERIFIED_AT,
      synthetic: { annualBudgetOre: (4200000 + i * 580000) * 100 },
    })),
    ...orgNames.map(([id, name, area], i) => ({
      id: `org-${id}`,
      name,
      aliases: [],
      type: 'organisation' as const,
      area,
      nameSourceUrl: NAME_SOURCES.organisations,
      verifiedAt: NAME_VERIFIED_AT,
      synthetic: { annualBudgetOre: (i < 2 ? 26000000 : 87000000 + i * 1000000) * 100 },
    })),
    ...committeeNames.map(([id, name, area]) => ({
      id: `committee-${id}`,
      name,
      aliases: [],
      type: 'committee' as const,
      area,
      nameSourceUrl: NAME_SOURCES.committees,
      verifiedAt: NAME_VERIFIED_AT,
      synthetic: { annualBudgetOre: 0 },
    })),
  ];
}
export function generateDataset(config: DatasetConfig = {}): Dataset {
  const version = config.version || DATASET_VERSION,
    seed = config.seed || DATASET_SEED,
    referenceDate = config.referenceDate || REFERENCE_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !Number.isFinite(Date.parse(referenceDate)))
    throw new Error('Ugyldig referencedato');
  const refYear = Number(referenceDate.slice(0, 4)),
    refMonth = Number(referenceDate.slice(5, 7));
  const expanded = !/^KAIA-DEMO-2026\.09-v[123]$/.test(version);
  const fromYear = expanded ? DATASET_START_YEAR : 2023;
  const toYear = expanded ? DATASET_END_YEAR : 2028;
  const lots = expanded ? 16 : 6;
  const entities = entityRegistry();
  const rows: LedgerRow[] = [];
  const shares: Record<Category, number> = {
    salary: 0.68,
    energy: 0.06,
    substitute: 0.06,
    maintenance: 0.07,
    activity: 0.13,
    income: -0.03,
  };
  for (const entity of entities.filter((e) => e.type !== 'committee'))
    for (let year = fromYear; year <= toYear; year++)
      for (const category of CATEGORIES) {
        const growth = expanded
          ? {
              salary: 0.031,
              energy: 0.045,
              substitute: 0.037,
              maintenance: 0.032,
              activity: 0.022,
              income: 0.021,
            }[category]
          : 0.027;
        const activityScale =
          expanded && category === 'activity' && entity.synthetic.pupils
            ? 1 + 0.28 * (pupilsForYear(entity, year) / entity.synthetic.pupils - 1)
            : 1;
        const annual = Math.round(
          entity.synthetic.annualBudgetOre *
            Math.pow(1 + growth, year - 2026) *
            shares[category] *
            activityScale,
        );
        const weights = Array.from({ length: 12 }, (_, i) =>
          category === 'energy'
            ? [1.55, 1.4, 1.2, 0.9, 0.65, 0.5, 0.45, 0.55, 0.8, 1.1, 1.35, 1.55][i]
            : category === 'maintenance'
              ? [0.6, 0.6, 0.7, 0.7, 0.8, 1.2, 1.8, 1.6, 0.9, 0.8, 0.7, 0.6][i]
              : category === 'activity' && entity.type === 'school'
                ? [1, 1, 1, 1, 1, 1, 0.4, 0.85, 1, 1, 1, 1][i]
                : 1,
        );
        const budgetMonths = allocate(annual, weights);
        for (let month = 1; month <= 12; month++) {
          const budget = budgetMonths[month - 1];
          const drift =
            category === 'energy'
              ? expanded && year === 2022
                ? 1.38
                : expanded && year === 2021
                  ? 1.17
                  : 1.1 + (year - 2023) * 0.012
              : category === 'substitute'
                ? factor(seed, `${entity.id}:sub`, 0.88, 1.34)
                : category === 'salary'
                  ? 1.015
                  : category === 'maintenance'
                    ? entity.id === 'school-rynkevang' && month === 8 && year === 2026
                      ? 1.7
                      : 1.035
                    : expanded && category === 'activity' && year === 2020
                      ? 0.84
                      : category === 'income'
                        ? 1.02
                        : 1.018;
          const realized = Math.round(
            budget * drift * factor(seed, `${entity.id}:${year}:${month}:${category}`, 0.97, 1.03),
          );
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (kind === 'actual' && (year > refYear || (year === refYear && month > refMonth)))
              continue;
            const amount = kind === 'budget' ? budget : realized;
            const parts = splitExact(amount, lots);
            for (let lot = 0; lot < lots; lot++) {
              const id = `DEMO-L-${entity.id}-${year}-${String(month).padStart(2, '0')}-${category}-${kind}-${lot}`;
              if (category === 'energy') {
                // Every invoice is integer kWh × integer øre/kWh; unlike other categories it has no rounding residual.
                const price =
                  kind === 'budget'
                    ? 142 + Math.round((year - 2023) * 3)
                    : 160 + Math.round((year - 2023) * 5) + lot;
                const quantity = Math.max(1, Math.round(parts[lot] / price));
                rows.push({
                  id,
                  datasetVersion: version,
                  entityId: entity.id,
                  year,
                  month,
                  category,
                  kind,
                  amountOre: quantity * price,
                  quantity,
                  unitPriceOre: price,
                });
              } else
                rows.push({
                  id,
                  datasetVersion: version,
                  entityId: entity.id,
                  year,
                  month,
                  category,
                  kind,
                  amountOre: parts[lot],
                });
            }
          }
        }
      }
  const documents: DemoDocument[] = [];
  const areaYearRows = new Map<string, LedgerRow[]>();
  const entityYearRows = new Map<string, LedgerRow[]>();
  const entityAreas = new Map(entities.map((entity) => [entity.id, entity.area]));
  for (const row of rows) {
    const areaKey = `${entityAreas.get(row.entityId)}:${row.year}`;
    const entityKey = `${row.entityId}:${row.year}`;
    if (!areaYearRows.has(areaKey)) areaYearRows.set(areaKey, []);
    if (!entityYearRows.has(entityKey)) entityYearRows.set(entityKey, []);
    areaYearRows.get(areaKey)!.push(row);
    entityYearRows.get(entityKey)!.push(row);
  }
  const types: DemoDocument['type'][] = ['budget', 'followup', 'strategy', 'decision', 'note'];
  const titles: Record<DemoDocument['type'], string> = {
    budget: 'budgetnotat',
    followup: 'budgetopfølgning',
    strategy: 'strategi',
    decision: 'beslutningsreferat',
    note: 'beregningsnotat',
  };
  for (const area of Object.keys(AREA_LABELS) as Area[])
    for (const year of expanded
      ? Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index)
      : [2024, 2025, 2026])
      for (const type of types) {
        const entityIds = entities
          .filter((e) => e.area === area && e.type !== 'committee')
          .map((e) => e.id);
        const id = `DEMO-DOC-${area}-${year}-${type}`;
        const month =
          year === refYear ? Math.min(refMonth, 9) : expanded && year > refYear ? 12 : 9;
        const sameYearRows = areaYearRows.get(`${area}:${year}`) || [];
        const selectedKind = year > refYear ? 'forecast' : 'actual';
        const annualBudget = sameYearRows
          .filter((r) => r.kind === 'budget')
          .reduce((s, r) => s + r.amountOre, 0);
        const actual = sameYearRows
          .filter((r) => r.kind === selectedKind && r.month <= month)
          .reduce((s, r) => s + r.amountOre, 0);
        const budget = sameYearRows
          .filter((r) => r.kind === 'budget' && r.month <= month)
          .reduce((s, r) => s + r.amountOre, 0);
        const periodRows = sameYearRows.filter((r) => r.month <= month);
        const categoryDelta = (category: Category) =>
          periodRows
            .filter((r) => r.category === category && r.kind === selectedKind)
            .reduce((s, r) => s + r.amountOre, 0) -
          periodRows
            .filter((r) => r.category === category && r.kind === 'budget')
            .reduce((s, r) => s + r.amountOre, 0);
        const committee = entities.find((e) => e.type === 'committee' && e.area === area)!.name;
        const text = `SIMULERET MATERIALE. ${AREA_LABELS[area]}, ${year}. Årets simulerede nettobudget er ${humanMoney(annualBudget)} Periodiseret budget for ${humanCoverage(month)}: ${humanMoney(budget)} ${year > refYear ? 'Forventet nettoforbrug (prognose)' : 'Realiseret nettoforbrug'} i samme periode: ${humanMoney(actual)} ${documentParagraph(type, AREA_LABELS[area].toLowerCase(), budget, actual, categoryDelta('energy'), categoryDelta('substitute'), committee)} Grundlaget er dataversion ${version}. Opfølgningen og denne dokumentserie henviser til den simulerede strategi DEMO-DOC-${area}-${year}-strategy. Navne er virkelige, mens tal, egenskaber og alle beskrivelser af beslutninger er fiktive.`;

        documents.push({
          id,
          title: `Simuleret ${titles[type]}, ${AREA_LABELS[area].toLowerCase()}, ${year}`,
          date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
          period: `${year}`,
          type,
          status: 'simulated',
          classification: type === 'followup' || type === 'note' ? 'internal' : 'political',
          entityIds,
          area,
          text,
          relatedDocumentIds: types
            .filter((t) => t !== type)
            .map((t) => `DEMO-DOC-${area}-${year}-${t}`),
          factRefs: [
            `ledger:${version}:${area}:${year}:budget`,
            `ledger:${version}:${area}:${year}:${selectedKind}:1-${month}`,
          ],
          datasetVersion: version,
        });
      }
  // Unit documents keep single-school scopes useful without exposing area totals.
  for (const entity of entities.filter((e) => e.type !== 'committee'))
    for (const year of expanded
      ? Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index)
      : [Math.min(2026, refYear)])
      for (const type of ['followup', 'strategy', 'decision'] as const) {
        const id = `DEMO-DOC-${entity.id}-${year}-${type}`;
        const er = entityYearRows.get(`${entity.id}:${year}`) || [];
        const month = year > refYear ? 12 : refMonth;
        const selectedKind = year > refYear ? 'forecast' : 'actual';
        const annual = er.filter((r) => r.kind === 'budget').reduce((s, r) => s + r.amountOre, 0);
        const budget = er
          .filter((r) => r.kind === 'budget' && r.month <= month)
          .reduce((s, r) => s + r.amountOre, 0);
        const actual = er
          .filter((r) => r.kind === selectedKind && r.month <= month)
          .reduce((s, r) => s + r.amountOre, 0);
        const periodRows = er.filter((r) => r.month <= month);
        const categoryDelta = (category: Category) =>
          periodRows
            .filter((r) => r.category === category && r.kind === selectedKind)
            .reduce((s, r) => s + r.amountOre, 0) -
          periodRows
            .filter((r) => r.category === category && r.kind === 'budget')
            .reduce((s, r) => s + r.amountOre, 0);
        const committee = entities.find(
          (e) => e.type === 'committee' && e.area === entity.area,
        )!.name;
        const text = `SIMULERET MATERIALE. ${entity.name}, ${year}. Helårsnettobudget: ${humanMoney(annual)} Budget for ${humanCoverage(month)}: ${humanMoney(budget)} ${year > refYear ? 'Forventet nettoforbrug (prognose)' : 'Realiseret nettoforbrug'} i samme periode: ${humanMoney(actual)} ${documentParagraph(type, entity.name, budget, actual, categoryDelta('energy'), categoryDelta('substitute'), committee)} Grundlaget er dataversion ${version}. Relateret simuleret strategi: DEMO-DOC-${entity.id}-${year}-strategy. Navne er virkelige; alle tal, egenskaber og beslutninger er fiktive.`;
        documents.push({
          id,
          title: `Simuleret ${titles[type]}, ${entity.name}, ${year}`,
          date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
          period: String(year),
          type,
          status: 'simulated',
          classification: type === 'followup' ? 'internal' : 'political',
          entityIds: [entity.id],
          area: entity.area,
          text,
          relatedDocumentIds: ['followup', 'strategy', 'decision']
            .filter((t) => t !== type)
            .map((t) => `DEMO-DOC-${entity.id}-${year}-${t}`),
          factRefs: [
            `ledger:${version}:${entity.id}:${year}:budget`,
            `ledger:${version}:${entity.id}:${year}:${selectedKind}:1-${month}`,
          ],
          datasetVersion: version,
        });
      }
  const demography: DemographyRow[] = [];
  for (let year = fromYear; year <= toYear; year++)
    for (const [ageGroup, base, change] of [
      ['0-5', 2610, -17],
      ['6-16', 5210, -32],
      ['17-64', 27000, -75],
      ['65+', 12320, 138],
    ] as const)
      demography.push({
        year,
        ageGroup,
        population: base + (year - 2023) * change,
        births: ageGroup === '0-5' ? 405 : 0,
        deaths: ageGroup === '65+' ? 573 : 0,
        domesticNet: ageGroup === '6-16' ? -21 : ageGroup === '65+' ? 128 : -41,
        internationalNet: ageGroup === '17-64' ? 118 : 13,
        ageIn:
          ageGroup === '0-5' ? 0 : ageGroup === '6-16' ? 394 : ageGroup === '17-64' ? 418 : 570,
        ageOut:
          ageGroup === '0-5' ? 394 : ageGroup === '6-16' ? 418 : ageGroup === '17-64' ? 570 : 0,
      });
  const expandedData = expanded
    ? {
        coverage: { fromYear, toYear },
        ...municipalData(rows, entities, demography, seed, version, referenceDate),
      }
    : {};
  return {
    version,
    seed,
    referenceDate,
    entities,
    rows,
    documents,
    demography,
    ...expandedData,
    statistics: {
      ledgerRows: rows.length,
      documents: documents.length,
      schools: schoolNames.length,
      facilities: facilityNames.length,
      committees: committeeNames.length,
    },
  };
}
let cached: Dataset | undefined;
export function getDataset(): Dataset {
  return (cached ??= generateDataset());
}
