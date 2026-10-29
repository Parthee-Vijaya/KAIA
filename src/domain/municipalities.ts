import { createHash } from 'node:crypto';
import type { Area } from './types';

export const MUNICIPAL_NAME_SOURCE =
  'https://www.dst.dk/da/Statistik/dokumentation/Nomenklaturer/NUTS';
export const MUNICIPAL_CODE_SOURCE = 'https://www.statistikbanken.dk/FOLK1A';
export const MUNICIPAL_NAMES_VERIFIED_AT = '2026-10-21';
export const MUNICIPAL_BENCHMARK_YEARS = { fromYear: 2020, toYear: 2032 } as const;
export const MUNICIPAL_BENCHMARK_AREAS: readonly Area[] = [
  'schools',
  'facilities',
  'social',
  'health',
  'environment',
  'administration',
  'preparedness',
];
export const KALUNDBORG_MUNICIPALITY_ID = 'municipality-kalundborg';

/** Only these names and codes are real. No statistics are imported from either name source. */
export const MUNICIPAL_NAME_REGISTRY = [
  { id: KALUNDBORG_MUNICIPALITY_ID, code: '326', name: 'Kalundborg' },
  { id: 'municipality-odsherred', code: '306', name: 'Odsherred' },
  { id: 'municipality-holbaek', code: '316', name: 'Holbæk' },
  { id: 'municipality-slagelse', code: '330', name: 'Slagelse' },
  { id: 'municipality-soroe', code: '340', name: 'Sorø' },
  { id: 'municipality-ringsted', code: '329', name: 'Ringsted' },
] as const;

export interface MunicipalStructure {
  population: number;
  population65Share: number;
  schoolchildren: number;
  /** A synthetic 0–1 model index, not an official rural/urban classification. */
  rurality: number;
}
export interface MunicipalProfile {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  nameSourceUrl: string;
  codeSourceUrl: string;
  verifiedAt: string;
  status: 'simulated';
  structureYear: number;
  structure: MunicipalStructure;
  structuralAssumptions: string[];
}
export interface MunicipalBenchmarkRow {
  id: string;
  datasetVersion: string;
  municipalityId: string;
  year: number;
  month: number;
  area: Area;
  kind: 'budget' | 'actual' | 'forecast';
  amountOre: number;
  population: number;
  pupils: number;
  status: 'simulated';
}
export type KalundborgAggregateRow = Pick<
  MunicipalBenchmarkRow,
  'year' | 'month' | 'area' | 'kind' | 'amountOre' | 'population' | 'pupils'
>;
export interface KalundborgAggregateInput {
  structure: MunicipalStructure;
  structureYear?: number;
  rows: KalundborgAggregateRow[];
}
export interface MunicipalBenchmarkMetadata {
  datasetVersion: string;
  seed: string;
  referenceDate: string;
  status: 'simulated';
  nameStatus: 'official-names-and-codes';
  nameSourceUrls: string[];
  namesVerifiedAt: string;
  fromYear: number;
  toYear: number;
  generatedPeerCount: number;
  generatedPeerRows: number;
  importedKalundborgRows: number;
  contentHash: string;
  assumptions: string[];
}
export interface MunicipalBenchmarkDataset {
  municipalities: MunicipalProfile[];
  municipalBenchmarks: MunicipalBenchmarkRow[];
  metadata: MunicipalBenchmarkMetadata;
}
export interface MunicipalSimilarityComponent {
  key: 'population' | 'population65Share' | 'schoolchildrenShare' | 'rurality';
  label: string;
  weight: number;
  baseline: number;
  peer: number;
  normalizedDifference: number;
  weightedDifference: number;
}
export interface MunicipalPeerMatch {
  municipality: MunicipalProfile;
  score: number;
  distance: number;
  components: MunicipalSimilarityComponent[];
  explanation: string;
}

