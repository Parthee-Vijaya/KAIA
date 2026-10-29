import { describe, expect, it } from 'vitest';
import type { Analysis } from '../src/domain/types';
import { buildAnswerEvidence, withIllustrationHistorySources } from '../src/server/answer-evidence';
import { buildIllustration } from '../src/domain/illustrations';
import { entityRegistry, type Dataset } from '../src/domain/data';
import type { AccessContext, IllustrationSpec } from '../src/domain/types';

const basis = (): Analysis => ({
  analysisId: 'DEMO-EVIDENCE',
  datasetVersion: 'DEMO-VERSION',
  question: 'Sammenlign skolerne pr. elev.',
  title: 'Udgift pr. elev',
  conclusion: 'En beregnet sammenligning. [1]',
  narrative: ['Samme måneder og skoler. [1]'],
  context: {
    area: 'schools',
    entityIds: ['school-a', 'school-b'],
    period: { year: 2025, fromMonth: 1, toMonth: 12 },
    intent: 'comparison',
    metric: 'perPupil',
  },
  metrics: [{ label: 'Helårsbudget', value: 225000099, unit: 'ore', sourceIds: ['DEMO-CALC'] }],
  chart: {
    type: 'bar',
    title: 'Udgift pr. elev',
    subtitle: 'Hele2025 · kr./elev',
    unit: 'ore',
    sourceIds: ['DEMO-CALC'],
    series: [
      { key: 'budget', label: 'Budget', color: '#006f71' },
      { key: 'actual', label: 'Forbrug', color: '#bc4d30' },
    ],
    rows: [
      { label: 'Høng Skole', budget: 8000000, actual: 8123456, variance: 200000099, pupils: 400 },
      {
        label: 'Svebølle Skole',
        budget: 7900000,
        actual: 8000001,
        variance: -8000000,
        pupils: 250,
      },
    ],
  },
  sources: [
    {
      id: 'DEMO-CALC',
      title: 'Simuleret beregningsgrundlag',
      type: 'demo',
      datasetVersion: 'DEMO-VERSION',
      period: 'januar–december2025',
      excerpt: 'Budget, regnskab og beregning.',
    },
  ],
  assumptions: ['Begge skoler har samme periode.'],
  followups: [],
});

