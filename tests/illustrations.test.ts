import { describe, expect, it } from 'vitest';
import {
  buildIllustration,
  illustrationSpecSchema,
  IllustrationInputError,
  type IllustrationSpec,
} from '../src/domain/illustrations';
import { entityRegistry, type Dataset } from '../src/domain/data';
import type { AccessContext, AnalysisContext, IllustrationTerm } from '../src/domain/types';

const version = 'KAIA-ILLUSTRATION-FIXTURE-v1';
const entities = entityRegistry();
const user: AccessContext = {
  userId: 'illustration-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-hoeng', 'school-sveboelle'],
};
const baseline: AnalysisContext = {
  area: 'schools',
  entityIds: [...user.unitIds],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
  intent: 'budget',
  metric: 'net',
};
function shell(patch: Partial<Dataset> = {}): Dataset {
  return {
    version,
    seed: 'illustration-fixed-seed',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2020, toYear: 2032 },
    entities,
    get rows(): Dataset['rows'] {
      throw new Error('Illustrations must not read ledger facts.');
    },
    get documents(): Dataset['documents'] {
      throw new Error('Illustrations must not read document facts.');
    },
    get demography(): Dataset['demography'] {
      throw new Error('Illustrations must not read observed/synthetic demographic facts.');
    },
    ...patch,
  };
}
const factor = (label: string, value: number) => ({ label, valueMilli: value * 1000 });
function term(patch: Partial<IllustrationTerm> = {}): IllustrationTerm {
  return {
    label: 'Opstart',
    kind: 'upfrontCost',
    quantityFactors: [factor('Enheder', 1)],
    divisor: 1,
    unitValueOre: 10000,
    ...patch,
  };
}
function investment(
  patch: Partial<Extract<IllustrationSpec, { kind: 'investment' }>> = {},
): Extract<IllustrationSpec, { kind: 'investment' }> {
  return {
    kind: 'investment',
    title: 'Illustrativ AI-investering',
    years: 5,
    assumptions: ['Alle priser er modeludkast på et ensartet momsgrundlag.'],
    terms: [
      term({ unitValueOre: 750_000_00 }),
      term({ label: 'Drift', kind: 'annualCost', unitValueOre: 120_000_00 }),
      term({
        label: 'Tidsværdi',
        kind: 'annualBenefit',
        quantityFactors: [
          factor('Medarbejdere', 100),
          factor('Minutter pr. uge', 300),
          factor('Arbejdsuger', 40),
        ],
        divisor: 60,
        unitValueOre: 100_00,
        cashRealizationBps: 2500,
      }),
    ],
    ...patch,
  };
}
function activity(
  patch: Partial<Extract<IllustrationSpec, { kind: 'activity' }>> = {},
): Extract<IllustrationSpec, { kind: 'activity' }> {
  return {
    kind: 'activity',
    title: 'Illustrativ aktivitetsudvikling',
    years: 5,
    initialQuantityMilli: 24_000_000,
    annualChangeBps: 1000,
    unit: 'besøg',
    assumptions: [],
    ...patch,
  };
}
const process: IllustrationSpec = {
  kind: 'process',
  title: 'Muligt undersøgelsesforløb',
  assumptions: ['Rækkefølgen er et modeludkast.'],
  steps: [
    { label: 'Afgræns behovet', description: 'Beskriv formål og det tilladte fagområde.' },
    {
      label: 'Indsaml grundlag',
      description: 'Undersøg hvilke aggregerede oplysninger der faktisk er tilgængelige.',
    },
    {
      label: 'Vurder muligheder',
      description: 'Sammenhold antagelser og dokumenteret grundlag før en beslutning.',
    },
  ],
};
const question = 'Illustrér en mulig investering med de anførte antagelser.';
const build = (spec: IllustrationSpec, context = baseline, access = user, dataset = shell()) =>
  buildIllustration(question, access, context, spec, dataset);

