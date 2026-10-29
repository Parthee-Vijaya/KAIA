import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalysisActivity } from '../src/components/analysis-motion';
import { ScenarioEditor, scenarioPreviewProblem } from '../src/components/scenario';
import { DEFAULT_SCENARIO, type Analysis, type ScenarioAssumptions } from '../src/domain/types';

const assumptions: ScenarioAssumptions = { ...DEFAULT_SCENARIO, energyPercent: 15 };
const basis = {
  analysisId: '11111111-1111-4111-8111-111111111111',
  datasetVersion: 'KAIA-PREVIEW-FIXTURE-v1',
  context: {
    area: 'schools',
    entityIds: ['school-hoeng', 'school-sveboelle'],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
  },
} as Analysis;
const preview = {
  ...basis,
  analysisId: 'DEMO-A-preview',
  context: { ...basis.context, intent: 'scenario', scenario: assumptions },
  scenario: { baselineOre: 10000, scenarioOre: 11500, deltaOre: 1500, assumptions },
} as Analysis;

describe('beregningsaktivitet uden falske resultater', () => {
  it.each(['analysis', 'simulation'] as const)(
    'annoncerer én faktisk status ved %s og skjuler SVG for hjælpemidler',
    (kind) => {
      const label = 'Henter budgettal';
      const html = renderToStaticMarkup(createElement(AnalysisActivity, { label, kind }));
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html.match(/Henter budgettal/g)).toHaveLength(1);
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('focusable="false"');
      expect(html).not.toContain('role="progressbar"');
    },
  );
  it('viser ingen nulbeløb eller gammel baselinesgraf, før et serverresultat findes', () => {
    const html = renderToStaticMarkup(
      createElement(ScenarioEditor, { basis, busy: false, onCalculate: () => undefined }),
    );
    expect(html).toContain('Beregner de berørte poster');
    expect(html).not.toContain('0 kr.');
    expect(html).not.toContain('chart-panel');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Brug scenarie/);
  });
});

describe('scenariepreview tilhører præcis det efterspurgte grundlag', () => {
  it('accepterer et afstemt nulscenarie og semantisk ens enhedsrækkefølge', () => {
    const zero = {
      ...preview,
      context: { ...preview.context, entityIds: [...preview.context.entityIds].reverse() },
      scenario: {
        ...preview.scenario!,
        scenarioOre: 10000,
        deltaOre: 0,
        assumptions: DEFAULT_SCENARIO,
      },
    };
    expect(scenarioPreviewProblem(zero, basis, DEFAULT_SCENARIO)).toBeUndefined();
  });
  it.each([
    { datasetVersion: 'KAIA-PREVIEW-FIXTURE-v2' },
    { context: { ...preview.context, area: 'facilities' } },
    { context: { ...preview.context, entityIds: ['school-hoeng'] } },
    { context: { ...preview.context, period: { ...preview.context.period, year: 2025 } } },
    { context: { ...preview.context, period: { ...preview.context.period, fromMonth: 4 } } },
    { context: { ...preview.context, period: { ...preview.context.period, toMonth: 6 } } },
  ])('afviser et forsinket svar efter version-, scope- eller periodeskift %j', (patch) => {
    expect(
      scenarioPreviewProblem({ ...preview, ...patch } as Analysis, basis, assumptions),
    ).toMatch(/afgrænsning/);
  });
  it('afviser et forsinket svar fra den tidligere sliderindstilling', () => {
    expect(scenarioPreviewProblem(preview, basis, { ...assumptions, energyPercent: -10 })).toMatch(
      /forudsætninger/,
    );
    expect(scenarioPreviewProblem(preview, basis, { ...assumptions, horizon: 'annual' })).toMatch(
      /forudsætninger/,
    );
  });
  it.each([
    undefined,
    { ...preview, scenario: undefined },
    { ...preview, scenario: { ...preview.scenario!, baselineOre: 1.5 } },
    { ...preview, scenario: { ...preview.scenario!, deltaOre: 1501 } },
    { ...preview, scenario: { ...preview.scenario!, scenarioOre: Number.MAX_SAFE_INTEGER + 1 } },
  ])('afviser manglende eller uafstemte beregningsbeløb %j', (invalid) => {
    expect(scenarioPreviewProblem(invalid, basis, assumptions)).toBeDefined();
  });
  it('bevarer en forklaring om manglende grundlag uden at konstruere et nulresultat', () => {
    const missing = {
      ...basis,
      missingData: 'Det valgte år har ingen prognosemåneder.',
      scenario: undefined,
    };
    expect(scenarioPreviewProblem(missing, basis, assumptions)).toBeUndefined();
    expect(missing.scenario).toBeUndefined();
  });
});
