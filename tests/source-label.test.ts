import { describe, expect, it } from 'vitest';
import { sourceLabel } from '../src/components/source-label';
import { metricValue } from '../src/domain/format';
import type { SourceRef } from '../src/domain/types';

const source: SourceRef = {
  id: 'DEMO-ILLUSTRATION-ASSUMPTIONS',
  title: 'Grundlag',
  type: 'demo',
  excerpt: 'Foreslåede antagelser',
  period: '2026–2030',
  datasetVersion: 'fixture-v1',
};

describe('illustration provenance and units', () => {
  it('distinguishes assumptions, calculations and retrieved evidence', () => {
    expect(sourceLabel({ ...source, origin: 'assumption' })).toBe('Foreslåede antagelser');
    expect(sourceLabel({ ...source, origin: 'calculation' })).toBe('Beregning fra antagelser');
    expect(sourceLabel(source)).toBe('Beregningskilde');
    expect(sourceLabel({ ...source, type: 'name' })).toBe('Officiel navnekilde');
    expect(sourceLabel({ ...source, type: 'context', status: 'verified-public-snapshot' })).toBe(
      'Offentlig kontekst',
    );
  });

  it('preserves the activity unit without changing legacy money or percentages', () => {
    expect(metricValue(1250.5, 'number', 'timer')).toBe('1.250,5 timer');
    expect(metricValue(7, 'number')).toBe('7');
    expect(metricValue(120000, 'ore', 'timer')).toBe('1.200 kr.');
    expect(metricValue(15, 'percent', 'timer')).toBe('15 %');
  });
});