describe('Serverberegnet investering med adskilt kontant effekt og kapacitet', () => {
  it('beregner faktorer, årets netto og tilbagebetaling præcist fra antagelserne', () => {
    const result = build(investment());
    expect(result.basisKind).toBe('illustration');
    expect(result.illustration?.version).toBe(1);
    const calculation = result.illustration!.calculation;
    if (calculation.kind !== 'investment') throw new Error('Investment calculation expected');
    expect(calculation.upfrontCostOre).toBe(75_000_000);
    expect(calculation.annualCostOre).toBe(12_000_000);
    // 100 × 300 minutes/week × 40 weeks / 60 = 20,000 hours at 100 kr./hour.
    expect(calculation.annualBenefitValueOre).toBe(200_000_000);
    expect(calculation.annualCashBenefitOre).toBe(50_000_000);
    expect(calculation.annualCapacityValueOre).toBe(150_000_000);
    expect(calculation.breakEvenYear).toBe(2027);
    const rows = result.chart!.rows;
    expect(rows.map((row) => row.label)).toEqual(['2026', '2027', '2028', '2029', '2030']);
    expect(rows[0]).toMatchObject({
      cost: 87_000_000,
      benefit: 50_000_000,
      net: -37_000_000,
      cumulative: -37_000_000,
    });
    expect(rows[1]).toMatchObject({
      cost: 12_000_000,
      benefit: 50_000_000,
      net: 38_000_000,
      cumulative: 1_000_000,
    });
    let running = 0;
    for (const row of rows) {
      expect(row.net).toBe(Number(row.benefit) - Number(row.cost));
      running += Number(row.net);
      expect(row.cumulative).toBe(running);
      expect(row.capacityValue).toBe(calculation.annualCapacityValueOre);
    }
    expect(
      result.metrics.find((metric) => metric.label === 'Samlet kontant netto efter 5 år')?.value,
    ).toBe(running);
  });

  it('afrunder et produkt én gang og realiserer kontantandelen fra det uafrundede grundlag', () => {
    const result = build(
      investment({
        terms: [
          term({
            label: 'Gevinst',
            kind: 'annualBenefit',
            quantityFactors: [{ label: 'Mængde', valueMilli: 1005 }],
            unitValueOre: 100,
            cashRealizationBps: 5000,
          }),
        ],
        years: 1,
      }),
    );
    const calculation = result.illustration!.calculation;
    if (calculation.kind !== 'investment') throw new Error('Investment calculation expected');
    // 1.005 kr. = 100.5 øre -> 101; half of the exact input is 50.25 -> 50, not 51.
    expect(calculation.terms[0]).toMatchObject({
      amountOre: 101,
      cashAmountOre: 50,
      capacityAmountOre: 51,
    });
    expect(calculation.annualCashBenefitOre + calculation.annualCapacityValueOre).toBe(
      calculation.annualBenefitValueOre,
    );
  });

  it('betragter ikke frigjort tid som kontant besparelse uden en særskilt antagelse', () => {
    const result = build(
      investment({
        terms: [term({ label: 'Frigjort tid', kind: 'annualBenefit', unitValueOre: 10_000 })],
      }),
    );
    const calculation = result.illustration!.calculation;
    if (calculation.kind !== 'investment') throw new Error('Investment calculation expected');
    expect(calculation.annualCashBenefitOre).toBe(0);
    expect(calculation.annualCapacityValueOre).toBe(10_000);
    expect(
      result.chart!.rows.every(
        (row) => row.net === 0 && row.cumulative === 0 && row.capacityValue === 10_000,
      ),
    ).toBe(true);
    expect(calculation.breakEvenYear).toBeNull();
  });

  it('beregner også den præcise timemængde fra kortere hjemmeplejebesøg', () => {
    const spec = investment({
      years: 1,
      terms: [
        term({
          label: 'Frigjort tid',
          kind: 'annualBenefit',
          quantityFactors: [factor('Besøg', 24_000), factor('Minutter pr. besøg', 8)],
          divisor: 60,
          quantityUnit: 'timer',
          unitValueOre: 360_00,
        }),
      ],
    });
    const result = build(spec);
    const calculation = result.illustration!.calculation;
    if (calculation.kind !== 'investment') throw new Error('Investment calculation expected');
    expect(calculation.terms[0]).toMatchObject({
      quantityMilli: 3_200_000,
      quantityUnit: 'timer',
      amountOre: 115_200_000,
      cashAmountOre: 0,
    });
    expect(result.metrics.find((metric) => metric.displayUnit === 'timer')).toMatchObject({
      value: 3200,
      unit: 'number',
      displayUnit: 'timer',
    });
    expect(result.sources[1].excerpt).toContain('3.200 timer');
  });

  it('giver ingen opdigtet tilbagebetaling hvis omkostningen ikke dækkes i tidshorisonten', () => {
    const result = build(investment({ terms: [term({ unitValueOre: 1_000_000 })], years: 20 }));
    expect(result.illustration?.calculation).toMatchObject({
      kind: 'investment',
      breakEvenYear: null,
    });
    expect(result.chart!.rows.at(-1)?.cumulative).toBe(-1_000_000);
    expect(result.metrics.some((metric) => metric.label.includes('Første år'))).toBe(false);
  });
});

