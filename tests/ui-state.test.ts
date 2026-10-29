import { describe, it, expect } from 'vitest';
import {
  filtersForAnalysis,
  selectedEntityIds,
  MULTI_SELECTION,
  dashboardAccessKey,
  snapshotInitialFilters,
} from '../src/components/workspace-state';
import { publicEntity } from '../src/domain/public-entity';
import type { AccessContext, Analysis, Entity } from '../src/domain/types';
const entities = [
  { id: 'school-hoeng', area: 'schools', type: 'school' },
  { id: 'school-nyrup', area: 'schools', type: 'school' },
  { id: 'school-svebolle', area: 'schools', type: 'school' },
] as Entity[];
const analysis = {
  context: {
    period: { year: 2025, fromMonth: 1, toMonth: 6 },
    area: 'schools',
    entityIds: ['school-hoeng', 'school-nyrup'],
  },
} as Analysis;
describe('genåbning og skift af analyseafgrænsning', () => {
  it('genopretter hele perioden og en tydelig flerenhedsmarkering', () => {
    expect(filtersForAnalysis(analysis, entities)).toEqual({
      year: 2025,
      toMonth: 6,
      area: 'schools',
      unit: MULTI_SELECTION,
    });
    expect(selectedEntityIds(MULTI_SELECTION, analysis)).toEqual(analysis.context.entityIds);
  });
  it('vælg alle fjerner en tidligere smal afgrænsning', () => {
    expect(selectedEntityIds('', analysis)).toEqual([]);
  });
  it('et navngivet institutionssvar erstatter et gammelt institutionsfilter', () => {
    const next = { ...analysis, context: { ...analysis.context, entityIds: ['school-svebolle'] } };
    expect(filtersForAnalysis(next, entities).unit).toBe('school-svebolle');
    expect(selectedEntityIds('school-svebolle', analysis)).toEqual(['school-svebolle']);
  });
  it('alle tilladte enheder vises som alle, uden en skjult flerenhedsafgrænsning', () => {
    const next = {
      ...analysis,
      context: { ...analysis.context, entityIds: entities.map((e) => e.id) },
    };
    expect(filtersForAnalysis(next, entities).unit).toBe('');
  });
});

describe('offentlige navigationsmetadata', () => {
  it('sender aldrig syntetiske institutionsbudgetter eller elevtal til arbejdsfladens klient', () => {
    const input = {
      id: 'school-hoeng',
      name: 'Høng Skole',
      aliases: ['Høng'],
      type: 'school',
      area: 'schools',
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-20',
      synthetic: { annualBudgetOre: 500000000, pupils: 400 },
    } as Entity;
    const output = publicEntity(input);
    expect(output.name).toBe('Høng Skole');
    expect(JSON.stringify(output)).not.toContain('annualBudgetOre');
    expect(JSON.stringify(output)).not.toContain('pupils');
    expect(output).not.toHaveProperty('synthetic');
  });
});

describe('dashboardets identitet og aktuelle adgang', () => {
  const access: AccessContext = {
    userId: 'fixture-user',
    tenantId: 'fixture-tenant',
    objectId: 'fixture-object',
    roles: ['KAIA.Finance', 'KAIA.Executive'],
    areas: ['schools', 'facilities'],
    unitIds: ['school-hoeng', 'school-nyrup'],
    displayName: 'Økonomikonsulent',
    title: 'Chef',
  };
  it('isolerer paneler ved ændrede enhedsrettigheder, roller og områdescope for samme bruger', () => {
    const current = dashboardAccessKey(access);
    for (const changed of [
      { ...access, unitIds: ['school-hoeng'] },
      { ...access, unitIds: ['*'] },
      { ...access, roles: ['KAIA.Council'] as AccessContext['roles'] },
      { ...access, roles: [] },
      { ...access, areas: ['schools'] as AccessContext['areas'] },
    ])
      expect(dashboardAccessKey(changed)).not.toBe(current);
  });
  it('isolerer identiteter selv ved ens lokalt bruger-ID eller ens grants', () => {
    const current = dashboardAccessKey(access);
    for (const changed of [
      { ...access, tenantId: 'another-tenant' },
      { ...access, objectId: 'another-object' },
      { ...access, userId: 'another-user' },
    ])
      expect(dashboardAccessKey(changed)).not.toBe(current);
    expect(dashboardAccessKey(undefined)).toBe('');
    expect(dashboardAccessKey({ ...access, objectId: '' })).toBe('');
  });
  it('genbruger samme scope ved omordnede eller gentagne grants uden at ændre inputtet', () => {
    const before = structuredClone(access);
    const reordered: AccessContext = {
      ...access,
      roles: ['KAIA.Executive', 'KAIA.Finance', 'KAIA.Finance'],
      unitIds: ['school-nyrup', 'school-hoeng', 'school-hoeng'],
      areas: ['facilities', 'schools'],
      displayName: 'Funktionsprofil',
      title: 'Ny visningstitel',
    };
    expect(dashboardAccessKey(reordered)).toBe(dashboardAccessKey(access));
    expect(access).toEqual(before);
  });
});

describe('første dashboardperiode følger datasnapshot', () => {
  it.each([
    ['2026-09-30', { year: 2026, toMonth: 9 }],
    ['2025-04-30', { year: 2025, toMonth: 4 }],
    ['2024-02-29', { year: 2024, toMonth: 2 }],
    ['2032-12-31', { year: 2032, toMonth: 12 }],
  ] as const)(
    'bruger observationen %s frem for et fast år eller dags dato',
    (reference, expected) => {
      expect(snapshotInitialFilters(reference)).toEqual(expected);
    },
  );
  it.each([
    '',
    '30/09/2026',
    '2026-04-31',
    '2026-02-29',
    '2026-00-01',
    '2026-13-01',
    '2019-12-31',
    '2033-01-01',
  ])('afviser ugyldig referencedato %s uden at erstatte den med et andet snapshot', (reference) => {
    expect(() => snapshotInitialFilters(reference)).toThrow(/referencedato/);
  });
});
