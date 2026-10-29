import { describe, expect, it } from 'vitest';
import type { Analysis } from '../src/domain/types';
import {
  buildAdjustmentEvidence,
  prepareAdjustmentEvidence,
} from '../src/server/adjustment-evidence';

function scenario(amount: number, percent: number): Analysis {
  return {
    analysisId: 'a36f201a-bee1-43bf-8cc9-bbad1b4f1b1c',
    datasetVersion: 'ADJUST-FIXTURE',
    question: 'Undersøg energi',
    title: 'Energiscenarie',
    conclusion: `Et beregnet beløb. [1]`,
    narrative: ['Perioden er januar–september2026. [1]'],
    context: {
      area: 'schools',
      entityIds: ['school-hoeng'],
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
      intent: 'scenario',
    },
    metrics: [{ label: 'Scenarie', value: amount, unit: 'ore', sourceIds: ['DEMO-CALC-SAME'] }],
    chart: {
      type: 'line',
      title: 'Baseline og scenarie',
      subtitle: '2026 · kr.',
      unit: 'ore',
      sourceIds: ['DEMO-CALC-SAME'],
      rows: [{ label: '2026', baseline: 100_00, scenario: amount }],
      series: [{ key: 'scenario', label: 'Scenarie', color: '#bc4d30' }],
    },
    sources: [
      {
        id: 'DEMO-CALC-SAME',
        title: 'Simuleret beregning',
        type: 'demo',
        status: 'simulated',
        datasetVersion: 'ADJUST-FIXTURE',
        period: '2026',
        excerpt: `Scenarie${percent}% giver${amount}øre.`,
      },
    ],
    assumptions: [],
    followups: [],
    scenario: {
      assumptions: {
        energyPercent: percent,
        salaryPercent: 0,
        substitutePercent: 0,
        pupilsPercent: 0,
        budgetPercent: 0,
        maintenancePercent: 0,
        horizon: 'remaining',
      },
      baselineOre: 100_00,
      scenarioOre: amount,
      deltaOre: amount - 100_00,
    },
  };
}

