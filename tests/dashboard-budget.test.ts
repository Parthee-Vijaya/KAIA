import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BudgetOverview,
  budgetOverviewModel,
  type BudgetOverviewProps,
} from '../src/components/dashboard-budget';
import { AnalysisChart } from '../src/components/chart';
import type { DashboardData } from '../src/domain/dashboard';
import type { Analysis, Metric, SourceRef } from '../src/domain/types';

// Presentation fixtures only; server calculation and authorization have separate domain/API tests.
const version = 'KAIA-BUDGET-PRESENTATION-FIXTURE';
function source(id: string): SourceRef {
  return {
    id,
    type: 'demo',
    status: 'simulated',
    datasetVersion: version,
    title: 'Simuleret beregningsgrundlag',
    period: 'april–september 2026',
    excerpt: 'SIMULEREDE TESTTAL. Samme valgte enheder og måneder.',
  };
}
function fixture(): DashboardData {
  const scope: DashboardData['scope'] = {
    area: 'schools',
    entityIds: ['school-fixture'],
    period: { year: 2026, fromMonth: 4, toMonth: 9 },
  };
  const metric = (
    label: string,
    value: number,
    sourceId: string,
    unit: Metric['unit'] = 'ore',
  ): Metric => ({ label, value, unit, sourceIds: [sourceId] });
  const base: Analysis = {
    analysisId: 'DEMO-BUDGET-FIXTURE',
    datasetVersion: version,
    question: 'Vis budgetstatus.',
    title: 'Budgetstatus',
    conclusion: '',
    narrative: [],
    context: { ...scope, intent: 'budget', metric: 'net' },
    assumptions: [],
    followups: [],
    sources: [source('DEMO-CALC-FIXTURE')],
    metrics: [
      metric('Periodiseret budget', 1000000, 'DEMO-CALC-FIXTURE'),
      metric('Forbrug / prognose', 1100000, 'DEMO-CALC-FIXTURE'),
      metric('Afvigelse', 100000, 'DEMO-CALC-FIXTURE'),
      metric('Årsprognose', 9900000, 'DEMO-CALC-FIXTURE'),
    ],
  };
  const year: Analysis = {
    ...base,
    analysisId: 'DEMO-YEAR-FIXTURE',
    question: 'Sammenlign med sidste års data.',
    context: {
      ...scope,
      intent: 'yearComparison',
      metric: 'net',
      comparison: { kind: 'year', year: 2025 },
    },
    sources: [source('DEMO-YEAR-FIXTURE')],
    metrics: [
      metric('2025 · regnskab', 1000000, 'DEMO-YEAR-FIXTURE'),
      metric('2026 · regnskab', 1100000, 'DEMO-YEAR-FIXTURE'),
      metric('Forskel', 100000, 'DEMO-YEAR-FIXTURE'),
      metric('Ændring', 10, 'DEMO-YEAR-FIXTURE', 'percent'),
    ],
    chart: {
      type: 'bar',
      title: 'Nettoudgift · samme månedsspænd',
      subtitle: 'april–september begge år · kr. · simulerede data',
      unit: 'ore',
      rows: [
        { label: '2025 · regnskab', value: 1000000, budget: 1000000 },
        { label: '2026 · regnskab', value: 1100000, budget: 1000000 },
      ],
      series: [
        { key: 'budget', label: 'Periodiseret budget', color: '#464f5e' },
        { key: 'value', label: 'Regnskab / prognose', color: '#bc4d30' },
      ],
      sourceIds: ['DEMO-YEAR-FIXTURE'],
    },
  };
  const missing = {
    status: 'missing' as const,
    code: 'FIXTURE_UNUSED',
    reason: 'Ikke relevant i testen.',
  };
  return {
    dataset: {
      version,
      referenceDate: '2026-09-30',
      coverage: { fromYear: 2020, toYear: 2032 },
      status: 'simulated',
    },
    scope,
    capabilities: { detail: true, perPupil: true, municipalBenchmark: true },
    suggestions: [],
    panels: {
      budget: { status: 'ready', analysis: base },
      year: { status: 'ready', analysis: year },
      forecast: missing,
      perPupil: missing,
      waterfall: missing,
      heatmap: missing,
      peer: missing,
      comparison: missing,
    },
  };
}
function analyses(data: DashboardData) {
  if (data.panels.budget.status !== 'ready' || data.panels.year.status !== 'ready')
    throw new Error('Fixture kræver ready-paneler.');
  return { budget: data.panels.budget.analysis, year: data.panels.year.analysis };
}
function props(data = fixture()): BudgetOverviewProps {
  return { data, onAsk: vi.fn(), onSource: vi.fn(), onExpand: vi.fn(), busy: false };
}
function html(data = fixture(), busy = false) {
  return renderToStaticMarkup(createElement(BudgetOverview, { ...props(data), busy }));
}
function find(
  node: ReactNode,
  predicate: (node: NonNullable<ReturnType<typeof element>>) => boolean,
): ReturnType<typeof element> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
  } else {
    const item = element(node);
    if (item) return predicate(item) ? item : find(item.props.children, predicate);
  }
}
function element(node: ReactNode) {
  return isValidElement<{ children?: ReactNode; onClick?: () => void }>(node) ? node : undefined;
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  const item = element(node);
  return item
    ? text(item.props.children)
    : node == null || typeof node === 'boolean'
      ? ''
      : String(node);
}

