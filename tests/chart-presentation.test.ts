import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChartSpec } from '../src/domain/types';
import { AnalysisChart, chartCsv, flowSvg, formatChartValue } from '../src/components/chart';

const flow: ChartSpec = {
  type: 'flow',
  title: 'Et muligt forløb',
  subtitle: 'Kvalitativ illustration',
  unit: 'number',
  displayUnit: 'rækkefølge',
  sourceIds: ['ASSUMPTIONS-1', 'CALC-1'],
  series: [{ key: 'order', label: 'Trin', color: '#006f71' }],
  rows: [
    { label: 'Afklar behov', description: 'Beskriv den ønskede forbedring.', order: 1 },
    { label: 'Afprøv', description: 'Undersøg muligheder i et afgrænset forløb.', order: 2 },
    { label: 'Følg op', description: 'Vurdér erfaringer før næste beslutning.', order: 3 },
  ],
};
const activity: ChartSpec = {
  type: 'line',
  title: 'Aktivitet',
  subtitle: '2026–2028 · timer',
  unit: 'number',
  displayUnit: 'timer',
  rows: [{ label: '2026', value: 1234.567 }],
  sourceIds: ['CALC-1'],
  series: [{ key: 'value', label: 'Aktivitet', color: '#006f71' }],
};

describe('Kvalitative procesfigurer', () => {
  it('renderer en læsbar ordnet proces frem for søjler, akser eller målte scores', () => {
    const html = renderToStaticMarkup(createElement(AnalysisChart, { chart: flow, version: 'v1' }));
    expect(html).toContain('Procesforløb uden kvantitative målinger');
    for (const row of flow.rows) {
      expect(html).toContain(row.label);
      expect(html).toContain(row.description);
    }
    expect(html).not.toContain('chart-canvas');
    expect(html).not.toContain('recharts-wrapper');
    expect(html).not.toContain('rækkefølge</td>');
    expect(html).not.toContain('data-status-badge');
    expect(html).toContain('Hent CSV');
  });
  it('viser samme kvalitative indhold i tabellen uden en numerisk order-serie', () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisChart, { chart: flow, version: 'v1', initialTable: true }),
    );
    expect(html).toContain('<th scope="col">Trin</th>');
    expect(html).toContain('<th scope="col">Beskrivelse</th>');
    expect(html).toContain('Beskriv den ønskede forbedring.');
    expect(html).not.toContain('>1 rækkefølge<');
    expect(html).not.toContain('>order<');
  });
  it('eksporterer flow-SVG med kilde-ID og sikker tekst, uden scripts eller fremmed HTML', () => {
    const chart = structuredClone(flow);
    chart.title = '<script>alert("test")</script>';
    chart.rows[0].description = '<foreignObject onload="attack()">& indhold';
    const svg = flowSvg(chart, 'v1');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&lt;foreignObject');
    expect(svg).toContain('ASSUMPTIONS-1, CALC-1');
    expect(svg).toContain('ingen måltal eller scores');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<foreignObject');
  });
});

describe('Diagramenheder og eksport', () => {
  it('bevarer øre-skalaen og en eksplicit normaliseret enhed', () => {
    expect(formatChartValue(123456, { ...activity, unit: 'ore', displayUnit: 'kr./elev' })).toBe(
      '1.234,56 kr./elev',
    );
    expect(formatChartValue(1234.567, activity)).toBe('1.234,567 timer');
    expect(formatChartValue(2.75, { ...activity, unit: 'percent', displayUnit: undefined })).toBe(
      '2,75 %',
    );
    expect(formatChartValue(0, { ...activity, displayUnit: undefined })).toBe('0');
  });
  it('viser den eksplicitte enhed i tabel og CSV med samme værdier', () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisChart, { chart: activity, version: 'v1', initialTable: true }),
    );
    expect(html).toContain('Enhed: timer.');
    expect(html).toContain('1.234,567 timer');
    const csv = chartCsv(activity, 'v1');
    expect(csv).toContain('Aktivitet (timer)');
    expect(csv).toContain('"1234,567"');
    expect(csv).toContain('CALC-1');
    expect(csv).not.toContain('kr.');
  });
  it('neutraliserer farlige CSV-tekstpræfikser uden at ændre ægte negative tal eller originaldata', () => {
    const chart = structuredClone(activity),
      original = structuredClone(activity);
    chart.title = '=HYPERLINK("https://invalid.example")';
    chart.rows = [
      { label: ' \t+SUM(1+1)', value: -10 },
      { label: '@SUM(A1:A2)', value: 0 },
      { label: '-2+3', value: 1 },
    ];
    const csv = chartCsv(chart, 'v1');
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).toContain('"\' \t+SUM');
    expect(csv).toContain('"\'@SUM');
    expect(csv).toContain('"\'-2+3"');
    expect(csv).toContain('"-10"');
    expect(activity).toEqual(original);
  });
  it('CSV fra kvalitative figurer udelader position som en målt serie', () => {
    const csv = chartCsv(flow, 'v1');
    expect(csv).toContain('"Trin";"Beskrivelse"');
    expect(csv).toContain('Afklar behov');
    expect(csv).not.toContain('rækkefølge)');
    expect(csv).not.toContain('"order"');
  });
});
