import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { entityRegistry, type Dataset } from '../src/domain/data';
import { buildIllustration } from '../src/domain/illustrations';
import type { AccessContext, AnalysisContext, IllustrationSpec } from '../src/domain/types';
import { AnalysisBasis } from '../src/components/analysis-basis';
import { buildAnalysisBasis, formatBasisValue } from '../src/components/analysis-basis-model';
import { analysisCsv } from '../src/server/export';

vi.mock('../src/components/chart', () => ({
  AnalysisChart: () => createElement('div', { 'data-chart-fixture': true }),
}));
const entity = entityRegistry().find((item) => item.id === 'school-hoeng')!;
const dataset: Dataset = {
  version: 'ILLUSTRATION-PRESENTATION-v1',
  seed: 'presentation-fixture',
  referenceDate: '2026-09-30',
  coverage: { fromYear: 2020, toYear: 2032 },
  entities: [entity],
  rows: [],
  documents: [],
  demography: [],
};
const user: AccessContext = {
  userId: 'presentation-fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: [entity.id],
};
const context: AnalysisContext = {
  area: 'schools',
  entityIds: [entity.id],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
};
const investment: IllustrationSpec = {
  kind: 'investment',
  title: 'Investering i et illustrativt forløb',
  years: 5,
  assumptions: ['Årlige beløb er konstante.'],
  terms: [
    {
      label: 'Opstart',
      kind: 'upfrontCost',
      quantityFactors: [{ label: 'Løsninger', valueMilli: 1000 }],
      divisor: 1,
      unitValueOre: 100000,
    },
    {
      label: 'Drift',
      kind: 'annualCost',
      quantityFactors: [{ label: 'Enheder', valueMilli: 2000 }],
      divisor: 1,
      unitValueOre: 5000,
    },
    {
      label: 'Frigjort tid',
      kind: 'annualBenefit',
      quantityFactors: [{ label: 'Timer', valueMilli: 10000 }],
      divisor: 1,
      unitValueOre: 5000,
      cashRealizationBps: 5000,
      quantityUnit: 'timer',
    },
  ],
};
const activity: IllustrationSpec = {
  kind: 'activity',
  title: 'Aktivitet i et tænkt forløb',
  years: 3,
  initialQuantityMilli: 1235,
  annualChangeBps: 100,
  unit: 'timer',
  assumptions: [],
};
const process: IllustrationSpec = {
  kind: 'process',
  title: 'Et muligt kommunalt forløb',
  assumptions: [],
  steps: [
    { label: 'Afklar behov', description: 'Beskriv udfordringen og afgræns opgaven.' },
    { label: 'Undersøg muligheder', description: 'Indhent et konkret grundlag.' },
    { label: 'Vurdér næste skridt', description: 'Afprøv en løsning og saml erfaringer.' },
  ],
};
const build = (spec: IllustrationSpec = investment) =>
  buildIllustration('Vis et illustrativt forløb.', user, context, spec, dataset);

