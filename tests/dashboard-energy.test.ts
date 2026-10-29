import { isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard, type DashboardProps } from '../src/components/dashboard';
import { DEFAULT_SCENARIO, type Analysis } from '../src/domain/types';
import type { DashboardData } from '../src/domain/dashboard';

// Controlled presentation state: no browser, API request or timer is simulated as an integration.
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useState: vi.fn(),
  useEffect: vi.fn(),
  useRef: vi.fn(),
  useId: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockReturnValue({ current: 0 });
  vi.mocked(useId).mockReturnValue('energy-presentation-fixture');
  vi.mocked(useEffect).mockImplementation(() => {});
});
function fixture() {
  const missing = {
    status: 'missing' as const,
    code: 'FIXTURE_UNUSED',
    reason: 'Ikke relevant i testen.',
  };
  const data: DashboardData = {
    dataset: {
      version: 'KAIA-ENERGY-UI-FIXTURE',
      referenceDate: '2026-09-30',
      coverage: { fromYear: 2020, toYear: 2032 },
      status: 'simulated',
    },
    scope: {
      area: 'schools',
      entityIds: ['school-fixture'],
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
    },
    capabilities: { detail: false, perPupil: false, municipalBenchmark: false },
    suggestions: [],
    panels: {
      budget: missing,
      year: missing,
      forecast: missing,
      perPupil: missing,
      comparison: missing,
      peer: missing,
      waterfall: missing,
      heatmap: missing,
    },
  };
  const assumptions = { ...DEFAULT_SCENARIO, energyPercent: 15 };
  const analysis: Analysis = {
    analysisId: 'DEMO-ENERGY-UI-FIXTURE',
    datasetVersion: data.dataset.version,
    question: 'Hvad hvis energiprisen stiger 15 procent resten af året?',
    title: 'Hvad nu hvis?',
    conclusion: '',
    narrative: [],
    metrics: [],
    assumptions: [],
    followups: [],
    sources: [],
    context: { ...data.scope, intent: 'scenario', scenario: assumptions },
    scenario: { assumptions, baselineOre: 1000000, scenarioOre: 1015000, deltaOre: 15000 },
    chart: {
      type: 'scenario',
      title: 'Baseline og scenarie',
      subtitle: '2026 · kr.',
      unit: 'ore',
      rows: [{ label: 'Oktober', baseline: 1000000, scenario: 1015000 }],
      series: [
        { key: 'baseline', label: 'Baseline', color: '#464f5e' },
        { key: 'scenario', label: 'Scenarie', color: '#006f71' },
      ],
      sourceIds: [],
    },
  };
  const input: DashboardProps = {
    data,
    entities: [],
    loading: false,
    error: '',
    busy: false,
    onAsk: vi.fn(),
    onSource: vi.fn(),
    onExpand: vi.fn(),
    onExplain: vi.fn(),
    onReload: vi.fn(),
  };
  const key = `${JSON.stringify({ context: data.scope, datasetVersion: data.dataset.version, assumptions })}|0`;
  return { input, analysis, key };
}
function element(node: ReactNode) {
  return isValidElement<{
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    onExplain?: (analysis: Analysis) => void;
  }>(node)
    ? node
    : undefined;
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
function energyNode(input: DashboardProps) {
  const node = find(
    Dashboard(input),
    (item) => typeof item.type === 'function' && item.type.name === 'EnergyScenario',
  );
  if (!node) throw new Error('Dashboardet mangler energikortet.');
  return node;
}
function energyTree(
  input: DashboardProps,
  result?: { key: string; analysis?: Analysis; error?: string },
) {
  vi.mocked(useState)
    .mockReset()
    .mockReturnValueOnce([15, vi.fn()])
    .mockReturnValueOnce([0, vi.fn()])
    .mockReturnValueOnce(['remaining', vi.fn()])
    .mockReturnValueOnce([result, vi.fn()]);
  const node = energyNode(input);
  return (node.type as (props: unknown) => ReactNode)(node.props);
}
function dataButton(tree: ReactNode) {
  return find(
    tree,
    (item) => item.type === 'button' && item.props['aria-label'] === 'Vis data for energiscenariet',
  );
}

describe('energy card data explanation', () => {
  it('forwards the dashboard explanation callback to its custom energy card', () => {
    const { input } = fixture();
    expect(energyNode(input).props.onExplain).toBe(input.onExplain);
  });
  it('opens the exact server preview with its original chart when ready', () => {
    const { input, analysis, key } = fixture(),
      originalChart = analysis.chart;
    const button = dataButton(energyTree(input, { key, analysis }));
    expect(button?.props.disabled).toBe(false);
    button?.props.onClick?.();
    expect(input.onExplain).toHaveBeenCalledExactlyOnceWith(analysis);
    expect(analysis.chart).toBe(originalChart);
  });
  it.each(['pending', 'stale', 'error', 'missing'] as const)(
    'prevents explanation of a %s preview',
    (state) => {
      const { input, analysis, key } = fixture();
      if (state === 'missing') analysis.missingData = 'Der mangler et sammenligneligt grundlag.';
      const result =
        state === 'pending'
          ? undefined
          : state === 'stale'
            ? { key: 'OTHER_PREVIEW', analysis }
            : state === 'error'
              ? { key, error: 'Beregningen blev afbrudt.' }
              : { key, analysis };
      const button = dataButton(energyTree(input, result));
      expect(button?.props.disabled).toBe(true);
      button?.props.onClick?.();
      expect(input.onExplain).not.toHaveBeenCalled();
    },
  );
  it('disables the explanation during another active request', () => {
    const { input, analysis, key } = fixture();
    input.busy = true;
    const button = dataButton(energyTree(input, { key, analysis }));
    expect(button?.props.disabled).toBe(true);
    button?.props.onClick?.();
    expect(input.onExplain).not.toHaveBeenCalled();
  });
  it('retains the old interface when no explanation callback is supplied', () => {
    const { input, analysis, key } = fixture();
    input.onExplain = undefined;
    expect(dataButton(energyTree(input, { key, analysis }))).toBeUndefined();
  });
});
