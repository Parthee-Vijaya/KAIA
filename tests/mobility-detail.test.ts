import { describe, it, expect } from 'vitest';
import { entityRegistry, type Dataset } from '../src/domain/data';
import { buildMobilityAnalysis, DEFAULT_MOBILITY } from '../src/domain/mobility';
import { mobilityDetail } from '../src/domain/mobility-detail';
import { MOBILITY_QUESTION } from '../src/domain/mobility-question';
import type { AccessContext, AnalysisContext } from '../src/domain/types';
const user: AccessContext = {
  userId: 'fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  roles: ['KAIA.DepartmentHead'],
  areas: ['schools'],
  unitIds: ['*'],
  displayName: 'Fagchef',
  title: 'Fagchef',
};
const shell: Dataset = {
  version: 'KAIA-DEMO-2026.09-v4',
  seed: 'kaia-kalundborg-2026',
  referenceDate: '2026-09-30',
  coverage: { fromYear: 2020, toYear: 2032 },
  entities: entityRegistry(),
  rows: [],
  documents: [],
};
const context: AnalysisContext = {
  area: 'schools',
  entityIds: shell.entities.filter((e) => e.type === 'school').map((e) => e.id),
  period: { year: 2026, fromMonth: 1, toMonth: 12 },
  metric: 'net',
  intent: 'mobilityCapacity',
};
const a = buildMobilityAnalysis(MOBILITY_QUESTION, user, context, shell, {
  ...DEFAULT_MOBILITY,
  migrationChangePercent: 25,
  extraClasses: 2,
  variableCostOre: 2100000,
});
describe('Granular immutable school-capacity views', () => {
  it('reconciles every school-year point with the original five aggregate forecast points', () => {
    const d = mobilityDetail(a, { year: 2030 });
    expect(d.schoolYears).toHaveLength(80);
    for (const p of a.mobility!.scenario) {
      const rows = d.schoolYears.filter((r) => r.year === p.year);
      for (const field of [
        'pupils',
        'capacity',
        'shortage',
        'variableCostOre',
        'fixedCostOre',
      ] as const)
        expect(rows.reduce((n, r) => n + r[field], 0)).toBe(p[field]);
    }
  });
  it('filters one school without reallocating any of the saved classes', () => {
    const full = mobilityDetail(a, { year: 2028 });
    for (const s of full.schools) {
      const d = mobilityDetail(a, { year: 2028, entityId: s.id });
      expect(d.selectedRows).toEqual(full.selectedRows.filter((r) => r.id === s.id));
      expect(d.metrics.pupils).toBe(d.selectedRows[0].pupils);
      expect(d.charts.timeline.rows.at(-1)!.scenario).toBe(
        d.schoolYears.find((r) => r.id === s.id && r.year === 2030)!.pupils,
      );
      expect(d.history).toHaveLength(5);
    }
  });
  it('reconciles yearly gross in/out series to underlying scoped family events', () => {
    const d = mobilityDetail(a, { year: 2029, entityId: 'school-hoeng' });
    for (const row of d.charts.movement.rows) {
      const h = d.history.find((h) => h.year === Number(row.label))!;
      expect(row.domesticIn).toBe(h.domesticIn);
      expect(row.domesticOut).toBe(-h.domesticOut);
      expect(row.internationalIn).toBe(h.internationalIn);
      expect(row.internalOut).toBe(-h.internalOut);
    }
    expect(d.charts.movement.sourceIds).toEqual([a.sources[0].id]);
  });
  it('exactly decomposes the cost delta with pupil-price interaction counted once', () => {
    for (const year of [2026, 2028, 2030]) {
      const d = mobilityDetail(a, { year });
      const rows = d.charts.costBridge.rows;
      expect(Number(rows[0].value) + Number(rows[1].value) + Number(rows[2].value)).toBe(
        rows[3].value,
      );
      expect(rows[3].value).toBe(d.metrics.costDeltaOre);
      expect(d.metrics.scenarioCostOre - d.metrics.baselineCostOre).toBe(d.metrics.costDeltaOre);
    }
    expect(mobilityDetail(a, { year: 2030 }).metrics.costDeltaOre).toBe(a.mobility!.costDeltaOre);
  });
  it('keeps source IDs, graph version, snapshot and the original baseline immutable', () => {
    const original = JSON.stringify(a);
    const d = mobilityDetail(a, { year: 2026 });
    expect(JSON.stringify(a)).toBe(original);
    expect(d.sources).toEqual(a.sources);
    for (const chart of Object.values(d.charts))
      expect(
        chart.sourceIds.every((id) =>
          a.sources.some((s) => s.id === id && s.datasetVersion === d.datasetVersion),
        ),
      ).toBe(true);
  });
  it.each([2025, 2031, 2026.5])('rejects an unavailable forecast year %s', (year) =>
    expect(() => mobilityDetail(a, { year })).toThrow(),
  );
  it('rejects an entity outside the immutable saved scope', () =>
    expect(() => mobilityDetail(a, { year: 2026, entityId: 'not-in-snapshot' })).toThrow());
  it('does not turn spare capacity at another school into local capacity', () => {
    const d = mobilityDetail(a, { year: 2030 });
    expect(d.metrics.shortage).toBe(
      d.selectedRows.reduce((n, r) => n + Math.max(0, r.pupils - r.capacity), 0),
    );
    expect(d.metrics.shortage).toBeGreaterThan(Math.max(0, d.metrics.pupils - d.metrics.capacity));
  });
});
