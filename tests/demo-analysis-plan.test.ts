import { describe, expect, it } from 'vitest';
import {
  resolveDemoAnalysis,
  DemoAnalysisPlanError,
  type DemoAnalysisInput,
} from '../src/domain/demo-analysis-plan';
import { analyze, parseQuestion } from '../src/domain/analysis';
import { entityRegistry, type Dataset } from '../src/domain/data';
import { buildIllustration } from '../src/domain/illustrations';
import { describeAnalysisEditor, recalculateAnalysisEditor } from '../src/domain/analysis-editor';
import { demonstrationQuestions } from '../src/domain/questions';
import { AccessDeniedError } from '../src/domain/policy';
import { DEFAULT_SCENARIO, type AccessContext, type AnalysisContext } from '../src/domain/types';

const user: AccessContext = {
  userId: 'demo-plan-fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  unitIds: ['*'],
  areas: [
    'schools',
    'health',
    'environment',
    'administration',
    'facilities',
    'social',
    'preparedness',
  ],
};
const version = 'KAIA-DEMO-PLAN-FIXTURE-v1';
function shell(patch: Partial<Dataset> = {}): Dataset {
  return {
    version,
    seed: 'fixed-plan-seed',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2020, toYear: 2032 },
    entities: entityRegistry(),
    get rows(): Dataset['rows'] {
      throw new Error('The resolver and illustrations must not read ledger rows.');
    },
    get documents(): Dataset['documents'] {
      throw new Error('The resolver and illustrations must not read documents.');
    },
    get demography(): Dataset['demography'] {
      throw new Error('No demographic facts may be manufactured.');
    },
    ...patch,
  };
}
const selected: AnalysisContext = {
  area: 'schools',
  entityIds: ['school-hoeng', 'school-sveboelle'],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
  metric: 'net',
  intent: 'budget',
};
function plan(question: string, patch: Partial<DemoAnalysisInput> = {}) {
  return resolveDemoAnalysis({
    question,
    user,
    dataset: shell(),
    inputContext: selected,
    ...patch,
  });
}
function illustrate(question: string, patch: Partial<DemoAnalysisInput> = {}) {
  const result = plan(question, patch);
  if (result.outcome !== 'illustration') throw new Error(`Expected illustration for ${question}`);
  return {
    plan: result,
    analysis: buildIllustration(
      question,
      patch.user || user,
      result.context,
      result.spec,
      patch.dataset || shell(),
    ),
  };
}
const aiQuestion =
  'Lav et regneeksempel for AI med 100 medarbejdere, 15 minutter om ugen, 46 arbejdsuger og en timeværdi på 350 kr.';
const prior = () => illustrate(aiQuestion).analysis;