const MONTH_WEIGHTS: Record<Area, readonly number[]> = {
  schools: [103, 102, 103, 102, 103, 102, 77, 96, 103, 103, 103, 103],
  facilities: [118, 113, 107, 99, 94, 88, 85, 89, 97, 105, 113, 118],
  social: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 101, 103],
  health: [104, 103, 102, 100, 100, 100, 101, 101, 100, 101, 102, 104],
  environment: [86, 87, 93, 103, 107, 112, 119, 114, 108, 99, 90, 92],
  administration: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 102],
  preparedness: [96, 96, 96, 101, 108, 98, 97, 98, 120, 103, 96, 101],
};
// Fallback unit costs are explicit fictional model constants in øre/year, not official budget figures.
const UNIT_COST_ORE: Record<Area, number> = {
  schools: 7_900_000,
  facilities: 85_000,
  social: 690_000,
  health: 870_000,
  environment: 160_000,
  administration: 145_000,
  preparedness: 27_000,
};
const PEER_MODEL_ANCHORS: Record<
  string,
  {
    population: number;
    seniorShare: number;
    pupilShare: number;
    rurality: number;
    growthBp: number;
  }
> = {
  'municipality-odsherred': {
    population: 39_000,
    seniorShare: 0.29,
    pupilShare: 0.085,
    rurality: 0.72,
    growthBp: -18,
  },
  'municipality-holbaek': {
    population: 62_000,
    seniorShare: 0.22,
    pupilShare: 0.105,
    rurality: 0.43,
    growthBp: 42,
  },
  'municipality-slagelse': {
    population: 72_000,
    seniorShare: 0.25,
    pupilShare: 0.095,
    rurality: 0.4,
    growthBp: 10,
  },
  'municipality-soroe': {
    population: 41_500,
    seniorShare: 0.245,
    pupilShare: 0.1,
    rurality: 0.57,
    growthBp: 20,
  },
  'municipality-ringsted': {
    population: 36_000,
    seniorShare: 0.215,
    pupilShare: 0.11,
    rurality: 0.37,
    growthBp: 48,
  },
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function seededInt(seed: string, key: string, minimum: number, maximum: number): number {
  return minimum + (hash(`${seed}:${key}`) % (maximum - minimum + 1));
}
function roundRatio(value: number, numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  )
    throw new Error('Beløbsberegning kræver sikre heltal og en positiv nævner.');
  const product = BigInt(value) * BigInt(numerator),
    divisor = BigInt(denominator);
  const result = Number((product + divisor / 2n) / divisor);
  if (!Number.isSafeInteger(result))
    throw new Error('Den simulerede beløbsberegning overstiger sikker heltalspræcision.');
  return result;
}
function allocateExactly(total: number, weights: readonly number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const amounts = weights.map((weight) =>
    Number((BigInt(total) * BigInt(weight)) / BigInt(weightSum)),
  );
  const remainder = total - amounts.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; index < remainder; index++) amounts[index % amounts.length]++;
  return amounts;
}
function validateDate(value: string): { year: number; month: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ugyldig benchmarkreferencedato.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Ugyldig benchmarkreferencedato.');
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth() + 1;
  if (year < MUNICIPAL_BENCHMARK_YEARS.fromYear || year > MUNICIPAL_BENCHMARK_YEARS.toYear)
    throw new Error('Benchmarkreferencen skal ligge i perioden 2020–2032.');
  return { year, month };
}
function validateStructure(structure: MunicipalStructure): void {
  if (
    !Number.isSafeInteger(structure.population) ||
    structure.population <= 0 ||
    structure.population > 100_000_000 ||
    !Number.isSafeInteger(structure.schoolchildren) ||
    structure.schoolchildren < 0 ||
    structure.schoolchildren > structure.population ||
    !Number.isFinite(structure.population65Share) ||
    structure.population65Share < 0 ||
    structure.population65Share > 1 ||
    !Number.isFinite(structure.rurality) ||
    structure.rurality < 0 ||
    structure.rurality > 1
  )
    throw new Error('Ugyldige simulerede strukturforudsætninger.');
}
function makeProfile(
  registration: (typeof MUNICIPAL_NAME_REGISTRY)[number],
  structure: MunicipalStructure,
  structureYear: number,
  source: 'generated-peer' | 'imported-kalundborg',
): MunicipalProfile {
  validateStructure(structure);
  return {
    ...registration,
    aliases: [registration.name, `${registration.name} Kommune`],
    nameSourceUrl: MUNICIPAL_NAME_SOURCE,
    codeSourceUrl: MUNICIPAL_CODE_SOURCE,
    verifiedAt: MUNICIPAL_NAMES_VERIFIED_AT,
    status: 'simulated',
    structureYear,
    structure: { ...structure },
    structuralAssumptions: [
      'Kun kommunenavn og kommunekode er officielle. Alle befolknings-, elev-, alders- og økonomital samt landlighedsindekset er simulerede.',
      source === 'imported-kalundborg'
        ? 'Kalundborgs struktur er overført uændret fra K.A.I.A.’s eget simulerede datagrundlag; kommunen får ingen ekstra sidegenererede økonomital.'
        : 'Strukturen følger versionsstyrede, fiktive modelankre og deterministiske seedvariationer. Den beskriver ikke kommunens faktiske forhold.',
      'Rurality er et illustrativt indeks mellem 0 og 1, ikke Danmarks Statistiks kommunegruppering. Peerudvælgelsen er en demonstreret metode, ikke en faktisk rangering af kommuner.',
    ],
  };
}
function peerStructure(
  seed: string,
  id: string,
  year: number,
  anchorYear: number,
): MunicipalStructure {
  const anchor = PEER_MODEL_ANCHORS[id];
  const seededPopulation = roundRatio(
    anchor.population,
    seededInt(seed, `${id}:population`, 9400, 10600),
    10000,
  );
  const growth = anchor.growthBp + seededInt(seed, `${id}:growth`, -12, 12);
  const population = Math.max(
    1,
    Math.round(seededPopulation * Math.pow(1 + growth / 10000, year - anchorYear)),
  );
  const population65Share = Math.max(
    0.1,
    Math.min(
      0.45,
      anchor.seniorShare +
        seededInt(seed, `${id}:seniors`, -120, 120) / 10000 +
        (year - anchorYear) * 0.0018,
    ),
  );
  const pupilShare = Math.max(
    0.06,
    Math.min(
      0.15,
      anchor.pupilShare +
        seededInt(seed, `${id}:pupils`, -60, 60) / 10000 -
        (year - anchorYear) * 0.00025,
    ),
  );
  return {
    population,
    population65Share: Math.round(population65Share * 10000) / 10000,
    schoolchildren: Math.round(population * pupilShare),
    rurality: Math.max(
      0,
      Math.min(
        1,
        Math.round(
          (anchor.rurality + seededInt(seed, `${id}:rurality`, -450, 450) / 10000) * 10000,
        ) / 10000,
      ),
    ),
  };
}
function validateKalundborgRows(
  input: KalundborgAggregateInput,
  reference: { year: number; month: number },
): void {
  validateStructure(input.structure);
  const keys = new Set<string>(),
    denominators = new Map<number, { population: number; pupils: number }>();
  if (
    input.structureYear !== undefined &&
    (!Number.isInteger(input.structureYear) ||
      input.structureYear < 2020 ||
      input.structureYear > 2032)
  )
    throw new Error('Ugyldigt strukturår for Kalundborg.');
  for (const row of input.rows) {
    if (
      !Number.isInteger(row.year) ||
      row.year < 2020 ||
      row.year > 2032 ||
      !Number.isInteger(row.month) ||
      row.month < 1 ||
      row.month > 12 ||
      !MUNICIPAL_BENCHMARK_AREAS.includes(row.area) ||
      !['budget', 'actual', 'forecast'].includes(row.kind) ||
      !Number.isSafeInteger(row.amountOre) ||
      !Number.isSafeInteger(row.population) ||
      row.population <= 0 ||
      !Number.isSafeInteger(row.pupils) ||
      row.pupils < 0 ||
      (row.area === 'schools' && row.pupils === 0)
    )
      throw new Error('Ugyldig aggregeret Kalundborgrække.');
    if (
      row.kind === 'actual' &&
      (row.year > reference.year || (row.year === reference.year && row.month > reference.month))
    )
      throw new Error(
        'Kalundborgs realiserede benchmarkposter må ikke ligge efter referencedatoen.',
      );
    const key = `${row.year}:${row.month}:${row.area}:${row.kind}`;
    if (keys.has(key))
      throw new Error('Dubleret aggregeret Kalundborgrække; beløb må ikke tælles to gange.');
    keys.add(key);
    const prior = denominators.get(row.year);
    if (prior && (prior.population !== row.population || prior.pupils !== row.pupils))
      throw new Error('Kalundborgs benchmarknævnere skal være konsistente inden for samme år.');
    denominators.set(row.year, { population: row.population, pupils: row.pupils });
  }
}
function calibratedUnitCost(
  input: KalundborgAggregateInput | undefined,
  area: Area,
  year: number,
): number | undefined {
  const rows =
    input?.rows.filter((row) => row.area === area && row.kind === 'budget' && row.year === year) ||
    [];
  if (rows.length !== 12 || new Set(rows.map((row) => row.month)).size !== 12) return undefined;
  const total = Number(rows.reduce((sum, row) => sum + BigInt(row.amountOre), 0n)),
    denominator = area === 'schools' ? rows[0].pupils : rows[0].population;
  if (!Number.isSafeInteger(total))
    throw new Error('Kalundborgs aggregerede helårsbeløb overstiger sikker heltalspræcision.');
  return total > 0 && denominator > 0 ? Math.round(total / denominator) : undefined;
}

