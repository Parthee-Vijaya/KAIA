import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { CATEGORIES, type Dataset } from '../src/domain/data';
import { generateMunicipalBenchmarks } from '../src/domain/municipalities';
import {
  DEFAULT_SCENARIO,
  type AccessContext,
  type Analysis,
  type LedgerRow,
  type PublicEntity,
  type SourceRef,
} from '../src/domain/types';
import { AnalysisBasis } from '../src/components/analysis-basis';
import { buildAnalysisBasis, formatBasisValue } from '../src/components/analysis-basis-model';
import { AnalysisChart } from '../src/components/chart';

vi.mock('../src/components/chart', () => ({
  AnalysisChart: () => createElement('div', { 'data-chart-fixture': 'true' }),
}));
const version = 'KAIA-BASIS-FIXTURE-v1';
const source: SourceRef = {
  id: 'DEMO-BASIS',
  title: 'Simuleret beregningsgrundlag',
  type: 'demo',
  status: 'simulated',
  period: 'januar–september 2026',
  datasetVersion: version,
  excerpt: 'Versioneret beregningsgrundlag.',
};
const nameSource: SourceRef = {
  id: 'NAME-FIXTURE',
  title: 'Officiel navnekilde · Høng Skole',
  type: 'name',
  status: 'official-name',
  period: '2026',
  datasetVersion: version,
  excerpt: 'Dokumenterer kun navn og stavning.',
};
const entity: PublicEntity = {
  id: 'school-hoeng',
  name: 'Høng Skole',
  type: 'school',
  area: 'schools',
  aliases: ['Høng'],
  nameSourceUrl: 'https://www.kalundborg.dk/',
  verifiedAt: '2026-10-21',
};
const user: AccessContext = {
  userId: 'basis-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: [entity.id],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
function fixture(): Analysis {
  return {
    analysisId: 'DEMO-BASIS-A',
    question: 'Vis budgetstatus.',
    title: 'Budgetstatus',
    datasetVersion: version,
    conclusion: 'Konklusion med belæg. [1]',
    narrative: [],
    context: {
      area: 'schools',
      entityIds: [entity.id],
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
      intent: 'budget',
      metric: 'net',
    },
    sources: [source],
    metrics: [
      { label: 'Periodiseret budget', value: 10000, unit: 'ore', sourceIds: [source.id] },
      { label: 'Forbrug / prognose', value: 12345, unit: 'ore', sourceIds: [source.id] },
      { label: 'Afvigelse', value: 2345, unit: 'ore', sourceIds: [source.id] },
    ],
    assumptions: ['Samme måneder og enheder.'],
    followups: [],
    chart: {
      title: 'Budget og forbrug',
      subtitle: 'januar–september 2026',
      unit: 'ore',
      type: 'bar',
      sourceIds: [source.id],
      rows: [{ label: 'Nettoudgifter', budget: 10000, actual: 12345 }],
      series: [
        { key: 'budget', label: 'Budget', color: '#464f5e' },
        { key: 'actual', label: 'Forbrug', color: '#bc4d30' },
      ],
    },
  };
}
function realDataset(): Dataset {
  const rows: LedgerRow[] = [];
  for (let year = 2023; year <= 2032; year++)
    for (let month = 1; month <= 12; month++)
      for (const [index, category] of CATEGORIES.entries())
        for (const kind of ['budget', 'actual', 'forecast'] as const) {
          if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
          const amount =
            10003 +
            index * 13 +
            month * 7 +
            (year - 2023) * 101 +
            (kind === 'budget' ? 0 : kind === 'actual' ? 47 : 113);
          rows.push({
            id: `DEMO-L-${year}-${month}-${category}-${kind}`,
            entityId: entity.id,
            datasetVersion: version,
            year,
            month,
            category,
            kind,
            amountOre: category === 'income' ? -Math.round(amount / 10) : amount,
          });
        }
  return {
    version,
    seed: 'basis-fixture',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2023, toYear: 2032 },
    entities: [{ ...entity, synthetic: { pupils: 3, annualBudgetOre: 10000000 } }],
    rows,
    documents: [],
  };
}
const data = realDataset();
function real(question: string, context: Partial<Analysis['context']> = {}) {
  return analyze(question, user, undefined, { ...fixture().context, ...context }, data);
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}