describe('BudgetOverview: server result and evidence contracts', () => {
  it('selects metric labels rather than array positions and keeps the exact server metrics', () => {
    const data = fixture(),
      analysis = analyses(data);
    analysis.budget.metrics.reverse();
    analysis.year.metrics.reverse();
    const model = budgetOverviewModel(data);
    expect(model.budget.status).toBe('ready');
    expect(model.year.status).toBe('ready');
    if (model.budget.status !== 'ready' || model.year.status !== 'ready') return;
    expect(model.budget.variance).toBe(
      analysis.budget.metrics.find((item) => item.label === 'Afvigelse'),
    );
    expect(model.year.difference).toBe(
      analysis.year.metrics.find((item) => item.label === 'Forskel'),
    );
    expect(model.year.percent?.value).toBe(10);
    expect(model.year.chart).toBe(analysis.year.chart);
  });
  it('renders budget and year change together with distinct explanations and real chart controls', () => {
    const markup = html();
    expect(markup).toContain('Afvigelse fra budget');
    expect(markup).toContain('Merforbrug');
    expect(markup).toContain('Ændring fra sidste år');
    expect(markup).toContain('Højere end sidste år');
    expect(markup).toContain('+10 %');
    expect(markup).toContain('april–september 2026');
    expect(markup).toContain('Vis tabel');
    expect(markup).toContain('Udvid diagram');
    expect(markup).toContain('Eksportér diagram som SVG');
    expect(markup).toContain('Hent CSV');
    expect(markup).toContain('Budgetafvigelsen måler mod periodens budget');
    expect(markup).toContain('Årsændringen måler mod samme måneder sidste år');
    expect(markup).not.toContain('99.000 kr.'); // Helårsprognosen is not a selected-period KPI.
  });
  it('passes the unchanged chart/version and full analysis to chart expansion', () => {
    const input = props(),
      analysis = analyses(input.data).year;
    const node = find(BudgetOverview(input), (item) => item.type === AnalysisChart);
    expect(node).toBeDefined();
    const chartProps = node?.props as Parameters<typeof AnalysisChart>[0];
    expect(chartProps.chart).toBe(analysis.chart);
    expect(chartProps.version).toBe(version);
    expect(chartProps.compact).toBe(true);
    chartProps.onExpand?.(chartProps.chart);
    expect(input.onExpand).toHaveBeenCalledWith(analysis.chart, analysis);
  });
  it('opens the same original analysis when the chart data explanation is requested', () => {
    const input = { ...props(), onExplain: vi.fn() },
      analysis = analyses(input.data).year;
    const node = find(BudgetOverview(input), (item) => item.type === AnalysisChart);
    const chartProps = node?.props as Parameters<typeof AnalysisChart>[0];
    chartProps.onExplain?.();
    expect(input.onExplain).toHaveBeenCalledExactlyOnceWith(analysis);
    expect(analysis.sources[0].title).toBe('Simuleret beregningsgrundlag');
    expect(analysis.chart?.subtitle).toContain('simulerede data');
  });
  it('opens both analyses through the normal question/context action', () => {
    const input = props(),
      analysis = analyses(input.data);
    const tree = BudgetOverview(input);
    find(
      tree,
      (item) =>
        item.type === 'button' && text(item.props.children).includes('Undersøg budgetstatus'),
    )?.props.onClick?.();
    find(
      tree,
      (item) =>
        item.type === 'button' && text(item.props.children).includes('Undersøg årsændringen'),
    )?.props.onClick?.();
    expect(input.onAsk).toHaveBeenNthCalledWith(
      1,
      analysis.budget.question,
      analysis.budget.context,
    );
    expect(input.onAsk).toHaveBeenNthCalledWith(2, analysis.year.question, analysis.year.context);
    expect(html(input.data, true)).toMatch(/disabled=""[^>]*>Undersøg budgetstatus/);
  });
  it('preserves zero and negative net budgets rather than hiding them or deriving a usage percentage', () => {
    const data = fixture(),
      analysis = analyses(data).budget;
    analysis.metrics.find((item) => item.label === 'Periodiseret budget')!.value = -1000000;
    analysis.metrics.find((item) => item.label === 'Forbrug / prognose')!.value = -1100000;
    analysis.metrics.find((item) => item.label === 'Afvigelse')!.value = -100000;
    expect(html(data)).toContain('Mindreforbrug');
    expect(html(data)).toContain('-1.000 kr.');
    for (const item of analysis.metrics) item.value = 0;
    expect(budgetOverviewModel(data).budget.status).toBe('ready');
    expect(html(data)).toContain('I balance');
  });
  it('explains an omitted percentage without inventing a zero percentage', () => {
    const data = fixture(),
      analysis = analyses(data).year;
    analysis.metrics = analysis.metrics.filter((item) => item.unit !== 'percent');
    analysis.narrative = ['En procentændring kan ikke beregnes med nul i sammenligningsåret.'];
    const model = budgetOverviewModel(data);
    expect(model.year.status === 'ready' && model.year.percent).toBeUndefined();
    expect(html(data)).toContain('En procentændring kan ikke beregnes med nul');
    expect(html(data)).not.toContain('+10 %');
  });
  it.each([
    [2025, 1, 12, 'Realiseret forbrug i den valgte periode.'],
    [2026, 1, 9, 'Realiseret forbrug i den valgte periode.'],
    [2026, 1, 12, 'Regnskab og prognose i den valgte periode.'],
    [2026, 10, 12, 'Prognose for den valgte periode.'],
    [2027, 1, 12, 'Prognose for den valgte periode.'],
  ] as const)(
    'labels selected-period coverage correctly for %s, months %s–%s',
    (year, fromMonth, toMonth, note) => {
      const data = fixture(),
        analysis = analyses(data);
      data.scope.period = { year, fromMonth, toMonth };
      analysis.budget.context.period = { ...data.scope.period };
      analysis.year.context.period = { ...data.scope.period };
      expect(html(data)).toContain(note);
    },
  );
  it('explains the dataset boundary while retaining a valid first-year budget', () => {
    const data = fixture(),
      analysis = analyses(data).budget;
    data.scope.period.year = 2020;
    analysis.context.period.year = 2020;
    data.panels.year = {
      status: 'missing',
      code: 'MISSING_COVERAGE',
      reason: 'Årssammenligningen mangler et komplet grundlag.',
    };
    const model = budgetOverviewModel(data);
    expect(model.budget.status).toBe('ready');
    expect(model.year.status).toBe('missing');
    expect(html(data)).toContain('Datasættet begynder i 2020');
    expect(html(data)).toContain('Samme måneder i 2019 findes derfor ikke');
  });
  it('keeps server missing/unsupported explanations and never reuses attached stale analysis', () => {
    const data = fixture(),
      analysis = analyses(data);
    data.panels.budget = {
      status: 'missing',
      code: 'MISSING_COVERAGE',
      reason: 'Budgetgrundlaget er ufuldstændigt.',
      analysis: analysis.budget,
    };
    data.panels.year = {
      status: 'unsupported',
      code: 'ROLE_RESTRICTED',
      reason: 'Denne sammenligning er ikke tilgængelig.',
      analysis: analysis.year,
    };
    const markup = html(data);
    expect(markup).toContain('Budgetgrundlaget er ufuldstændigt.');
    expect(markup).toContain('Denne sammenligning er ikke tilgængelig.');
    expect(markup).not.toContain('10.000 kr.');
    expect(markup).not.toContain('Vis tabel');
  });
  it.each(['budget', 'year'] as const)('rejects another dataset version in %s', (panel) => {
    const data = fixture();
    analyses(data)[panel].datasetVersion = 'OTHER_VERSION';
    const model = budgetOverviewModel(data);
    expect(model[panel].status).toBe('missing');
    expect(model[panel].status === 'missing' && model[panel].reason).toContain('anden dataversion');
  });
  it.each(['area', 'entityIds', 'period'] as const)(
    'rejects a different %s scope before rendering',
    (field) => {
      const data = fixture(),
        analysis = analyses(data).budget;
      analysis.context = structuredClone(analysis.context);
      if (field === 'area') analysis.context.area = 'health';
      if (field === 'entityIds') analysis.context.entityIds = ['other-unit'];
      if (field === 'period') analysis.context.period.toMonth = 12;
      expect(budgetOverviewModel(data).budget.status).toBe('missing');
    },
  );
  it('rejects a comparison with another year instead of labelling it last year', () => {
    const data = fixture();
    analyses(data).year.context.comparison = { kind: 'year', year: 2024 };
    expect(budgetOverviewModel(data).year.status).toBe('missing');
  });
  it.each(['name', 'context'] as const)(
    'rejects %s references as the sole evidence for financial claims',
    (type) => {
      const data = fixture(),
        analysis = analyses(data);
      analysis.budget.sources[0].type = type;
      analysis.year.sources[0].type = type;
      expect(budgetOverviewModel(data).budget.status).toBe('missing');
      expect(budgetOverviewModel(data).year.status).toBe('missing');
      expect(html(data)).not.toContain('Vis tabel');
    },
  );
  it('rejects mismatched source versions, unsafe amounts, and duplicate metric labels', () => {
    const wrongSource = fixture();
    analyses(wrongSource).budget.sources[0].datasetVersion = 'OTHER_VERSION';
    expect(budgetOverviewModel(wrongSource).budget.status).toBe('missing');
    const unsafe = fixture();
    analyses(unsafe).budget.metrics[0].value = Number.MAX_SAFE_INTEGER + 1;
    expect(budgetOverviewModel(unsafe).budget.status).toBe('missing');
    const duplicate = fixture();
    analyses(duplicate).budget.metrics.push(analyses(duplicate).budget.metrics[0]);
    expect(budgetOverviewModel(duplicate).budget.status).toBe('missing');
  });
  it('retains evidenced year metrics while explaining a chart with missing points or name-only evidence', () => {
    const data = fixture(),
      analysis = analyses(data).year;
    analysis.chart!.rows[0].value = null;
    const model = budgetOverviewModel(data);
    expect(model.year.status).toBe('ready');
    expect(model.year.status === 'ready' && model.year.chart).toBeUndefined();
    expect(html(data)).toContain('Figuren mangler et komplet');
    expect(html(data)).not.toContain('Vis tabel');
  });
});
