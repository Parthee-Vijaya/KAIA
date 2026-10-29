import { describe, expect, it } from 'vitest';
import {
  AnalysisEditorError,
  describeAnalysisEditor,
  recalculateAnalysisEditor,
  type AnalysisEditorValues,
} from '../src/domain/analysis-editor';
import { analyzeResolvedContext } from '../src/domain/analysis';
import { CATEGORIES, entityRegistry, type Dataset } from '../src/domain/data';
import { buildIllustration } from '../src/domain/illustrations';
import { AccessDeniedError } from '../src/domain/policy';
import {
  DEFAULT_SCENARIO,
  type AccessContext,
  type Analysis,
  type AnalysisContext,
  type IllustrationSpec,
  type LedgerRow,
} from '../src/domain/types';

const version = 'KAIA-EDITOR-FIXTURE-v1';
const user: AccessContext = {
  userId: 'editor-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  unitIds: ['school-hoeng', 'school-sveboelle'],
  areas: ['schools'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
const context: AnalysisContext = {
  area: 'schools',
  entityIds: ['school-hoeng'],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
  metric: 'net',
};
function shell(patch: Partial<Dataset> = {}): Dataset {
  return {
    version,
    seed: 'editor-fixed-seed',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2020, toYear: 2032 },
    entities: entityRegistry(),
    get rows(): LedgerRow[] {
      throw new Error('Metadata and illustration must not read ledger facts.');
    },
    get documents(): Dataset['documents'] {
      throw new Error('Metadata and illustration must not read document facts.');
    },
    ...patch,
  };
}
const investment: IllustrationSpec = {
  kind: 'investment',
  title: '15 minutter og 750.000 kr. giver sikker besparelse',
  years: 5,
  assumptions: ['15 minutter er et dokumenteret mål; sikker besparelse på 750.000 kr.'],
  terms: [
    {
      label: '750.000 kr. i opstart',
      kind: 'upfrontCost',
      quantityFactors: [{ label: 'Antal', valueMilli: 1000 }],
      divisor: 1,
      unitValueOre: 75_000_000,
    },
    {
      label: 'Drift 120.000 kr.',
      kind: 'annualCost',
      quantityFactors: [{ label: 'Enheder', valueMilli: 1000 }],
      divisor: 1,
      unitValueOre: 12_000_000,
    },
    {
      label: 'Femten minutter sparet',
      kind: 'annualBenefit',
      quantityFactors: [
        { label: 'Medarbejdere', valueMilli: 100_000 },
        { label: '15 minutter', valueMilli: 15_000 },
        { label: 'Arbejdsuger', valueMilli: 46_000 },
      ],
      divisor: 60,
      unitValueOre: 35_000,
      cashRealizationBps: 2500,
      quantityUnit: 'timer',
    },
  ],
};
const activity: IllustrationSpec = {
  kind: 'activity',
  title: 'Gammel vækst 15 %',
  years: 3,
  initialQuantityMilli: 125_555,
  annualChangeBps: 1500,
  unit: 'besøg',
  assumptions: ['Der bliver altid 15 % flere besøg.'],
};
function illustrated(spec: IllustrationSpec = investment, selected = context) {
  return {
    ...buildIllustration('Illustrér en mulig investering.', user, selected, spec, shell()),
    analysisId: '00000000-0000-4000-8000-000000000001',
  };
}
function ledgerDataset(): Dataset {
  const rows: LedgerRow[] = [];
  for (const entityId of user.unitIds)
    for (const year of [2025, 2026, 2027])
      for (let month = 1; month <= 12; month++)
        for (const [index, category] of CATEGORIES.entries())
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
            const magnitude = category === 'energy' ? 1_373_625 : 30_001 + index * 17 + month;
            rows.push({
              id: `DEMO-L-${entityId}-${year}-${month}-${category}-${kind}`,
              datasetVersion: version,
              entityId,
              year,
              month,
              category,
              kind,
              amountOre:
                (category === 'income' ? -1 : 1) *
                magnitude *
                (entityId === 'school-hoeng' ? 1 : 3),
            });
          }
  return shell({ rows, documents: [] });
}
const dataset = ledgerDataset();
function scenario(
  period = context.period,
  assumptions = { ...DEFAULT_SCENARIO, energyPercent: 15 },
) {
  return {
    ...analyzeResolvedContext(
      'Vis baseline og scenarie i samme graf.',
      user,
      { ...context, period, intent: 'scenario', scenario: assumptions },
      dataset,
    ),
    analysisId: '00000000-0000-4000-8000-000000000002',
  };
}
const rebuild = (basis: Analysis, values: AnalysisEditorValues, access = user, source = shell()) =>
  recalculateAnalysisEditor(basis, access, source, values);