describe('model input for distinct illustrative assumptions and calculated results', () => {
  const shell: Dataset = {
    version: 'ILLUSTRATION-FIXTURE',
    seed: 'fixed-evidence',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2023, toYear: 2032 },
    entities: entityRegistry().filter((entity) => entity.id === 'school-hoeng'),
    rows: [],
    documents: [],
    demography: [],
  };
  const owner: AccessContext = {
    userId: 'fixture-owner',
    tenantId: 'fixture',
    objectId: 'fixture',
    displayName: 'Økonomikonsulent',
    title: 'Økonomikonsulent',
    roles: ['KAIA.Finance'],
    areas: ['schools'],
    unitIds: ['school-hoeng'],
  };
  const context = {
    area: 'schools' as const,
    entityIds: ['school-hoeng'],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    intent: 'illustration',
    metric: 'net' as const,
  };
  const build = (spec: IllustrationSpec) =>
    buildIllustration('Et illustrativt regneeksempel', owner, context, spec, shell);
  it('passes exact assumption parameters and separates capacity value from cash', () => {
    const analysis = build({
      kind: 'investment',
      title: 'Illustrativ kapacitet',
      years: 3,
      terms: [
        {
          label: 'Mulig gevinst',
          kind: 'annualBenefit',
          quantityFactors: [{ label: 'Andel', valueMilli: 125 }],
          divisor: 1,
          unitValueOre: 100000,
          cashRealizationBps: 0,
        },
      ],
      assumptions: ['En antaget mængde.'],
    });
    const payload = buildAnswerEvidence(analysis);
    expect(payload.basisKind).toBe('illustration');
    expect(payload.illustration?.kind).toBe('investment');
    const illustration = payload.illustration;
    if (illustration?.kind !== 'investment') throw new Error('Expected investment');
    expect(illustration.terms[0].quantityFactors[0].value.formatted).toBe('0,125');
    expect(illustration.terms[0].unitValue.formatted).toBe('1.000,00 kr.');
    expect(illustration.terms[0].cashRealization.formatted).toBe('0,0 %');
    expect(illustration.calculation.annualCashBenefit.formatted).toBe('0,00 kr.');
    expect(illustration.calculation.annualCapacityValue.formatted).toBe('125,00 kr.');
    expect(payload.citations.map((source) => source.origin)).toEqual(['assumption', 'calculation']);
    expect(payload.citations.every((source) => !source.rowIds)).toBe(true);
  });
  it('formats milli activity values with their declared physical unit and basis points as percent', () => {
    const analysis = build({
      kind: 'activity',
      title: 'Illustrative besøg',
      years: 3,
      initialQuantityMilli: 125555,
      annualChangeBps: 125,
      unit: 'besøg',
      assumptions: [],
    });
    const payload = buildAnswerEvidence(analysis);
    expect(payload.metrics[0].value.formatted).toBe('125,555 besøg');
    expect(payload.chart?.rows[0].values.value).toMatchObject({
      raw: 125.555,
      rawUnit: 'number',
      unit: 'besøg',
      formatted: '125,555 besøg',
    });
    const illustration = payload.illustration;
    if (illustration?.kind !== 'activity') throw new Error('Expected activity');
    expect(illustration.initialQuantity.formatted).toBe('125,555 besøg');
    expect(illustration.annualChange.formatted).toBe('1,25 %');
    expect(illustration.calculation.points[2].quantity.raw).toBe(analysis.chart!.rows[2].value);
  });
  it('passes process descriptions as proposals with zero measured-effect metrics', () => {
    const spec: IllustrationSpec = {
      kind: 'process',
      title: 'Et muligt forløb',
      steps: [
        { label: 'Afgræns', description: 'Aftal formålet.' },
        { label: 'Undersøg', description: 'Indhent aggregeret grundlag.' },
        { label: 'Afprøv', description: 'Vælg et muligt tiltag.' },
      ],
      assumptions: ['Trinene er kun forslag.'],
    };
    const payload = buildAnswerEvidence(build(spec));
    expect(payload.metrics).toEqual([]);
    expect(payload.chart?.type).toBe('flow');
    expect(payload.illustration).toMatchObject({
      kind: 'process',
      steps: spec.steps,
      calculation: { stepCount: 3, meaning: expect.stringContaining('Ingen målte effekter') },
    });
    expect(payload.chart?.unit).toBe('rækkefølge');
  });
  it('rejects missing illustrative parameters instead of silently treating them as ledger facts', () => {
    expect(() => buildAnswerEvidence({ ...basis(), basisKind: 'illustration' })).toThrow(
      /gemte antagelser/,
    );
  });
  it('passes15to20minute time savings as server-calculated hours and exact cash/capacity results', () => {
    for (const [minutes, hours, formatted] of [
      [15, 1150, '402.500,00 kr.'],
      [20, 1533.333, '536.666,67 kr.'],
    ] as const) {
      const analysis = build({
        kind: 'investment',
        title: 'Illustrativ tidsfrigørelse',
        years: 5,
        terms: [
          {
            label: 'Frigjort tid',
            kind: 'annualBenefit',
            quantityFactors: [
              { label: 'Minutter pr. uge', valueMilli: minutes * 1000 },
              { label: 'Medarbejdere', valueMilli: 100000 },
              { label: 'Uger', valueMilli: 46000 },
            ],
            divisor: 60,
            unitValueOre: 35000,
            quantityUnit: 'timer',
            cashRealizationBps: 0,
          },
        ],
        assumptions: ['Alle værdier er antagelser.'],
      });
      const payload = buildAnswerEvidence(analysis);
      const illustration = payload.illustration;
      if (illustration?.kind !== 'investment') throw new Error('Expected investment');
      expect(illustration.calculation.terms[0].quantity.raw).toBe(hours);
      expect(illustration.calculation.terms[0].quantity.unit).toBe('timer');
      expect(illustration.calculation.annualCapacityValue.formatted).toBe(formatted);
      expect(illustration.calculation.annualCashBenefit.formatted).toBe('0,00 kr.');
    }
  });
  it('provides distinct old15/new20 assumptions and results with clickable evidence, never old rendered prose', () => {
    const model = (minutes: number) =>
      build({
        kind: 'investment',
        title: 'Illustrativ tidsfrigørelse',
        years: 5,
        terms: [
          {
            label: 'Frigjort tid',
            kind: 'annualBenefit',
            quantityFactors: [
              { label: 'Minutter pr. uge', valueMilli: minutes * 1000 },
              { label: 'Medarbejdere', valueMilli: 100000 },
              { label: 'Uger', valueMilli: 46000 },
            ],
            divisor: 60,
            unitValueOre: 35000,
            quantityUnit: 'timer',
            cashRealizationBps: 0,
          },
        ],
        assumptions: ['Alle værdier er antagelser.'],
      });
    const previous = model(15);
    previous.question = 'Vis15minutter';
    previous.renderedText = 'WRONG_OLD_PROSE: Allerede20minutter.';
    const current = model(20);
    const original = structuredClone(current);
    const attached = withIllustrationHistorySources(current, previous);
    const payload = buildAnswerEvidence(attached, previous);
    expect(payload.previousQuestion).toBe('Vis15minutter');
    const old = payload.previousIllustration,
      next = payload.illustration;
    if (old?.kind !== 'investment' || next?.kind !== 'investment')
      throw new Error('Expected investment history');
    expect(old.terms[0].quantityFactors[0].value.formatted).toBe('15');
    expect(next.terms[0].quantityFactors[0].value.formatted).toBe('20');
    expect(old.calculation.terms[0].quantity.formatted).toBe('1.150 timer');
    expect(next.calculation.terms[0].quantity.formatted).toBe('1.533,333 timer');
    expect(old.calculation.annualCapacityValue.formatted).toBe('402.500,00 kr.');
    expect(next.calculation.annualCapacityValue.formatted).toBe('536.666,67 kr.');
    expect(old.calculation.annualCashBenefit.formatted).toBe('0,00 kr.');
    expect(next.calculation.annualCashBenefit.formatted).toBe('0,00 kr.');
    expect(old.sameScope).toBe(true);
    expect(old.samePeriod).toBe(true);
    expect(attached.sources).toHaveLength(4);
    expect(payload.citations[2]).toMatchObject({
      citation: '[3]',
      id: previous.sources[0].id,
      origin: 'assumption',
    });
    expect(payload.citations[3]).toMatchObject({
      citation: '[4]',
      id: previous.sources[1].id,
      origin: 'calculation',
    });
    expect(old.sourceIds).toEqual(previous.sources.map((source) => source.id));
    expect(JSON.stringify(payload)).not.toMatch(/WRONG_OLD_PROSE|renderedText/);
    expect(current).toEqual(original);
    expect(() => buildAnswerEvidence(current, previous)).toThrow(/kildehenvisninger mangler/);
    const third = withIllustrationHistorySources(model(25), attached);
    expect(third.sources).toHaveLength(4);
    expect(third.sources.some((source) => source.id === previous.sources[0].id)).toBe(false);
  });
  it('does not equate previous models from different scopes/periods and rejects cross-version history', () => {
    const spec: IllustrationSpec = {
      kind: 'activity',
      title: 'Illustration',
      years: 2,
      initialQuantityMilli: 1000,
      annualChangeBps: 100,
      unit: 'besøg',
      assumptions: [],
    };
    const current = build(spec),
      previous = build(spec);
    previous.context = {
      ...previous.context,
      entityIds: ['school-sveboelle'],
      period: { year: 2025, fromMonth: 1, toMonth: 12 },
    };
    const payload = buildAnswerEvidence(
      withIllustrationHistorySources(current, previous),
      previous,
    );
    expect(payload.previousIllustration).toMatchObject({ sameScope: false, samePeriod: false });
    expect(() =>
      withIllustrationHistorySources(current, { ...previous, datasetVersion: 'OTHER' }),
    ).toThrow(/samme dataversion/);
    expect(buildAnswerEvidence(current)).not.toHaveProperty('previousIllustration');
  });
});

