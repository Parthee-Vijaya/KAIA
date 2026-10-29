import { describe, it, expect } from 'vitest';
import { applyYearComparison, applyMunicipalBenchmark } from '../src/domain/comparisons';
import { CATEGORIES, pupilsForYear, type Dataset } from '../src/domain/data';
import {
  generateMunicipalBenchmarks,
  selectMunicipalPeers,
  KALUNDBORG_MUNICIPALITY_ID,
} from '../src/domain/municipalities';
import type { AccessContext, Analysis, Entity, LedgerRow } from '../src/domain/types';
const version = 'KAIA-COMPARISON-FIXTURE-v1';
const entities: Entity[] = [
  {
    id: 'school-hoeng',
    name: 'Høng Skole',
    aliases: ['Høng'],
    type: 'school',
    area: 'schools',
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-20',
    synthetic: { pupils: 100, annualBudgetOre: 1000000 },
  },
  {
    id: 'school-sveboelle',
    name: 'Svebølle Skole',
    aliases: ['Svebølle'],
    type: 'school',
    area: 'schools',
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-20',
    synthetic: { pupils: 200, annualBudgetOre: 2000000 },
  },
  {
    id: 'facility-spiralen',
    name: 'Spiralen',
    aliases: [],
    type: 'facility',
    area: 'facilities',
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-20',
    synthetic: { annualBudgetOre: 3000000 },
  },
  {
    id: 'committee-boern-familie',
    name: 'Børn- og Familieudvalget',
    aliases: [],
    type: 'committee',
    area: 'schools',
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-20',
    synthetic: { annualBudgetOre: 0 },
  },
];
const rows: LedgerRow[] = [];
for (const [index, entity] of entities.filter((entity) => entity.type !== 'committee').entries())
  for (let year = 2024; year <= 2027; year++)
    for (let month = 1; month <= 12; month++)
      for (const category of CATEGORIES)
        for (const kind of ['budget', 'actual', 'forecast'] as const) {
          if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
          const amountOre =
            (index + 1) *
            (year - 2023) *
            month *
            (category === 'income' ? -20 : category === 'energy' ? 30 : 100) *
            (kind === 'budget' ? 10 : kind === 'actual' ? 11 : 13);
          rows.push({
            id: `DEMO-L-${entity.id}-${year}-${month}-${category}-${kind}`,
            datasetVersion: version,
            entityId: entity.id,
            year,
            month,
            category,
            kind,
            amountOre,
          });
        }
