import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StreamingAnswer } from '../src/components/analysis-motion';
import { AnalysisChart } from '../src/components/chart';
import type { ChartSpec } from '../src/domain/types';

describe('synlig tekstlevering fra den faktiske svarstream', () => {
  it('viser ærlig Demo-status, aktuel aktivitet og en dekorativ ventetilstand', () => {
    const html = renderToStaticMarkup(
      createElement(StreamingAnswer, {
        label: 'Henter budgettal',
        text: '',
        provider: 'Demo · Beregnet svar',
      }),
    );
    expect(html).toContain('aria-label="Svar under udarbejdelse"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<section[^>]*aria-busy/);
    expect(html).toContain('Demo · Beregnet svar');
    expect(html).toContain('Henter budgettal');
    expect(html).toContain('streaming-answer-skeleton');
    expect(html).not.toContain('0 kr.');
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('streaming-answer-text');
  });
  it('viser kun modtaget tekst og fjerner skeleton når tekst ankommer', () => {
    const text = 'Forbruget er 4.210 kr. [1]';
    const html = renderToStaticMarkup(
      createElement(StreamingAnswer, {
        label: 'Leverer beregnet svar',
        text,
        kind: 'simulation',
      }),
    );
    expect(html).toContain(text);
    expect(html).toContain('analysis-activity--simulation');
    expect(html).toContain('streaming-caret');
    expect(html).not.toContain('streaming-answer-skeleton');
    expect(html).not.toContain('FORMULERET MED AI');
  });
  it('bevarer navnet på en konkret live-forbindelse', () => {
    const html = renderToStaticMarkup(
      createElement(StreamingAnswer, {
        label: 'Formulerer svar',
        text: 'En kildebaseret forklaring.',
        provider: 'Corti · corti-s1',
      }),
    );
    expect(html).toContain('Corti · corti-s1');
    expect(html).not.toContain('Demo');
  });
});

describe('diagrammets beregningsgrundlag og præsentation', () => {
  const chart: ChartSpec = {
    type: 'bar',
    title: 'Simuleret nettoudgift',
    subtitle: '2026 · kr. · simulerede data',
    unit: 'ore',
    rows: [{ label: 'Høng Skole', value: 123456 }],
    series: [{ key: 'value', label: 'Nettoudgift', color: '#bc4d30' }],
    sourceIds: ['DEMO-BASIS'],
  };
  it('viser Vis data, tabel og CSV særskilt, når et analysegrundlag er tilgængeligt', () => {
    const before = structuredClone(chart);
    const html = renderToStaticMarkup(
      createElement(AnalysisChart, {
        chart,
        version: 'KAIA-FIXTURE-v1',
        initialTable: true,
        onExplain: () => undefined,
      }),
    );
    expect(html).toContain('Vis data');
    expect(html).toContain('Hent CSV');
    expect(html).toContain('Vis diagram');
    expect(html).toContain('1.234,56 kr.');
    expect(html).toContain('KAIA-FIXTURE-v1');
    expect(html).not.toMatch(/simulerede data/i);
    expect(html).not.toContain('Simuleret nettoudgift');
    expect(chart).toEqual(before);
  });
  it('tilbyder ikke en død Vis data-knap uden grundlagscallback', () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisChart, {
        chart,
        version: 'KAIA-FIXTURE-v1',
        initialTable: true,
      }),
    );
    expect(html).not.toContain('Vis data');
    expect(html).toContain('Hent CSV');
  });
});