/** The only Kalundborg values returned are caller-supplied aggregates; the generator synthesizes peers only. */
export function generateMunicipalBenchmarks(
  seed: string,
  version: string,
  referenceDate: string,
  actualKalundborgAggregates?: KalundborgAggregateInput,
): MunicipalBenchmarkDataset {
  if (!seed || seed.length > 200 || !/^[a-zA-Z0-9_.-]{1,100}$/.test(version))
    throw new Error('Angiv gyldigt seed og dataversion til benchmark.');
  const reference = validateDate(referenceDate),
    anchorYear = actualKalundborgAggregates?.structureYear ?? reference.year;
  if (actualKalundborgAggregates) validateKalundborgRows(actualKalundborgAggregates, reference);
  const municipalities: MunicipalProfile[] = [];
  const municipalBenchmarks: MunicipalBenchmarkRow[] = [];
  if (actualKalundborgAggregates) {
    municipalities.push(
      makeProfile(
        MUNICIPAL_NAME_REGISTRY[0],
        actualKalundborgAggregates.structure,
        anchorYear,
        'imported-kalundborg',
      ),
    );
    for (const row of actualKalundborgAggregates.rows)
      municipalBenchmarks.push({
        ...row,
        id: `DEMO-MB-326-${row.year}-${String(row.month).padStart(2, '0')}-${row.area}-${row.kind}`,
        datasetVersion: version,
        municipalityId: KALUNDBORG_MUNICIPALITY_ID,
        status: 'simulated',
      });
  }
  const importedKalundborgRows = municipalBenchmarks.length;
  for (const registration of MUNICIPAL_NAME_REGISTRY.slice(1)) {
    const profile = makeProfile(
      registration,
      peerStructure(seed, registration.id, anchorYear, anchorYear),
      anchorYear,
      'generated-peer',
    );
    municipalities.push(profile);
    for (let year = 2020; year <= 2032; year++) {
      const structure = peerStructure(seed, registration.id, year, anchorYear);
      for (const area of MUNICIPAL_BENCHMARK_AREAS) {
        const denominator = area === 'schools' ? structure.schoolchildren : structure.population;
        const calibrated = calibratedUnitCost(actualKalundborgAggregates, area, year);
        const anchorCost =
          calibratedUnitCost(actualKalundborgAggregates, area, anchorYear) ?? UNIT_COST_ORE[area];
        const unitCost = calibrated ?? Math.round(anchorCost * Math.pow(1.027, year - anchorYear));
        const structuralPremium =
          area === 'schools'
            ? Math.round(structure.rurality * 550)
            : area === 'health'
              ? Math.round((structure.population65Share - 0.24) * 6000)
              : area === 'environment'
                ? Math.round(structure.rurality * 400)
                : 0;
        const efficiencyBp = seededInt(seed, `${registration.id}:${area}:unit-cost`, -650, 650);
        const annualBudget = roundRatio(
          unitCost * denominator,
          10000 + structuralPremium + efficiencyBp,
          10000,
        );
        const deviationBp =
          seededInt(seed, `${registration.id}:${area}:${year}:deviation`, -140, 580) +
          (area === 'facilities' || area === 'environment'
            ? year === 2022
              ? 420
              : year === 2026
                ? 170
                : 0
            : 0);
        const annualForecast = roundRatio(annualBudget, 10000 + deviationBp, 10000);
        const budgets = allocateExactly(annualBudget, MONTH_WEIGHTS[area]);
        const forecasts = allocateExactly(
          annualForecast,
          MONTH_WEIGHTS[area].map(
            (weight, index) =>
              weight *
              seededInt(seed, `${registration.id}:${year}:${area}:month-${index + 1}`, 970, 1030),
          ),
        );
        for (let month = 1; month <= 12; month++)
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (
              kind === 'actual' &&
              (year > reference.year || (year === reference.year && month > reference.month))
            )
              continue;
            municipalBenchmarks.push({
              id: `DEMO-MB-${registration.code}-${year}-${String(month).padStart(2, '0')}-${area}-${kind}`,
              datasetVersion: version,
              municipalityId: registration.id,
              year,
              month,
              area,
              kind,
              amountOre: kind === 'budget' ? budgets[month - 1] : forecasts[month - 1],
              population: structure.population,
              pupils: structure.schoolchildren,
              status: 'simulated',
            });
          }
      }
    }
  }
  municipalBenchmarks.sort(
    (a, b) =>
      a.municipalityId.localeCompare(b.municipalityId) ||
      a.year - b.year ||
      a.month - b.month ||
      a.area.localeCompare(b.area) ||
      a.kind.localeCompare(b.kind),
  );
  const contentHash = createHash('sha256')
    .update(JSON.stringify({ seed, version, referenceDate, municipalities, municipalBenchmarks }))
    .digest('hex');
  return {
    municipalities,
    municipalBenchmarks,
    metadata: {
      datasetVersion: version,
      seed,
      referenceDate,
      status: 'simulated',
      nameStatus: 'official-names-and-codes',
      nameSourceUrls: [MUNICIPAL_NAME_SOURCE, MUNICIPAL_CODE_SOURCE],
      namesVerifiedAt: MUNICIPAL_NAMES_VERIFIED_AT,
      fromYear: 2020,
      toYear: 2032,
      generatedPeerCount: 5,
      generatedPeerRows: municipalBenchmarks.length - importedKalundborgRows,
      importedKalundborgRows,
      contentHash,
      assumptions: [
        'Alle benchmarkbeløb, befolkningstal, elevtal, strukturegenskaber og prognoser er simulerede. Officielle kilder dokumenterer kun navn og kommunekode.',
        'Sammenligningsniveauet er hele det modellerede fagområde i demoorganisationen; det er ikke kommunernes faktiske budgetorganisation eller et komplet kommuneregnskab.',
        'Udgifter og nettoomkostninger er positive. Afvigelse = regnskab/prognose minus budget. Der findes ingen selvstændig indtægtsserie i benchmarktabellen.',
        'Budget og forecast findes for januar–december i alle år 2020–2032. Actual findes kun til og med referenceåret/-måneden; forecasts omskriver ikke historisk datastatus.',
        'En outlook-serie vælger actual i observerede måneder og forecast derefter; de to slags poster må aldrig summeres i samme måned.',
        'Skoleområdet normaliseres med samme års syntetiske elever; øvrige områder med samme års syntetiske indbyggere. Perioder skal have samme månedsspænd.',
        actualKalundborgAggregates
          ? 'Kalundborgs økonomi og nævnere er uændrede indsendte aggregeringer fra K.A.I.A.’s egen ledger. Komplette helårsbudgetter kalibrerer peers på samme demoområdes enhedsomkostning; derefter anvendes eksplicitte simulerede struktur-/seedfaktorer.'
          : 'Kalundborgtal er ikke medleveret og er derfor ikke genereret. Peerøkonomien bruger eksplicitte fiktive enhedsomkostninger som modelankre.',
        'Prognoser er deterministiske øvelsesforløb med sæson og seedvariation; de er ikke officielle fremskrivninger eller statistiske sikkerhedsintervaller.',
      ],
    },
  };
}

