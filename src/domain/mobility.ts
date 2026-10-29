import { z } from 'zod';
import { hash, pupilsForYear, type Dataset } from './data';
import { assertScope, canUseDetailedData, AccessDeniedError } from './policy';
import type { AccessContext, Analysis, AnalysisContext, ChartSpec, SourceRef } from './types';

export const MOBILITY_VERSION = 'KAIA-MOBILITY-v1';
export const mobilityAssumptionsSchema = z
  .object({
    migrationChangePercent: z.number().int().min(-100).max(200),
    extraClasses: z.number().int().min(0).max(20),
    variableCostOre: z.number().int().min(0).max(10_000_000),
  })
  .strict();
export type MobilityAssumptions = z.infer<typeof mobilityAssumptionsSchema>;
export const DEFAULT_MOBILITY: MobilityAssumptions = {
  migrationChangePercent: 0,
  extraClasses: 0,
  variableCostOre: 1_800_000,
};
const normalize = (q: string) =>
  q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae');
export const isMobilityQuestion = (q: string) =>
  /flyttemonst|bornefamil|skolekapacitet|tilflytning/.test(normalize(q));
export function mobilityQuestionAssumptions(
  question: string,
  previous?: MobilityAssumptions,
): MobilityAssumptions {
  const q = normalize(question),
    result = { ...DEFAULT_MOBILITY, ...previous };
  if (/uaendret tilflytning|nulstil/.test(q)) result.migrationChangePercent = 0;
  const change = q.match(
    /(?:tilflytning|flytning|familier).{0,45}?(stiger|falder|oges|reduceres).{0,12}?(\d+)\s*(?:procent|%)/,
  );
  if (change)
    result.migrationChangePercent =
      Number(change[2]) * (/falder|reduceres/.test(change[1]) ? -1 : 1);
  const classes = q.match(/\b(\d+)\s+(?:nye|ekstra)\s+klasser/);
  if (classes) result.extraClasses = Number(classes[1]);
  const parsed = mobilityAssumptionsSchema.safeParse(result);
  if (!parsed.success)
    throw new MobilityError('Forudsætningerne ligger uden for demomodellens grænser.');
  return parsed.data;
}
export class MobilityError extends Error {
  readonly status = 422;
  readonly code = 'MOBILITY_INVALID';
}
export interface MobilityHistory {
  id: string;
  entityId: string;
  year: number;
  pupils: number;
  capacity: number;
  domesticIn: number;
  domesticOut: number;
  internationalIn: number;
  internationalOut: number;
  internalIn: number;
  internalOut: number;
  schoolChildrenNet: number;
  migrationPupils: number;
  cohortBalance: number;
}
export interface MobilitySchool {
  id: string;
  name: string;
  capacity: number;
  pupils: number;
  migrationPerYear: number;
  cohortPerYear: number;
}
export interface MobilityPoint {
  year: number;
  pupils: number;
  capacity: number;
  shortage: number;
  variableCostOre: number;
  fixedCostOre: number;
}
export interface MobilityCase {
  version: typeof MOBILITY_VERSION;
  seed: string;
  anchorYear: number;
  observedAt: string;
  history: MobilityHistory[];
  schools: MobilitySchool[];
  assumptions: MobilityAssumptions;
  baseline: MobilityPoint[];
  scenario: MobilityPoint[];
  schoolResults: Array<{
    id: string;
    name: string;
    pupils: number;
    capacity: number;
    shortage: number;
    extraClasses: number;
  }>;
  familyNet: number;
  schoolChildrenNet: number;
  costDeltaOre: number;
  additionalPupils: number;
  assumptionsFingerprint: string;
}
const count = new Intl.NumberFormat('da-DK');
const money = (v: number) =>
  new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    maximumFractionDigits: 0,
  }).format(v / 100);
const roundedRatio = (a: number, b: number) =>
  Number((BigInt(a) * 2n + BigInt(b)) / (2n * BigInt(b)));