describe('Illustrativ aktivitet og kvalitative forløb', () => {
  it('beregner aktivitetsår direkte fra startantagelsen uden afrundingsdrift', () => {
    const result = build(
      activity({ initialQuantityMilli: 1001, annualChangeBps: 3333, years: 3, unit: 'timer' }),
    );
    expect(result.illustration?.calculation).toEqual({
      kind: 'activity',
      points: [
        { year: 2026, quantityMilli: 1001 },
        { year: 2027, quantityMilli: 1335 },
        { year: 2028, quantityMilli: 1779 },
      ],
    });
    expect(result.chart?.displayUnit).toBe('timer');
    expect(result.chart?.rows.map((row) => row.value)).toEqual([1.001, 1.335, 1.779]);
    expect(result.metrics[1]).toMatchObject({ value: 1.779, unit: 'number', displayUnit: 'timer' });
  });

  it.each([-10_000, 0, 10_000])('håndterer årlig ændring %i basispoint', (annualChangeBps) => {
    const result = build(activity({ initialQuantityMilli: 10_000, years: 3, annualChangeBps }));
    const values = result.chart!.rows.map((row) => row.value);
    expect(values).toEqual(
      annualChangeBps === -10_000
        ? [10, 0, 0]
        : annualChangeBps === 0
          ? [10, 10, 10]
          : [10, 20, 40],
    );
  });

  it('kan vise 20 hypotetiske år uden at fremstille dem som seeddata eller ændre baselineperioden', () => {
    const result = build(activity({ years: 20, annualChangeBps: 0 }));
    expect(result.context.period).toEqual(baseline.period);
    expect(result.chart!.rows.at(-1)?.label).toBe('2045');
    expect(result.assumptions.some((text) => text.includes('uden for datasættet'))).toBe(true);
    expect(result.assumptions.some((text) => text.includes('ikke kommunale prognoser'))).toBe(true);
    expect(result.datasetVersion).toBe(version);
  });

  it('bygger et procesforløb uden økonomital, sandsynligheder eller effektmål', () => {
    const result = build(process);
    expect(result.metrics).toEqual([]);
    expect(result.scenario).toBeUndefined();
    expect(result.chart).toMatchObject({ type: 'flow', unit: 'number', displayUnit: 'rækkefølge' });
    expect(result.chart!.rows).toEqual(
      process.kind === 'process'
        ? process.steps.map((step, index) => ({ ...step, order: index + 1 }))
        : [],
    );
    expect(result.illustration?.calculation).toEqual({ kind: 'process', stepCount: 3 });
    expect(result.conclusion).toBe(
      'Her er et muligt forløb, som kan tilpasses det konkrete behov. [1]',
    );
    expect(result.narrative.at(-1)).toBe('Se forslagene og forløbets grundlag i Vis data.');
    expect(result.narrative.join(' ')).not.toContain('justér');
    expect(result.sources[1].excerpt).toContain('positionsnumre er ikke effektmålinger');
  });
});