describe('Editorens afgrænsede metadata og provenance', () => {
  it('beskriver felter fra originalen uden at læse økonomiposter og uden gamle tal i labels', () => {
    const basis = illustrated();
    const editor = describeAnalysisEditor(basis, shell());
    expect(editor.kind).toBe('investment');
    expect(editor.basisAnalysisId).toBe(basis.analysisId);
    expect(editor.datasetVersion).toBe(version);
    expect(editor.values['illustration.terms.2.quantityFactors.1.valueMilli']).toBe(15_000);
    expect(editor.fields.find((field) => field.id.endsWith('unitValueOre'))).toMatchObject({
      scale: 100,
      displayUnit: 'kr.',
    });
    expect(editor.fields.find((field) => field.id.endsWith('cashRealizationBps'))).toMatchObject({
      scale: 100,
      min: 0,
      max: 10000,
    });
    expect(editor.fields.map((field) => field.label).join(' ')).not.toMatch(
      /750\.000|120\.000|15 minutter|Femten/,
    );
    expect(editor.fields.some((field) => field.label.includes('Medarbejdere'))).toBe(true);
    expect(editor.fields.some((field) => field.label.includes('Faktor 2'))).toBe(true);
    expect(
      editor.fields.find(
        (field) => field.id === 'illustration.terms.2.quantityFactors.0.valueMilli',
      )!.displayUnit,
    ).toBe('medarb.');
    expect(
      editor.fields.find(
        (field) => field.id === 'illustration.terms.2.quantityFactors.2.valueMilli',
      )!.displayUnit,
    ).toBe('uger');
    expect(
      editor.fields.find(
        (field) => field.id === 'illustration.terms.2.quantityFactors.1.valueMilli',
      )!.displayUnit,
    ).toBe('enheder');
    expect(
      editor.fields.some(
        (field) => field.id.includes('cashRealization') && !field.id.includes('terms.2.'),
      ),
    ).toBe(false);
  });

  it('har ingen kunstige talfelter for kvalitative forløb, dokumenter og manglende grundlag', () => {
    const qualitative: IllustrationSpec = {
      kind: 'process',
      title: 'Undersøg mulighederne',
      assumptions: [],
      steps: [
        { label: 'Afgræns', description: 'Beskriv det tilladte område.' },
        { label: 'Undersøg', description: 'Find et grundlag.' },
        { label: 'Vurder', description: 'Tag stilling til mulighederne.' },
      ],
    };
    const process = illustrated(qualitative);
    expect(describeAnalysisEditor(process, shell())).toMatchObject({
      kind: 'process',
      fields: [],
      values: {},
    });
    expect(() => rebuild(process, {})).toThrow(/ingen numeriske/);
    const budget = analyzeResolvedContext(
      'Vis budgetstatus.',
      user,
      { ...context, intent: 'budget' },
      dataset,
    );
    const documents = {
      ...budget,
      context: { ...budget.context, intent: 'documents' },
      metrics: [],
      chart: undefined,
    };
    expect(describeAnalysisEditor(documents, shell())).toMatchObject({
      kind: 'none',
      fields: [],
      values: {},
    });
    expect(() => rebuild(documents, {})).toThrow(/ingen numeriske/);
    expect(
      describeAnalysisEditor({ ...budget, missingData: 'Ufuldstændigt grundlag' }, shell()).fields,
    ).toEqual([]);
  });

  it('binder fingerprint og previewnøgle til original, dataversion og kanoniske værdier', () => {
    const basis = illustrated();
    const a = rebuild(basis, {
      'illustration.years': 4,
      'illustration.terms.0.unitValueOre': 76_000_000,
    });
    const b = rebuild(basis, {
      'illustration.terms.0.unitValueOre': 76_000_000,
      'illustration.years': 4,
    });
    expect(a.previewKey).toBe(b.previewKey);
    expect(a.analysis).toEqual(b.analysis);
    expect(a.editor.basisFingerprint).toBe(describeAnalysisEditor(basis, shell()).basisFingerprint);
    expect(rebuild({ ...basis, analysisId: 'another-owned-id' }, {}).previewKey).not.toBe(
      rebuild(basis, {}).previewKey,
    );
    expect(rebuild(basis, { 'illustration.years': 3 }).previewKey).not.toBe(a.previewKey);
    expect(
      describeAnalysisEditor(basis, shell({ referenceDate: '2026-10-31' })).basisFingerprint,
    ).not.toBe(a.editor.basisFingerprint);
  });
});