describe('Illustrationens beregningspanel', () => {
  it('viser input og præcise serverresultater uden at rekonstruere et budget', () => {
    const analysis = build(),
      original = structuredClone(analysis);
    const model = buildAnalysisBasis(analysis, [entity]);
    expect(model.family).toBe('illustration-investment');
    expect(model.units).toEqual([]);
    expect(model.calculationPeriod).toBe('2026–2030 · 5 år');
    expect(model.sources.map((source) => source.kind)).toEqual([
      'Foreslåede antagelser',
      'Beregning fra antagelser',
    ]);
    expect(model.formulas[0]).toMatchObject({
      title: 'Opstart',
      expression: '1 × 1.000,00 kr.',
      result: { value: 100000, unit: 'ore' },
    });
    expect(model.formulas.at(-1)?.result).toMatchObject({ value: -25000, unit: 'ore' });
    expect(model.formulas.some((formula) => formula.title === 'Afvigelse fra budgettet')).toBe(
      false,
    );
    expect(model.problems).toEqual([]);
    expect(analysis).toEqual(original);
  });
  it('holder kontant realisering og kapacitetsværdi adskilt i den synlige formel', () => {
    const model = buildAnalysisBasis(build());
    const benefit = model.formulas.find((formula) => formula.title === 'Frigjort tid')!;
    expect(benefit.note).toContain('Kontant realisering: 250,00 kr.');
    expect(benefit.note).toContain('Øvrig kapacitetsværdi: 250,00 kr.');
    expect(benefit.values).toContainEqual({
      label: 'Beregnet mængde',
      value: 10,
      unit: 'number',
      displayUnit: 'timer',
    });
    expect(model.formulas.at(-1)?.note).toMatch(/Kapacitetsværdi indgår ikke/);
    const cash = model.formulas.find(
      (formula) => formula.title === 'Frigjort tid · kontant effekt',
    )!;
    expect(cash.expression).toContain('× 50 %');
    expect(cash.result?.value).toBe(25000);
    expect(cash.note).toContain('uafrundede produkt');
  });
  it('viser aktivitetsenhed og 0,001-præcision uden at miste faktorer ved formatering', () => {
    const analysis = build(activity),
      model = buildAnalysisBasis(analysis);
    expect(model.family).toBe('illustration-activity');
    expect(formatBasisValue(model.formulas[0].values[0])).toBe('1,235 timer');
    expect(model.formulas[0].expression).toContain('startmængde');
    expect(model.formulas[0].note).toContain('tidligere afrundede punkter genbruges ikke');
    expect(formatBasisValue(model.metrics[0])).toBe('1,235 timer');
  });
  it.each([
    'missing-payload',
    'wrong-kind',
    'missing-assumptions',
    'missing-calculation',
    'stale-version',
  ] as const)(
    'viser ikke en illustration som et bekræftet beregningsgrundlag ved %s',
    (problem) => {
      const analysis = build();
      if (problem === 'missing-payload') analysis.illustration = undefined;
      if (problem === 'wrong-kind')
        analysis.illustration!.calculation = { kind: 'process', stepCount: 3 };
      if (problem === 'missing-assumptions')
        analysis.sources = analysis.sources.filter((source) => source.origin !== 'assumption');
      if (problem === 'missing-calculation')
        analysis.sources = analysis.sources.filter((source) => source.origin !== 'calculation');
      if (problem === 'stale-version')
        analysis.sources.forEach((source) => {
          source.datasetVersion = 'OTHER';
        });
      const model = buildAnalysisBasis(analysis);
      expect(model.formulas).toEqual([]);
      expect(model.metrics).toEqual([]);
      expect(model.chart).toBeUndefined();
      expect(model.problems.length).toBeGreaterThan(0);
    },
  );
  it('kan ikke løfte illustrationskilder til en almindelig datasetbudgetberegning', () => {
    const analysis = build();
    analysis.basisKind = 'dataset';
    analysis.context.intent = 'budget';
    analysis.metrics = [
      {
        label: 'Periodiseret budget',
        value: 10000,
        unit: 'ore',
        sourceIds: [analysis.sources[1].id],
      },
      {
        label: 'Forbrug / prognose',
        value: 11000,
        unit: 'ore',
        sourceIds: [analysis.sources[1].id],
      },
    ];
    const model = buildAnalysisBasis(analysis);
    expect(model.metrics).toEqual([]);
    expect(model.formulas).toEqual([]);
    expect(model.chart).toBeUndefined();
  });
  it('viser processen uden målte nøgletal og uden at bruge sessionens måneder som måleperiode', () => {
    const analysis = build(process),
      model = buildAnalysisBasis(analysis);
    expect(model.family).toBe('illustration-process');
    expect(model.calculationPeriod).toBe('Ingen måleperiode · kvalitativt forløb');
    expect(model.metrics).toEqual([]);
    expect(model.formulas[0].values).toEqual([]);
    expect(model.formulas[0].result).toBeUndefined();
    expect(model.chart).toBe(analysis.chart);
    const html = renderToStaticMarkup(
      createElement(AnalysisBasis, { analysis, onSource: () => undefined }),
    );
    expect(html).toContain('Kvalitativt forløb');
    expect(html).toContain('Rækkefølge uden måltal');
    expect(html).not.toContain('Periodiseret budget');
    expect(html).not.toContain('data-status-badge');
    expect(html).not.toContain('valgte enheder');
  });
});

describe('Illustrationens vedvarende CSV-eksport', () => {
  it('bevarer forudsætninger, termformler og eksakte serverresultater med deres kilde-ID', () => {
    const analysis = build(),
      csv = analysisCsv(analysis);
    expect(csv).toContain('Illustration fra foreslåede antagelser');
    expect(csv).toContain('Antagelseskilde');
    expect(csv).toContain('Beregningskilde');
    expect(csv).toContain(analysis.sources[0].id);
    expect(csv).toContain('Forudsætninger, præcist format');
    expect(csv).toContain('Serverresultater, præcist format');
    expect(csv).toContain('Løsninger: 1000/1000');
    expect(csv).toContain('Årlige beløb er konstante.');
    expect(csv).toContain('Akkumuleret kontant netto (kr.)');
    expect(csv).toContain('"-250,00"');
  });
  it('eksporterer kvalitative trin som tekst og udelader tekniske ordensnumre som måltal', () => {
    const csv = analysisCsv(build(process));
    expect(csv).toContain('"Trin";"Beskrivelse"');
    expect(csv).toContain('Afklar behov');
    expect(csv).not.toContain('"order"');
    expect(csv).toContain('ingen måltal eller scores');
  });
  it('konverterer også investeringens ikke-plottede net-kolonne fra øre til danske kroner', () => {
    const analysis = build();
    analysis.chart!.rows[0].net = -87000000;
    const csv = analysisCsv(analysis);
    expect(csv).toContain('Årets kontante netto (kr.)');
    const dataLine = csv.split('\r\n').find((line) => line.startsWith('"2026";'))!;
    expect(dataLine).toContain('"-870000,00"');
    expect(dataLine).not.toContain('"-87000000"');
  });
  it('bevarer besøg som aktivitetsenhed uden at fortolke dem som øre', () => {
    const analysis = build({ ...activity, unit: 'besøg' });
    const csv = analysisCsv(analysis);
    expect(csv).toContain('Antaget niveau · besøg (besøg)');
    expect(csv.split('\r\n').find((line) => line.startsWith('"2026";'))).toBe('"2026";"1,235"');
  });
  it('bevarer aktivitetsenheden og neutraliserer også modelskrevne formler i tekstfelter', () => {
    const analysis = build(activity);
    analysis.title = '=HYPERLINK("https://invalid.example")';
    analysis.chart!.rows[0].label = '\t@SUM(1+1)';
    analysis.assumptions.push('+SUM(1+1)');
    const csv = analysisCsv(analysis);
    expect(csv).toContain('Antaget niveau · timer (timer)');
    expect(csv).toContain('"1,235"');
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).toContain('"\'\t@SUM');
    expect(csv).toContain('"\'+SUM');
  });
});