describe('beregningsgrundlag afspejler det faktiske analyseobjekt', () => {
  it('viser præcis budgetafvigelse og beholder dataversion, scope og de originale kildeobjekter', () => {
    const analysis = fixture(),
      before = structuredClone(analysis),
      model = buildAnalysisBasis(analysis, [entity]);
    expect(model.formulas[0].result?.value).toBe(2345);
    expect(model.formulas[0].values.map((value) => value.value)).toEqual([12345, 10000]);
    expect(model.version).toBe(version);
    expect(model.selectedPeriod).toBe('januar–september 2026');
    expect(model.units).toEqual([{ id: entity.id, name: entity.name }]);
    expect(model.sources[0].source).toBe(analysis.sources[0]);
    expect(model.chart).toBe(analysis.chart);
    expect(analysis).toEqual(before);
  });
  it.each([0, -12345])(
    'bevarer et ægte nul eller negativt beløb %s uden at skjule fortegnet',
    (amount) => {
      const analysis = fixture();
      analysis.metrics[1].value = amount;
      const model = buildAnalysisBasis(analysis);
      expect(model.formulas[0].result?.value).toBe(amount - 10000);
      expect(model.formulas[0].values[0].value).toBe(amount);
    },
  );
  it('genopfinder ikke navne for enheder, der ikke er medsendt i navigationsmetadata', () => {
    expect(buildAnalysisBasis(fixture()).units).toEqual([{ id: entity.id, name: undefined }]);
  });
  it.each([
    'Vis budgetstatus.',
    'Hvilke udgiftstyper bidrager til nettoafvigelsen på Høng Skole?',
    'Vis prognosen frem mod 2032.',
    'Vis udvikling i udgift pr. elev fra 2023 til 2026.',
    'Sammenlign med sidste års data.',
  ])('kan forklare faktiske domæneresultater: %s', (question) => {
    const analysis = real(question),
      model = buildAnalysisBasis(analysis, [entity]);
    expect(model.problems).toEqual([]);
    expect(model.chart).toBe(analysis.chart);
    expect(model.formulas.length).toBeGreaterThan(0);
    for (const formula of model.formulas)
      expect(
        formula.sourceIds.every((id) => analysis.sources.some((source) => source.id === id)),
      ).toBe(true);
  });
  it('afstemmer alle kategoriers positive og negative bidrag uden at kalde dem en dokumenteret årsag', () => {
    const analysis = real('Hvilke udgiftstyper bidrager til nettoafvigelsen på Høng Skole?'),
      model = buildAnalysisBasis(analysis);
    const expected = analysis.chart!.rows.reduce((total, row) => total + Number(row.value), 0);
    expect(model.formulas[0].result?.value).toBe(expected);
    expect(model.formulas[0].values).toHaveLength(CATEGORIES.length);
    expect(model.formulas[0].note).toMatch(/ikke i sig selv en dokumenteret årsag/);
  });
});

