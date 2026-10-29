import { describe, expect, it } from 'vitest';
import { CATEGORIES, type Dataset } from '../src/domain/data';
import { buildDashboard, resolveDashboardScope } from '../src/domain/dashboard-analysis';
import { AccessDeniedError } from '../src/domain/policy';
import type { DashboardQuery } from '../src/domain/dashboard';
import type {
  AccessContext,
  Analysis,
  ChartRow,
  Entity,
  LedgerRow,
  Period,
} from '../src/domain/types';

const version = 'KAIA-SCHOOL-YEARS-FIXTURE-v1';
const reference = { year: 2026, month: 9 };
const access: AccessContext = {
  userId: 'school-years-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  areas: ['schools', 'facilities'],
  unitIds: ['*'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
const definitions: [string, string, number, number, number][] = [
  ['school-hoeng', 'Høng Skole', 321, -9, -3],
  ['school-sveboelle', 'Svebølle Skole', 183, 12, -2],
  ['school-nyrup', 'Nyrupskolen', 431, -2, 7],
  ['school-herred', 'Skolen på Herredsåsen', 512, 0, 0],
  ['school-firhoej', 'Firhøjskolen', 215, 8, 8],
];
const fields = [
  'priorYear',
  'priorVariance',
  'varianceChange',
  'varianceMagnitudeChange',
  'priorVarianceReason',
];
function makeDataset(): Dataset {
  const entities: Entity[] = definitions.map(([id, name, pupils]) => ({
    id,
    name,
    type: 'school',
    area: 'schools',
    aliases: [],
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-21',
    synthetic: { pupils, annualBudgetOre: 10000000 },
  }));
  entities.push(
    {
      id: 'facility-spiralen',
      name: 'Spiralen',
      type: 'facility',
      area: 'facilities',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 20000000 },
    },
    {
      id: 'committee-schools',
      name: 'Børn- og Familieudvalget',
      type: 'committee',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 0 },
    },
  );
  const rows: LedgerRow[] = [];
  for (const [index, entity] of entities.filter((entity) => entity.type !== 'committee').entries())
    for (let year = 2020; year <= 2032; year++)
      for (let month = 1; month <= 12; month++)
        for (const [categoryIndex, category] of CATEGORIES.entries())
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (
              kind === 'actual' &&
              (year > reference.year || (year === reference.year && month > reference.month))
            )
              continue;
            const base =
              (index + 1) * 100003 + (year - 2020) * 1009 + month * 17 + categoryIndex * 71;
            const definition = definitions[index];
            const drift =
              year === 2025
                ? (definition?.[3] ?? 4)
                : year === 2026
                  ? (definition?.[4] ?? 6)
                  : (year - 2020) * (index % 2 ? -3 : 5);
            const change =
              kind === 'budget'
                ? 0
                : drift * (categoryIndex + 1) * month * (kind === 'forecast' ? 5 : 1);
            rows.push({
              id: `DEMO-L-${entity.id}-${year}-${month}-${category}-${kind}-0`,
              datasetVersion: version,
              entityId: entity.id,
              year,
              month,
              category,
              kind,
              amountOre: category === 'income' ? -Math.round(base / 12) - change : base + change,
            });
          }
  return {
    version,
    seed: 'school-years-fixture',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2020, toYear: 2032 },
    entities,
    rows,
    documents: [],
  };
}
const dataset = makeDataset();
function result(
  period: Period,
  data = dataset,
  user = access,
  extra: DashboardQuery = {},
): Analysis {
  const scope = resolveDashboardScope(user, data, { area: 'schools', ...period, ...extra });
  const panel = buildDashboard(data, user, scope).panels.comparison;
  if (panel.status !== 'ready') throw new Error(`Comparison unavailable: ${panel.reason}`);
  return panel.analysis;
}
function usedRows(data: Dataset, period: Period, ids: string[]) {
  return data.rows.filter(
    (row) =>
      ids.includes(row.entityId) &&
      row.year === period.year &&
      row.month >= period.fromMonth &&
      row.month <= period.toMonth &&
      (row.kind === 'budget' ||
        row.kind ===
          (period.year < reference.year ||
          (period.year === reference.year && row.month <= reference.month)
            ? 'actual'
            : 'forecast')),
  );
}
function raw(data: Dataset, period: Period, id: string) {
  const selected = usedRows(data, period, [id]);
  const budget = Number(
    selected
      .filter((row) => row.kind === 'budget')
      .reduce((sum, row) => sum + BigInt(row.amountOre), 0n),
  );
  const outlook = Number(
    selected
      .filter((row) => row.kind !== 'budget')
      .reduce((sum, row) => sum + BigInt(row.amountOre), 0n),
  );
  return { budget, outlook, variance: outlook - budget };
}
function chartSource(analysis: Analysis) {
  return analysis.sources.find((source) => analysis.chart!.sourceIds.includes(source.id))!;
}
function rowById(analysis: Analysis, id: string, data = dataset): ChartRow {
  return analysis.chart!.rows.find(
    (row) => row.label === data.entities.find((entity) => entity.id === id)!.name,
  )!;
}