export function municipalSimilarity(
  baseline: MunicipalStructure,
  peer: MunicipalStructure,
): { score: number; distance: number; components: MunicipalSimilarityComponent[] } {
  validateStructure(baseline);
  validateStructure(peer);
  const definitions: Array<{
    key: MunicipalSimilarityComponent['key'];
    label: string;
    weight: number;
    baseline: number;
    peer: number;
    difference: number;
  }> = [
    {
      key: 'population',
      label: 'Simuleret indbyggertal',
      weight: 0.3,
      baseline: baseline.population,
      peer: peer.population,
      difference:
        Math.abs(baseline.population - peer.population) /
        Math.max(baseline.population, peer.population),
    },
    {
      key: 'population65Share',
      label: 'Simuleret andel på 65 år og derover',
      weight: 0.25,
      baseline: baseline.population65Share,
      peer: peer.population65Share,
      difference: Math.min(1, Math.abs(baseline.population65Share - peer.population65Share) / 0.25),
    },
    {
      key: 'schoolchildrenShare',
      label: 'Simuleret skolebørnsandel',
      weight: 0.25,
      baseline: baseline.schoolchildren / baseline.population,
      peer: peer.schoolchildren / peer.population,
      difference: Math.min(
        1,
        Math.abs(
          baseline.schoolchildren / baseline.population - peer.schoolchildren / peer.population,
        ) / 0.12,
      ),
    },
    {
      key: 'rurality',
      label: 'Simuleret landlighedsindeks',
      weight: 0.2,
      baseline: baseline.rurality,
      peer: peer.rurality,
      difference: Math.abs(baseline.rurality - peer.rurality),
    },
  ];
  const components = definitions.map(({ difference, ...definition }) => ({
    ...definition,
    normalizedDifference: difference,
    weightedDifference: difference * definition.weight,
  }));
  const distance = components.reduce((sum, component) => sum + component.weightedDifference, 0);
  return { score: Math.round((1 - distance) * 1000) / 10, distance, components };
}

