import { describe, expect, it } from 'vitest';
import type { Dataset } from '../src/domain/data';
import { pupilsForYear } from '../src/domain/data';
import { AccessDeniedError } from '../src/domain/policy';
import { applyMultiYearProjection } from '../src/domain/projections';
import type { AccessContext, Analysis, Category, Entity, LedgerRow } from '../src/domain/types';

const access: AccessContext = {
  userId: 'projection-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-one'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
function fixture(): Dataset {
  const entities: Entity[] = [
    {
      id: 'school-one',
      name: 'Høng Skole',
      type: 'school',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-20',
      synthetic: { pupils: 100, annualBudgetOre: 122400 },
    },
    {
      id: 'school-two',
      name: 'Svebølle Skole',
      type: 'school',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-20',
      synthetic: { pupils: 200, annualBudgetOre: 244800 },
    },
    {
      id: 'facility-one',
      name: 'Høng Hallen',
      type: 'facility',
      area: 'facilities',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-20',
      synthetic: { annualBudgetOre: 856800 },
    },
    {
      id: 'committee-one',
      name: 'Børn- og Familieudvalget',
      type: 'committee',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-20',
      synthetic: { annualBudgetOre: 0 },
    },
  ];
  const rows: LedgerRow[] = [];
  for (const [index, entity] of entities.slice(0, 3).entries())
    for (let year = 2025; year <= 2028; year++)
      for (let month = 1; month <= 12; month++)
        for (const kind of ['budget', 'actual', 'forecast'] as const) {
          if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
          const scale = index + 1;
          const price =
            (kind === 'budget' ? 100 : kind === 'actual' ? 103 : 101) + (year - 2026) * 10;
          const amounts: [Category, number][] = [
            [
              'salary',
              (kind === 'budget' ? 10000 : kind === 'actual' ? 10003 : 10001) +
                (year - 2026) * 1000,
            ],
            ['energy', price * 3],
            ['income', kind === 'budget' ? -100 : kind === 'actual' ? -101 : -103],
          ];
          for (const [category, amount] of amounts)
            rows.push({
              id: `${entity.id}-${year}-${month}-${kind}-${category}`,
              datasetVersion: 'fixture-v4',
              entityId: entity.id,
              year,
              month,
              kind,
              category,
              amountOre: amount * scale,
              ...(category === 'energy' ? { quantity: 3 * scale, unitPriceOre: price } : {}),
            });
        }
  return {
    version: 'fixture-v4',
    seed: 'fixed-fixture',
    referenceDate: '2026-09-30',
    entities,
    rows,
    documents: [],
  };
}
function base(
  dataset: Dataset,
  metric: 'net' | 'energy' | 'perPupil' | 'perCapita' = 'net',
): Analysis {
  const context = {
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    entityIds: ['school-one'],
    area: 'schools' as const,
    metric,
  };
  return {
    analysisId: 'DEMO-fixture',
    datasetVersion: dataset.version,
    question: 'Vis en simuleret prognose.',
    title: 'Tidligere analyse',
    conclusion: 'Tidligere konklusion',
    narrative: [],
    metrics: [],
    sources: [
      {
        id: 'DEMO-CALC-old',
        title: 'Tidligere delårsberegning',
        type: 'demo',
        datasetVersion: dataset.version,
        period: '2026',
        excerpt: 'Tidligere delårsbeløb',
        rowIds: ['old-row'],
      },
    ],
    assumptions: [],
    followups: [],
    context,
    renderedText: 'Tidligere modeltekst',
  };
}

describe('multi-year projections with authorized deterministic ledger facts', () => {
  it('reconciles exact annual øre, budgets, forecast months and cumulative growth', () => {
    const dataset = fixture();
    const result = applyMultiYearProjection(base(dataset), dataset, access, 2027);
    expect(result.chart?.rows).toEqual([
      {
        label: '2026',
        budget: 122400,
        base: 122502,
        low: 122193,
        high: 122811,
        actual: 91899,
        forecast: 30603,
        cumulativeGrowthPercent: 0,
        annualGrowthPercent: null,
        actualMonths: 9,
        forecastMonths: 3,
      },
      {
        label: '2027',
        budget: 134760,
        base: 134772,
        low: 132060,
        high: 137508,
        actual: null,
        forecast: 134772,
        cumulativeGrowthPercent: ((134772 - 122502) / 122502) * 100,
        annualGrowthPercent: ((134772 - 122502) / 122502) * 100,
        actualMonths: 0,
        forecastMonths: 12,
      },
    ]);
    expect(result.metrics.find((metric) => metric.label === 'Basis 2027')?.value).toBe(134772);
    expect(result.chart?.unit).toBe('ore');
    expect(result.chart?.series.map((series) => series.key)).toEqual([
      'budget',
      'base',
      'low',
      'high',
    ]);
    expect(result.chart?.series.slice(1).every((series) => series.dashed)).toBe(true);
    expect(result.sources[0].excerpt).toContain(
      'årsnetto 134772 øre = udgifter 136008 øre + indtægter -1236 øre',
    );
    expect(result.sources[0].excerpt).toContain('Fuldt reproducerbart udtræk');
  });

  it('ignores future actuals, preserves real observed amounts and never mutates the dataset', () => {
    const dataset = fixture();
    dataset.rows.push({
      id: 'untrusted-future-actual',
      datasetVersion: dataset.version,
      entityId: 'school-one',
      year: 2027,
      month: 1,
      category: 'salary',
      kind: 'actual',
      amountOre: 999999999,
    });
    const before = structuredClone(dataset);
    const result = applyMultiYearProjection(base(dataset), dataset, access, 2027);
    expect(result.chart?.rows[0].actual).toBe(91899);
    expect(result.chart?.rows[1].actual).toBeNull();
    expect(result.chart?.rows[1].base).toBe(134772);
    expect(dataset).toEqual(before);
    expect(result.renderedText).toBeUndefined();
  });

  it('keeps income unchanged across the sensitivity span, including income-only forecasts', () => {
    const dataset = fixture();
    dataset.rows = dataset.rows.filter((row) => row.category === 'income');
    const result = applyMultiYearProjection(base(dataset), dataset, access, 2027);
    expect(result.chart?.rows[1]).toMatchObject({ base: -1236, low: -1236, high: -1236 });
    expect(result.sources[0].excerpt).toContain('udgifter 0 øre + indtægter -1236 øre');
    expect(result.assumptions.join(' ')).toContain('indtægter er uændrede');
    expect(result.conclusion).not.toContain('NaN');
  });

  it('leaves a fully observed reference year identical in all sensitivity paths', () => {
    const dataset = fixture();
    dataset.referenceDate = '2025-12-31';
    const result = applyMultiYearProjection(base(dataset), dataset, access, 2025);
    const row = result.chart!.rows[0];
    expect(row.low).toBe(row.base);
    expect(row.high).toBe(row.base);
    expect(row.forecast).toBeNull();
    expect(row.actualMonths).toBe(12);
  });

  it('filters energy before calculation and cannot change other accounts', () => {
    const dataset = fixture();
    const result = applyMultiYearProjection(base(dataset, 'energy'), dataset, access, 2027);
    expect(result.chart?.rows[0]).toMatchObject({
      budget: 3600,
      base: 3690,
      actual: 2781,
      forecast: 909,
    });
    expect(result.chart?.rows[1]).toMatchObject({
      budget: 3960,
      base: 3996,
      low: 3912,
      high: 4080,
    });
    expect(result.sources[0].rowIds?.every((id) => id.endsWith('-energy'))).toBe(true);
    expect(result.sources[0].excerpt).toContain('category = energy');
    expect(result.narrative.join(' ')).toContain('mængdevægtet øre/kWh');
  });

  it('uses each year’s synthetic pupil denominator rather than relabeling total amounts', () => {
    const dataset = fixture();
    const result = applyMultiYearProjection(base(dataset, 'perPupil'), dataset, access, 2027);
    expect(pupilsForYear(dataset.entities[0], 2026)).toBe(100);
    expect(pupilsForYear(dataset.entities[0], 2027)).toBe(101);
    expect(result.chart?.rows[0]).toMatchObject({ base: 1225, pupils: 100 });
    expect(result.chart?.rows[1]).toMatchObject({ base: 1334, pupils: 101 });
    expect(result.chart?.subtitle).toContain('kr./elev');
    expect(result.sources[0].excerpt).toContain('årsnetto 134772 øre');
    expect(result.sources[0].excerpt).toContain('årsnetto pr. elev 1334 øre');
    expect(result.context).toMatchObject({ metric: 'perPupil', projectionEndYear: 2027 });
  });

  it('rejects explicit forbidden units, wrong areas, empty selection and missing identity', () => {
    const dataset = fixture();
    for (const context of [
      { entityIds: ['school-one', 'school-two'] },
      { entityIds: ['facility-one'], area: 'facilities' as const },
      { entityIds: [] },
    ]) {
      const analysis = base(dataset);
      analysis.context = { ...analysis.context, ...context };
      expect(() => applyMultiYearProjection(analysis, dataset, access, 2027)).toThrow(
        AccessDeniedError,
      );
    }
    expect(() =>
      applyMultiYearProjection(base(dataset), dataset, { ...access, objectId: '' }, 2027),
    ).toThrow(AccessDeniedError);
    const allowed = applyMultiYearProjection(
      base(dataset),
      dataset,
      { ...access, unitIds: ['*'] },
      2027,
    );
    expect(allowed.context.entityIds).toEqual(['school-one']);
    expect(allowed.chart?.rows[1].base).toBe(134772);
  });

  it('returns only political area aggregates for Council and rejects an individual-school scope', () => {
    const dataset = fixture();
    const council: AccessContext = {
      ...access,
      roles: ['KAIA.Council'],
      unitIds: ['committee-one'],
    };
    const analysis = base(dataset);
    expect(() => applyMultiYearProjection(analysis, dataset, council, 2027)).toThrow(
      AccessDeniedError,
    );
    analysis.context.entityIds = ['school-one', 'school-two'];
    const result = applyMultiYearProjection(analysis, dataset, council, 2027);
    expect(result.chart?.rows[1].base).toBe(134772 * 3);
    expect(result.sources.every((source) => source.rowIds === undefined)).toBe(true);
    const exposed = JSON.stringify([result.chart, result.sources, result.narrative]);
    expect(exposed).not.toContain('school-one');
    expect(exposed).not.toContain('Svebølle Skole');
    expect(exposed).not.toContain('Løn');
  });

  it('shows missing data for a historical snapshot or partial month instead of invented zeros', () => {
    const dataset = fixture();
    for (const candidate of [
      dataset,
      {
        ...dataset,
        rows: dataset.rows.filter((row) => row.id !== 'school-one-2027-1-forecast-energy'),
      },
    ]) {
      const result = applyMultiYearProjection(
        base(candidate),
        candidate,
        access,
        candidate === dataset ? 2030 : 2027,
      );
      expect(result.missingData).toContain('ikke et komplet');
      expect(result.chart).toBeUndefined();
      expect(result.metrics).toHaveLength(0);
      expect(result.followups.join(' ')).toContain('ny analyse');
    }
  });

  it('reports unsupported population scope honestly and validates projection bounds and versions', () => {
    const dataset = fixture();
    const unsupported = applyMultiYearProjection(base(dataset, 'perCapita'), dataset, access, 2027);
    expect(unsupported.missingData).toContain('befolkningsserie');
    expect(unsupported.metrics).toHaveLength(0);
    for (const year of [2025, 2033, 2027.5, NaN, Infinity])
      expect(() => applyMultiYearProjection(base(dataset), dataset, access, year)).toThrow(
        'slutår',
      );
    expect(() =>
      applyMultiYearProjection(
        { ...base(dataset), datasetVersion: 'another-version' },
        dataset,
        access,
        2027,
      ),
    ).toThrow('samme dataversion');
  });

  it('does not invent a growth percentage for zero net basis or a missing pupil denominator', () => {
    const dataset = fixture();
    for (const row of dataset.rows) row.amountOre = 0;
    const zero = applyMultiYearProjection(base(dataset), dataset, access, 2027);
    expect(zero.chart?.rows[1].cumulativeGrowthPercent).toBeNull();
    expect(zero.metrics.some((metric) => metric.unit === 'percent')).toBe(false);
    expect(zero.conclusion).toContain('nulbasis');
    delete dataset.entities[0].synthetic.pupils;
    const missingPupils = applyMultiYearProjection(
      base(dataset, 'perPupil'),
      dataset,
      access,
      2027,
    );
    expect(missingPupils.missingData).toContain('mangler et gyldigt syntetisk elevtal');
    expect(missingPupils.chart).toBeUndefined();
  });

  it('rejects unsafe amounts and cannot mix ledger rows from a different dataset version', () => {
    const dataset = fixture();
    const row = dataset.rows.find((item) => item.entityId === 'school-one' && item.year === 2027)!;
    row.amountOre = Number.MAX_SAFE_INTEGER + 1;
    expect(() => applyMultiYearProjection(base(dataset), dataset, access, 2027)).toThrow(
      'sikre heltal',
    );
    row.amountOre = 100;
    row.datasetVersion = 'different-version';
    expect(applyMultiYearProjection(base(dataset), dataset, access, 2027).missingData).toContain(
      'ikke et komplet',
    );
  });

  it('links every numeric output to its same-version reproducible source and is deterministic', () => {
    const dataset = fixture();
    const first = applyMultiYearProjection(base(dataset), dataset, access, 2028);
    expect(applyMultiYearProjection(base(dataset), dataset, access, 2028)).toEqual(first);
    expect(first.sources[0].status).toBe('simulated');
    expect(first.sources[0].datasetVersion).toBe(first.datasetVersion);
    expect(first.metrics.every((metric) => metric.sourceIds.includes(first.sources[0].id))).toBe(
      true,
    );
    expect(first.chart?.sourceIds).toEqual([first.sources[0].id]);
    expect(first.sources[0].excerpt).toContain('Fuldt reproducerbart udtræk');
    expect(first.sources[0].excerpt).toContain('fixed-fixture');
    expect(first.assumptions.join(' ')).toContain('ikke et statistisk konfidensinterval');
  });
});