describe('skolernes sidsteårsafvigelse bruger samme tilladte måneder og rå øre', () => {
  it.each<Period>([
    { year: 2024, fromMonth: 4, toMonth: 6 },
    { year: 2026, fromMonth: 1, toMonth: 9 },
    { year: 2026, fromMonth: 7, toMonth: 12 },
    { year: 2027, fromMonth: 1, toMonth: 12 },
    { year: 2032, fromMonth: 2, toMonth: 5 },
  ])('afstemmer historisk/YTD/blandet/fremtidig periode $year $fromMonth–$toMonth', (period) => {
    const analysis = result(period);
    for (const entity of dataset.entities.filter((entity) => entity.type === 'school')) {
      const row = rowById(analysis, entity.id),
        current = raw(dataset, period, entity.id),
        prior = raw(dataset, { ...period, year: period.year - 1 }, entity.id);
      expect(row.variance).toBe(current.variance);
      expect(row.priorYear).toBe(period.year - 1);
      expect(row.priorVariance).toBe(prior.variance);
      expect(row.varianceChange).toBe(current.variance - prior.variance);
      expect(row.varianceMagnitudeChange).toBe(
        Math.abs(current.variance) - Math.abs(prior.variance),
      );
      expect(row.priorVarianceReason).toBeNull();
      for (const field of fields.filter((field) => field !== 'priorVarianceReason'))
        expect(Number.isSafeInteger(row[field])).toBe(true);
      expect(row.actual).toBe(Math.round(current.outlook / Number(row.pupils)));
      expect(row.budget).toBe(Math.round(current.budget / Number(row.pupils)));
    }
  });
  it('skelner ændret fortegn fra en større eller mindre afvigelsesstørrelse, også ved ægte nul', () => {
    const analysis = result({ year: 2026, fromMonth: 1, toMonth: 9 });
    const negative = rowById(analysis, 'school-hoeng');
    expect(Number(negative.variance)).toBeLessThan(0);
    expect(Number(negative.priorVariance)).toBeLessThan(0);
    expect(Number(negative.varianceChange)).toBeGreaterThan(0);
    expect(Number(negative.varianceMagnitudeChange)).toBeLessThan(0);
    const crossesToNegative = rowById(analysis, 'school-sveboelle');
    expect(Number(crossesToNegative.priorVariance)).toBeGreaterThan(0);
    expect(Number(crossesToNegative.variance)).toBeLessThan(0);
    expect(Number(crossesToNegative.varianceMagnitudeChange)).toBeLessThan(0);
    const crossesToPositive = rowById(analysis, 'school-nyrup');
    expect(Number(crossesToPositive.priorVariance)).toBeLessThan(0);
    expect(Number(crossesToPositive.variance)).toBeGreaterThan(0);
    expect(Number(crossesToPositive.varianceMagnitudeChange)).toBeGreaterThan(0);
    const zero = rowById(analysis, 'school-herred');
    expect([
      zero.variance,
      zero.priorVariance,
      zero.varianceChange,
      zero.varianceMagnitudeChange,
    ]).toEqual([0, 0, 0, 0]);
    expect(zero.priorVarianceReason).toBeNull();
    const unchanged = rowById(analysis, 'school-firhoej');
    expect(unchanged.varianceChange).toBe(0);
    expect(unchanged.varianceMagnitudeChange).toBe(0);
  });
  it('holder alle absolutte historikbeløb uændrede, når elevnormaliseringen ændres', () => {
    const period = { year: 2026, fromMonth: 1, toMonth: 9 },
      before = result(period);
    const changed = {
      ...dataset,
      entities: dataset.entities.map((entity) =>
        entity.id === 'school-hoeng'
          ? { ...entity, synthetic: { ...entity.synthetic, pupils: 17 } }
          : entity,
      ),
    };
    const after = result(period, changed),
      original = rowById(before, 'school-hoeng'),
      updated = rowById(after, 'school-hoeng');
    expect(updated.actual).not.toBe(original.actual);
    expect(updated.budget).not.toBe(original.budget);
    for (const field of ['variance', ...fields]) expect(updated[field]).toEqual(original[field]);
  });
  it('tilføjer ikke skolehistorikfelter til en anden enhedstype', () => {
    const analysis = result({ year: 2026, fromMonth: 1, toMonth: 9 }, dataset, access, {
      area: 'facilities',
    });
    for (const field of fields) expect(analysis.chart!.rows[0]).not.toHaveProperty(field);
  });
});