describe('Illustrationspreview fra typede værdier', () => {
  it('genberegner faktorer og kontantandel eksakt, uden at bruge afrundet visningsmængde', () => {
    const basis = illustrated();
    const original = structuredClone(basis);
    const result = rebuild(basis, { 'illustration.terms.2.quantityFactors.1.valueMilli': 20_000 });
    expect(result.analysis.illustration?.calculation).toMatchObject({
      kind: 'investment',
      annualBenefitValueOre: 53_666_667,
      annualCashBenefitOre: 13_416_667,
      annualCapacityValueOre: 40_250_000,
    });
    if (result.analysis.illustration?.calculation.kind !== 'investment')
      throw new Error('Investment required');
    expect(result.analysis.illustration.calculation.terms[2]).toMatchObject({
      quantityMilli: 1_533_333,
      quantityUnit: 'timer',
      amountOre: 53_666_667,
    });
    expect(result.analysis.chart?.rows[0]).toMatchObject({
      cost: 87_000_000,
      benefit: 13_416_667,
      net: -73_583_333,
      cumulative: -73_583_333,
    });
    expect(result.analysis.basisKind).toBe('illustration');
    expect(
      result.analysis.sources.every(
        (source) => source.datasetVersion === version && !source.rowIds?.length,
      ),
    ).toBe(true);
    expect(result.analysis.sources.map((source) => source.origin)).toEqual([
      'assumption',
      'calculation',
    ]);
    expect(basis).toEqual(original);
    expect(result.editor.values['illustration.terms.2.quantityFactors.1.valueMilli']).toBe(20_000);
  });

  it('erstatter modstridende modelprosa, numeriske og udskrevne talnavne med neutrale aktuelle antagelser', () => {
    const basis = illustrated();
    const result = rebuild(basis, { 'illustration.terms.2.quantityFactors.1.valueMilli': 20_000 });
    const spec = result.analysis.illustration!.spec;
    expect(spec.title).toBe('Opdateret investeringsillustration');
    expect(spec.assumptions.join(' ')).not.toMatch(
      /15 minutter|dokumenteret mål|sikker besparelse/,
    );
    if (spec.kind !== 'investment') throw new Error('Investment required');
    expect(spec.terms[2].label).toBe('Årlig gevinst · bidrag 3');
    expect(spec.terms[2].quantityFactors[1]).toEqual({ label: 'Faktor 2', valueMilli: 20000 });
    expect(spec.assumptions.join(' ')).toContain('Faktor 2 20');
    expect(basis.illustration!.spec.title).toContain('15 minutter');
    const written = structuredClone(basis);
    if (written.illustration!.spec.kind !== 'investment') throw new Error('Investment required');
    written.illustration!.spec.terms[2].quantityFactors[1].label = 'femten minutter';
    const edited = rebuild(written, {}).analysis.illustration!.spec;
    if (edited.kind !== 'investment') throw new Error('Investment required');
    expect(edited.terms[2].quantityFactors[1].label).toBe('Faktor 2');
  });

  it('bruger altid originalen, så successive patches ikke akkumulerer en tidligere previewændring', () => {
    const basis = illustrated();
    const first = rebuild(basis, { 'illustration.terms.0.unitValueOre': 1 });
    expect(first.analysis.illustration?.calculation).toMatchObject({ upfrontCostOre: 1 });
    const second = rebuild(basis, { 'illustration.years': 2 });
    expect(second.analysis.illustration?.calculation).toMatchObject({ upfrontCostOre: 75_000_000 });
    expect(second.analysis.chart!.rows).toHaveLength(2);
    const reset = rebuild(basis, describeAnalysisEditor(basis, shell()).values);
    expect(reset.analysis.illustration?.calculation).toEqual(
      basis.illustration?.calculation && {
        ...basis.illustration.calculation,
        ...(basis.illustration.calculation.kind === 'investment'
          ? {
              terms: basis.illustration.calculation.terms.map((term, i) => ({
                ...term,
                label:
                  ['Engangsomkostning', 'Årlig drift', 'Årlig gevinst'][i] + ` · bidrag ${i + 1}`,
              })),
            }
          : {}),
      },
    );
    expect(reset.analysis.chart!.rows).toEqual(basis.chart!.rows);
  });

  it('genberegner aktivitet fra startniveau, direkte årlig vækst og valgt tidshorisont', () => {
    const basis = illustrated(activity);
    const result = rebuild(basis, {
      'illustration.initialQuantityMilli': 100_005,
      'illustration.annualChangeBps': -5000,
      'illustration.years': 4,
    });
    expect(result.analysis.illustration?.calculation).toEqual({
      kind: 'activity',
      points: [
        { year: 2026, quantityMilli: 100005 },
        { year: 2027, quantityMilli: 50003 },
        { year: 2028, quantityMilli: 25001 },
        { year: 2029, quantityMilli: 12501 },
      ],
    });
    expect(result.analysis.chart!.rows.map((row) => row.value)).toEqual([
      100.005, 50.003, 25.001, 12.501,
    ]);
    expect(result.analysis.illustration?.spec.assumptions.join(' ')).not.toMatch(/15 % flere/);
    expect(result.analysis.context).toEqual({ ...context, intent: 'illustration' });
    const zero = rebuild(basis, { 'illustration.initialQuantityMilli': 0 });
    expect(zero.analysis.chart!.rows.every((row) => row.value === 0)).toBe(true);
  });

  it('begrænser år til 2050 og afslører overflows uden tavs afrunding eller falsk nul', () => {
    const basis = illustrated(activity, {
      ...context,
      period: { year: 2032, fromMonth: 1, toMonth: 12 },
    });
    expect(describeAnalysisEditor(basis, shell()).fields[0].max).toBe(19);
    expect(() => rebuild(basis, { 'illustration.years': 20 })).toThrow(AnalysisEditorError);
    expect(rebuild(basis, { 'illustration.years': 19 }).analysis.chart!.rows.at(-1)!.label).toBe(
      '2050',
    );
    expect(() =>
      rebuild(illustrated(), {
        'illustration.terms.2.unitValueOre': 10_000_000_000,
        'illustration.terms.2.quantityFactors.0.valueMilli': 1_000_000_000,
        'illustration.terms.2.quantityFactors.1.valueMilli': 1_000_000_000,
        'illustration.terms.2.quantityFactors.2.valueMilli': 1_000_000_000,
      }),
    ).toThrow(/præcise talrepræsentation/);
  });
});

