import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerText } from '../src/components/answer-text';
import type { SourceRef } from '../src/domain/types';

const source: SourceRef = {
  id: 'DEMO-TEST',
  title: 'Antagelser',
  type: 'demo',
  origin: 'assumption',
  datasetVersion: 'fixture',
  period: '2026',
  excerpt: 'Et modeludkast',
};
const render = (text: string) =>
  renderToStaticMarkup(createElement(AnswerText, { text, sources: [source], onSource: () => {} }));
describe('safe live answer presentation', () => {
  it('renders emphasis and a known citation inside emphasis without raw markdown', () => {
    const html = render('**Frigjort kapacitet [1]**\nEt forslag. [99]');
    expect(html).toContain('<strong>');
    expect(html).toContain('aria-label="Åbn kilde 1"');
    expect(html).not.toContain('**');
    expect(html).not.toContain('Åbn kilde 99');
    expect(html).toContain('[99]');
  });
  it('escapes model HTML and does not turn arbitrary links into active links', () => {
    const html = render('<img src=x onerror=alert(1)> [klik](javascript:alert(1))');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a');
  });
  it('renders a streaming fragment without inventing a citation or completed emphasis', () => {
    const html = renderToStaticMarkup(
      createElement(AnswerText, { text: '## Antagelser\n**Foreløbig tekst [1]' }),
    );
    expect(html).toContain('<strong>');
    expect(html).not.toContain('<button');
    expect(html).toContain('[1]');
  });
});