describe('manglende sidsteårsgrundlag påvirker kun den berørte skoles historik', () => {
  it('bevarer den aktuelle liste ved første dækningsår og bruger null frem for 0 for 2019', () => {
    const analysis = result({ year: 2020, fromMonth: 1, toMonth: 9 });
    expect(analysis.chart!.rows).toHaveLength(definitions.length);
    for (const row of analysis.chart!.rows) {
      expect(Number.isSafeInteger(row.variance)).toBe(true);
      expect(row.priorYear).toBe(2019);
      for (const field of ['priorVariance', 'varianceChange', 'varianceMagnitudeChange'])
        expect(row[field]).toBeNull();
      expect(row.priorVarianceReason).toMatch(/2019/);
      expect(row.priorVarianceReason).toContain(version);
    }
  });
  it.each(['budget', 'actual'] as const)(
    'isolerer en manglende prior-%s-post til én skole',
    (kind) => {
      const period = { year: 2026, fromMonth: 4, toMonth: 9 };
      const incomplete = {
        ...dataset,
        rows: dataset.rows.filter(
          (row) =>
            !(
              row.entityId === 'school-hoeng' &&
              row.year === 2025 &&
              row.month === 6 &&
              row.category === 'maintenance' &&
              row.kind === kind
            ),
        ),
      };
      const complete = result(period),
        partial = result(period, incomplete);
      expect(partial.chart!.rows.map((row) => [row.label, row.variance])).toEqual(
        complete.chart!.rows.map((row) => [row.label, row.variance]),
      );
      const missing = rowById(partial, 'school-hoeng');
      expect(missing.priorVariance).toBeNull();
      expect(missing.varianceChange).toBeNull();
      expect(missing.varianceMagnitudeChange).toBeNull();
      expect(missing.priorVarianceReason).toMatch(/Høng Skole/);
      expect(missing.priorVarianceReason).toMatch(/april–september 2025/);
      for (const entity of dataset.entities.filter(
        (entity) => entity.type === 'school' && entity.id !== 'school-hoeng',
      ))
        expect(rowById(partial, entity.id)).toEqual(rowById(complete, entity.id));
    },
  );
  it('kræver også prognoseposter i den del af sidste år, der ligger efter reference', () => {
    const period = { year: 2027, fromMonth: 7, toMonth: 12 };
    const incomplete = {
      ...dataset,
      rows: dataset.rows.filter(
        (row) =>
          !(
            row.entityId === 'school-hoeng' &&
            row.year === 2026 &&
            row.month === 11 &&
            row.category === 'energy' &&
            row.kind === 'forecast'
          ),
      ),
    };
    const analysis = result(period, incomplete);
    expect(rowById(analysis, 'school-hoeng').priorVariance).toBeNull();
    expect(rowById(analysis, 'school-sveboelle').priorVariance).not.toBeNull();
  });
  it('lader manglende måneder uden for den valgte periode være uden betydning', () => {
    const period = { year: 2026, fromMonth: 1, toMonth: 9 };
    const outside = {
      ...dataset,
      rows: dataset.rows.filter(
        (row) => !(row.entityId === 'school-hoeng' && row.year === 2025 && row.month === 12),
      ),
    };
    expect(result(period, outside).chart!.rows).toEqual(result(period).chart!.rows);
  });
});