describe('Scenariepreview bruger samme økonomiske baseline og påvirkede konti', () => {
  it.each([
    'budget',
    'forecast',
    'comparison',
    'trend',
    'category',
    'heatmap',
    'yearComparison',
    'municipalBenchmark',
    'projection',
  ])(
    'etablerer nulscenarie fra %s med samme scope, periode og en adskilt helårsbaseline',
    (intent) => {
      const budget = analyzeResolvedContext(
        'Vis budgetstatus.',
        user,
        { ...context, intent: 'budget' },
        dataset,
      );
      // Existing numeric analysis snapshots retain their own reference context; the editor creates no planner request.
      const basis = { ...budget, context: { ...budget.context, intent } };
      const editor = describeAnalysisEditor(basis, shell());
      expect(editor.kind).toBe('scenario');
      expect(editor.values).toEqual({
        'scenario.energyPercent': 0,
        'scenario.salaryPercent': 0,
        'scenario.substitutePercent': 0,
        'scenario.pupilsPercent': 0,
        'scenario.budgetPercent': 0,
        'scenario.maintenancePercent': 0,
        'scenario.horizon': 'remaining',
      });
      const result = rebuild(basis, { 'scenario.energyPercent': 10 }, user, dataset).analysis;
      expect(result.context).toMatchObject({ ...context, intent: 'scenario' });
      expect(result.scenario!.deltaOre).toBe(137363 * 3);
      expect(result.chart!.rows).toHaveLength(12);
      expect(result.chart!.subtitle).toContain('Januar–december 2026');
      expect(result.sources[0].datasetVersion).toBe(budget.datasetVersion);
    },
  );

  it('vælger illustrativ annual fra en historisk budgetanalyse, aldrig en skjult historisk ændring', () => {
    const basis = analyzeResolvedContext(
      'Vis budgetstatus.',
      user,
      { ...context, period: { year: 2025, fromMonth: 4, toMonth: 6 }, intent: 'budget' },
      dataset,
    );
    expect(describeAnalysisEditor(basis, shell()).values['scenario.horizon']).toBe('annual');
    const result = rebuild(basis, { 'scenario.energyPercent': 10 }, user, dataset).analysis;
    expect(result.scenario!.deltaOre).toBe(137363 * 12);
    expect(result.chart!.subtitle).toContain('illustrativ helårsvirkning');
    expect(result.context.period).toEqual(basis.context.period);
  });
  it('ændrer kun relevante resterende poster, med præcis negativ halvtie-afrunding', () => {
    const basis = scenario();
    const original = structuredClone(basis);
    const result = rebuild(basis, { 'scenario.energyPercent': -23.6 }, user, dataset);
    expect(result.analysis.scenario?.deltaOre).toBe(-324175 * 3);
    expect(result.analysis.scenario?.baselineOre).toBe(basis.scenario?.baselineOre);
    expect(result.analysis.context.period).toEqual(context.period);
    expect(
      result.analysis.chart!.rows.slice(0, 9).every((row) => row.scenario === row.baseline),
    ).toBe(true);
    expect(
      result.analysis
        .chart!.rows.slice(9)
        .every((row) => Number(row.scenario) - Number(row.baseline) === -324175),
    ).toBe(true);
    expect(
      result.analysis.sources
        .flatMap((source) => source.rowIds || [])
        .every((id) => id.includes('school-hoeng')),
    ).toBe(true);
    expect(basis).toEqual(original);
  });

  it('kombinerer separate konti uden dobbelt effekt og adskiller budget fra forbrug', () => {
    const basis = scenario();
    const energy = rebuild(basis, { 'scenario.energyPercent': 10 }, user, dataset).analysis;
    const salary = rebuild(
      basis,
      { 'scenario.energyPercent': 0, 'scenario.salaryPercent': 20 },
      user,
      dataset,
    ).analysis;
    const combined = rebuild(
      basis,
      { 'scenario.energyPercent': 10, 'scenario.salaryPercent': 20, 'scenario.budgetPercent': -10 },
      user,
      dataset,
    ).analysis;
    expect(combined.scenario!.deltaOre).toBe(energy.scenario!.deltaOre + salary.scenario!.deltaOre);
    expect(
      combined.metrics.find((metric) => metric.label === 'Ny budgetramme')!.value,
    ).toBeLessThan(energy.metrics.find((metric) => metric.label === 'Ny budgetramme')!.value);
    const noBudget = rebuild(
      basis,
      { 'scenario.energyPercent': 10, 'scenario.salaryPercent': 20 },
      user,
      dataset,
    ).analysis;
    expect(combined.scenario!.baselineOre).toBe(noBudget.scenario!.baselineOre);
    expect(combined.scenario!.scenarioOre).toBe(noBudget.scenario!.scenarioOre);
    expect(combined.scenario!.deltaOre).toBe(noBudget.scenario!.deltaOre);
  });

  it('bevarer historisk helårsvirkning og afviser remaining når ingen måneder er fremtidige', () => {
    const basis = scenario(
      { year: 2025, fromMonth: 4, toMonth: 6 },
      { ...DEFAULT_SCENARIO, energyPercent: 10, horizon: 'annual' },
    );
    const editor = describeAnalysisEditor(basis, shell());
    expect(editor.fields.find((field) => field.id === 'scenario.horizon')!.options).toContainEqual({
      value: 'remaining',
      label: 'Resterende prognosemåneder',
      disabled: true,
    });
    expect(rebuild(basis, {}, user, dataset).analysis.scenario?.deltaOre).toBe(137363 * 12);
    expect(() => rebuild(basis, { 'scenario.horizon': 'remaining' }, user, dataset)).toThrow(
      /Virkningsperioden/,
    );
    const closedReference = shell({
      rows: dataset.rows,
      documents: [],
      referenceDate: '2026-12-31',
    });
    expect(() => rebuild(scenario(), {}, user, closedReference)).toThrow(
      /ingen resterende prognosemåneder/,
    );
  });

  it('anvender alle tolv måneder i et fremtidigt år, selv når den valgte visningsperiode er kort', () => {
    const basis = scenario({ year: 2027, fromMonth: 4, toMonth: 6 });
    const result = rebuild(basis, { 'scenario.energyPercent': 10 }, user, dataset).analysis;
    expect(result.scenario?.deltaOre).toBe(137363 * 12);
    expect(result.chart!.rows).toHaveLength(12);
    expect(result.context.period).toEqual(basis.context.period);
  });

  it('bruger elevaktivitetens 28 % variable andel, ikke samtlige skoleudgifter', () => {
    const basis = scenario();
    const result = rebuild(
      basis,
      { 'scenario.energyPercent': 0, 'scenario.pupilsPercent': 50 },
      user,
      dataset,
    ).analysis;
    const activityRows = dataset.rows.filter(
      (row) =>
        row.entityId === 'school-hoeng' &&
        row.year === 2026 &&
        row.month > 9 &&
        row.kind === 'forecast' &&
        row.category === 'activity',
    );
    const expected = activityRows.reduce(
      (sum, row) => sum + Math.floor((row.amountOre * 14 + 50) / 100),
      0,
    );
    expect(result.scenario!.deltaOre).toBe(expected);
    expect(result.scenario!.deltaOre).toBeLessThan(result.scenario!.baselineOre * 0.01);
  });
});

