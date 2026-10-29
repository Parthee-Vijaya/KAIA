import { describe, it, expect } from 'vitest';
import { entityRegistry, pupilsForYear, type Dataset } from '../src/domain/data';
import { analyze, parseQuestion } from '../src/domain/analysis';
import {
  buildMobilityAnalysis,
  DEFAULT_MOBILITY,
  CLASS_COST_ORE,
  mobilityQuestionAssumptions,
} from '../src/domain/mobility';
import { MOBILITY_QUESTION } from '../src/domain/mobility-question';
import { createTrace, TRACE_LABELS } from '../src/domain/trace';
import { planQuery } from '../src/integrations/planner';
import { buildAnswerEvidence } from '../src/server/answer-evidence';
import { canApprovePlan, planFingerprint, buildPlanDraft } from '../src/server/plan-drafts';
import type { AccessContext, AnalysisContext } from '../src/domain/types';
const shell: Dataset = {
  version: 'KAIA-DEMO-2026.09-v4',
  seed: 'kaia-kalundborg-2026',
  referenceDate: '2026-09-30',
  entities: entityRegistry(),
  rows: [],
  documents: [],
  coverage: { fromYear: 2020, toYear: 2032 },
};
const user: AccessContext = {
  userId: 'fixture-mobility',
  tenantId: 'fixture',
  objectId: 'fixture',
  displayName: 'Fagchef',
  title: 'Fagchef',
  roles: ['KAIA.DepartmentHead'],
  areas: ['schools'],
  unitIds: ['*'],
};
const context: AnalysisContext = {
  area: 'schools',
  entityIds: shell.entities.filter((e) => e.type === 'school').map((e) => e.id),
  period: { year: 2026, fromMonth: 1, toMonth: 12 },
  metric: 'net',
  intent: 'mobilityCapacity',
};
const build = (assumptions = DEFAULT_MOBILITY) =>
  buildMobilityAnalysis(MOBILITY_QUESTION, user, context, shell, assumptions);