describe('Demoens begrænsede valg og eksisterende analysekontrakt', () => {
  it('bevarer alle forberedte økonomispørgsmål på den eksisterende motor', () => {
    for (const question of demonstrationQuestions) {
      if (question.includes('individuel social')) continue;
      const result = plan(question, { inputContext: undefined });
      expect(result.outcome, question).toBe('analysis');
      expect(result.context).toEqual(parseQuestion(question, user, shell()));
    }
  });
  it.each([
    'budget',
    'forecast',
    'comparison',
    'energy',
    'trend',
    'category',
    'heatmap',
    'yearComparison',
    'municipalBenchmark',
    'projection',
    'scenario',
  ])('returnerer currentContext klonet og helt uændret for kendt %s', (intent) => {
    const currentContext: AnalysisContext = {
      ...selected,
      intent,
      metric: 'perPupil',
      period: { year: 2025, fromMonth: 4, toMonth: 6 },
      ...(intent === 'scenario' ? { scenario: { ...DEFAULT_SCENARIO, energyPercent: 15 } } : {}),
      ...(intent === 'yearComparison' ? { comparison: { kind: 'year', year: 2024 } } : {}),
      ...(intent === 'municipalBenchmark'
        ? { comparison: { kind: 'municipality', municipalityId: 'municipality-holbaek' } }
        : {}),
      ...(intent === 'projection' ? { projectionEndYear: 2030 } : {}),
    };
    const before = structuredClone(currentContext);
    const result = plan('Vis budgetstatus.', { currentContext });
    expect(result.outcome).toBe('analysis');
    expect(result.context).toEqual(before);
    expect(result.context).not.toBe(currentContext);
    expect(result.context.period).not.toBe(currentContext.period);
    expect(currentContext).toEqual(before);
  });

  it('bevarer et kendt lønscenarie, selv om medarbejdere nævnes i spørgsmålet', () => {
    const question =
      'Hvad sker der, hvis lønomkostningerne stiger 3 procent for medarbejderne på skoleområdet?';
    const result = plan(question);
    expect(result.outcome).toBe('analysis');
    expect(result.context).toEqual(parseQuestion(question, user, shell(), undefined, selected));
    expect(result.context.scenario?.salaryPercent).toBe(3);
  });
  it('opsnapper ikke et eksplicit budgetskift efter en illustration', () => {
    const previous = prior();
    for (const question of [
      'Vis skoleområdets budget i stedet.',
      'Forklar antagelserne bag budgetprognosen.',
    ]) {
      const result = plan(question, { previous });
      expect(result.outcome, question).toBe('analysis');
      expect(result.context.intent).not.toBe('illustration');
    }
  });
  it('bevarer ukendte ikke-kommunale spørgsmål som missing i stedet for at opfinde et emne', () => {
    const question = 'Vis min yndlingsfarve.';
    expect(plan(question)).toMatchObject({ outcome: 'analysis', context: { intent: 'missing' } });
    expect(
      analyze(question, user, undefined, undefined, shell({ rows: [], documents: [] })).missingData,
    ).toBeTruthy();
  });
});

