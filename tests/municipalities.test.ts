import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateMunicipalBenchmarks,
  selectMunicipalPeers,
  municipalSimilarity,
  MUNICIPAL_NAME_REGISTRY,
  MUNICIPAL_NAME_SOURCE,
  MUNICIPAL_CODE_SOURCE,
  MUNICIPAL_BENCHMARK_AREAS,
  KALUNDBORG_MUNICIPALITY_ID,
  type KalundborgAggregateInput,
  type MunicipalProfile,
} from '../src/domain/municipalities';

const version = 'KAIA-TEST-MUNICIPAL-v1';
const referenceDate = '2026-09-30';
function kalundborgInput(): KalundborgAggregateInput {
  const structure = {
    population: 48_770,
    population65Share: 0.26,
    schoolchildren: 4200,
    rurality: 0.59,
  };
  const rows: KalundborgAggregateInput['rows'] = [];
  for (let year = 2020; year <= 2032; year++) {
    const population = structure.population + (year - 2026) * 30,
      pupils = structure.schoolchildren + (year - 2026) * 20;
    for (const area of MUNICIPAL_BENCHMARK_AREAS)
      for (let month = 1; month <= 12; month++)
        for (const kind of ['budget', 'actual', 'forecast'] as const) {
          if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
          const denominator = area === 'schools' ? pupils : population;
          rows.push({
            year,
            month,
            area,
            kind,
            amountOre:
              denominator * (area === 'schools' ? 650_000 : 50_000) +
              (kind === 'budget' ? 0 : 120_000),
            population,
            pupils,
          });
        }
  }
  return { structure, structureYear: 2026, rows };
}

describe('Municipal names and synthetic provenance', () => {
  it('registers the six currently verified official names/codes without invented institutions', () => {
    expect(MUNICIPAL_NAME_REGISTRY.map((row) => [row.code, row.name])).toEqual([
      ['326', 'Kalundborg'],
      ['306', 'Odsherred'],
      ['316', 'Holbæk'],
      ['330', 'Slagelse'],
      ['340', 'Sorø'],
      ['329', 'Ringsted'],
    ]);
    expect(MUNICIPAL_NAME_SOURCE).toMatch(/^https:\/\/www\.dst\.dk\//);
    expect(MUNICIPAL_CODE_SOURCE).toBe('https://www.statistikbanken.dk/FOLK1A');
  });
  it('does not synthesize any Kalundborg financial or structural values when none are supplied', () => {
    const generated = generateMunicipalBenchmarks('fixture', version, referenceDate);
    expect(generated.municipalities).toHaveLength(5);
    expect(
      generated.municipalities.some((profile) => profile.id === KALUNDBORG_MUNICIPALITY_ID),
    ).toBe(false);
    expect(
      generated.municipalBenchmarks.some(
        (row) => row.municipalityId === KALUNDBORG_MUNICIPALITY_ID,
      ),
    ).toBe(false);
    expect(generated.metadata.importedKalundborgRows).toBe(0);
    expect(() => selectMunicipalPeers(generated.municipalities)).toThrow(/basisprofil/);
  });
  it('copies caller-supplied Kalundborg financial facts and denominators exactly and never mutates the input', () => {
    const input = kalundborgInput(),
      original = structuredClone(input);
    const result = generateMunicipalBenchmarks('fixture', version, referenceDate, input);
    const returned = result.municipalBenchmarks.filter(
      (row) => row.municipalityId === KALUNDBORG_MUNICIPALITY_ID,
    );
    expect(returned).toHaveLength(input.rows.length);
    const index = new Map(
      input.rows.map((row) => [`${row.year}:${row.month}:${row.area}:${row.kind}`, row]),
    );
    for (const row of returned)
      expect({
        year: row.year,
        month: row.month,
        area: row.area,
        kind: row.kind,
        amountOre: row.amountOre,
        population: row.population,
        pupils: row.pupils,
      }).toEqual(index.get(`${row.year}:${row.month}:${row.area}:${row.kind}`));
    expect(result.municipalities[0].structure).toEqual(input.structure);
    expect(input).toEqual(original);
  });
  it('marks all attributes and financial rows as simulated and binds the full result to a reproducible SHA-256', () => {
    const result = generateMunicipalBenchmarks('fixture', version, referenceDate);
    expect(
      result.municipalities.every(
        (profile) =>
          profile.status === 'simulated' &&
          profile.structuralAssumptions
            .join(' ')
            .includes('Kun kommunenavn og kommunekode er officielle'),
      ),
    ).toBe(true);
    expect(
      result.municipalBenchmarks.every(
        (row) => row.status === 'simulated' && row.datasetVersion === version,
      ),
    ).toBe(true);
    expect(result.metadata.contentHash).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({
            seed: 'fixture',
            version,
            referenceDate,
            municipalities: result.municipalities,
            municipalBenchmarks: result.municipalBenchmarks,
          }),
        )
        .digest('hex'),
    );
  });
});