const signedRatio = (a: number, b: number) => (a < 0 ? -roundedRatio(-a, b) : roundedRatio(a, b));
export const CLASS_SIZE = 24;
export const CLASS_COST_ORE = 110_000_000;
export function assertMobilityAccess(
  user: AccessContext,
  context: AnalysisContext,
  dataset: Dataset,
) {
  assertScope(user, context.entityIds, dataset.entities, 'schools');
  if (
    context.area !== 'schools' ||
    !canUseDetailedData(user) ||
    context.entityIds.some(
      (id) => !dataset.entities.some((e) => e.id === id && e.type === 'school'),
    )
  )
    throw new AccessDeniedError(
      'Demoforløbet kræver faglig adgang til de valgte skoler. Politisk adgang kan fortsat bruge områdets aggregerede økonomianalyser.',
    );
  const year = context.period.year,
    first = dataset.coverage?.fromYear ?? 2020;
  if (
    !Number.isInteger(year) ||
    year < first + 6 ||
    year > Number(dataset.referenceDate.slice(0, 4))
  )
    throw new MobilityError(
      `Vælg et referenceår mellem ${first + 6} og ${dataset.referenceDate.slice(0, 4)}. Forløbet bruger fem afsluttede kalenderår før referenceåret.`,
    );
}
function generateCase(
  context: AnalysisContext,
  dataset: Dataset,
): Pick<MobilityCase, 'version' | 'seed' | 'anchorYear' | 'observedAt' | 'history' | 'schools'> {
  const anchorYear = context.period.year,
    seed = `${dataset.seed}:${dataset.version}:${MOBILITY_VERSION}`;
  const all = dataset.entities
    .filter((e) => e.type === 'school')
    .sort((a, b) => a.id.localeCompare(b.id));
  const selected = all.filter((e) => context.entityIds.includes(e.id));
  const history: MobilityHistory[] = [];
  for (const entity of selected) {
    const i = all.findIndex((e) => e.id === entity.id);
    const capacity =
      CLASS_SIZE *
      Math.ceil(
        (pupilsForYear(entity, anchorYear - 1) * (0.96 + (hash(seed + entity.id) % 20) / 100)) /
          CLASS_SIZE,
      );
    for (let year = anchorYear - 5; year < anchorYear; year++) {
      const pupils = pupilsForYear(entity, year),
        previous = pupilsForYear(entity, year - 1);
      const variation = hash(`${seed}:${entity.id}:${year}`) % 7;
      const domesticIn = Math.max(2, Math.round(pupils * 0.045) + variation),
        domesticOut = Math.max(1, Math.round(pupils * 0.03) + (variation % 3));
      const internationalIn = Math.max(1, Math.round(pupils * 0.008)),
        internationalOut = Math.round(pupils * 0.003);
      // A closed ring keeps internal demo-area moves balanced across the complete organisation.
      const transfer = (id: string) => 1 + (hash(`${seed}:transfer:${id}:${year}`) % 5);
      const internalOut = transfer(entity.id),
        internalIn = transfer(all[(i + all.length - 1) % all.length].id);
      const net =
        domesticIn - domesticOut + internationalIn - internationalOut + internalIn - internalOut;
      const schoolChildrenNet = signedRatio(net * 85, 100),
        migrationPupils = signedRatio(schoolChildrenNet * 90, 100);
      history.push({
        id: `DEMO-MOVE-${entity.id}-${year}`,
        entityId: entity.id,
        year,
        pupils,
        capacity,
        domesticIn,
        domesticOut,
        internationalIn,
        internationalOut,
        internalIn,
        internalOut,
        schoolChildrenNet,
        migrationPupils,
        cohortBalance: pupils - previous - migrationPupils,
      });
    }
  }
  const schools = selected.map((entity) => {
    const rows = history.filter((r) => r.entityId === entity.id),
      last = rows.at(-1)!;
    return {
      id: entity.id,
      name: entity.name,
      capacity: last.capacity,
      pupils: last.pupils,
      migrationPerYear: signedRatio(
        rows.reduce((n, r) => n + r.migrationPupils, 0),
        5,
      ),
      cohortPerYear: signedRatio(
        rows.reduce((n, r) => n + r.cohortBalance, 0),
        5,
      ),
    };
  });
  return {
    version: MOBILITY_VERSION,
    seed,
    anchorYear,
    observedAt: dataset.referenceDate,
    history,
    schools,
  };
}
export const mobilityDemand = (s: MobilitySchool, t: number, a: MobilityAssumptions) =>
  Math.max(
    0,
    s.pupils +
      t *
        (signedRatio(s.migrationPerYear * (100 + a.migrationChangePercent), 100) + s.cohortPerYear),
  );