describe('bounded answer evidence from exact server results', () => {
  it('retains originals while formatting whole-øre monetary metrics as exact Danish kroner', () => {
    const analysis = basis(),
      original = structuredClone(analysis);
    const payload = buildAnswerEvidence(analysis);
    expect(payload.metrics[0].value).toEqual({
      raw: 225000099,
      rawUnit: 'ore',
      unit: 'kr.',
      formatted: '2.250.000,99 kr.',
    });
    expect(analysis).toEqual(original);
    expect(payload.context.period).toEqual(analysis.context.period);
  });
  it('formats only the series as normalized money, excludes mixed total-variance extras and labels pupil counts', () => {
    const payload = buildAnswerEvidence(basis());
    expect(payload.chart?.rows[0]).toEqual({
      label: 'Høng Skole',
      values: {
        budget: { raw: 8000000, rawUnit: 'ore', unit: 'kr./elev', formatted: '80.000,00 kr./elev' },
        actual: { raw: 8123456, rawUnit: 'ore', unit: 'kr./elev', formatted: '81.234,56 kr./elev' },
      },
      pupils: { raw: 400, rawUnit: 'number', unit: 'antal', formatted: '400' },
    });
    expect(JSON.stringify(payload.chart)).not.toContain('variance');
    expect(JSON.stringify(payload.chart)).not.toContain('200000099');
  });
  it('provides exact, reproducible school differences instead of asking the model to do arithmetic', () => {
    expect(buildAnswerEvidence(basis()).pairedComparisons).toEqual([
      {
        label: 'Budget',
        calculation: 'Høng Skole minus Svebølle Skole',
        difference: {
          raw: 100000,
          rawUnit: 'ore',
          unit: 'kr./elev',
          formatted: '1.000,00 kr./elev',
        },
        sourceIds: ['DEMO-CALC'],
      },
      {
        label: 'Forbrug',
        calculation: 'Høng Skole minus Svebølle Skole',
        difference: {
          raw: 123455,
          rawUnit: 'ore',
          unit: 'kr./elev',
          formatted: '1.234,55 kr./elev',
        },
        sourceIds: ['DEMO-CALC'],
      },
    ]);
  });
  it('does not invent a pair or rank when the selected chart has more than two institutions', () => {
    const a = basis();
    a.chart!.rows.push({ ...a.chart!.rows[0], label: 'Nyrupskolen' });
    expect(buildAnswerEvidence(a)).not.toHaveProperty('pairedComparisons');
  });
  it('never swaps a year-change sign by deriving an institution comparison for a two-year chart', () => {
    const a = basis();
    a.context.intent = 'yearComparison';
    expect(buildAnswerEvidence(a)).not.toHaveProperty('pairedComparisons');
  });
  it('labels normalized year/peer difference metrics consistently even when the label omits its denominator', () => {
    for (const [intent, metric, expected] of [
      ['yearComparison', 'perPupil', 'kr./elev'],
      ['municipalBenchmark', 'perCapita', 'kr./indbygger'],
    ] as const) {
      const a = basis();
      a.context.intent = intent;
      a.context.metric = metric;
      a.metrics = [{ label: 'Forskel', value: -123456, unit: 'ore', sourceIds: ['DEMO-CALC'] }];
      expect(buildAnswerEvidence(a).metrics[0].value).toMatchObject({
        raw: -123456,
        formatted: `-1.234,56 ${expected}`,
        unit: expected,
      });
    }
  });
  it('preserves percentage values and does not scale them by 100', () => {
    const a = basis();
    a.metrics = [{ label: 'Ændring', value: 2.567, unit: 'percent', sourceIds: ['DEMO-CALC'] }];
    expect(buildAnswerEvidence(a).metrics[0].value).toEqual({
      raw: 2.567,
      rawUnit: 'percent',
      unit: '%',
      formatted: '2,57 %',
    });
  });
  it('preserves null chart observations without manufacturing zero amounts', () => {
    const a = basis();
    a.chart!.rows[0].actual = null;
    expect(buildAnswerEvidence(a).chart!.rows[0].values.actual).toBeNull();
    expect(buildAnswerEvidence(a).pairedComparisons).toHaveLength(1);
  });
  it('limits chart rows to100 and preserves explicit omission/source metadata', () => {
    const a = basis();
    a.chart!.rows = Array.from({ length: 120 }, (_, i) => ({
      label: String(2020 + i),
      actual: 123456,
      budget: 120000,
    }));
    const c = buildAnswerEvidence(a).chart!;
    expect(c.rows).toHaveLength(100);
    expect(c.rowCount).toBe(120);
    expect(c.rowsOmitted).toBe(20);
    expect(c.sourceIds).toEqual(['DEMO-CALC']);
    expect(c.series.map((series) => series.key)).toEqual(['budget', 'actual']);
  });
  it('keeps citation numbering exact and marks official name evidence as name-only', () => {
    const a = basis();
    a.sources.push({
      ...a.sources[0],
      id: 'NAME-A',
      type: 'name',
      excerpt: 'Skolens officielle navn.',
    });
    expect(buildAnswerEvidence(a).citations).toMatchObject([
      { citation: '[1]', id: 'DEMO-CALC', datasetVersion: a.datasetVersion },
      {
        citation: '[2]',
        id: 'NAME-A',
        purpose: 'Kun officiel navnestavning. Ingen belæg for økonomital.',
      },
    ]);
  });
  it('bounds source text and raw-row references without shipping the ledger', () => {
    const a = basis();
    a.sources[0].excerpt = 'x'.repeat(5000);
    a.sources[0].rowIds = Array.from({ length: 500 }, (_, i) => `ROW-${i}`);
    const source = buildAnswerEvidence(a).citations[0];
    expect(source.excerpt.length).toBe(2000);
    expect(source.rowIds).toHaveLength(20);
    expect(source.rowCount).toBe(500);
    expect(buildAnswerEvidence(a)).not.toHaveProperty('ledger');
  });
  it.each(['version', 'unknown', 'name'] as const)(
    'rejects incompatible %s financial evidence instead of sending unsupported claims',
    (kind) => {
      const a = basis();
      if (kind === 'version') a.sources[0].datasetVersion = 'OTHER';
      if (kind === 'unknown') a.chart!.sourceIds = ['MISSING'];
      if (kind === 'name') a.sources[0].type = 'name';
      expect(() => buildAnswerEvidence(a)).toThrow(/kompatibel demokilde/);
    },
  );
  it('rejects nonfinite metric values', () => {
    const a = basis();
    a.metrics[0].value = Infinity;
    expect(() => buildAnswerEvidence(a)).toThrow(/ugyldigt tal/);
  });
});