describe('prognoser, scenarier og normalisering forklares uden manglende input', () => {
  it('viser den faktiske normaliserede årsforskel i kr./elev i både formel og nøgletalssektion', () => {
    const analysis = real('Sammenlign udgift pr. elev med sidste års data.');
    expect(analysis.context.comparison?.kind).toBe('year');
    expect(analysis.context.metric).toBe('perPupil');
    const original = analysis.metrics.find((metric) => metric.label === 'Forskel')!;
    expect(original.unit).toBe('ore');
    const model = buildAnalysisBasis(analysis);
    const difference = model.metrics.find((metric) => metric.label === 'Forskel')!;
    expect(difference).toMatchObject({ value: original.value, unit: 'perPupil' });
    expect(formatBasisValue(difference)).toMatch(/kr\.\/elev$/);
    expect(model.formulas[0].result?.unit).toBe(difference.unit);
    expect(analysis.metrics.find((metric) => metric.label === 'Forskel')!.unit).toBe('ore');
  });
  it('viser en reel kommunebenchmarkforskel i kr./indbygger uden at ændre serverbeløbet', () => {
    const municipal = generateMunicipalBenchmarks(
      'basis-peer-fixture',
      version,
      data.referenceDate,
      {
        structure: { population: 10000, schoolchildren: 3, population65Share: 0.25, rurality: 0.6 },
        structureYear: 2026,
        rows: [],
      },
    );
    const peerData: Dataset = {
      ...data,
      municipalities: municipal.municipalities,
      municipalBenchmarks: municipal.municipalBenchmarks,
      demography: (['0-5', '6-16', '17-64', '65+'] as const).map((ageGroup) => ({
        year: 2026,
        ageGroup,
        population: 2500,
        births: 0,
        deaths: 0,
        domesticNet: 0,
        internationalNet: 0,
        ageIn: 0,
        ageOut: 0,
      })),
    };
    const analysis = analyze(
      'Sammenlign udgift pr. indbygger med en sammenlignelig kommune.',
      user,
      undefined,
      fixture().context,
      peerData,
    );
    expect(analysis.missingData).toBeUndefined();
    expect(analysis.context.comparison?.kind).toBe('municipality');
    expect(analysis.context.metric).toBe('perCapita');
    const model = buildAnalysisBasis(analysis),
      difference = model.metrics.find((metric) => metric.label === 'Forskel')!;
    expect(difference).toMatchObject({
      value: analysis.metrics.find((metric) => metric.label === 'Forskel')!.value,
      unit: 'perCapita',
    });
    expect(formatBasisValue(difference)).toMatch(/kr\.\/indbygger$/);
    expect(model.formulas[0].result?.unit).toBe(difference.unit);
  });
  it('bevarer net-årsforskelle og rå budgettotaler i kroner, også under en anden normaliseret analysetype', () => {
    const net = buildAnalysisBasis(real('Sammenlign med sidste års data.'));
    expect(net.metrics.find((metric) => metric.label === 'Forskel')!.unit).toBe('ore');
    const normalized = fixture();
    normalized.context.metric = 'perPupil';
    normalized.context.intent = 'comparison';
    normalized.metrics.push({ label: 'Forskel', value: 2345, unit: 'ore', sourceIds: [source.id] });
    const model = buildAnalysisBasis(normalized);
    expect(model.metrics.every((metric) => metric.unit === 'ore')).toBe(true);
    expect(model.metrics.map((metric) => metric.value)).toEqual(
      normalized.metrics.map((metric) => metric.value),
    );
  });
  it('bruger scenariets præcise baseline, ændring og helårsresultat, mens perioden skelnes fra filterudsnittet', () => {
    const analysis = real('Vis baseline og scenarie i samme graf.', {
        scenario: { ...DEFAULT_SCENARIO, energyPercent: 15 },
      }),
      model = buildAnalysisBasis(analysis);
    expect(model.formulas[0].values.map((value) => value.value)).toEqual([
      analysis.scenario!.baselineOre,
      analysis.scenario!.deltaOre,
    ]);
    expect(model.formulas[0].result?.value).toBe(analysis.scenario!.scenarioOre);
    expect(model.selectedPeriod).toBe('januar–september 2026');
    expect(model.calculationPeriod).toBe('januar–december 2026');
    expect(model.coverage).toEqual([{ label: '2026', actual: 9, forecast: 3 }]);
    expect(model.parameters.find((item) => item.label === 'Energipris')!.value).toBe(15);
  });
  it('viser ikke en succesformel for et uafstemt scenarie', () => {
    const analysis = real('Vis baseline og scenarie i samme graf.');
    analysis.scenario!.deltaOre += 1;
    const model = buildAnalysisBasis(analysis);
    expect(model.formulas).toEqual([]);
    expect(model.problems.join(' ')).toMatch(/ikke afstemmes/);
  });
  it('skelner faktiske og forventede måneder fra de leverede prognosefelter', () => {
    const analysis = real('Vis prognosen frem mod 2032.'),
      model = buildAnalysisBasis(analysis);
    expect(model.calculationPeriod).toBe('2026–2032 · hele kalenderår');
    expect(model.coverage[0]).toEqual({ label: '2026', actual: 9, forecast: 3 });
    expect(model.coverage.slice(1).every((row) => row.actual === 0 && row.forecast === 12)).toBe(
      true,
    );
    expect(model.formulas[0].values.reduce((sum, value) => sum + value.value, 0)).toBe(
      model.formulas[0].result!.value,
    );
  });
  it('normaliserer ikke afrundede delserier igen og rekonstruerer ikke en ukendt nettosum', () => {
    const analysis = real('Vis prognosen for udgift pr. elev frem mod 2032.');
    const first = analysis.chart!.rows[0];
    first.actual = 333;
    first.forecast = 667;
    first.base = 999;
    first.pupils = 3;
    const model = buildAnalysisBasis(analysis);
    expect(model.formulas[0].result).toMatchObject({ value: 999, unit: 'perPupil' });
    expect(model.formulas[0].values).toEqual([
      { label: '2026 · elever', value: 3, unit: 'number' },
    ]);
    expect(model.formulas[0].note).toMatch(/ikke bruges til at rekonstruere/);
  });
  it('viser den eksisterende tæller og nævner, når trendobjektet faktisk indeholder begge', () => {
    const analysis = real('Vis udvikling i udgift pr. elev fra 2023 til 2026.'),
      row = analysis.chart!.rows.at(-1)!,
      model = buildAnalysisBasis(analysis);
    expect(model.formulas[0].values.map((value) => value.value)).toEqual([
      row.amountOre,
      row.pupils,
    ]);
    expect(model.formulas[0].result?.value).toBe(row.value);
  });
  it('blander ikke rå variance med pr.-elev-felter og udleder aldrig nettosum ved at gange et afrundet nøgletal op', () => {
    const analysis = fixture();
    analysis.context.intent = 'comparison';
    analysis.context.metric = 'perPupil';
    analysis.chart!.rows = [
      { label: entity.name, budget: 100, actual: 103, variance: 9999, pupils: 321 },
    ];
    const model = buildAnalysisBasis(analysis);
    expect(model.formulas[0].values).toEqual([{ label: 'Elever', value: 321, unit: 'number' }]);
    expect(model.formulas[0].result?.value).toBe(103);
    expect(
      model.formulas[0].values.some((value) => value.value === 9999 || value.value === 103 * 321),
    ).toBe(false);
    expect(model.metrics[1]).toMatchObject({ value: 12345, unit: 'ore' });
    expect(model.formulas[0].note).toMatch(/Ikke alle rå input/);
  });
  it('bevarer retningen i sammenligninger mellem år og mellem kommuner', () => {
    for (const kind of ['year', 'municipality'] as const) {
      const analysis = fixture();
      analysis.context.comparison = { kind, year: 2025 };
      analysis.context.metric = 'perCapita';
      analysis.chart!.rows = [
        { label: 'Grundlag A', value: 1000, budget: 900 },
        { label: 'Grundlag B', value: 1200, budget: 1100 },
      ];
      analysis.chart!.series = [{ key: 'value', label: 'Værdi', color: '#006f71' }];
      const model = buildAnalysisBasis(analysis);
      expect(model.formulas[0].result).toMatchObject({
        value: kind === 'year' ? 200 : -200,
        unit: 'perCapita',
      });
      expect(model.formulas[0].values.every((value) => value.unit === 'perCapita')).toBe(true);
      expect(model.notes.join(' ')).toMatch(/nævner.*ikke er medsendt/);
    }
  });
});

