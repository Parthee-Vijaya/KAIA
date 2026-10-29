import { beforeAll, describe, expect, it } from 'vitest';
import { generateDataset, getDataset, type Dataset, pupilsForYear } from '../src/domain/data';
import {
  analyze,
  assertAnalysisContext,
  calculateScenario,
  decomposePriceQuantity,
  parseQuestion,
  parseScenario,
  searchDocuments,
} from '../src/domain/analysis';
import {
  allowedEntities,
  canAccessDocument,
  canAccessEntity,
  AccessDeniedError,
} from '../src/domain/policy';
import { suggestions, preparedScenarios, demonstrationQuestions } from '../src/domain/questions';
import { DEFAULT_SCENARIO, type AccessContext } from '../src/domain/types';
let dataset: Dataset;
const access: AccessContext = {
  userId: 'fixture-user',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-oid',
  roles: ['KAIA.Admin'],
  unitIds: ['*'],
  areas: [
    'schools',
    'facilities',
    'social',
    'health',
    'environment',
    'administration',
    'preparedness',
  ],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
const schools: AccessContext = { ...access, roles: ['KAIA.DepartmentHead'], areas: ['schools'] };
beforeAll(() => {
  dataset = getDataset();
});
describe('deterministic, explicitly synthetic dataset', () => {
  it('generates volume, verified names, source register, and safe fictional documents', () => {
    expect(dataset.rows.length).toBeGreaterThanOrEqual(150000);
    expect(dataset.documents.length).toBeGreaterThanOrEqual(60);
    expect(dataset.entities.filter((e) => e.type === 'school').length).toBeGreaterThanOrEqual(10);
    expect(dataset.entities.filter((e) => e.type === 'facility')).toHaveLength(8);
    expect(dataset.entities.filter((e) => e.type === 'committee')).toHaveLength(7);
    expect(
      dataset.entities.every(
        (e) =>
          e.nameSourceUrl.startsWith('https://www.kalundborg.dk/') && e.verifiedAt === '2026-10-20',
      ),
    ).toBe(true);
    expect(
      dataset.documents.every(
        (d) => d.id.startsWith('DEMO-') && d.status === 'simulated' && d.text.includes('SIMULERET'),
      ),
    ).toBe(true);
    expect(dataset.documents.every((d) => !/@|telefon|underskrevet/i.test(d.text))).toBe(true);
  });
  it('is reproducible at full row and document level', () => {
    const second = generateDataset();
    expect(second.rows).toEqual(dataset.rows);
    expect(second.documents).toEqual(dataset.documents);
  });
  it('stores exact safe integer øre and no actuals after the reference month', () => {
    expect(dataset.rows.every((r) => Number.isSafeInteger(r.amountOre))).toBe(true);
    expect(
      dataset.rows
        .filter((r) => r.kind === 'actual')
        .every((r) => r.year < 2026 || (r.year === 2026 && r.month <= 9)),
    ).toBe(true);
    expect(
      dataset.rows
        .filter((r) => r.kind === 'budget')
        .every((r) => (r.category === 'income' ? r.amountOre < 0 : r.amountOre > 0)),
    ).toBe(true);
    expect(
      dataset.rows
        .filter((r) => r.category === 'energy')
        .every((r) => r.amountOre === r.quantity! * r.unitPriceOre!),
    ).toBe(true);
  });
  it('uses human Danish document amounts, month names and type-specific narratives', () => {
    const docs = dataset.documents.filter(
      (d) => d.area === 'schools' && d.period === '2026' && d.entityIds.length > 1,
    );
    expect(docs).toHaveLength(5);
    expect(docs.every((d) => d.text.includes('januar–september'))).toBe(true);
    expect(docs.every((d) => /\d[.\d]*\s+kr\./.test(d.text) && !d.text.includes(' øre'))).toBe(
      true,
    );
    expect(docs.find((d) => d.type === 'strategy')!.text).toContain('28 procent');
    expect(docs.find((d) => d.type === 'followup')!.text).toContain('Energi bidrager');
    expect(docs.find((d) => d.type === 'decision')!.text).toContain('ikke et faktisk møde');
  });
  it('never reuses ledger ids and never assigns operating rows to committees', () => {
    expect(new Set(dataset.rows.map((r) => r.id)).size).toBe(dataset.rows.length);
    const ids = new Set(dataset.entities.filter((e) => e.type !== 'committee').map((e) => e.id));
    expect(dataset.rows.every((r) => ids.has(r.entityId))).toBe(true);
  });
});
describe('server access policy', () => {
  it('requires validated identity, valid role, area and units independently', () => {
    const entity = dataset.entities.find((e) => e.id === 'school-hoeng')!;
    expect(canAccessEntity({ ...schools, roles: [] }, entity)).toBe(false);
    expect(canAccessEntity({ ...schools, objectId: '' }, entity)).toBe(false);
    expect(canAccessEntity({ ...schools, unitIds: [] }, entity)).toBe(false);
    expect(canAccessEntity({ ...schools, areas: ['social'] }, entity)).toBe(false);
    expect(canAccessEntity({ ...schools, unitIds: [entity.id] }, entity)).toBe(true);
  });
  it('denies explicit forbidden entities, scopes and override requests', () => {
    expect(() =>
      analyze('Vis budgetstatus på socialområdet.', schools, undefined, undefined, dataset),
    ).toThrow(AccessDeniedError);
    const partial = { ...schools, unitIds: ['school-hoeng'] };
    expect(() =>
      analyze('Vis budget for Skolen på Herredsåsen.', partial, undefined, undefined, dataset),
    ).toThrow(AccessDeniedError);
    expect(() =>
      analyze('Vis budget.', partial, undefined, { entityIds: ['school-nyrup'] }, dataset),
    ).toThrow(AccessDeniedError);
  });
  it('does not leak mixed-scope documents and supports same-unit sources', () => {
    const partial = { ...schools, unitIds: ['school-hoeng'] };
    expect(
      canAccessDocument(
        partial,
        dataset.documents.find((d) => d.id === 'DEMO-DOC-schools-2026-followup')!,
        dataset.entities,
      ),
    ).toBe(false);
    const result = analyze('Find den simulerede strategi.', partial, undefined, undefined, dataset);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(
      result.sources
        .filter((s) => s.type === 'demo')
        .every((s) => s.documentId?.includes('school-hoeng')),
    ).toBe(true);
    const historical = analyze(
      'Find den simulerede strategi for 2023.',
      partial,
      undefined,
      undefined,
      {
        ...dataset,
        documents: dataset.documents.filter((document) => Number(document.period) > 2023),
      },
    );
    expect(historical.sources).toHaveLength(0);
    expect(historical.missingData).toBeTruthy();
  });
  it('maps committee scope to operating units but limits Council to political aggregates', () => {
    const council: AccessContext = {
      ...access,
      roles: ['KAIA.Council'],
      unitIds: ['committee-boern-familie'],
      areas: ['schools'],
    };
    expect(
      allowedEntities(council, dataset.entities).filter((e) => e.type === 'school'),
    ).toHaveLength(16);
    const result = analyze(
      'Vis budgetstatus på skoleområdet.',
      council,
      undefined,
      undefined,
      dataset,
    );
    expect(result.sources[0].rowIds).toBeUndefined();
    const composition = analyze(
      'Vis udgiftssammensætningen.',
      council,
      undefined,
      undefined,
      dataset,
    );
    expect(composition.chart!.rows).toHaveLength(1);
    expect(() => analyze('Sammenlign skolerne.', council, undefined, undefined, dataset)).toThrow(
      AccessDeniedError,
    );
    expect(() =>
      assertAnalysisContext(council, { ...result.context, intent: 'comparison' }, dataset.entities),
    ).toThrow(AccessDeniedError);
    expect(() =>
      assertAnalysisContext(council, { ...result.context, intent: 'heatmap' }, dataset.entities),
    ).toThrow(AccessDeniedError);
    expect(
      canAccessDocument(
        council,
        dataset.documents.find((d) => d.id === 'DEMO-DOC-schools-2026-followup')!,
        dataset.entities,
      ),
    ).toBe(false);
    expect(
      canAccessDocument(
        council,
        dataset.documents.find((d) => d.id === 'DEMO-DOC-schools-2026-decision')!,
        dataset.entities,
      ),
    ).toBe(true);
  });
});
describe('v4 question routing, comparisons and forecast coverage', () => {
  it.each([
    ['Sammenlign op mod sidste års data.', 'yearComparison'],
    ['sammennlign op mod sidste års data', 'yearComparison'],
    ['Sammenlign med sidste år.', 'yearComparison'],
    ['Sammenlign kommunens budget med sidste års data.', 'yearComparison'],
    ['Sammenlign skoleområdet med en sammenlignelig kommune.', 'municipalBenchmark'],
    ['Vis prognosen frem mod 2030.', 'projection'],
  ])('routes the Danish request %s to %s', (question, intent) => {
    expect(parseQuestion(question, schools, dataset).intent).toBe(intent);
  });
  it('retains the same school, quarter and per-pupil metric in a year-over-year followup', () => {
    const first = analyze(
      'Sammenlign udgift pr. elev på Høng Skole i 2. kvartal 2026.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const result = analyze(
      'Sammenlign op mod sidste års data.',
      schools,
      first.context,
      undefined,
      dataset,
    );
    expect(result.missingData).toBeUndefined();
    expect(result.context).toMatchObject({
      entityIds: ['school-hoeng'],
      area: 'schools',
      metric: 'perPupil',
      period: { year: 2026, fromMonth: 4, toMonth: 6 },
      comparison: { kind: 'year', year: 2025 },
    });
    const entity = dataset.entities.find((item) => item.id === 'school-hoeng')!;
    const expected = [2025, 2026].map((year) =>
      Math.round(
        dataset.rows
          .filter(
            (row) =>
              row.entityId === entity.id &&
              row.year === year &&
              row.month >= 4 &&
              row.month <= 6 &&
              row.kind === 'actual',
          )
          .reduce((total, row) => total + row.amountOre, 0) / pupilsForYear(entity, year),
      ),
    );
    expect(result.metrics.slice(0, 2).map((metric) => metric.value)).toEqual(expected);
    expect(result.chart!.rows.map((row) => row.value)).toEqual(expected);
    expect(result.sources[0].excerpt).toContain('Identiske måneder 4–6');
    expect(result.sources[0].excerpt).toContain(String(expected[1]));
    const next = analyze(result.followups[0], schools, result.context, undefined, dataset);
    expect(next.context.intent).toBe('yearComparison');
    expect(next.context.metric).toBe('perPupil');
    expect(next.context.period).toEqual({ year: 2027, fromMonth: 4, toMonth: 6 });
    expect(next.context.comparison).toEqual({ kind: 'year', year: 2026 });
  });
  it('preserves the energy metric and labels future data as forecasts against realized history', () => {
    const previous = parseQuestion(
      'Sammenlign energiudgifter på Høng Skole i 4. kvartal 2026.',
      schools,
      dataset,
    );
    const result = analyze(
      'Sammenlign med sidste års data.',
      schools,
      previous,
      undefined,
      dataset,
    );
    const expected = [2025, 2026].map((year) =>
      dataset.rows
        .filter(
          (row) =>
            row.entityId === 'school-hoeng' &&
            row.year === year &&
            row.month >= 10 &&
            row.category === 'energy' &&
            row.kind === (year === 2025 ? 'actual' : 'forecast'),
        )
        .reduce((total, row) => total + row.amountOre, 0),
    );
    expect(result.context.metric).toBe('energy');
    expect(result.context.period).toEqual({ year: 2026, fromMonth: 10, toMonth: 12 });
    expect(result.metrics.slice(0, 2).map((metric) => metric.value)).toEqual(expected);
    expect(result.metrics[0].label).toContain('regnskab');
    expect(result.metrics[1].label).toContain('prognose');
    expect(result.conclusion).toContain('regnskab');
    expect(result.conclusion).toContain('prognose');
  });
  it('retains an explicitly selected peer through explanation and period followups', () => {
    const first = analyze(
      'Sammenlign skoleområdet med Holbæk Kommune.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(first.missingData).toBeUndefined();
    expect(first.context.comparison?.municipalityId).toBe('municipality-holbaek');
    const why = analyze(
      'Hvorfor er den kommune sammenlignelig?',
      schools,
      first.context,
      undefined,
      dataset,
    );
    expect(why.context.comparison?.municipalityId).toBe('municipality-holbaek');
    expect(why.narrative.join(' ')).toContain('fiktive strukturscore');
    const changedPeriod = analyze(
      'Vis samme analyse for 2025.',
      schools,
      why.context,
      undefined,
      dataset,
    );
    expect(changedPeriod.missingData).toBeUndefined();
    expect(changedPeriod.context.comparison?.municipalityId).toBe('municipality-holbaek');
    expect(changedPeriod.context.period).toEqual({ year: 2025, fromMonth: 1, toMonth: 9 });
    const changedPeer = analyze('Og med Sorø?', schools, changedPeriod.context, undefined, dataset);
    expect(changedPeer.context.comparison?.municipalityId).toBe('municipality-soroe');
    expect(changedPeer.context.period).toEqual(changedPeriod.context.period);
    expect(changedPeer.chart!.rows[1].label).toBe('Sorø');
  });
  it('does not substitute a supported peer for an explicitly unknown municipality', () => {
    const result = analyze(
      'Sammenlign skoleområdet med Aarhus Kommune.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(result.context.intent).toBe('municipalBenchmark');
    expect(result.context.comparison?.municipalityId).toBe('unknown:aarhus');
    expect(result.missingData).toContain('ønskede kommune findes ikke');
    expect(result.metrics).toEqual([]);
    expect(result.chart).toBeUndefined();
    expect(result.sources).toEqual([]);
    expect(result.followups.length).toBeGreaterThan(0);
  });
  it('computes the requested 2030 projection from canonical forecast rows and exposes the same figures', () => {
    const result = analyze(
      'Vis prognosen for Høng Skole frem mod 2030.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(result.missingData).toBeUndefined();
    expect(result.context.projectionEndYear).toBe(2030);
    expect(result.chart!.rows.map((row) => row.label)).toEqual([
      '2026',
      '2027',
      '2028',
      '2029',
      '2030',
    ]);
    const expected = dataset.rows
      .filter(
        (row) => row.entityId === 'school-hoeng' && row.year === 2030 && row.kind === 'forecast',
      )
      .reduce((total, row) => total + row.amountOre, 0);
    expect(result.chart!.rows.at(-1)!.base).toBe(expected);
    expect(result.metrics.find((metric) => metric.label === 'Basis 2030')!.value).toBe(expected);
    expect(result.sources[0].excerpt).toContain(String(expected));
    expect(result.chart!.rows[0]).toMatchObject({ actualMonths: 9, forecastMonths: 3 });
    expect(result.chart!.rows.at(-1)).toMatchObject({
      actual: null,
      actualMonths: 0,
      forecastMonths: 12,
    });
  });
  it('keeps old v3 analyses honest when the requested year or benchmark is absent', () => {
    const legacy = generateDataset({ version: 'KAIA-DEMO-2026.09-v3' });
    for (const question of [
      'Sammenlign skoleområdet i 2023 med sidste års data.',
      'Sammenlign skoleområdet med en sammenlignelig kommune.',
      'Vis prognosen frem mod 2030.',
    ]) {
      const result = analyze(question, schools, undefined, undefined, legacy);
      expect(result.datasetVersion).toBe('KAIA-DEMO-2026.09-v3');
      expect(result.missingData).toBeTruthy();
      expect(result.metrics).toEqual([]);
      expect(result.chart).toBeUndefined();
    }
  });
});
describe('analysis mathematics and evidence', () => {
  it('distinguishes missing future actuals from real zero expenditure', () => {
    for (const question of [
      'Vis budgetstatus for 2027.',
      'Vis budgetstatus for 4. kvartal 2026.',
    ]) {
      const result = analyze(question, schools, undefined, undefined, dataset);
      expect(result.narrative.join(' ')).toContain('ingen realiserede posteringer');
      expect(result.narrative.join(' ')).not.toContain('Realiseret forbrug inden for');
      expect(result.metrics[1].value).toBeGreaterThan(0);
    }
  });
  it('reconciles chart, net metrics and actual/budget sums using equal period coverage', () => {
    const a = analyze(
      'Giv mig budgetstatus på skoleområdet.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const rows = dataset.rows.filter(
      (r) => r.entityId.startsWith('school-') && r.year === 2026 && r.month <= 9,
    );
    const budget = rows.filter((r) => r.kind === 'budget').reduce((s, r) => s + r.amountOre, 0),
      actual = rows.filter((r) => r.kind === 'actual').reduce((s, r) => s + r.amountOre, 0);
    expect(a.metrics[0].value).toBe(budget);
    expect(a.metrics[1].value).toBe(actual);
    expect(a.metrics[2].value).toBe(actual - budget);
    expect(a.chart!.rows[0].actual).toBe(a.metrics[1].value);
    expect(a.sources[0].rowIds!.length).toBeLessThanOrEqual(10);
    expect(a.sources.every((s) => s.type === 'demo' && s.datasetVersion === a.datasetVersion)).toBe(
      true,
    );
    expect(a.sources[0].excerpt).toContain(String(actual));
  });
  it('formats Danish currency prose without duplicated abbreviation punctuation', () => {
    for (const q of [
      'Vis budgetstatus.',
      'Vis årsprognosen.',
      'Hvad hvis energiprisen stiger 15 procent?',
      'Forklar energi med pris og mængde.',
    ]) {
      const a = analyze(q, schools, undefined, undefined, dataset);
      expect([a.conclusion, ...a.narrative, ...a.assumptions].join(' ')).not.toContain('kr..');
    }
  });
  it('preserves entities and month coverage through ordinary period followups', () => {
    const a = analyze(
      'Sammenlign Skolen på Herredsåsen, Høng Skole og Svebølle Skole.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(a.context.entityIds).toHaveLength(3);
    const b = analyze('Vis det for 2025.', schools, a.context, undefined, dataset);
    expect(b.context.period).toEqual({ year: 2025, fromMonth: 1, toMonth: 9 });
    expect(b.context.entityIds).toEqual(a.context.entityIds);
    expect(b.context.intent).toBe('comparison');
    const single = analyze(
      'Vis budget for Skolen på Herredsåsen.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const next = analyze('Sammenlign med Høng.', schools, single.context, undefined, dataset);
    expect(next.context.entityIds).toEqual(['school-herredsaasen', 'school-hoeng']);
  });
  it('treats current UI filters as defaults under explicit question scope and period', () => {
    const initial = analyze(
      'Vis budgetstatus på skoleområdet.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const ui = {
      area: 'schools' as const,
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
      entityIds: initial.context.entityIds,
    };
    const priorYear = analyze('Vis samme analyse for 2025.', schools, initial.context, ui, dataset);
    expect(priorYear.context.period.year).toBe(2025);
    const named = analyze(
      'Sammenlign Skolen på Herredsåsen og Høng Skole.',
      schools,
      initial.context,
      ui,
      dataset,
    );
    expect(named.context.entityIds).toEqual(['school-herredsaasen', 'school-hoeng']);
    const empty = analyze(
      'Vis budgetstatus.',
      schools,
      initial.context,
      { ...ui, entityIds: [] },
      dataset,
    );
    expect(empty.context.entityIds).toHaveLength(16);
    const month = analyze(
      'Vis budgetstatus i oktober 2025.',
      schools,
      initial.context,
      ui,
      dataset,
    );
    expect(month.context.period).toEqual({ year: 2025, fromMonth: 1, toMonth: 10 });
    expect(() =>
      analyze('Vis budgetstatus på socialområdet.', schools, initial.context, ui, dataset),
    ).toThrow(AccessDeniedError);
    const changed = analyze(
      'Vis budgetstatus på socialområdet.',
      access,
      initial.context,
      ui,
      dataset,
    );
    expect(changed.context.area).toBe('social');
    expect(
      changed.context.entityIds.every((id) => id === 'org-voksen' || id === 'org-jobcenter'),
    ).toBe(true);
    const partial = { ...schools, unitIds: ['school-hoeng'] };
    expect(() =>
      analyze(
        'Vis budget for Skolen på Herredsåsen.',
        partial,
        undefined,
        { ...ui, entityIds: ['school-hoeng'] },
        dataset,
      ),
    ).toThrow(AccessDeniedError);
  });
  it('calculates pupil ratios from same-year synthetic pupil counts', () => {
    const a = analyze(
      'Vis udviklingen i udgift pr. elev fra 2023 til 2026.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const row = a.chart!.rows.find((r) => r.label === '2025')!;
    const pupils = dataset.entities
      .filter((e) => e.type === 'school')
      .reduce((s, e) => s + pupilsForYear(e, 2025), 0);
    expect(row.pupils).toBe(pupils);
    expect(row.value).toBe(Math.round(Number(row.amountOre) / pupils));
    expect(a.chart!.rows).toHaveLength(4);
  });
  it('separates official name sources from simulated monetary evidence', () => {
    const a = analyze(
      'Sammenlign Skolen på Herredsåsen og Høng Skole.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(a.sources[0].type).toBe('demo');
    const names = a.sources.filter((s) => s.type === 'name');
    expect(names).toHaveLength(1);
    expect(names[0].url).toContain('kalundborg.dk');
    expect(names[0].excerpt).toContain('kun eksistens og stavning');
    expect(a.metrics.every((m) => m.sourceIds.every((id) => !names.some((s) => s.id === id)))).toBe(
      true,
    );
    expect(a.chart!.sourceIds.every((id) => !names.some((s) => s.id === id))).toBe(true);
  });
  it('makes category contributions sum to exactly the net variance', () => {
    const a = analyze(
      'Hvilke typer udgifter bidrager mest til afvigelsen?',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(a.chart!.rows.reduce((s, r) => s + Number(r.value), 0)).toBe(
      a.metrics.find((m) => m.label === 'Afvigelse')!.value,
    );
  });
  it('supports all six chart types and honest unsupported queries', () => {
    const cases: [string, string][] = [
      ['Vis udviklingen i udgifter.', 'line'],
      ['Sammenlign skolerne.', 'bar'],
      ['Vis udgiftssammensætningen.', 'stacked'],
      ['Hvilke typer udgifter bidrager til afvigelsen?', 'waterfall'],
      ['Vis et heatmap over månedlige afvigelser.', 'heatmap'],
      ['Hvad hvis energiprisen stiger 15 procent?', 'scenario'],
    ];
    for (const [q, type] of cases)
      expect(analyze(q, schools, undefined, undefined, dataset).chart?.type).toBe(type);
    expect(
      analyze(
        'Hvor mange borgere fik en individuel bevilling i går?',
        schools,
        undefined,
        undefined,
        dataset,
      ).missingData,
    ).toBeTruthy();
    expect(
      analyze('Hvad er kommunens faktiske budget?', schools, undefined, undefined, dataset)
        .missingData,
    ).toBeTruthy();
    expect(
      analyze('Vis min yndlingsfarve.', schools, undefined, undefined, dataset).missingData,
    ).toBeTruthy();
    for (const year of [2019, 2033])
      expect(() =>
        analyze(`Vis budget for ${year}.`, schools, undefined, undefined, dataset),
      ).toThrow('2020–2032');
  });
  it('returns exactly four working in-scope shortcuts and >=20 prepared demos', () => {
    for (const area of access.areas) {
      const limited = { ...access, areas: [area] };
      const list = suggestions(limited);
      expect(list).toHaveLength(4);
      for (const s of list)
        expect(
          analyze(s.question, limited, undefined, undefined, dataset).missingData,
        ).toBeUndefined();
    }
    expect(demonstrationQuestions.length).toBeGreaterThanOrEqual(20);
    expect(preparedScenarios.length).toBeGreaterThanOrEqual(8);
  });
  it('runs the twenty scripted questions with real results or the intended missing/denied state', () => {
    const questions = demonstrationQuestions.filter((q) => !q.startsWith('Gem '));
    expect(questions.length).toBeGreaterThanOrEqual(20);
    for (const question of questions) {
      if (question === 'Vis budgetstatus på socialområdet.') {
        expect(() => analyze(question, schools, undefined, undefined, dataset)).toThrow(
          AccessDeniedError,
        );
        continue;
      }
      const result = analyze(question, access, undefined, undefined, dataset);
      if (question.includes('individuel social')) expect(result.missingData).toBeTruthy();
      else {
        expect(result.missingData).toBeUndefined();
        expect(result.sources.length).toBeGreaterThan(0);
        expect(
          result.metrics.length +
            (result.chart ? 1 : 0) +
            result.sources.filter((s) => s.documentId).length,
        ).toBeGreaterThan(0);
      }
    }
  });
  it('retrieves relevant strategy and decision documents without an embedding key', () => {
    const a = analyze(
      'Find den simulerede strategi, som opfølgningen henviser til.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    const docs = searchDocuments(a.question, a.context, schools, dataset);
    expect(docs[0].type).toBe('strategy');
    expect(a.sources[0].documentId).toBeTruthy();
  });
});
describe('scenario and explanation models', () => {
  it('changes only remaining energy entries and reconciles every monthly value', () => {
    const rows = dataset.rows.filter((r) => r.entityId === 'school-hoeng');
    const a = { ...DEFAULT_SCENARIO, energyPercent: 15 };
    const result = calculateScenario(rows, { year: 2026, fromMonth: 1, toMonth: 9 }, a, dataset);
    const expected = rows
      .filter(
        (r) => r.year === 2026 && r.month > 9 && r.kind === 'forecast' && r.category === 'energy',
      )
      .reduce((s, r) => s + Math.round(r.amountOre * 0.15), 0);
    expect(result.deltaOre).toBe(expected);
    expect(result.scenarioOre - result.baselineOre).toBe(expected);
    expect(result.rows.slice(0, 9).every((r) => r.baseline === r.scenario)).toBe(true);
    expect(result.rows.reduce((s, r) => s + Number(r.scenario), 0)).toBe(result.scenarioOre);
    expect(result.effects.salary).toBe(0);
    expect(result.effects.substitute).toBe(0);
  });
  it('combines disjoint category effects once and keeps budget adjustment separate', () => {
    const rows = dataset.rows.filter((r) => r.entityId === 'school-hoeng'),
      period = { year: 2026, fromMonth: 1, toMonth: 9 };
    const e = calculateScenario(rows, period, { ...DEFAULT_SCENARIO, energyPercent: 15 }, dataset),
      v = calculateScenario(rows, period, { ...DEFAULT_SCENARIO, substitutePercent: -10 }, dataset);
    const combo = calculateScenario(
      rows,
      period,
      { ...DEFAULT_SCENARIO, energyPercent: 15, substitutePercent: -10, budgetPercent: -2 },
      dataset,
    );
    expect(combo.deltaOre).toBe(e.deltaOre + v.deltaOre);
    expect(combo.budgetDeltaOre).toBeLessThan(0);
    expect(calculateScenario(rows, period, { ...DEFAULT_SCENARIO }, dataset).deltaOre).toBe(0);
    expect(
      parseScenario('Hvad hvis energi stiger 15 procent og vikarforbruget falder 10 procent?'),
    ).toMatchObject({ energyPercent: 15, substitutePercent: -10 });
    expect(parseScenario('Hvad hvis energiprisen sænkes 2,5 pct.?')).toMatchObject({
      energyPercent: -2.5,
    });
    expect(parseScenario('Hvad hvis energi −10 %?')).toMatchObject({ energyPercent: -10 });
    expect(parseScenario('Hvad hvis energi stiger 15,5 procent?')).toMatchObject({
      energyPercent: 15.5,
    });
    expect(
      parseScenario('Hvad hvis energi stiger 15 procent mens vikarforbruget falder 10 procent?'),
    ).toMatchObject({ energyPercent: 15, substitutePercent: -10 });
    expect(parseScenario('Hvad hvis energi og løn stiger 3 procent?')).toMatchObject({
      energyPercent: 3,
      salaryPercent: 3,
    });
    expect(parseScenario('Hvad hvis energi +15 % og vikarer -10 %?')).toMatchObject({
      energyPercent: 15,
      substitutePercent: -10,
    });
    expect(parseScenario('Hvad hvis energi stiger 15 % vikarer falder 10 %?')).toMatchObject({
      energyPercent: 15,
      substitutePercent: -10,
    });
    expect(parseScenario('Nulstil scenariet', { ...DEFAULT_SCENARIO, energyPercent: 15 })).toEqual(
      DEFAULT_SCENARIO,
    );
    expect(() =>
      calculateScenario(rows, period, { ...DEFAULT_SCENARIO, energyPercent: -101 }, dataset),
    ).toThrow();
  });
  it('separates illustrative annual effects from remaining-year effects', () => {
    const rows = dataset.rows.filter((r) => r.entityId === 'school-hoeng'),
      p = { year: 2026, fromMonth: 1, toMonth: 9 };
    const annual = calculateScenario(
        rows,
        p,
        { ...DEFAULT_SCENARIO, energyPercent: 15, horizon: 'annual' },
        dataset,
      ),
      remaining = calculateScenario(rows, p, { ...DEFAULT_SCENARIO, energyPercent: 15 }, dataset);
    expect(annual.deltaOre).toBeGreaterThan(remaining.deltaOre);
    expect(
      calculateScenario(
        rows,
        { ...p, year: 2025 },
        { ...DEFAULT_SCENARIO, energyPercent: 15 },
        dataset,
      ).deltaOre,
    ).toBe(0);
  });
  it('has exact price + quantity + interaction decomposition, never correlation as cause', () => {
    const result = decomposePriceQuantity(
      dataset.rows.filter((r) => r.entityId.startsWith('school-')),
      { year: 2026, fromMonth: 1, toMonth: 9 },
      dataset,
    );
    expect(result.matchedInvoices).toBe(16 * 9 * 16);
    expect(result.unexplainedOre).toBe(0);
    expect(result.priceEffectOre + result.quantityEffectOre + result.interactionOre).toBe(
      result.currentOre - result.baselineOre,
    );
    const a = analyze(
      'Forklar energiudgifternes ændring med pris, mængde og samspil.',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(a.chart!.type).toBe('waterfall');
    expect(a.conclusion).toContain('I simuleringen');
  });
  it('keeps unexplained fees and unmodelled energy invoices in the residual', () => {
    const rows = dataset.rows.filter((r) => r.entityId === 'school-hoeng');
    const changed = rows.map((r) =>
      r.year === 2026 &&
      r.month === 1 &&
      r.kind === 'actual' &&
      r.category === 'energy' &&
      r.id.endsWith('-0')
        ? { ...r, amountOre: r.amountOre + 12345 }
        : r,
    );
    const result = decomposePriceQuantity(
      changed,
      { year: 2026, fromMonth: 1, toMonth: 9 },
      dataset,
    );
    expect(result.unexplainedOre).toBe(12345);
    expect(result.currentOre - result.baselineOre).toBe(
      result.priceEffectOre +
        result.quantityEffectOre +
        result.interactionOre +
        result.unexplainedOre,
    );
  });
  it('reconciles births, deaths, separate migration and cohort aging to each population change', () => {
    const demo = dataset.demography!;
    for (const current of demo.filter((r) => r.year > 2023)) {
      const prior = demo.find(
        (r) => r.year === current.year - 1 && r.ageGroup === current.ageGroup,
      )!;
      expect(current.population - prior.population).toBe(
        current.births -
          current.deaths +
          current.domesticNet +
          current.internationalNet +
          current.ageIn -
          current.ageOut,
      );
    }
    for (const year of [2023, 2024, 2025, 2026, 2027, 2028]) {
      const rows = demo.filter((r) => r.year === year);
      expect(rows.reduce((s, r) => s + r.ageIn - r.ageOut, 0)).toBe(0);
    }
  });
  it('demography leaves fixed costs unchanged and labels the illustrative activity relation', () => {
    const a = analyze(
      'Hvordan påvirker ændret demografi skoleudgifterne?',
      schools,
      undefined,
      undefined,
      dataset,
    );
    expect(a.metrics.find((m) => m.label === 'Faste øvrige udgifter')!.value).toBeGreaterThan(0);
    expect(a.chart!.rows.find((r) => r.label === 'Faste udgifter')!.value).toBe(0);
    expect(a.metrics.find((m) => m.label === 'Illustrativ virkning')!.value).toBeLessThan(0);
    expect(a.assumptions.join(' ')).toContain('28 %');
  });
});