describe('Brugbare temaer uden API eller opfundne lokale fakta', () => {
  it.each([
    ['Hvordan kan AI frigive tid på skolerne?', 'ai'],
    ['Hvordan kan vi forbedre hjemmeplejen?', 'care'],
    ['Hvordan kan vi styrke elevernes trivsel?', 'wellbeing'],
    ['Hvordan kan vi sænke ventetiden i hjemmeplejen?', 'waiting'],
    ['Hvilke muligheder har vi for at spare på skoleområdet?', 'savings'],
    ['Hvilke sociale indsatser bør vi prioritere?', 'savings'],
    ['Hvordan kan vi forbedre kommunens service?', 'generic'],
    ['Hvilke udfordringer står sundhedsområdet overfor?', 'generic'],
    ['Hvilke udfordringer står miljøområdet overfor?', 'generic'],
  ])('giver et tematisk kvalitativt forløb: %s', (question) => {
    const { plan: result, analysis } = illustrate(question, { inputContext: undefined });
    expect(result.spec.kind).toBe('process');
    expect(analysis.chart!.type).toBe('flow');
    expect(analysis.metrics).toEqual([]);
    expect(analysis.illustration!.calculation).toMatchObject({ kind: 'process' });
    expect(analysis.missingData).toBeUndefined();
    expect(
      analysis.sources.every(
        (source) => !source.rowIds && !source.documentId && source.datasetVersion === version,
      ),
    ).toBe(true);
    expect(analysis.sources.map((source) => source.origin)).toEqual(['assumption', 'calculation']);
    expect(describeAnalysisEditor(analysis, shell()).fields).toEqual([]);
  });
  it('bruger ikke skolernes nettototal som budgettet for et nyt AI-projekt', () => {
    const result = plan('Vis budgettet for et nyt AI-projekt.');
    expect(result.outcome).toBe('illustration');
    if (result.outcome !== 'illustration') throw new Error('Illustration required');
    expect(result.spec.kind).toBe('process');
  });
  it('opfinder ikke frigjort kapacitet ved ekstra tidsforbrug i en opfølgning', () => {
    const result = plan('Vis samme illustration med 20 minutter ekstra tidsforbrug i stedet.', {
      previous: prior(),
    });
    expect(result.outcome).toBe('illustration');
    if (result.outcome !== 'illustration') throw new Error('Illustration required');
    expect(result.spec.kind).toBe('process');
  });
  it('beregner et AI-eksempel eksakt og giver ikke 0%-scenarie eller påstået kontant gevinst', () => {
    const { plan: result, analysis } = illustrate(aiQuestion);
    expect(result.trigger).toBe('explicit-hypothesis');
    expect(result.spec).toMatchObject({ kind: 'investment', years: 5 });
    expect(analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 75_000_000,
      annualCostOre: 12_000_000,
      annualBenefitValueOre: 40_250_000,
      annualCashBenefitOre: 0,
      annualCapacityValueOre: 40_250_000,
    });
    if (analysis.illustration!.calculation.kind !== 'investment')
      throw new Error('Investment required');
    expect(analysis.illustration!.calculation.terms[2].quantityMilli).toBe(1_150_000);
    expect(analysis.scenario).toBeUndefined();
    expect(analysis.chart!.rows[0]).toMatchObject({
      benefit: 0,
      capacityValue: 40_250_000,
      net: -87_000_000,
    });
    expect(analysis.illustration!.spec.assumptions.join(' ')).toContain(
      'Forberedte demoforudsætninger v1',
    );
    expect(analysis.analysisId).toBe(illustrate(aiQuestion).analysis.analysisId);
    expect(describeAnalysisEditor(analysis, shell()).kind).toBe('investment');
  });
  it('afhjælper det falske nulscenarie for en ny investering med opstart og tid', () => {
    const question =
      'Hvad hvis vi investerer 750.000 kroner i AI og sparer 15 minutter om ugen for 100 medarbejdere?';
    const { analysis } = illustrate(question);
    expect(analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 75_000_000,
      annualBenefitValueOre: 40_250_000,
    });
    expect(analysis.scenario).toBeUndefined();
  });
  it('besvarer en ikke-registreret stillingsgruppe med separat cost-only eksempel og ingen nettototal', () => {
    const { plan: result, analysis } = illustrate('Vis lønudgifter til skolepsykologer');
    expect(result.trigger).toBe('unsupported-dimension');
    expect(analysis.illustration!.calculation).toMatchObject({
      kind: 'investment',
      upfrontCostOre: 0,
      annualCostOre: 60_000_000,
      annualBenefitValueOre: 0,
      annualCashBenefitOre: 0,
      annualCapacityValueOre: 0,
    });
    expect(analysis.chart!.rows).toHaveLength(1);
    expect(analysis.chart!.rows[0]).toMatchObject({ cost: 60_000_000, net: -60_000_000 });
    expect(analysis.illustration!.spec.assumptions.join(' ')).toContain(
      'ingen oplysninger om faktisk bemanding',
    );
    expect(analysis.sources.every((source) => !source.rowIds && !source.documentId)).toBe(true);
  });
  it('holder infrastrukturens totalpris adskilt fra en kilometerpris', () => {
    const unit = illustrate(
      'Hvad vil 5 kilometer cykelsti koste med en anlægspris på 2,5 mio. kr. pr. km?',
      { inputContext: undefined },
    );
    expect(unit.analysis.context.area).toBe('environment');
    expect(unit.analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 1_250_000_000,
    });
    const total = illustrate('Hvad vil 5 kilometer cykelsti koste med et anlæg på 10 mio. kr.?', {
      inputContext: undefined,
    });
    expect(total.analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 1_000_000_000,
    });
  });
  it('fremskriver et antaget aktivitetsniveau og bevarer fortegn ved fald', () => {
    const { analysis } = illustrate('Hvad hvis hjemmeplejens besøg falder 10 procent årligt?', {
      inputContext: undefined,
    });
    expect(analysis.illustration!.spec).toMatchObject({
      kind: 'activity',
      initialQuantityMilli: 1_000_000,
      annualChangeBps: -1000,
    });
    expect(analysis.chart!.rows.map((row) => row.value)).toEqual([1000, 900, 810, 729, 656.1]);
    const explicit = illustrate(
      'Illustrér 1.250 besøg med en årlig vækst på 2,5 procent over 3 år.',
      { inputContext: undefined },
    );
    expect(explicit.analysis.illustration!.spec).toMatchObject({
      kind: 'activity',
      initialQuantityMilli: 1_250_000,
      annualChangeBps: 250,
      years: 3,
      unit: 'besøg',
    });
  });
  it.each([
    'Hvad koster det hvis 100 medarbejdere bruger 15 minutter ekstra på AI hver uge?',
    'Hvad hvis AI ikke sparer 15 minutter om ugen for 100 medarbejdere?',
    'Lav et AI-regneeksempel med 15 og 20 minutter om ugen.',
    'Lav et AI-regneeksempel med 100 medarbejdere og 10 procent besparelse.',
  ])('opfinder ingen gevinst ved negativ eller tvetydig tidsbetydning: %s', (question) => {
    expect(illustrate(question).plan.spec.kind).toBe('process');
  });
});