describe('Complete and reproducible monthly peer data', () => {
  it('covers all seven areas and 2020–2032 months, with actuals only through the fixed reference', () => {
    const result = generateMunicipalBenchmarks('fixture', version, referenceDate);
    expect(result.municipalBenchmarks).toHaveLength(13_755);
    expect(result.metadata.generatedPeerRows).toBe(13_755);
    const ids = new Set(result.municipalBenchmarks.map((row) => row.id));
    expect(ids.size).toBe(result.municipalBenchmarks.length);
    for (const profile of result.municipalities)
      for (const area of MUNICIPAL_BENCHMARK_AREAS)
        for (let year = 2020; year <= 2032; year++) {
          const rows = result.municipalBenchmarks.filter(
            (row) => row.municipalityId === profile.id && row.area === area && row.year === year,
          );
          expect(rows.filter((row) => row.kind === 'budget')).toHaveLength(12);
          expect(rows.filter((row) => row.kind === 'forecast')).toHaveLength(12);
          expect(rows.filter((row) => row.kind === 'actual')).toHaveLength(
            year < 2026 ? 12 : year === 2026 ? 9 : 0,
          );
        }
  });
  it('keeps whole-year denominators consistent, amounts in safe integer øre and observed forecasts reconciled', () => {
    const result = generateMunicipalBenchmarks('fixture', version, referenceDate);
    const actual = new Map(
      result.municipalBenchmarks
        .filter((row) => row.kind === 'actual')
        .map((row) => [
          `${row.municipalityId}:${row.year}:${row.month}:${row.area}`,
          row.amountOre,
        ]),
    );
    const denominators = new Map<string, string>();
    for (const row of result.municipalBenchmarks) {
      expect(Number.isSafeInteger(row.amountOre) && row.amountOre > 0).toBe(true);
      expect(
        Number.isSafeInteger(row.population) && row.population > row.pupils && row.pupils > 0,
      ).toBe(true);
      const key = `${row.municipalityId}:${row.year}`,
        values = `${row.population}:${row.pupils}`;
      expect(denominators.get(key) || values).toBe(values);
      denominators.set(key, values);
      if (
        row.kind === 'forecast' &&
        actual.has(`${row.municipalityId}:${row.year}:${row.month}:${row.area}`)
      )
        expect(row.amountOre).toBe(
          actual.get(`${row.municipalityId}:${row.year}:${row.month}:${row.area}`),
        );
    }
  });
  it('is deterministic, insensitive to imported input order and changes when seed/version changes', () => {
    const input = kalundborgInput();
    const first = generateMunicipalBenchmarks('fixture', version, referenceDate, input);
    const repeated = generateMunicipalBenchmarks('fixture', version, referenceDate, {
      ...input,
      rows: [...input.rows].reverse(),
    });
    expect(repeated).toEqual(first);
    expect(
      generateMunicipalBenchmarks('different-seed', version, referenceDate, input).metadata
        .contentHash,
    ).not.toBe(first.metadata.contentHash);
    expect(
      generateMunicipalBenchmarks('fixture', 'KAIA-TEST-MUNICIPAL-v2', referenceDate, input)
        .metadata.contentHash,
    ).not.toBe(first.metadata.contentHash);
  });
  it('uses the same whole-area denominator level by calibrating peer unit costs from supplied Kalundborg budgets', () => {
    const input = kalundborgInput();
    const a = generateMunicipalBenchmarks('fixture', version, referenceDate, input);
    const doubled = {
      ...input,
      rows: input.rows.map((row) => ({ ...row, amountOre: row.amountOre * 2 })),
    };
    const b = generateMunicipalBenchmarks('fixture', version, referenceDate, doubled);
    for (const peer of a.municipalities.filter(
      (profile) => profile.id !== KALUNDBORG_MUNICIPALITY_ID,
    ))
      for (const area of MUNICIPAL_BENCHMARK_AREAS) {
        const annual = (rows: typeof a.municipalBenchmarks) =>
          rows
            .filter(
              (row) =>
                row.municipalityId === peer.id &&
                row.area === area &&
                row.year === 2026 &&
                row.kind === 'budget',
            )
            .reduce((sum, row) => sum + row.amountOre, 0);
        expect(
          Math.abs(annual(b.municipalBenchmarks) - annual(a.municipalBenchmarks) * 2),
        ).toBeLessThanOrEqual(1);
      }
  });
  it('responds to a new reference without synthesizing future actuals', () => {
    const rows = generateMunicipalBenchmarks('fixture', version, '2027-03-31').municipalBenchmarks;
    expect(rows.some((row) => row.kind === 'actual' && row.year === 2027 && row.month === 3)).toBe(
      true,
    );
    expect(
      rows.some(
        (row) => row.kind === 'actual' && (row.year > 2027 || (row.year === 2027 && row.month > 3)),
      ),
    ).toBe(false);
  });
  it('rejects invalid dates, duplicate imports, future actuals and inconsistent denominators', () => {
    for (const date of ['2026-02-30', '2019-12-31', '2033-01-01', 'not-a-date'])
      expect(() => generateMunicipalBenchmarks('fixture', version, date)).toThrow();
    const input = kalundborgInput();
    expect(() =>
      generateMunicipalBenchmarks('fixture', version, referenceDate, {
        ...input,
        rows: [input.rows[0], input.rows[0]],
      }),
    ).toThrow(/Dubleret/);
    expect(() =>
      generateMunicipalBenchmarks('fixture', version, referenceDate, {
        ...input,
        rows: [{ ...input.rows[0], kind: 'actual', year: 2027 }],
      }),
    ).toThrow(/referencedato/);
    expect(() =>
      generateMunicipalBenchmarks('fixture', version, referenceDate, {
        ...input,
        rows: [input.rows[0], { ...input.rows[1], population: 10 }],
      }),
    ).toThrow(/konsistente/);
  });
});