/** Pure, snapshot-based model. No model-generated numbers, external calls or ledger writes. */
export function buildMobilityAnalysis(
  question: string,
  user: AccessContext,
  context: AnalysisContext,
  dataset: Dataset,
  assumptions: MobilityAssumptions = DEFAULT_MOBILITY,
  frozen?: MobilityCase,
): Analysis {
  assertMobilityAccess(user, context, dataset);
  const parsed = mobilityAssumptionsSchema.safeParse(assumptions);
  if (!parsed.success) throw new MobilityError('Kontrollér scenariets forudsætninger.');
  assumptions = parsed.data;
  if (
    frozen &&
    (frozen.version !== MOBILITY_VERSION ||
      frozen.anchorYear !== context.period.year ||
      JSON.stringify(frozen.schools.map((s) => s.id).sort()) !==
        JSON.stringify([...context.entityIds].sort()))
  )
    throw new MobilityError('Scenariets gemte version eller enheder matcher ikke analysen.');
  const raw = frozen
    ? {
        version: frozen.version,
        seed: frozen.seed,
        anchorYear: frozen.anchorYear,
        observedAt: frozen.observedAt,
        history: frozen.history,
        schools: frozen.schools,
      }
    : generateCase(context, dataset);
  const { schools, history, anchorYear } = raw;
  // Allocate each additional class once to the largest projected local shortage; never pool spare places across schools.
  const allocation = new Map(schools.map((s) => [s.id, 0]));
  const demand = mobilityDemand;
  for (let i = 0; i < assumptions.extraClasses; i++) {
    const next = [...schools].sort(
      (a, b) =>
        demand(b, 5, assumptions) -
          b.capacity -
          allocation.get(b.id)! * CLASS_SIZE -
          (demand(a, 5, assumptions) - a.capacity - allocation.get(a.id)! * CLASS_SIZE) ||
        a.id.localeCompare(b.id),
    )[0];
    allocation.set(next.id, allocation.get(next.id)! + 1);
  }
  function project(a: MobilityAssumptions, extra: boolean): MobilityPoint[] {
    return Array.from({ length: 5 }, (_, i) => {
      const t = i + 1,
        local = schools.map((s) => ({
          pupils: demand(s, t, a),
          capacity: s.capacity + (extra ? allocation.get(s.id)! * CLASS_SIZE : 0),
        }));
      const pupils = local.reduce((n, r) => n + r.pupils, 0);
      return {
        year: anchorYear + i,
        pupils,
        capacity: local.reduce((n, r) => n + r.capacity, 0),
        shortage: local.reduce((n, r) => n + Math.max(0, r.pupils - r.capacity), 0),
        variableCostOre: pupils * a.variableCostOre,
        fixedCostOre: (extra ? assumptions.extraClasses : 0) * CLASS_COST_ORE,
      };
    });
  }
  const baseline = project(DEFAULT_MOBILITY, false),
    scenario = project(assumptions, true),
    last = scenario.at(-1)!,
    baseLast = baseline.at(-1)!;
  const familyNet = history.reduce(
    (n, r) =>
      n +
      r.domesticIn -
      r.domesticOut +
      r.internationalIn -
      r.internationalOut +
      r.internalIn -
      r.internalOut,
    0,
  );
  const data: MobilityCase = {
    ...raw,
    assumptions,
    baseline,
    scenario,
    familyNet,
    schoolChildrenNet: history.reduce((n, r) => n + r.schoolChildrenNet, 0),
    schoolResults: schools.map((s) => ({
      id: s.id,
      name: s.name,
      pupils: demand(s, 5, assumptions),
      capacity: s.capacity + allocation.get(s.id)! * CLASS_SIZE,
      shortage: Math.max(
        0,
        demand(s, 5, assumptions) - s.capacity - allocation.get(s.id)! * CLASS_SIZE,
      ),
      extraClasses: allocation.get(s.id)!,
    })),
    additionalPupils: last.pupils - baseLast.pupils,
    costDeltaOre: last.variableCostOre + last.fixedCostOre - baseLast.variableCostOre,
    assumptionsFingerprint: `mobility-${hash(JSON.stringify({ raw, assumptions })).toString(16)}`,
  };
  if (
    [last.variableCostOre, last.fixedCostOre, data.costDeltaOre].some(
      (n) => !Number.isSafeInteger(n),
    )
  )
    throw new MobilityError('Beregningen overskrider den præcise beløbsrepræsentation.');
  const version = dataset.version,
    scope = context.entityIds.slice().sort().join('|'),
    key = hash(`${version}:${raw.seed}:${anchorYear}:${scope}`).toString(16);
  const source = (
    suffix: string,
    title: string,
    excerpt: string,
    origin?: SourceRef['origin'],
  ): SourceRef => ({
    id: `DEMO-MOBILITY-${suffix}-${key}`,
    title,
    type: 'demo',
    status: 'simulated',
    datasetVersion: version,
    period:
      suffix === 'MOVES'
        ? `${anchorYear - 5}–${anchorYear - 1}`
        : `${anchorYear - 5}–${anchorYear + 4}`,
    observedAt: raw.observedAt,
    ...(origin ? { origin } : {}),
    excerpt,
  });
  const moveRows = history.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !['pupils', 'capacity', 'cohortBalance'].includes(key)),
    ),
  );
  const sources = [
    source(
      'MOVES',
      'Børnefamiliers flytninger',
      `Fiktive demoområder knyttet til de valgte skolers navne; områderne er ikke kommunens faktiske skoledistrikter. Børnefamilie betyder i modellen en husstand med mindst ét barn 0–17 år. Flytninger er husstandshændelser, ikke unikke familier over fem år. Indenlandske flytninger mellem kommuner, internationale flytninger og interne flytninger vises særskilt. 0,85 børn i skolealderen pr. nettofamilieflytning og 90 % skoleoptag er faste modelantagelser.\n${JSON.stringify(moveRows)}`,
    ),
    source(
      'CAPACITY',
      'Elevtal og skolepladser',
      `Elevtal bruger samme pupilsForYear-funktion og syntetiske institutionsgrundtal som økonomidemoen. Kapaciteten er et særskilt fiktivt antal anvendelige pladser. Inklusion, klassetrin og faktisk bygningsegnethed vurderes ikke.\n${JSON.stringify(history.map(({ id, entityId, year, pupils, capacity, cohortBalance }) => ({ id, entityId, year, pupils, capacity, cohortBalance })))}`,
    ),
    source(
      'ASSUMPTIONS',
      'Valgte forudsætninger',
      `${MOBILITY_VERSION}. Fem afsluttede kalenderår og fem prognoseår. Migrationstilpasning ${assumptions.migrationChangePercent} %, ${assumptions.extraClasses} nye klasser à ${CLASS_SIZE} pladser fra første prognoseår, variabel udgift ${money(assumptions.variableCostOre)} pr. elev/år og fast driftsudgift ${money(CLASS_COST_ORE)} pr. ny klasse/år. Prisniveau er konstant, beløb er illustrative nettodriftsudgifter; ingen anlæg, momsberegning, skat, udligning eller inflation indregnes. Skolevalg, private skoler og udpendling er repræsenteret ved den faste optagsantagelse; ingen individuel visitation.`,
      'assumption',
    ),
    source(
      'CALCULATION',
      'Kapacitet og økonomi · beregningsgrundlag',
      `Historisk elevændring = migrationseffekt + øvrig kohortebalance. Sidstnævnte er den afstemte rest, ikke en dokumenteret årsag. Fremskrivning pr. skole = seneste elevtal + årstrin × (gennemsnitlig migrationseffekt × (1 + ændring/100) + gennemsnitlig øvrig balance); afrunding til hele elever. Lokal pladsmangel = max(0, elever − anvendelige pladser), summeret uden at udligne med andre skolers ledige pladser. Nye klasser fordeles deterministisk til største forventede lokale pres. Variabel drift = elevtal × enhedspris; ny fast drift = nye klasser × klassepris. Eksisterende faste udgifter er uændrede og indgår ikke i ændringsbeløbet. Lavere elevtal giver ingen automatisk klasselukning.\n${JSON.stringify({ baseline, scenario, schoolResults: data.schoolResults, costDeltaOre: data.costDeltaOre })}`,
      'calculation',
    ),
  ];
  const chart: ChartSpec = {
    type: 'line',
    title: 'Elevudvikling og anvendelige skolepladser',
    subtitle: `${anchorYear - 5}–${anchorYear + 4} · elever / pladser · forventninger er stiplede`,
    unit: 'number',
    displayUnit: 'elever / pladser',
    rows: [
      ...Array.from({ length: 5 }, (_, i) => {
        const y = anchorYear - 5 + i;
        return {
          label: String(y),
          history: history.filter((r) => r.year === y).reduce((n, r) => n + r.pupils, 0),
          baseline: i === 4 ? schools.reduce((n, s) => n + s.pupils, 0) : null,
          scenario: i === 4 ? schools.reduce((n, s) => n + s.pupils, 0) : null,
          capacity: schools.reduce((n, s) => n + s.capacity, 0),
        };
      }),
      ...scenario.map((p, i) => ({
        label: String(p.year),
        history: null,
        baseline: baseline[i].pupils,
        scenario: p.pupils,
        capacity: p.capacity,
      })),
    ],
    series: [
      { key: 'history', label: 'Elevtal · afsluttede år', color: '#464f5e' },
      { key: 'baseline', label: 'Uændrede forudsætninger', color: '#006f71', dashed: true },
      { key: 'scenario', label: 'Valgt scenarie', color: '#bc4d30', dashed: true },
      { key: 'capacity', label: 'Anvendelige pladser', color: '#9b4028' },
    ],
    sourceIds: sources.map((s) => s.id),
  };
  const conclusion = `I de fem afsluttede år er nettoflytningen ${count.format(familyNet)} børnefamiliehændelser i de valgte demoområder. Med de valgte forudsætninger er der ${count.format(last.pupils)} elever og ${count.format(last.capacity)} pladser i ${last.year}. Den lokale pladsmangel er samlet ${count.format(last.shortage)} pladser. [1] [2] [4]`;
  return {
    analysisId: `mobility-${key}-${hash(JSON.stringify(assumptions))}`,
    datasetVersion: version,
    question,
    title: 'Flyttemønstre og skolekapacitet',
    context: {
      ...context,
      intent: 'mobilityCapacity',
      period: { year: anchorYear, fromMonth: 1, toMonth: 12 },
      metric: 'net',
      mobilityAssumptions: assumptions,
    },
    basisKind: 'dataset',
    mobility: data,
    conclusion,
    narrative: [
      `Historikken viser fem hele kalenderår ${anchorYear - 5}–${anchorYear - 1}. Flytninger er adskilt fra ændringer i alderssammensætning og øvrig elevaktivitet. En nettotilflyttet familie er ikke automatisk en ny skoleelev. [1] [2]`,
      `Prognosen bruger historikkens gennemsnitlige bidrag og eksplicitte optagsforudsætninger. Den er en forenklet kohortemodel uden statistisk konfidensinterval; ændr forudsætningerne i Vis data. [3] [4]`,
      `Scenariets ændring i årlig drift i ${last.year} er ${money(data.costDeltaOre)} i forhold til uændrede forudsætninger. Faste eksisterende udgifter bevares. Nye klassers drift og variable elevudgifter vises særskilt; anlæg er ikke finansieret af denne beregning. [3] [4]`,
    ],
    metrics: [
      {
        label: `Forventede elever ${last.year}`,
        value: last.pupils,
        unit: 'number',
        sourceIds: [sources[3].id],
      },
      {
        label: 'Anvendelige pladser',
        value: last.capacity,
        unit: 'number',
        sourceIds: [sources[1].id, sources[3].id],
      },
      {
        label: 'Lokal pladsmangel',
        value: last.shortage,
        unit: 'number',
        description: 'Summeret pr. skole; ledige pladser modregnes ikke på tværs.',
        sourceIds: [sources[3].id],
      },
      {
        label: 'Ændring i årlig drift',
        value: data.costDeltaOre,
        unit: 'ore',
        sourceIds: [sources[3].id],
      },
    ],
    sources,
    chart,
    assumptions: [
      `Forløbets kildeversion er ${MOBILITY_VERSION}; det anvender snapshot ${version}.`,
      'Navne er officielle; demoområder, familieflytninger og kapaciteter er fiktive modelleringsvalg.',
      'Interne flytninger afstemmer til nul for hele demoorganisationen. Et delscope kan have nettobevægelse til og fra øvrige områder.',
      'Fødsler, dødsfald, aldersovergange og øvrigt skolevalg indgår samlet i øvrig kohortebalance; der påstås ikke en eksakt personbaseret forklaring.',
      'Kun hele afsluttede kalenderår sammenlignes. Eksisterende faste omkostninger holdes uændrede.',
      'Et planudkast er en intern godkendelsesøvelse; ingen ekstern sag eller myndighedsafgørelse oprettes.',
    ],
    followups: [
      'Hvad hvis tilflytningen stiger 25 procent?',
      'Undersøg skolekapaciteten med 2 ekstra klasser.',
      'Vis samme analyse med uændret tilflytning.',
    ],
  };
}