describe('Entydige parametre, præcis repræsentation og ejede opfølgninger', () => {
  it('anvender danske decimaler og tusindtalsseparatorer uden float-afrunding', () => {
    const { analysis } = illustrate(
      'Lav et AI-regneeksempel med opstart 1,5 mio. kr., årlig drift 120.000,29 kr., 100 medarbejdere, 15 minutter, 46 arbejdsuger og en timeværdi på 350,29 kr.',
    );
    expect(analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 150_000_000,
      annualCostOre: 12_000_029,
    });
    const spec = analysis.illustration!.spec;
    if (spec.kind !== 'investment') throw new Error('Investment required');
    expect(spec.terms[2].unitValueOre).toBe(35029);
  });

  it('binder opstart og drift til nærmeste tal, bevarer talord og accepterer kroner uden mellemrum', () => {
    const first = illustrate(
      'Lav et AI-regneeksempel med drift på 120.000 kr. og opstart på 750.000 kr. over tre år.',
    ).analysis;
    expect(first.illustration!.spec).toMatchObject({ kind: 'investment', years: 3 });
    expect(first.illustration!.calculation).toMatchObject({
      upfrontCostOre: 75_000_000,
      annualCostOre: 12_000_000,
    });
    const compact = illustrate('Lav et AI-regneeksempel med en opstart på 500000kr.').analysis;
    expect(compact.illustration!.calculation).toMatchObject({ upfrontCostOre: 50_000_000 });
    const suffixed = illustrate(
      'Lav et AI-regneeksempel med 750.000 kr. i opstart og 120.000 kr. årligt over fem år.',
    ).analysis;
    expect(suffixed.illustration!.spec).toMatchObject({ kind: 'investment', years: 5 });
    expect(suffixed.illustration!.calculation).toMatchObject({
      upfrontCostOre: 75_000_000,
      annualCostOre: 12_000_000,
    });
  });
  it('gætter ikke på total versus pris pr. medarbejder ved eksplicit flerbemanding og beløb', () => {
    const { plan: result } = illustrate(
      'Hvad koster 2 skolepsykologer med en samlet årlig løn på 1 mio. kr.?',
    );
    expect(result.spec.kind).toBe('process');
  });
  it('bevarer alle øvrige antagelser ved 15→20 minutter og ændrer ikke basissnapshot', () => {
    const previous = prior(),
      original = structuredClone(previous);
    const question = 'Hvordan ser det ud med 20 minutter i stedet?';
    const { plan: result, analysis } = illustrate(question, { previous, inputContext: selected });
    expect(result.trigger).toBe('followup');
    expect(analysis.illustration!.calculation).toMatchObject({
      upfrontCostOre: 75_000_000,
      annualCostOre: 12_000_000,
      annualBenefitValueOre: 53_666_667,
      annualCashBenefitOre: 0,
    });
    if (analysis.illustration!.calculation.kind !== 'investment')
      throw new Error('Investment required');
    expect(analysis.illustration!.calculation.terms[2].quantityMilli).toBe(1_533_333);
    expect(previous).toEqual(original);
    expect(analysis.context).toEqual(previous.context);
    expect(analysis.illustration!.spec.assumptions.join(' ')).not.toContain('15 minutter');
    const editor = describeAnalysisEditor(analysis, shell());
    expect(editor.values['illustration.terms.2.quantityFactors.1.valueMilli']).toBe(20_000);
    const preview = recalculateAnalysisEditor(analysis, user, shell(), {
      'illustration.terms.2.quantityFactors.1.valueMilli': 10_000,
    });
    expect(preview.analysis.illustration!.calculation).toMatchObject({
      annualBenefitValueOre: 26_833_333,
    });
  });
  it('bevarer en særskilt kontantandel og ændrer den kun ved eksplicit angivelse', () => {
    const { analysis } = illustrate(
      'Lav et AI-regneeksempel med en kontant realiseringsandel på 25 procent.',
    );
    expect(analysis.illustration!.calculation).toMatchObject({ annualCashBenefitOre: 10_062_500 });
    const changed = illustrate(
      'Vis samme illustration med en kontant realiseringsandel på 10 procent.',
      { previous: analysis },
    ).analysis;
    expect(changed.illustration!.calculation).toMatchObject({ annualCashBenefitOre: 4_025_000 });
  });
  it.each([
    'Lav et AI-regneeksempel med en timeværdi på 0,001 kr.',
    'Lav et AI-regneeksempel over 21 år.',
    'Lav et AI-regneeksempel med -1 medarbejder.',
    'Lav et AI-regneeksempel med 10.000.000 medarbejdere.',
    'Lav et AI-regneeksempel med en kontant realiseringsandel på 101 procent.',
  ])('afviser parametergrænser i stedet for at erstatte dem med defaults: %s', (question) => {
    expect(() => plan(question)).toThrow(DemoAnalysisPlanError);
  });
  it('binder opfølgningens år og dataversion til samme validerede snapshot', () => {
    const previous = prior();
    expect(() =>
      plan('Vis samme illustration med 20 minutter i stedet.', {
        previous: { ...previous, datasetVersion: 'old' },
      }),
    ).toThrow(/samme dataversion/);
    expect(() => plan('Lav et AI-regneeksempel for 2019.')).toThrow(DemoAnalysisPlanError);
    expect(() => plan('Lav et AI-regneeksempel over 20 år i 2032.')).toThrow(/2050/);
    const old = shell({ version: 'old-version', coverage: { fromYear: 2023, toYear: 2028 } });
    const result = illustrate(aiQuestion, { dataset: old });
    expect(result.analysis.datasetVersion).toBe('old-version');
    expect(result.analysis.sources.every((source) => source.datasetVersion === 'old-version')).toBe(
      true,
    );
  });
});