/** The returned ordering is fictional structural similarity, never an economic or official ranking. */
export function selectMunicipalPeers(
  profiles: MunicipalProfile[],
  baselineId = KALUNDBORG_MUNICIPALITY_ID,
  limit = 3,
): MunicipalPeerMatch[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5)
    throw new Error('Vælg mellem 1 og 5 sammenligningskommuner.');
  const baseline = profiles.find((profile) => profile.id === baselineId);
  if (!baseline)
    throw new Error(
      'Der mangler en importeret simuleret basisprofil. Peers kan ikke vælges uden et sammenligningsgrundlag.',
    );
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length)
    throw new Error('Dublerede kommuneprofiler kan ikke indgå i peerudvælgelsen.');
  return profiles
    .filter((profile) => profile.id !== baselineId)
    .map((municipality) => {
      const result = municipalSimilarity(baseline.structure, municipality.structure);
      return {
        municipality,
        ...result,
        explanation: `${municipality.name} har ${new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 }).format(result.score)} af 100 i simuleret strukturlighed med ${baseline.name}. Vægte: indbyggertal 30 %, 65+-andel 25 %, skolebørnsandel 25 % og landlighedsindeks 20 %. Udvalget bygger udelukkende på fiktive strukturtræk, ikke på officielle forhold eller økonomisk kvalitet.`,
      };
    })
    .sort((a, b) => b.score - a.score || a.municipality.code.localeCompare(b.municipality.code))
    .slice(0, limit);
}