describe('Editorens afvisninger, scope og datakvalitet', () => {
  it.each([
    ['scope', { 'context.entityIds': 1 }],
    ['unit', { 'illustration.unit': 1 }],
    ['label', { 'illustration.terms.0.label': 1 }],
    ['divisor', { 'illustration.terms.0.divisor': 60 }],
    ['version', { datasetVersion: 1 }],
    ['field index', { 'illustration.terms.99.unitValueOre': 1 }],
    ['mixed natural field', { 'illustration.terms.0.unitValueDkk': 1 }],
    ['fractional ore', { 'illustration.terms.0.unitValueOre': 1.2 }],
    ['fractional milli', { 'illustration.terms.0.quantityFactors.0.valueMilli': 1.2 }],
    ['nonfinite', { 'illustration.years': NaN }],
    ['infinity', { 'illustration.years': Infinity }],
    ['negative', { 'illustration.terms.0.unitValueOre': -1 }],
    ['cash fraction', { 'illustration.terms.2.cashRealizationBps': 0.5 }],
    ['unsafe bound', { 'illustration.terms.0.unitValueOre': Number.MAX_SAFE_INTEGER }],
  ])('afviser %s frem for at acceptere klientens struktur', (_name, values) => {
    expect(() => rebuild(illustrated(), values as AnalysisEditorValues)).toThrow(
      AnalysisEditorError,
    );
  });

  it('afviser forkert primitive, oversize maps og prototypenøgler', () => {
    expect(() =>
      rebuild(illustrated(), { 'illustration.years': '5' } as unknown as AnalysisEditorValues),
    ).toThrow(AnalysisEditorError);
    expect(() => rebuild(illustrated(), JSON.parse('{"__proto__":1}'))).toThrow(
      AnalysisEditorError,
    );
    expect(() =>
      rebuild(
        illustrated(),
        Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`field${i}`, 1])),
      ),
    ).toThrow(AnalysisEditorError);
    expect(() => rebuild(illustrated(), [] as unknown as AnalysisEditorValues)).toThrow(
      AnalysisEditorError,
    );
  });

  it('genkontrollerer dataversion og nuværende adgang, selv for en tidligere autoriseret analyse', () => {
    const basis = illustrated();
    expect(() => rebuild(basis, {}, user, shell({ version: 'new-version' }))).toThrow(
      /samme dataversion/,
    );
    expect(() => rebuild(basis, {}, { ...user, unitIds: ['school-sveboelle'] })).toThrow(
      AccessDeniedError,
    );
    expect(() => rebuild(basis, {}, { ...user, areas: ['facilities'] })).toThrow(AccessDeniedError);
    expect(() => rebuild(basis, {}, { ...user, roles: [] })).toThrow(AccessDeniedError);
    const invalid = {
      ...basis,
      context: { ...basis.context, entityIds: ['school-hoeng', 'school-hoeng'] },
    };
    expect(() => rebuild(invalid, {})).toThrow(/entydige/);
  });

  it('tillader kun aggregeret område for Council og sender ikke andre skolers poster til individanalysen', () => {
    const council = { ...user, roles: ['KAIA.Council'] as AccessContext['roles'] };
    expect(() => rebuild(illustrated(), {}, council)).toThrow(AccessDeniedError);
    expect(() => rebuild(scenario(), {}, council, dataset)).toThrow(AccessDeniedError);
    const aggregate = illustrated(activity, { ...context, entityIds: [...user.unitIds] });
    expect(rebuild(aggregate, {}, council).analysis.context.entityIds).toEqual(
      [...user.unitIds].sort(),
    );
    const aggregateScenario = analyzeResolvedContext(
      'Vis baseline og scenarie i samme graf.',
      user,
      {
        ...context,
        entityIds: [...user.unitIds],
        intent: 'scenario',
        scenario: { ...DEFAULT_SCENARIO },
      },
      dataset,
    );
    const result = rebuild(
      aggregateScenario,
      { 'scenario.energyPercent': 10 },
      council,
      dataset,
    ).analysis;
    expect(result.sources.every((source) => !source.rowIds?.length)).toBe(true);
  });

  it('erstatter aldrig manglende, blandede eller duplikerede helårsposter med nul', () => {
    const basis = scenario();
    const badRows = dataset.rows.filter(
      (row) =>
        !(
          row.entityId === 'school-hoeng' &&
          row.year === 2026 &&
          row.month === 12 &&
          row.category === 'maintenance' &&
          row.kind === 'forecast'
        ),
    );
    expect(() => rebuild(basis, {}, user, shell({ rows: badRows, documents: [] }))).toThrow(
      /komplette/,
    );
    expect(() => rebuild(basis, {}, user, shell({ rows: [], documents: [] }))).toThrow(/komplette/);
    const one = dataset.rows.find((row) => row.entityId === 'school-hoeng' && row.year === 2026)!;
    expect(() =>
      rebuild(
        basis,
        {},
        user,
        shell({ rows: [...dataset.rows, { ...one, datasetVersion: 'wrong' }], documents: [] }),
      ),
    ).toThrow(/dataversioner/);
    expect(() =>
      rebuild(basis, {}, user, shell({ rows: [...dataset.rows, one], documents: [] })),
    ).toThrow(/entydige/);
    expect(() =>
      rebuild(
        basis,
        {},
        user,
        shell({
          rows: dataset.rows.map((row) => (row === one ? { ...row, amountOre: 0.5 } : row)),
          documents: [],
        }),
      ),
    ).toThrow(/heltal i øre/);
  });

  it.each(['salaryPercent', 'budgetPercent'] as const)(
    'anvender eksisterende snævre bounds for %s',
    (key) => {
      expect(() => rebuild(scenario(), { [`scenario.${key}`]: -51 }, user, dataset)).toThrow(
        AnalysisEditorError,
      );
      expect(() => rebuild(scenario(), { [`scenario.${key}`]: 101 }, user, dataset)).toThrow(
        AnalysisEditorError,
      );
    },
  );
});