describe('Kildeproveniens, reproduktion og adgang', () => {
  it.each([investment(), activity()])(
    'giver en betinget konklusion og viser vej til justerbare forudsætninger: $kind',
    (spec) => {
      const result = build(spec);
      expect(result.conclusion).toMatch(/^Med de valgte forudsætninger /);
      expect(result.conclusion).toContain('[2]');
      expect(result.narrative.at(-1)).toBe('Se og justér forudsætningerne i Vis data.');
      expect([result.conclusion, ...result.narrative].join(' ')).not.toMatch(
        /modeludkast|hypotese|mangler.{0,20}datagrundlag|ikke en budgetprognose/,
      );
      expect(result.assumptions).toContain(
        'Forudsætninger og trin er valgt til dette eksempel; de beskriver ikke registrerede kommunale forhold eller vedtagne beslutninger.',
      );
      expect(result.sources[0]).toMatchObject({
        title: 'Valgte forudsætninger',
        origin: 'assumption',
        status: 'simulated',
      });
      expect(result.sources[1]).toMatchObject({
        title: 'Beregning og metode',
        origin: 'calculation',
        status: 'simulated',
      });
    },
  );

  it('bevarer adskillelsen af kontant effekt og kapacitetsværdi i den korte forklaring', () => {
    const result = build(investment());
    expect(result.narrative[0]).toContain('antaget kontant effekt');
    expect(result.narrative[0]).toContain('kapacitetsværdi');
    expect(result.narrative[0]).toContain('Kun den kontante effekt indgår i kontant netto.');
    expect(result.sources[1].excerpt).toContain(
      'Årets kontante netto = kontant gevinst − drift − engangsomkostning (kun første år)',
    );
  });

  it('adskiller antagelseskilden fra beregning og bruger samme version og beregning i alle visninger', () => {
    const result = build(investment());
    expect(result.sources.map((source) => source.origin)).toEqual(['assumption', 'calculation']);
    expect(
      result.sources.every(
        (source) =>
          source.type === 'demo' &&
          source.status === 'simulated' &&
          source.datasetVersion === version &&
          !source.rowIds &&
          !source.documentId,
      ),
    ).toBe(true);
    const calculationId = result.sources[1].id;
    expect(
      result.metrics.every(
        (metric) => metric.sourceIds.length === 1 && metric.sourceIds[0] === calculationId,
      ),
    ).toBe(true);
    expect(result.chart!.sourceIds).toEqual([calculationId]);
    expect(result.conclusion).toContain('[2]');
    expect(result.sources[0].excerpt).toContain('valgt som forudsætninger for dette eksempel');
    expect(result.sources[0].excerpt).toContain('ikke som opslag i kommunale registreringer');
    expect(result.sources[1].excerpt).toContain(result.sources[0].id);
    expect(result.sources[1].excerpt).toContain('ingen regnskabs-, budget- eller dokumentrækker');
  });

  it('bevarer præcis spec og resultater i et genåbneligt JSON-snapshot', () => {
    const spec = investment();
    const result = build(spec);
    const restored = JSON.parse(JSON.stringify(result));
    expect(restored).toEqual(result);
    expect(restored.illustration.spec).toEqual(spec);
    expect(build(restored.illustration.spec)).toEqual(result);
  });

  it('har deterministisk ID for seed/spec/version/scope uden at mutere input', () => {
    const spec = investment();
    const inputSnapshot = JSON.stringify({ spec, baseline });
    const result = build(spec);
    expect(build(spec)).toEqual(result);
    expect(build(spec, { ...baseline, entityIds: [...baseline.entityIds].reverse() })).toEqual(
      result,
    );
    expect(build(spec, baseline, user, shell({ seed: 'another-seed' })).analysisId).not.toBe(
      result.analysisId,
    );
    expect(build(spec, baseline, user, shell({ version: 'another-version' })).analysisId).not.toBe(
      result.analysisId,
    );
    expect(build(investment({ years: 4 })).analysisId).not.toBe(result.analysisId);
    expect(JSON.stringify({ spec, baseline })).toBe(inputSnapshot);
  });

  it('afviser en skole uden for scope og blandede fagområder', () => {
    expect(() => build(process, { ...baseline, entityIds: ['school-nyrup'] })).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    const wide: AccessContext = { ...user, unitIds: ['*'], areas: ['schools', 'facilities'] };
    expect(() =>
      build(process, { ...baseline, entityIds: ['school-hoeng', 'facility-spiralen'] }, wide),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('giver ikke et kommunalbestyrelsesmedlem institutionsdetaljer gennem en illustration', () => {
    const council: AccessContext = { ...user, roles: ['KAIA.Council'] };
    expect(() =>
      build(process, { ...baseline, entityIds: ['school-hoeng'] }, council),
    ).toThrowError(expect.objectContaining({ status: 403 }));
    expect(
      build(process, baseline, council).sources.every((source) => !source.rowIds?.length),
    ).toBe(true);
  });

  it.each(['Hent elevernes CPR-numre', 'Hvad er kommunens faktiske budget?'])(
    'ophæver ikke afvisningen af fraværende data: %s',
    (question) => {
      expect(() => buildIllustration(question, user, baseline, process, shell())).toThrow(
        IllustrationInputError,
      );
    },
  );
});

describe('Afgrænsede antagelser uden udtryks- eller kodekørsel', () => {
  it.each([
    investment({ years: 0 }),
    investment({ years: 21 }),
    investment({ terms: [] }),
    investment({ terms: Array.from({ length: 7 }, (_, index) => term({ label: String(index) })) }),
    investment({ terms: [term(), term()] }),
    investment({ terms: [term({ unitValueOre: -1 })] }),
    investment({ terms: [term({ cashRealizationBps: 10_000 })] }),
    investment({ terms: [term({ kind: 'annualBenefit', cashRealizationBps: 10_001 })] }),
    investment({ terms: [term({ quantityFactors: [] })] }),
    activity({ initialQuantityMilli: Number.NaN }),
    activity({ initialQuantityMilli: Infinity }),
    activity({ annualChangeBps: -10_001 }),
    { ...process, steps: process.kind === 'process' ? process.steps.slice(0, 2) : [] },
    { ...activity(), expression: 'process.env.SECRET' },
    { ...process, chart: { type: 'bar', rows: [{ value: 999 }] } },
  ])('afviser uvaliderede eller ubundne inputs %#', (spec) => {
    expect(illustrationSpecSchema.safeParse(spec).success).toBe(false);
    expect(() => build(spec as IllustrationSpec)).toThrow(IllustrationInputError);
  });

  it('afviser præcisionsoverskridelse i produkter eller akkumulerede beløb', () => {
    expect(() =>
      build(
        investment({
          terms: [
            term({
              quantityFactors: Array.from({ length: 3 }, (_, index) => ({
                label: String(index),
                valueMilli: 1_000_000_000,
              })),
              unitValueOre: 10_000_000_000,
            }),
          ],
        }),
      ),
    ).toThrow(IllustrationInputError);
    expect(() =>
      build(
        activity({ initialQuantityMilli: 1_000_000_000_000, annualChangeBps: 10_000, years: 20 }),
      ),
    ).toThrow(IllustrationInputError);
  });

  it('fastholder baseline i snapshot og afviser et illustrativt slutår efter 2050', () => {
    expect(() =>
      build(activity(), { ...baseline, period: { ...baseline.period, year: 2019 } }),
    ).toThrow();
    expect(() =>
      build(activity({ years: 20 }), { ...baseline, period: { ...baseline.period, year: 2032 } }),
    ).toThrow(IllustrationInputError);
    expect(
      build(activity({ years: 19, annualChangeBps: 0 }), {
        ...baseline,
        period: { ...baseline.period, year: 2032 },
      }).chart!.rows.at(-1)?.label,
    ).toBe('2050');
  });
});
