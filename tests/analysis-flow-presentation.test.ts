import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AnalysisFlow } from '../src/components/analysis-flow';
import { createTrace } from '../src/domain/trace';
const done = () => {
  const t = createTrace('fixture-trace');
  for (let i = 0; i < 5; i++) {
    t.update(i, 'running', 'Faktisk operation');
    t.update(i, 'completed', 'Registreret resultat');
  }
  t.update(5, 'available', 'Afventer mandat');
  return t.snapshot();
};
describe('Controlled reading of actual recorded stages', () => {
  it('labels slow playback as a visual review rather than server execution', () => {
    const trace = done(),
      before = JSON.stringify(trace);
    const html = renderToStaticMarkup(createElement(AnalysisFlow, { trace }));
    expect(html).toContain('Visuel gennemgang · beregningen er afsluttet');
    expect(html).toContain('6 sek. pr. trin');
    expect(html).toContain('10 sek. pr. trin');
    expect(html).toContain('Afspil forløbet');
    expect(html).toContain('Næste trin');
    expect(html).toContain('Registreret resultat');
    expect(JSON.stringify(trace)).toBe(before);
    expect(html).not.toContain('role="progressbar"');
  });
  it('retains live operation status with no replay controls', () => {
    const t = createTrace('live');
    t.update(0, 'running', 'Fortolker spørgsmålet');
    const html = renderToStaticMarkup(createElement(AnalysisFlow, { trace: t.snapshot() }));
    expect(html).toContain('Live · registreret på serveren');
    expect(html).not.toContain('Afspil forløbet');
    expect(html).not.toContain('beregningen er afsluttet');
  });
  it('does not call a failed operation completed', () => {
    const t = createTrace('failed');
    t.update(0, 'error', 'Datakilden kunne ikke hentes');
    const html = renderToStaticMarkup(createElement(AnalysisFlow, { trace: t.snapshot() }));
    expect(html).toContain('Forløbet blev afbrudt');
    expect(html).not.toContain('beregningen er afsluttet');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Afspil forløbet/);
  });
  it('disables automatic playback in the explicit reduced-motion mode', () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisFlow, { trace: done(), autoPlay: true, reduced: true }),
    );
    expect(html).not.toContain('Pause gennemgang');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Afspil forløbet/);
  });
});