describe('proveniens og manglende grundlag', () => {
  it.each(['other-version', 'official-name', 'missing-reference'] as const)(
    'bruger ikke ugyldig figurproveniens %s som belæg for økonomi',
    (problem) => {
      const analysis = fixture();
      if (problem === 'other-version') analysis.sources = [{ ...source, datasetVersion: 'OTHER' }];
      if (problem === 'official-name')
        analysis.sources = [{ ...source, type: 'name', status: 'official-name' }];
      if (problem === 'missing-reference') analysis.sources = [];
      const model = buildAnalysisBasis(analysis);
      expect(model.chart).toBeUndefined();
      expect(model.metrics).toEqual([]);
      expect(model.formulas).toEqual([]);
      expect(model.problems.length).toBeGreaterThan(0);
    },
  );
  it('undertrykker ugyldige monetære decimaler eller usikre heltal fra figuren', () => {
    for (const invalid of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const analysis = fixture();
      analysis.chart!.rows[0].actual = invalid;
      expect(buildAnalysisBasis(analysis).chart).toBeUndefined();
    }
  });
  it('bruger ikke dublerede kilde-ID’er som entydigt økonomisk belæg', () => {
    const analysis = fixture();
    analysis.sources.push({ ...source });
    const model = buildAnalysisBasis(analysis);
    expect(model.chart).toBeUndefined();
    expect(model.formulas).toEqual([]);
    expect(model.problems.join(' ')).toMatch(/tvetydige/);
  });
  it('bevarer manglende data som forklaring og viser ikke gamle nøgletal eller en gammel figur', () => {
    const analysis = fixture();
    analysis.missingData = 'Perioden er ikke dækket.';
    const model = buildAnalysisBasis(analysis);
    expect(model.missing).toBe(analysis.missingData);
    expect(model.formulas).toEqual([]);
    expect(model.metrics).toEqual([]);
    expect(model.chart).toBeUndefined();
  });
  it('viser dokumentgrundlag uden at opfinde en økonomisk beregning', () => {
    const analysis = fixture();
    analysis.context.intent = 'documents';
    analysis.metrics = [];
    analysis.chart = undefined;
    analysis.sources = [{ ...source, documentId: 'DEMO-DOC-1', title: 'Simuleret strategi' }];
    const model = buildAnalysisBasis(analysis);
    expect(model.family).toBe('documents');
    expect(model.formulas).toEqual([]);
    expect(model.sources[0].kind).toBe('Dokument');
  });
});

