import { createElement, isValidElement, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SchoolVariances,
  schoolVariancesModel,
  type SchoolVariancesProps,
} from '../src/components/dashboard-schools';
import type { DashboardData } from '../src/domain/dashboard';
import type { Analysis, ChartRow, PublicEntity, SourceRef } from '../src/domain/types';

// A controlled hook fixture permits event-contract checks without pretending to run a browser.
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useState: vi.fn(),
}));
const setExpanded = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useState).mockReturnValue([null, setExpanded]);
});

const version = 'KAIA-SCHOOL-PRESENTATION-FIXTURE';
const names = [
  'Skolen på Herredsåsen',
  'Nyrupskolen',
  'Rynkevangskolen og Inklusionscenter',
  'Hvidebækskolen og Inklusionscenter',
  'Firhøjskolen',
  'Høng Skole',
  'Gørlev Skole og Inklusionscenter',
  'Svebølle Skole',
];
function fixture(): { data: DashboardData; entities: PublicEntity[] } {
  const entities: PublicEntity[] = names.map((name, index) => ({
    id: `school-fixture-${index}`,
    name,
    aliases: [],
    type: 'school',
    area: 'schools',
    nameSourceUrl:
      'https://www.kalundborg.dk/service-and-selvbetjening/boern-unge-and-familie/skoler-sfo-og-uddannelser/folkeskoler',
    verifiedAt: '2026-10-21',
  }));
  const scope: DashboardData['scope'] = {
    area: 'schools',
    entityIds: entities.map((entity) => entity.id),
    period: { year: 2026, fromMonth: 4, toMonth: 9 },
  };
  const nameSource: SourceRef = {
    id: 'OFFICIAL-NAME-FIXTURE',
    title: 'Officiel navnekilde',
    type: 'name',
    status: 'official-name',
    period: '2026',
    datasetVersion: version,
    excerpt: 'Navne dokumenterer ingen demotal.',
  };
  const financialSource: SourceRef = {
    id: 'DEMO-SCHOOL-VARIANCE-FIXTURE',
    title: 'Simuleret beregningsgrundlag',
    type: 'demo',
    status: 'simulated',
    period: 'april–september 2026',
    datasetVersion: version,
    excerpt: 'SIMULEREDE TESTTAL. Absolut nettoafvigelse i øre for hver skole.',
  };
  const variances = [1000000, -5000000, 0, 3000000, -2000000, 500000, -250000, 1];
  const priorVariances = [2000000, -3000000, 0, -4000000, -3000000, 500000, 250000, 0];
  const varianceChanges = [-1000000, -2000000, 0, 7000000, 1000000, 0, -500000, 1];
  const magnitudeChanges = [-1000000, 2000000, 0, -1000000, -1000000, 0, 0, 1];
  const analysis: Analysis = {
    analysisId: 'DEMO-COMPARISON-FIXTURE',
    datasetVersion: version,
    question: 'Sammenlign udgift pr. elev på de valgte skoler.',
    title: 'Sammenligning af udgift pr. elev',
    conclusion: '',
    narrative: [],
    metrics: [],
    context: { ...scope, intent: 'comparison', metric: 'perPupil' },
    assumptions: [],
    followups: [],
    sources: [nameSource, financialSource],
    chart: {
      type: 'bar',
      title: 'Udgift pr. elev',
      subtitle: 'Simulerede testdata',
      unit: 'ore',
      // budget/actual are normalized fields; only variance is an absolute school amount.
      rows: entities.map((entity, index) => ({
        label: entity.name,
        budget: 1000000,
        actual: 1001000,
        variance: variances[index],
        priorYear: 2025,
        priorVariance: priorVariances[index],
        varianceChange: varianceChanges[index],
        varianceMagnitudeChange: magnitudeChanges[index],
        priorVarianceReason: null,
      })),
      series: [
        { key: 'budget', label: 'Budget pr. elev', color: '#464f5e' },
        { key: 'actual', label: 'Forbrug pr. elev', color: '#bc4d30' },
      ],
      sourceIds: [financialSource.id],
    },
  };
  const missing = {
    status: 'missing' as const,
    code: 'FIXTURE_UNUSED',
    reason: 'Ikke relevant i testen.',
  };
  return {
    entities,
    data: {
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
        budget: missing,
        year: missing,
        forecast: missing,
        perPupil: missing,
        heatmap: missing,
        waterfall: missing,
        peer: missing,
        comparison: { status: 'ready', analysis },
      },
    },
  };
}
function analysis(data: DashboardData) {
  const panel = data.panels.comparison;
  if (panel.status !== 'ready') throw new Error('Fixture kræver et ready-panel.');
  return panel.analysis;
}
function props(): SchoolVariancesProps {
  return { ...fixture(), onAsk: vi.fn(), onSource: vi.fn(), busy: false };
}
function html(input = props()) {
  return renderToStaticMarkup(createElement(SchoolVariances, input));
}
function element(node: ReactNode) {
  return isValidElement<{
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
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
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  const item = element(node);
  return item
    ? text(item.props.children)
    : node == null || typeof node === 'boolean'
      ? ''
      : String(node);
}

describe('SchoolVariances presentation and contracts', () => {
  it('ranks both signs by server absolute variance without mutating chart or registry order', () => {
    const { data, entities } = fixture(),
      before = structuredClone(analysis(data).chart!.rows);
    const model = schoolVariancesModel(data, entities);
    expect(model.status).toBe('ready');
    if (model.status !== 'ready') return;
    expect(model.rows.map((row) => row.varianceOre)).toEqual([
      -5000000, 3000000, -2000000, 1000000, 500000, -250000, 1, 0,
    ]);
    expect(analysis(data).chart!.rows).toEqual(before);
    expect(entities[0].name).toBe(names[0]);
  });
  it('uses variance alone even when normalized budget/actual are missing or unrelated', () => {
    const { data, entities } = fixture();
    for (const row of analysis(data).chart!.rows) {
      row.budget = null;
      row.actual = 999999999;
    }
    const model = schoolVariancesModel(data, entities);
    expect(model.status).toBe('ready');
    expect(model.status === 'ready' && model.rows[0].varianceOre).toBe(-5000000);
    expect(html({ ...props(), data, entities })).toContain('-50.000,00 kr.');
    expect(html({ ...props(), data, entities })).not.toContain('9.999.999');
  });
  it('initially shows five schools, source citations, period, and distinct textual directions', () => {
    const markup = html();
    expect(markup.match(/kaia-schools-amount--current/g)).toHaveLength(5);
    expect(markup.match(/kaia-schools-amount--prior/g)).toHaveLength(5);
    expect(markup).toContain('Nyrupskolen');
    expect(markup).toContain('-50.000,00 kr.');
    expect(markup).toContain('+30.000,00 kr.');
    expect(markup).toContain('Merforbrug');
    expect(markup).toContain('Mindreforbrug');
    expect(markup).toContain('april–september 2026');
    expect(markup).not.toContain('Simulerede data');
    expect(markup).toContain('Største absolutte afvigelse først');
    expect(markup).toContain('ikke pr. elev');
    expect(markup).toContain('[2]');
    expect(markup).not.toContain('Officiel navnekilde');
    expect(markup).toContain('Vis alle 8 skoler');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('Svebølle Skole');
  });
  it('sends the exact category/net question and one authorized school with the selected period', () => {
    const input = props(),
      tree = SchoolVariances(input);
    const button = find(
      tree,
      (node) =>
        node.type === 'button' &&
        Boolean(node.props['aria-label']?.startsWith('Nyrupskolen: 2026')),
    );
    expect(button?.props['aria-label']).toContain('Mindreforbrug');
    button?.props.onClick?.();
    expect(input.onAsk).toHaveBeenCalledExactlyOnceWith(
      'Hvilke udgiftstyper bidrager til nettoafvigelsen på Nyrupskolen?',
      {
        area: 'schools',
        period: input.data.scope.period,
        entityIds: [input.entities[1].id],
        intent: 'category',
        metric: 'net',
      },
    );
  });
  it('uses only the referenced financial SourceRef for the source action', () => {
    const input = props(),
      tree = SchoolVariances(input);
    find(
      tree,
      (node) =>
        node.type === 'button' && node.props['aria-label'] === 'Åbn kilde: Beregningsgrundlag',
    )?.props.onClick?.();
    expect(input.onSource).toHaveBeenCalledExactlyOnceWith(analysis(input.data).sources[1]);
  });
  it('opens the prior-year amount with the same school and months but the preceding year', () => {
    const input = props(),
      tree = SchoolVariances(input);
    const button = find(
      tree,
      (node) =>
        node.type === 'button' &&
        Boolean(node.props['aria-label']?.startsWith('Nyrupskolen: 2025')),
    );
    expect(button?.props['aria-label']).toContain('-30.000,00 kr.');
    expect(button?.props['aria-label']).toContain('april–september 2025');
    button?.props.onClick?.();
    expect(input.onAsk).toHaveBeenCalledExactlyOnceWith(
      'Hvilke udgiftstyper bidrager til nettoafvigelsen på Nyrupskolen?',
      {
        area: 'schools',
        period: { year: 2025, fromMonth: 4, toMonth: 9 },
        entityIds: [input.entities[1].id],
        intent: 'category',
        metric: 'net',
      },
    );
    expect(input.data.scope.period).toEqual({ year: 2026, fromMonth: 4, toMonth: 9 });
  });
  it('displays the signed historical amount and server magnitude change without judging a larger underspend', () => {
    const input = props(),
      model = schoolVariancesModel(input.data, input.entities);
    if (model.status !== 'ready') throw new Error('Fixture mangler skolemodel.');
    expect(model.rows[0].prior).toEqual({
      status: 'ready',
      year: 2025,
      varianceOre: -3000000,
      varianceChangeOre: -2000000,
      varianceMagnitudeChangeOre: 2000000,
    });
    const markup = html(input);
    expect(markup).toContain('-30.000,00 kr.');
    expect(markup).toContain('20.000,00 kr. større');
    expect(markup).toContain('fra 2025 til 2026');
    expect(markup).toContain('uden fortegn');
    expect(markup).toContain('Større mindreforbrug er ikke automatisk en negativ udvikling');
    expect(markup).not.toContain('Forværring');
  });
  it('shows cross-sign explanations independently of magnitude growth or reduction', () => {
    const input = props(),
      model = schoolVariancesModel(input.data, input.entities);
    if (model.status !== 'ready') throw new Error('Fixture mangler skolemodel.');
    vi.mocked(useState).mockReturnValue([model.key, setExpanded]);
    const markup = html(input);
    expect(markup).toContain('Fra mindre- til merforbrug.');
    expect(markup).toContain('Fra mer- til mindreforbrug.');
    expect(markup).toContain('10.000,00 kr. mindre');
    expect(markup).toContain('Uændret størrelse');
  });
  it('uses the provided server magnitude field rather than recomputing a difference in the client', () => {
    const input = props();
    analysis(input.data).chart!.rows[1].varianceMagnitudeChange = 12345;
    expect(html(input)).toContain('123,45 kr. større');
    expect(html(input)).not.toContain('20.000,00 kr. større');
  });
  it('keeps a legacy response usable while explaining that prior-year fields are unavailable', () => {
    const input = props();
    for (const row of analysis(input.data).chart!.rows)
      for (const key of [
        'priorYear',
        'priorVariance',
        'varianceChange',
        'varianceMagnitudeChange',
        'priorVarianceReason',
      ])
        delete row[key];
    const model = schoolVariancesModel(input.data, input.entities);
    expect(model.status).toBe('ready');
    const markup = html(input);
    expect(markup.match(/kaia-schools-amount--current/g)).toHaveLength(5);
    expect(markup).not.toContain('kaia-schools-amount--prior');
    expect(markup).toContain('Ikke tilgængeligt');
    expect(markup).toContain('Sammenligningen mangler et komplet, dokumenteret grundlag');
    expect(markup).toContain('-50.000,00 kr.');
  });
  it('keeps prior null distinct from a documented zero and shows the server reason for that school', () => {
    const input = props(),
      row = analysis(input.data).chart!.rows[1];
    row.priorVariance = null;
    row.varianceChange = null;
    row.varianceMagnitudeChange = null;
    row.priorVarianceReason = 'Der mangler energiposter i april sidste år.';
    const model = schoolVariancesModel(input.data, input.entities);
    if (model.status !== 'ready') throw new Error('Aktuel skoleliste skal bevares.');
    expect(model.rows[0].prior).toEqual({
      status: 'missing',
      year: 2025,
      reason: 'Der mangler energiposter i april sidste år.',
    });
    const markup = html(input);
    expect(markup).toContain('Der mangler energiposter i april sidste år.');
    expect(markup.match(/kaia-schools-amount--current/g)).toHaveLength(5);
    expect(markup.match(/kaia-schools-amount--prior/g)).toHaveLength(4);
    expect(
      find(
        SchoolVariances(input),
        (node) =>
          node.type === 'button' &&
          Boolean(node.props['aria-label']?.startsWith('Nyrupskolen: 2025')),
      ),
    ).toBeUndefined();
  });
  it.each([
    ['priorYear', 2024],
    ['priorYear', '2025'],
    ['priorYear', null],
    ['priorVariance', NaN],
    ['priorVariance', Infinity],
    ['priorVariance', 1.5],
    ['priorVariance', Number.MAX_SAFE_INTEGER + 1],
    ['varianceChange', undefined],
    ['varianceChange', null],
    ['varianceChange', '0'],
    ['varianceMagnitudeChange', null],
    ['varianceMagnitudeChange', 1.5],
    ['varianceMagnitudeChange', Number.MAX_SAFE_INTEGER + 1],
    ['priorVarianceReason', undefined],
    ['priorVarianceReason', 'Grundlaget kan ikke sammenlignes.'],
  ] as const)('hides only prior-year details for the incomplete %s=%s contract', (key, value) => {
    const input = props();
    analysis(input.data).chart!.rows[1][key] = value as ChartRow[string];
    const model = schoolVariancesModel(input.data, input.entities);
    expect(model.status).toBe('ready');
    expect(model.status === 'ready' && model.rows[0].prior.status).toBe('missing');
    const markup = html(input);
    expect(markup).toContain('-50.000,00 kr.');
    expect(markup.match(/kaia-schools-amount--current/g)).toHaveLength(5);
    expect(markup.match(/kaia-schools-amount--prior/g)).toHaveLength(4);
  });
  it('accepts complete zero history and emits a prior-year action instead of a missing state', () => {
    const input = props(),
      row = analysis(input.data).chart!.rows[1];
    row.priorVariance = 0;
    row.varianceChange = -5000000;
    row.varianceMagnitudeChange = 5000000;
    const tree = SchoolVariances(input);
    const button = find(
      tree,
      (node) =>
        node.type === 'button' &&
        Boolean(node.props['aria-label']?.startsWith('Nyrupskolen: 2025')),
    );
    expect(button?.props['aria-label']).toContain('0,00 kr., I balance');
    button?.props.onClick?.();
    expect(input.onAsk).toHaveBeenCalledOnce();
    expect(html(input)).toContain('50.000,00 kr. større');
  });
  it('expands all schools, keeps zero as balance and fractional kroner visible, then collapses', () => {
    const input = props(),
      model = schoolVariancesModel(input.data, input.entities);
    if (model.status !== 'ready') throw new Error('Fixture mangler skolemodel.');
    find(
      SchoolVariances(input),
      (node) => node.type === 'button' && text(node.props.children).startsWith('Vis alle'),
    )?.props.onClick?.();
    expect(setExpanded).toHaveBeenCalledWith(model.key);
    vi.mocked(useState).mockReturnValue([model.key, setExpanded]);
    const markup = html(input);
    expect(markup.match(/kaia-schools-amount--current/g)).toHaveLength(8);
    expect(markup.match(/kaia-schools-amount--prior/g)).toHaveLength(8);
    expect(markup).toContain('I balance');
    expect(markup).toContain('0,00 kr.');
    expect(markup).toContain('+0,01 kr.');
    expect(markup).toContain('aria-expanded="true"');
    find(
      SchoolVariances(input),
      (node) => node.type === 'button' && text(node.props.children).startsWith('Vis de fem'),
    )?.props.onClick?.();
    expect(setExpanded).toHaveBeenLastCalledWith(null);
  });
  it('does not retain expanded state after a period or dataset change', () => {
    const input = props(),
      model = schoolVariancesModel(input.data, input.entities);
    if (model.status !== 'ready') throw new Error('Fixture mangler skolemodel.');
    vi.mocked(useState).mockReturnValue([model.key, setExpanded]);
    input.data.scope.period = { ...input.data.scope.period, toMonth: 8 };
    analysis(input.data).context.period = { ...input.data.scope.period };
    expect(html(input).match(/kaia-schools-amount--current/g)).toHaveLength(5);
  });
  it('disables school analysis buttons while a request is busy', () => {
    const input = props();
    input.busy = true;
    const button = find(
      SchoolVariances(input),
      (node) =>
        node.type === 'button' &&
        Boolean(node.props['aria-label']?.startsWith('Nyrupskolen: 2026')),
    );
    expect(button?.props.disabled).toBe(true);
    expect(html(input).match(/kaia-schools-amount--current[^"]*" disabled=""/g)).toHaveLength(5);
    expect(html(input).match(/kaia-schools-amount--prior[^"]*" disabled=""/g)).toHaveLength(5);
  });
  it('never reads or renders school details for a Council-style aggregate capability', () => {
    const input = props();
    input.data.capabilities.detail = false;
    Object.defineProperty(input.data.panels, 'comparison', {
      get() {
        throw new Error('Detaljepanelet må ikke læses.');
      },
    });
    const markup = html(input);
    expect(markup).toContain('Din adgang omfatter aggregerede oplysninger');
    for (const name of names) expect(markup).not.toContain(name);
    expect(markup).not.toContain('kr.');
    expect(markup).not.toContain('Beregningsgrundlag');
  });
  it('returns no widget outside the school area without reading the detail panel', () => {
    const input = props();
    input.data.scope.area = 'facilities';
    Object.defineProperty(input.data.panels, 'comparison', {
      get() {
        throw new Error('Skolepanelet må ikke læses.');
      },
    });
    expect(html(input)).toBe('');
  });
  it.each(['missing', 'unsupported'] as const)(
    'preserves the %s reason without rendering an attached stale analysis',
    (status) => {
      const input = props(),
        stale = analysis(input.data);
      input.data.panels.comparison = {
        status,
        code: 'FIXTURE',
        reason: 'Sammenligningen mangler et tilladt grundlag.',
        analysis: stale,
      };
      const markup = html(input);
      expect(markup).toContain('Sammenligningen mangler et tilladt grundlag.');
      expect(markup).not.toContain('Nyrupskolen');
    },
  );
  it.each(['version', 'area', 'entityIds', 'period'] as const)(
    'rejects a different analysis %s',
    (field) => {
      const input = props(),
        result = analysis(input.data);
      result.context = structuredClone(result.context);
      if (field === 'version') result.datasetVersion = 'OTHER_VERSION';
      if (field === 'area') result.context.area = 'health';
      if (field === 'entityIds') result.context.entityIds = [input.entities[0].id];
      if (field === 'period') result.context.period.fromMonth = 1;
      expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
      expect(html(input)).not.toContain('Nyrupskolen');
    },
  );
  it.each([NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5, null, undefined, '100'])(
    'rejects an invalid variance %s without a zero fallback',
    (value) => {
      const input = props();
      analysis(input.data).chart!.rows[0].variance = value as ChartRow['variance'];
      expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
      expect(html(input)).toContain('Manglende beløb erstattes ikke med nul');
      expect(html(input)).not.toContain('kaia-schools-amount');
    },
  );
  it.each(['name', 'context'] as const)('rejects a %s reference as financial evidence', (type) => {
    const input = props();
    analysis(input.data).sources[1].type = type;
    expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
    expect(html(input)).not.toContain('-50.000');
  });
  it.each(['missing', 'version', 'status', 'duplicate'] as const)(
    'rejects %s financial evidence',
    (field) => {
      const input = props(),
        result = analysis(input.data);
      if (field === 'missing') result.chart!.sourceIds = [];
      if (field === 'version') result.sources[1].datasetVersion = 'OTHER_VERSION';
      if (field === 'status') result.sources[1].status = 'official-name';
      if (field === 'duplicate') result.sources.push({ ...result.sources[1] });
      expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
    },
  );
  it.each(['case', 'alias', 'unknown', 'ambiguous', 'duplicate-row', 'incomplete'] as const)(
    'rejects %s school mapping rather than inventing an institution id',
    (problem) => {
      const input = props(),
        chart = analysis(input.data).chart!;
      if (problem === 'case') chart.rows[0].label = names[0].toUpperCase();
      if (problem === 'alias') {
        input.entities[0].aliases = ['Herredsåsen'];
        chart.rows[0].label = 'Herredsåsen';
      }
      if (problem === 'unknown') chart.rows[0].label = 'Spiralen';
      if (problem === 'ambiguous') input.entities[1].name = input.entities[0].name;
      if (problem === 'duplicate-row') chart.rows.push({ ...chart.rows[0] });
      if (problem === 'incomplete') chart.rows.pop();
      expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
    },
  );
  it.each(['missing', 'facility', 'other-area', 'duplicate-id', 'duplicate-scope'] as const)(
    'rejects a %s registry/scope contract',
    (problem) => {
      const input = props();
      if (problem === 'missing') input.entities.pop();
      if (problem === 'facility') input.entities[0].type = 'facility';
      if (problem === 'other-area') input.entities[0].area = 'facilities';
      if (problem === 'duplicate-id') input.entities.push({ ...input.entities[0] });
      if (problem === 'duplicate-scope')
        input.data.scope.entityIds.push(input.data.scope.entityIds[0]);
      expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
    },
  );
  it('ignores unscoped registry entries rather than expanding access or creating label ambiguity', () => {
    const input = props();
    input.entities.push({ ...input.entities[0], id: 'unscoped-school' });
    const model = schoolVariancesModel(input.data, input.entities);
    expect(model.status).toBe('ready');
    expect(
      model.status === 'ready' && model.rows.some((row) => row.entity.id === 'unscoped-school'),
    ).toBe(false);
  });
  it('shows valid zero variances with zero-width visual bars and no NaN scale', () => {
    const input = props();
    for (const row of analysis(input.data).chart!.rows) row.variance = 0;
    const markup = html(input);
    expect(markup).toContain('I balance');
    expect(markup).toContain('width:0%');
    expect(markup).not.toContain('NaN');
  });
  it('rejects an empty chart and propagates server missingData rather than showing empty success', () => {
    const input = props();
    analysis(input.data).chart!.rows = [];
    expect(schoolVariancesModel(input.data, input.entities).status).toBe('missing');
    expect(html(input)).toContain('Manglende data vises ikke som nul');
    const withMissing = props();
    analysis(withMissing.data).missingData = 'Datagrundlaget mangler sammenlignelige måneder.';
    expect(html(withMissing)).toContain('Datagrundlaget mangler sammenlignelige måneder.');
  });
});