describe('historikkilden er afstemt, begrænset og adgangskontrolleret', () => {
  it.each<Period>([
    { year: 2026, fromMonth: 7, toMonth: 12 },
    { year: 2027, fromMonth: 1, toMonth: 12 },
  ])(
    'dokumenterer rå summer og repræsentative anvendte posteringer fra begge år for $year',
    (period) => {
      const analysis = result(period),
        source = chartSource(analysis),
        priorPeriod = { ...period, year: period.year - 1 };
      const selectedIds = analysis.context.entityIds;
      const referenceRows = [
        ...usedRows(dataset, priorPeriod, selectedIds),
        ...usedRows(dataset, period, selectedIds),
      ];
      const counts: Record<string, number> = {};
      for (const row of referenceRows) {
        const key = `${row.year}:${row.kind}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      const actualCounts = JSON.parse(
        source.excerpt.match(/Antal relevante posteringer pr\. år og serie: (\{.*?\})\./)![1],
      );
      expect(actualCounts).toEqual(counts);
      const facts = JSON.parse(
        source.excerpt.match(
          /Beregningsgrundlag pr\. skole i øre, med null ved ufuldstændig historik: (\[.*?\])\. Antal/,
        )![1],
      ) as Record<string, string | number | null>[];
      for (const fact of facts) {
        const current = raw(dataset, period, String(fact.entityId)),
          prior = raw(dataset, priorPeriod, String(fact.entityId));
        expect([fact.currentBudgetOre, fact.currentOutlookOre, fact.currentVarianceOre]).toEqual([
          current.budget,
          current.outlook,
          current.variance,
        ]);
        expect([fact.priorBudgetOre, fact.priorOutlookOre, fact.priorVariance]).toEqual([
          prior.budget,
          prior.outlook,
          prior.variance,
        ]);
        expect(fact.varianceChange).toBe(current.variance - prior.variance);
        expect(fact.varianceMagnitudeChange).toBe(
          Math.abs(current.variance) - Math.abs(prior.variance),
        );
      }
      expect(source.type).toBe('demo');
      expect(source.status).toBe('simulated');
      expect(source.datasetVersion).toBe(version);
      expect(source.period).toContain(String(period.year));
      expect(source.period).toContain(String(priorPeriod.year));
      expect(source.excerpt).toContain('varianceChange =');
      expect(source.excerpt).toContain('varianceMagnitudeChange =');
      expect(source.excerpt).toMatch(/ikke pr\. elev/);
      expect(source.excerpt).toMatch(/repræsentativt udsnit/);
      const relevant = new Map(referenceRows.map((row) => [row.id, row]));
      expect(source.rowIds!.length).toBeLessThanOrEqual(20);
      for (const id of source.rowIds!) expect(relevant.has(id)).toBe(true);
      const examples = source.rowIds!.map((id) => relevant.get(id)!);
      for (const key of Object.keys(counts))
        expect(examples.some((row) => `${row.year}:${row.kind}` === key)).toBe(true);
      expect(
        analysis.sources.find((item) => analysis.metrics[0].sourceIds.includes(item.id))!.period,
      ).not.toBe(source.period);
    },
  );
  it('indeholder aldrig en skole uden for fagchefens eksplicitte enhedsscope', () => {
    const partial: AccessContext = {
      ...access,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: ['school-hoeng'],
    };
    const analysis = result({ year: 2026, fromMonth: 1, toMonth: 9 }, dataset, partial),
      source = chartSource(analysis);
    expect(analysis.chart!.rows).toHaveLength(1);
    expect(analysis.context.entityIds).toEqual(['school-hoeng']);
    const indexed = new Map(dataset.rows.map((row) => [row.id, row]));
    expect(source.rowIds!.every((id) => indexed.get(id)!.entityId === 'school-hoeng')).toBe(true);
    expect(source.excerpt).not.toContain('school-sveboelle');
    expect(() =>
      result({ year: 2026, fromMonth: 1, toMonth: 9 }, dataset, partial, {
        entityIds: ['school-sveboelle'],
      }),
    ).toThrow(AccessDeniedError);
  });
  it('bevarer Council-afvisning af institutionssammenligninger og historik', () => {
    const council: AccessContext = {
      ...access,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['committee-schools'],
    };
    const scope = resolveDashboardScope(council, dataset, { area: 'schools', year: 2026 });
    const panel = buildDashboard(dataset, council, scope).panels.comparison;
    expect(panel.status).toBe('unsupported');
    expect(panel).not.toHaveProperty('analysis');
  });
  it('afviser en ændring, der ville overstige præcise sikre heltalsøre', () => {
    const entities = dataset.entities.filter((entity) => entity.id === 'school-hoeng');
    const rows: LedgerRow[] = [];
    for (const year of [2025, 2026])
      for (let month = 1; month <= 12; month++)
        for (const category of CATEGORIES)
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (year === 2026 && month > 9 && kind === 'actual') continue;
            const edge =
              month === 1 &&
              category === 'salary' &&
              ((year === 2025 && kind === 'budget') || (year === 2026 && kind === 'actual'));
            rows.push({
              id: `DEMO-EDGE-${year}-${month}-${category}-${kind}`,
              datasetVersion: version,
              entityId: 'school-hoeng',
              year,
              month,
              category,
              kind,
              amountOre: edge ? Number.MAX_SAFE_INTEGER : 0,
            });
          }
    const edge = { ...dataset, entities, rows, coverage: { fromYear: 2025, toYear: 2026 } };
    expect(() => result({ year: 2026, fromMonth: 1, toMonth: 1 }, edge)).toThrow(
      /sikre heltal|præcis/i,
    );
  });
});