describe('Explainable peer selection uses synthetic structure only', () => {
  it('uses transparent, normalized weighted differences and symmetric bounded scores', () => {
    const a = kalundborgInput().structure,
      b = { ...a, population: a.population + 10_000, rurality: 0.4 };
    const result = municipalSimilarity(a, b);
    expect(municipalSimilarity(a, a).score).toBe(100);
    expect(result.score).toBe(municipalSimilarity(b, a).score);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.reduce((sum, component) => sum + component.weight, 0)).toBe(1);
    expect(
      result.components.reduce((sum, component) => sum + component.weightedDifference, 0),
    ).toBe(result.distance);
    expect(result.components.map((component) => component.key)).toEqual([
      'population',
      'population65Share',
      'schoolchildrenShare',
      'rurality',
    ]);
  });
  it('returns three stable matches with clear fictional explanations, excluding the baseline', () => {
    const profiles = generateMunicipalBenchmarks(
      'fixture',
      version,
      referenceDate,
      kalundborgInput(),
    ).municipalities;
    const peers = selectMunicipalPeers(profiles);
    expect(peers).toHaveLength(3);
    expect(
      peers.every(
        (peer) =>
          peer.municipality.id !== KALUNDBORG_MUNICIPALITY_ID &&
          peer.explanation.includes('udelukkende på fiktive strukturtræk'),
      ),
    ).toBe(true);
    expect(peers.map((peer) => peer.score)).toEqual(
      [...peers.map((peer) => peer.score)].sort((a, b) => b - a),
    );
    expect(selectMunicipalPeers([...profiles].reverse())).toEqual(peers);
  });
  it('breaks identical structural scores by stable official code and validates inputs', () => {
    const profiles = generateMunicipalBenchmarks(
      'fixture',
      version,
      referenceDate,
      kalundborgInput(),
    ).municipalities;
    const identical: MunicipalProfile[] = profiles.map((profile) => ({
      ...profile,
      structure: { ...profiles[0].structure },
    }));
    expect(selectMunicipalPeers(identical).map((peer) => peer.municipality.code)).toEqual([
      '306',
      '316',
      '329',
    ]);
    expect(() => selectMunicipalPeers(profiles, KALUNDBORG_MUNICIPALITY_ID, 0)).toThrow();
    expect(() => selectMunicipalPeers([...profiles, profiles[0]])).toThrow(/Dublerede/);
    expect(() =>
      municipalSimilarity({ ...profiles[0].structure, population: 0 }, profiles[1].structure),
    ).toThrow();
  });
});