describe('entydigt serverformateret basis- og previewgrundlag', () => {
  it('bevarer to forskellige beregninger med samme oprindelige kilde-ID', () => {
    const basis = scenario(115_00, 15),
      current = scenario(125_00, 25);
    const before = structuredClone(basis),
      after = structuredClone(current);
    const result = prepareAdjustmentEvidence(basis, current);
    expect(result.analysis.sources).toHaveLength(2);
    expect(result.analysis.sources[0].excerpt).toContain('12500');
    expect(result.analysis.sources[1].excerpt).toContain('11500');
    expect(result.analysis.sources[1].id).not.toBe(result.analysis.sources[0].id);
    const old = result.evidence.selectedBasis;
    expect(old.metrics[0].value.formatted).toBe('115,00 kr.');
    expect(result.evidence.current.metrics[0].value.formatted).toBe('125,00 kr.');
    expect(old.scenario?.assumptions.energyPercent).toBe(15);
    expect(result.evidence.current.scenario?.assumptions.energyPercent).toBe(25);
    expect(old.metrics[0].sourceIds).toEqual([result.analysis.sources[1].id]);
    expect(old.chart?.sourceIds).toEqual([result.analysis.sources[1].id]);
    expect(old.citations[0].citation).toBe('[2]');
    expect(old.conclusion).toContain('[2]');
    expect(old.narrative[0]).toContain('[2]');
    expect(result.evidence.current.citations.map((ref) => ref.citation)).toEqual(['[1]', '[2]']);
    expect(basis).toEqual(before);
    expect(current).toEqual(after);
  });
  it('bruger præcis den valgte basis og sender aldrig dens gamle modeltekst', () => {
    const basis = { ...scenario(115_00, 15), renderedText: 'Ubetroet gammel modeltekst.' };
    const result = buildAdjustmentEvidence(basis, scenario(125_00, 25));
    expect(result.selectedBasis.analysisId).toBe(basis.analysisId);
    expect(result.meaning).toContain('valgte uændrede');
    expect(JSON.stringify(result)).not.toContain(basis.renderedText);
  });
  it('markerer ændret normalisering, så kr.pr.elev ikke direkte sidestilles med nettototaler', () => {
    const basis = scenario(115_00, 15);
    basis.context.metric = 'perPupil';
    expect(buildAdjustmentEvidence(basis, scenario(125_00, 25)).sameMetric).toBe(false);
  });
  it('skelner YTD-budgettal fra scenariets helårsbaseline trods samme contextperiod', () => {
    const basis = scenario(115_00, 15);
    delete basis.scenario;
    basis.context.intent = 'budget';
    const result = buildAdjustmentEvidence(basis, scenario(125_00, 25));
    expect(result.samePeriod).toBe(true);
    expect(result.sameMetric).toBe(true);
    expect(result.sameCalculationBasis).toBe(false);
    expect(result.calculationCoverage?.current).toContain('Helårsbaseline');
    expect(result.calculationCoverage?.selectedBasis).toContain('ikke automatisk');
    expect(result.current.scenario?.baseline.formatted).toBe('100,00 kr.');
    expect(result.selectedBasis.metrics[0].value.formatted).toBe('115,00 kr.');
    expect(result.selectedToCurrentScenarioDifference).toBeUndefined();
  });
  it('skelner den præcise15→25justering fra den samlede0→25virkning', () => {
    const basis = scenario(115_00, 15),
      current = scenario(125_00, 25);
    const result = prepareAdjustmentEvidence(basis, current);
    expect(result.evidence.current.scenario?.delta.formatted).toBe('25,00 kr.');
    const adjustment = result.evidence.selectedToCurrentScenarioDifference!;
    expect(adjustment.value).toEqual({
      raw: 10_00,
      rawUnit: 'ore',
      unit: 'kr.',
      formatted: '10,00 kr.',
    });
    expect(adjustment.selectedAssumptions.energyPercent).toBe(15);
    expect(adjustment.currentAssumptions.energyPercent).toBe(25);
    expect(adjustment.meaning).toContain('ikke den samlede virkning mod nulscenariet');
    expect(adjustment.sourceIds).toEqual(result.analysis.sources.map((source) => source.id));
  });
  it.each(['baseline', 'horizon'])('udelader justeringen ved forskellig %s', (field) => {
    const basis = scenario(115_00, 15),
      current = scenario(125_00, 25);
    if (field === 'baseline') current.scenario!.baselineOre = 110_00;
    else current.scenario!.assumptions.horizon = 'annual';
    const result = buildAdjustmentEvidence(basis, current);
    expect(result.sameCalculationBasis).toBe(false);
    expect(result.selectedToCurrentScenarioDifference).toBeUndefined();
  });
  it('formatterer en negativ justering helt nøjagtigt til øren', () => {
    const result = buildAdjustmentEvidence(scenario(125_01, 25), scenario(115_00, 15));
    expect(result.selectedToCurrentScenarioDifference?.value).toEqual({
      raw: -10_01,
      rawUnit: 'ore',
      unit: 'kr.',
      formatted: '-10,01 kr.',
    });
  });
  it('afviser en sammenligningsforskel uden for præcise heltal', () => {
    const basis = scenario(-Number.MAX_SAFE_INTEGER, 15),
      current = scenario(Number.MAX_SAFE_INTEGER, 25);
    expect(() => buildAdjustmentEvidence(basis, current)).toThrow(/sikre heltal i øre/);
  });
  it.each(['datasetVersion', 'period', 'entityIds', 'area'])('afviser ændret %s', (key) => {
    const basis = scenario(115_00, 15),
      current = scenario(125_00, 25);
    if (key === 'datasetVersion') current.datasetVersion = 'OTHER';
    if (key === 'period') current.context.period.toMonth = 12;
    if (key === 'entityIds') current.context.entityIds = ['school-nyrup'];
    if (key === 'area') current.context.area = 'facilities';
    expect(() => buildAdjustmentEvidence(basis, current)).toThrow(/fastholde/);
  });
  it('afviser en basis med en ukendt beregningsreference', () => {
    const basis = scenario(115_00, 15);
    basis.metrics[0].sourceIds = ['MISSING'];
    expect(() => buildAdjustmentEvidence(basis, scenario(125_00, 25))).toThrow(/mangler en kilde/);
  });
});