describe('panelets præsentationskontrakt', () => {
  it('åbner den originale finansielle kilde med den oprindelige citationsplacering', () => {
    const analysis = fixture();
    analysis.sources = [nameSource, source];
    const onSource = vi.fn();
    const tree = AnalysisBasis({ analysis, entities: [entity], onSource });
    const citation = nodes(tree).find(
      (node) =>
        node.type === 'button' &&
        String(node.props['aria-label']).startsWith('Åbn beregningskilde 2'),
    )!;
    (citation.props.onClick as () => void)();
    expect(onSource).toHaveBeenCalledExactlyOnceWith(source);
    const graph = nodes(tree).find((node) => node.type === AnalysisChart)!;
    expect(graph.props.chart).toBe(analysis.chart);
    expect(graph.props.version).toBe(version);
    expect(graph.props).not.toHaveProperty('onExplain');
  });
  it('viser en grafisk datavej og dansk pengeformat uden lokal databadge eller modelreasoning', () => {
    const analysis = fixture();
    analysis.renderedText = 'MODELREASONING_MUST_NOT_APPEAR';
    const html = renderToStaticMarkup(
      createElement(AnalysisBasis, { analysis, entities: [entity], onSource: () => undefined }),
    );
    expect(html).toContain('Beregningens fire trin');
    expect(html).toContain('123,45 kr.');
    expect(html).toContain('23,45 kr.');
    expect(html).toContain(entity.name);
    expect(html).toContain(version);
    expect(html).not.toContain('MODELREASONING_MUST_NOT_APPEAR');
    expect(html).not.toContain('data-status-badge');
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain('<summary>Høng Skole');
  });
  it('formaterer præcise øre og normaliserede enheder uden en ekstra division', () => {
    expect(formatBasisValue({ value: -12345, unit: 'ore' })).toBe('-123,45 kr.');
    expect(formatBasisValue({ value: 12345, unit: 'perPupil' })).toBe('123,45 kr./elev');
    expect(formatBasisValue({ value: 0, unit: 'number' })).toBe('0');
    expect(formatBasisValue({ value: 3.75, unit: 'number' })).toBe('3,75');
  });
});