const demography = Array.from({ length: 4 }, (_, index) => 2024 + index).flatMap((year) =>
  (['0-5', '6-16', '17-64', '65+'] as const).map((ageGroup, index) => ({
    year,
    ageGroup,
    population: (index + 1) * 1000 + (year - 2024) * 100,
    births: 0,
    deaths: 0,
    domesticNet: 0,
    internationalNet: 0,
    ageIn: 0,
    ageOut: 0,
  })),
);
const municipal = generateMunicipalBenchmarks('comparison-fixture', version, '2026-09-30', {
  structure: { population: 10800, schoolchildren: 300, population65Share: 0.25, rurality: 0.6 },
  structureYear: 2026,
  rows: [],
});
const dataset: Dataset = {
  version,
  seed: 'comparison-fixture',
  referenceDate: '2026-09-30',
  entities,
  rows,
  documents: [],
  demography,
  municipalities: municipal.municipalities,
  municipalBenchmarks: municipal.municipalBenchmarks,
};
const access: AccessContext = {
  userId: 'fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  roles: ['KAIA.Finance'],
  unitIds: ['*'],
  areas: ['schools', 'facilities'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
function basis(
  overrides: Partial<Analysis['context']> = {},
  question = 'Sammenlign med sidste års data',
): Analysis {
  return {
    analysisId: 'fixture-analysis',
    datasetVersion: version,
    question,
    title: 'Budgetstatus',
    conclusion: 'Tidligere svar',
    narrative: [],
    metrics: [],
    sources: [],
    context: {
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
      entityIds: ['school-hoeng', 'school-sveboelle'],
      area: 'schools',
      metric: 'net',
      ...overrides,
    },
    assumptions: [],
    followups: [],
  };
}
function expected(
  year: number,
  fromMonth = 1,
  toMonth = 9,
  ids = ['school-hoeng', 'school-sveboelle'],
  category?: string,
) {
  return rows
    .filter(
      (row) =>
        row.year === year &&
        row.month >= fromMonth &&
        row.month <= toMonth &&
        ids.includes(row.entityId) &&
        (!category || row.category === category) &&
        row.kind === (year < 2026 || (year === 2026 && row.month <= 9) ? 'actual' : 'forecast'),
    )
    .reduce((sum, row) => sum + row.amountOre, 0);
}

describe('Årssammenligning fra nøjagtige, tilladte posteringer', () => {
  it('holder identiske enheder/måneder og inkluderer negative indtægter uden dobbelttælling', () => {
    const a = applyYearComparison(basis(), dataset, access);
    expect(a.metrics[0].value).toBe(expected(2025));
    expect(a.metrics[1].value).toBe(expected(2026));
    expect(a.metrics[2].value).toBe(expected(2026) - expected(2025));
    expect(a.chart!.rows.map((row) => row.value)).toEqual(
      a.metrics.slice(0, 2).map((metric) => metric.value),
    );
    expect(a.sources[0].excerpt).toContain(String(expected(2026)));
    expect(a.conclusion).toContain('samme måneder');
    expect(a.context.comparison).toEqual({ kind: 'year', year: 2025 });
  });
  it('bruger udvalgt kvartal i begge år uden at udvide til helår', () => {
    const a = applyYearComparison(
      basis({ period: { year: 2026, fromMonth: 4, toMonth: 6 } }),
      dataset,
      access,
    );
    expect(a.metrics[0].value).toBe(expected(2025, 4, 6));
    expect(a.metrics[1].value).toBe(expected(2026, 4, 6));
    expect(a.chart!.subtitle).toContain('april–juni');
  });
  it('understøtter et eksplicit sammenligningsår og samme institutionsfilter', () => {
    const a = applyYearComparison(
      basis({ entityIds: ['school-hoeng'], comparison: { kind: 'year', year: 2024 } }),
      dataset,
      access,
    );
    expect(a.metrics[0].value).toBe(expected(2024, 1, 9, ['school-hoeng']));
    expect(a.metrics[1].value).toBe(expected(2026, 1, 9, ['school-hoeng']));
    expect(a.sources[0].rowIds!.every((id) => id.includes('school-hoeng'))).toBe(true);
  });
  it('vælger kun energiposter ved energimetric', () => {
    const a = applyYearComparison(basis({ metric: 'energy' }), dataset, access);
    expect(a.metrics[0].value).toBe(expected(2025, 1, 9, undefined, 'energy'));
    expect(a.metrics[1].value).toBe(expected(2026, 1, 9, undefined, 'energy'));
    expect(a.metrics[1].value).not.toBe(expected(2026));
    expect(a.title).toContain('Energi');
  });
  it('normaliserer hvert år med samme års elevtal og bevarer præcise øretal i figur og metric', () => {
    const a = applyYearComparison(basis({ metric: 'perPupil' }), dataset, access);
    const pupils2025 = entities
      .filter((e) => e.type === 'school')
      .reduce((sum, e) => sum + pupilsForYear(e, 2025), 0);
    expect(a.metrics[0].value).toBe(Math.round(expected(2025) / pupils2025));
    expect(a.metrics[1].value).toBe(Math.round(expected(2026) / 300));
    expect(a.chart!.rows[0].value).toBe(a.metrics[0].value);
    expect(a.narrative.join(' ')).toContain(String(pupils2025));
  });
  it('bevarer første spørgsmåls per-elevmetric også når eksplicit felt mangler', () => {
    const a = applyYearComparison(
      basis({ metric: undefined }, 'Sammenlign udgift pr. elev med sidste år'),
      dataset,
      access,
    );
    expect(a.context.metric).toBe('perPupil');
  });
  it('bruger separate befolkningstal for normalisering pr. indbygger', () => {
    const a = applyYearComparison(basis({ metric: 'perCapita' }), dataset, access);
    const pop = (year: number) =>
      demography.filter((row) => row.year === year).reduce((sum, row) => sum + row.population, 0);
    expect(a.metrics[0].value).toBe(Math.round(expected(2025) / pop(2025)));
    expect(a.metrics[1].value).toBe(Math.round(expected(2026) / pop(2026)));
  });
  it('markerer helårsudsigter som regnskab/prognose og fremtid som prognose', () => {
    const a = applyYearComparison(
      basis({ period: { year: 2027, fromMonth: 1, toMonth: 12 } }),
      dataset,
      access,
    );
    expect(a.metrics[0].label).toContain('regnskab og prognose');
    expect(a.metrics[1].label).toBe('2027 · prognose');
    expect(a.metrics[1].value).toBe(expected(2027, 1, 12));
    expect(a.assumptions.join(' ')).toContain('ikke en observeret ændring');
  });
  it('afviser ufuldstændig historik trods tilstedeværende forecast', () => {
    const incomplete = {
      ...dataset,
      rows: rows.filter(
        (row) =>
          !(
            row.entityId === 'school-hoeng' &&
            row.year === 2025 &&
            row.month === 4 &&
            row.kind === 'actual' &&
            row.category === 'salary'
          ),
      ),
    };
    const a = applyYearComparison(basis(), incomplete, access);
    expect(a.missingData).toBeTruthy();
    expect(a.chart).toBeUndefined();
    expect(a.metrics).toEqual([]);
    expect(a.sources).toEqual([]);
  });
  it('forklarer manglende elev-/befolkningsgrundlag og ældste år', () => {
    expect(
      applyYearComparison(basis({ metric: 'perCapita' }), { ...dataset, demography: [] }, access)
        .missingData,
    ).toBeTruthy();
    expect(
      applyYearComparison(
        basis({ period: { year: 2024, fromMonth: 1, toMonth: 9 } }),
        dataset,
        access,
      ).missingData,
    ).toBeTruthy();
    expect(
      applyYearComparison(
        basis({ area: 'facilities', entityIds: ['facility-spiralen'], metric: 'perPupil' }),
        dataset,
        access,
      ).missingData,
    ).toBeTruthy();
  });
  it('undlader procentændring ved en nulreference', () => {
    const zero = {
      ...dataset,
      rows: rows.map((row) => (row.year === 2025 ? { ...row, amountOre: 0 } : row)),
    };
    const a = applyYearComparison(basis(), zero, access);
    expect(a.metrics).toHaveLength(3);
    expect(a.metrics.some((metric) => metric.unit === 'percent')).toBe(false);
    expect(a.narrative.join(' ')).toContain('nul');
  });
  it('viser baseline og rydder en tidligere scenariekontekst', () => {
    const a = applyYearComparison(
      basis({
        scenario: {
          energyPercent: 15,
          salaryPercent: 0,
          substitutePercent: 0,
          pupilsPercent: 0,
          budgetPercent: 0,
          maintenancePercent: 0,
          horizon: 'remaining',
        },
      }),
      dataset,
      access,
    );
    expect(a.context.scenario).toBeUndefined();
    expect(a.scenario).toBeUndefined();
    expect(a.metrics[1].value).toBe(expected(2026));
    expect(a.assumptions.join(' ')).toContain('Baseline sammenlignes');
  });
  it('afviser adgangsoverskridelse og blandede dataversioner', () => {
    expect(() =>
      applyYearComparison(basis(), dataset, {
        ...access,
        areas: ['facilities'],
        unitIds: ['facility-spiralen'],
      }),
    ).toThrow();
    expect(() =>
      applyYearComparison({ ...basis(), datasetVersion: 'old' }, dataset, access),
    ).toThrow();
  });
  it('holder politisk adgang aggregeret og uden posting-IDer', () => {
    const council = { ...access, roles: ['KAIA.Council'] as AccessContext['roles'] };
    const a = applyYearComparison(basis(), dataset, council);
    expect(a.chart!.rows).toHaveLength(2);
    expect(a.sources.every((source) => !source.rowIds)).toBe(true);
    expect(() =>
      applyYearComparison(basis({ entityIds: ['school-hoeng'] }), dataset, council),
    ).toThrow();
  });
  it('ændrer hverken baselineobjekt eller dataset', () => {
    const base = basis();
    const before = JSON.stringify(base);
    const first = applyYearComparison(base, dataset, access),
      second = applyYearComparison(base, dataset, access);
    expect(first).toEqual(second);
    expect(JSON.stringify(base)).toBe(before);
    expect(dataset.rows).toBe(rows);
  });
});

describe('Simuleret kommunebenchmark med separat navneproveniens', () => {
  it('normaliserer skoleområdet og lader aldrig officielle navnekilder dokumentere økonomi', () => {
    const a = applyMunicipalBenchmark(basis(), dataset, access, 'Sorø Kommune');
    expect(a.context.metric).toBe('perPupil');
    expect(a.metrics[0].value).toBe(Math.round(expected(2026) / 300));
    expect(a.chart!.rows.map((row) => row.value)).toEqual(
      a.metrics.slice(0, 2).map((metric) => metric.value),
    );
    expect(a.sources[0].status).toBe('simulated');
    expect(a.sources[0].url).toBeUndefined();
    expect(
      a.sources
        .slice(1)
        .every(
          (source) =>
            source.type === 'name' &&
            source.status === 'official-name' &&
            source.url?.startsWith('https://www.dst.dk/'),
        ),
    ).toBe(true);
    expect(
      a.metrics.every((metric) => metric.sourceIds.every((id) => id.startsWith('DEMO-'))),
    ).toBe(true);
    expect(a.conclusion).toContain('dokumenterer ikke');
  });
  it('vælger strukturelt nærmeste demokommune deterministisk uden at bruge økonomital', () => {
    const expectedPeer = selectMunicipalPeers(
      dataset.municipalities!,
      KALUNDBORG_MUNICIPALITY_ID,
      1,
    )[0];
    const a = applyMunicipalBenchmark(basis(), dataset, access);
    expect(a.context.comparison?.municipalityId).toBe(expectedPeer.municipality.id);
    expect(a.narrative.join(' ')).toContain('ingen økonomital');
  });
  it('beregner Kalundborg fra egen ledger og ignorerer en parallel benchmarkkopi', () => {
    const fake = {
      ...dataset.municipalBenchmarks![0],
      municipalityId: KALUNDBORG_MUNICIPALITY_ID,
      amountOre: 999999999999,
    };
    const a = applyMunicipalBenchmark(
      basis(),
      { ...dataset, municipalBenchmarks: [...dataset.municipalBenchmarks!, fake] },
      access,
      'Holbæk',
    );
    expect(a.metrics[0].value).toBe(Math.round(expected(2026) / 300));
  });
  it('bruger kr. pr. indbygger for et andet fagområde og det valgte år', () => {
    const base = basis({
      area: 'facilities',
      entityIds: ['facility-spiralen'],
      period: { year: 2027, fromMonth: 1, toMonth: 12 },
    });
    const a = applyMunicipalBenchmark(base, dataset, access, 'Ringsted');
    const pop = demography
      .filter((row) => row.year === 2027)
      .reduce((sum, row) => sum + row.population, 0);
    expect(a.context.metric).toBe('perCapita');
    expect(a.metrics[0].value).toBe(Math.round(expected(2027, 1, 12, ['facility-spiralen']) / pop));
    expect(a.chart!.subtitle).toContain('prognose');
  });
  it('forklarer institutionsscope, manglende peers og energimetric uden opdigtede skaleringsfaktorer', () => {
    expect(
      applyMunicipalBenchmark(basis({ entityIds: ['school-hoeng'] }), dataset, access).missingData,
    ).toContain('hel kommune');
    expect(
      applyMunicipalBenchmark(
        basis(),
        { ...dataset, municipalities: undefined, municipalBenchmarks: undefined },
        access,
      ).missingData,
    ).toBeTruthy();
    expect(
      applyMunicipalBenchmark(basis({ metric: 'energy' }), dataset, access).missingData,
    ).toContain('energi');
    expect(
      applyMunicipalBenchmark(basis(), dataset, access, 'Ukendt Kommune').missingData,
    ).toBeTruthy();
  });
  it('afviser uens måneder, manglende population og dobbelte kommuneaggregater', () => {
    const peer = 'municipality-soroe';
    const relevant = dataset.municipalBenchmarks!.find(
      (row) =>
        row.municipalityId === peer &&
        row.area === 'schools' &&
        row.year === 2026 &&
        row.month === 4 &&
        row.kind === 'actual',
    )!;
    const incomplete = {
      ...dataset,
      municipalBenchmarks: dataset.municipalBenchmarks!.filter((row) => row.id !== relevant.id),
    };
    expect(applyMunicipalBenchmark(basis(), incomplete, access, peer).missingData).toBeTruthy();
    expect(
      applyMunicipalBenchmark(
        basis(),
        {
          ...dataset,
          municipalBenchmarks: [...dataset.municipalBenchmarks!, { ...relevant, id: 'duplicate' }],
        },
        access,
        peer,
      ).missingData,
    ).toBeTruthy();
    const zero = {
      ...dataset,
      municipalBenchmarks: dataset.municipalBenchmarks!.map((row) =>
        row.municipalityId === peer ? { ...row, pupils: 0 } : row,
      ),
    };
    expect(applyMunicipalBenchmark(basis(), zero, access, peer).missingData).toBeTruthy();
  });
  it('holder politisk benchmark aggregeret og afslører ikke person- eller transaktionsdata', () => {
    const a = applyMunicipalBenchmark(
      basis(),
      dataset,
      { ...access, roles: ['KAIA.Council'] },
      'Sorø',
    );
    expect(a.chart!.rows).toHaveLength(2);
    expect(a.sources.every((source) => !source.rowIds)).toBe(true);
    expect(a.sources[0].excerpt).toContain('ALLE ØKONOMI');
  });
});