describe('Flyttemønstre → kapacitet → kontrolleret handling', () => {
  it('routes the complete question and scenario follow-ups to the unified case', () => {
    const parsed = parseQuestion(MOBILITY_QUESTION, user, shell);
    expect(parsed.intent).toBe('mobilityCapacity');
    const next = parseQuestion('Hvad hvis tilflytningen stiger 25 procent?', user, shell, parsed);
    expect(next.intent).toBe('mobilityCapacity');
    expect(next.mobilityAssumptions?.migrationChangePercent).toBe(25);
    expect(analyze(MOBILITY_QUESTION, user, undefined, parsed, shell).mobility).toBeDefined();
  });
  it('reproduces all rows, versions and facts from the same snapshot', () => {
    expect(build()).toEqual(build());
    expect(build().mobility!.history).toHaveLength(16 * 5);
    expect(new Set(build().mobility!.history.map((r) => r.year))).toEqual(
      new Set([2021, 2022, 2023, 2024, 2025]),
    );
  });
  it('shares pupil stock with the economic dataset and reconciles every historical change', () => {
    for (const row of build().mobility!.history) {
      const entity = shell.entities.find((e) => e.id === row.entityId)!;
      expect(row.pupils).toBe(pupilsForYear(entity, row.year));
      expect(row.migrationPupils + row.cohortBalance).toBe(
        row.pupils - pupilsForYear(entity, row.year - 1),
      );
    }
  });
  it('balances internal moves for each full-organisation year', () => {
    for (const year of [2021, 2022, 2023, 2024, 2025])
      expect(
        build()
          .mobility!.history.filter((r) => r.year === year)
          .reduce((n, r) => n + r.internalIn - r.internalOut, 0),
      ).toBe(0);
  });
  it('returns only scoped rows, schools and source excerpts', () => {
    const scoped = { ...context, entityIds: ['school-hoeng'] };
    const a = buildMobilityAnalysis(
      MOBILITY_QUESTION,
      { ...user, unitIds: scoped.entityIds },
      scoped,
      shell,
    );
    expect(a.mobility!.schools.map((s) => s.id)).toEqual(scoped.entityIds);
    expect(a.mobility!.history.every((r) => r.entityId === 'school-hoeng')).toBe(true);
    expect(JSON.stringify(a.sources)).not.toContain('school-nyrup');
  });
  it('sums local shortages without pooling spare capacity', () => {
    const c = build().mobility!;
    expect(c.scenario.at(-1)!.shortage).toBe(c.schoolResults.reduce((n, r) => n + r.shortage, 0));
    expect(c.schoolResults.some((r) => r.shortage > 0)).toBe(true);
    expect(c.schoolResults.some((r) => r.capacity > r.pupils)).toBe(true);
  });
  it('changes only the migration assumption and leaves original history/baseline untouched', () => {
    const a = build(),
      b = build({ ...DEFAULT_MOBILITY, migrationChangePercent: 25 });
    expect(b.mobility!.history).toEqual(a.mobility!.history);
    expect(b.mobility!.baseline).toEqual(a.mobility!.baseline);
    expect(b.mobility!.scenario.at(-1)!.pupils).toBeGreaterThan(
      a.mobility!.scenario.at(-1)!.pupils,
    );
    expect(a.mobility!.costDeltaOre).toBe(0);
  });
  it('allocates each new class once and prices fixed annual drift precisely', () => {
    const a = build().mobility!,
      b = build({ ...DEFAULT_MOBILITY, extraClasses: 2 }).mobility!;
    expect(b.schoolResults.reduce((n, r) => n + r.extraClasses, 0)).toBe(2);
    for (let i = 0; i < 5; i++) {
      expect(b.scenario[i].capacity - a.scenario[i].capacity).toBe(48);
      expect(b.scenario[i].pupils).toBe(a.scenario[i].pupils);
      expect(b.scenario[i].fixedCostOre).toBe(2 * CLASS_COST_ORE);
    }
    expect(b.costDeltaOre).toBe(2 * CLASS_COST_ORE);
  });
  it('isolates a variable-unit-cost change and handles zero without fallback defaults', () => {
    const c = build({ ...DEFAULT_MOBILITY, variableCostOre: 0 }).mobility!;
    expect(c.scenario.at(-1)!.variableCostOre).toBe(0);
    expect(c.costDeltaOre).toBe(-c.baseline.at(-1)!.variableCostOre);
    expect(c.scenario.at(-1)!.pupils).toBe(c.baseline.at(-1)!.pupils);
  });
  it('recomputes a saved case from its frozen rows even if the generator seed changes', () => {
    const a = build();
    expect(
      buildMobilityAnalysis(
        MOBILITY_QUESTION,
        user,
        context,
        { ...shell, seed: 'changed' },
        DEFAULT_MOBILITY,
        a.mobility,
      ).mobility,
    ).toEqual(a.mobility);
  });
  it.each([-101, 201, 1.5])('rejects invalid migration %s', (value) =>
    expect(() => build({ ...DEFAULT_MOBILITY, migrationChangePercent: value })).toThrow(),
  );
  it('rejects invalid class count, scope and reference periods', () => {
    expect(() => build({ ...DEFAULT_MOBILITY, extraClasses: 21 })).toThrow();
    expect(() =>
      buildMobilityAnalysis(
        MOBILITY_QUESTION,
        { ...user, unitIds: ['school-hoeng'] },
        context,
        shell,
      ),
    ).toThrow();
    expect(() =>
      buildMobilityAnalysis(
        MOBILITY_QUESTION,
        user,
        { ...context, period: { year: 2025, fromMonth: 1, toMonth: 12 } },
        shell,
      ),
    ).toThrow();
  });
  it('rejects council-only access at calculation and source-routing boundaries', () => {
    const council = { ...user, roles: ['KAIA.Council'] as AccessContext['roles'] };
    expect(() => buildMobilityAnalysis(MOBILITY_QUESTION, council, context, shell)).toThrow();
    expect(() => planQuery(MOBILITY_QUESTION, context, council)).toThrow();
  });
  it('uses three registered and independently authorized sources', () => {
    expect(planQuery(MOBILITY_QUESTION, context, user).steps.map((s) => s.sourceId)).toEqual([
      'mobility-history',
      'school-capacity',
      'capacity-scenarios',
    ]);
  });
  it('keeps graph, KPIs, model evidence and sources on one version', () => {
    const a = build(),
      last = a.mobility!.scenario.at(-1)!;
    expect(a.metrics[0].value).toBe(a.chart!.rows.at(-1)!.scenario);
    expect(a.metrics[0].value).toBe(last.pupils);
    const evidence = buildAnswerEvidence(a);
    expect(evidence.chart!.rowCount).toBe(10);
    expect(
      a.sources.every(
        (s) =>
          s.id.startsWith('DEMO-') &&
          s.status === 'simulated' &&
          s.type === 'demo' &&
          s.datasetVersion === a.datasetVersion &&
          !s.url,
      ),
    ).toBe(true);
  });
  it('parses a reduction and rejects out-of-range free-text assumptions', () => {
    expect(
      mobilityQuestionAssumptions('Hvad hvis tilflytningen falder 50 procent?')
        .migrationChangePercent,
    ).toBe(-50);
    expect(() =>
      mobilityQuestionAssumptions('Hvad hvis tilflytningen stiger 500 procent?'),
    ).toThrow();
  });
  it('binds approval to the exact context, source rows and assumptions', () => {
    const a = build(),
      b = build({ ...DEFAULT_MOBILITY, extraClasses: 1 });
    expect(planFingerprint(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(planFingerprint(a)).not.toBe(planFingerprint(b));
    expect(buildPlanDraft(a).effect).toContain('Ingen bevilling');
    expect(canApprovePlan(user)).toBe(true);
    expect(canApprovePlan({ ...user, roles: ['KAIA.Finance'] })).toBe(false);
  });
  it('records six actual stages with immutable snapshots and no automatic completion', () => {
    const t = createTrace('fixture-run');
    expect(t.snapshot().steps.map((s) => s.label)).toEqual([...TRACE_LABELS]);
    expect(t.snapshot().steps.every((s) => s.state === 'pending' && !s.startedAt)).toBe(true);
    t.update(0, 'running', 'Parsing');
    const before = t.snapshot();
    t.update(0, 'completed', 'Parsed');
    expect(before.steps[0].state).toBe('running');
    expect(t.snapshot().steps[0].finishedAt).toBeDefined();
    expect(t.snapshot().steps[1].state).toBe('pending');
    t.update(1, 'error', 'Unavailable');
    expect(t.snapshot().steps[1].state).toBe('error');
  });
});