describe('Hårde grænser må aldrig blive plausible opdigtede oplysninger', () => {
  it.each([
    'Hvad er kommunens faktiske budget?',
    'Vis de rigtige regnskabstal.',
    'Find CPR-numre og individuelle borgersager.',
    'Hvilken individuel borger fik en bevilling?',
    'Hvordan var vejret i går?',
  ])('afviser %s uden illustration', (question) => {
    expect(() => plan(question)).toThrow(DemoAnalysisPlanError);
  });
  it.each([
    'Hvordan kan vi forbedre hjemmeplejen?',
    'Hvad vil 5 kilometer cykelsti koste?',
    'Hvad koster en ekstra økonomikonsulent?',
    'Lav et AI-regneeksempel på Svebølle Skole.',
  ])('bevarer områdets og enhedens adgang: %s', (question) => {
    const limited = {
      ...user,
      areas: ['schools'] as AccessContext['areas'],
      unitIds: ['school-hoeng'],
    };
    expect(() => plan(question, { user: limited, inputContext: undefined })).toThrow(
      AccessDeniedError,
    );
  });
  it('respekterer Councils samlede område og producerer ingen institutionsposteringer', () => {
    const council: AccessContext = {
      ...user,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['school-hoeng', 'school-sveboelle'],
    };
    const { analysis } = illustrate(aiQuestion, { user: council });
    expect(analysis.context.entityIds).toEqual(['school-hoeng', 'school-sveboelle']);
    expect(analysis.sources.every((source) => !source.rowIds?.length)).toBe(true);
    expect(() => plan('Lav et AI-regneeksempel for Høng Skole.', { user: council })).toThrow(
      AccessDeniedError,
    );
  });
  it('accepterer ikke et runtime-injiceret scope eller udvalg som driftsenhed', () => {
    const invalid = { ...selected, entityIds: ['committee-boern'] };
    expect(() => plan(aiQuestion, { currentContext: invalid })).toThrow(AccessDeniedError);
    expect(() =>
      plan(aiQuestion, {
        currentContext: { ...selected, entityIds: ['school-hoeng', 'school-hoeng'] },
      }),
    ).toThrow(AccessDeniedError);
    expect(() => plan(aiQuestion, { user: { ...user, roles: [] } })).toThrow(AccessDeniedError);
  });
});
