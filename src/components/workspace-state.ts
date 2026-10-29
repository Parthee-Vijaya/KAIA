import type { AccessContext, Analysis, Entity } from '@/domain/types';

export type DashboardAccess = Pick<
  AccessContext,
  'userId' | 'tenantId' | 'objectId' | 'roles' | 'unitIds' | 'areas'
>;

/** UI cache partition only; the server independently authorizes every request. */
export function dashboardAccessKey(access: DashboardAccess | undefined): string {
  if (!access?.userId || !access.tenantId || !access.objectId) return '';
  const ordered = (values: string[]) => [...new Set(values)].sort();
  return JSON.stringify({
    identity: [access.userId, access.tenantId, access.objectId],
    roles: ordered(access.roles),
    unitIds: ordered(access.unitIds),
    areas: ordered(access.areas),
  });
}

/** Start at the immutable snapshot's observation period, independent of today's clock. */
export function snapshotInitialFilters(referenceDate: string): { year: number; toMonth: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate))
    throw new Error('Datasættets referencedato skal være en gyldig dato i formatet ÅÅÅÅ-MM-DD.');
  const [year, month, day] = referenceDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2020 ||
    year > 2032 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== referenceDate
  )
    throw new Error('Datasættets referencedato skal være en gyldig dato inden for 2020–2032.');
  return { year, toMonth: month };
}

/** A multi-selection has its own control value; empty always means all permitted units. */
export const MULTI_SELECTION = '__selection';
export function filtersForAnalysis(
  analysis: Analysis,
  entities: Pick<Entity, 'id' | 'area' | 'type'>[],
) {
  const context = analysis.context;
  const count = entities.filter((e) => e.area === context.area && e.type !== 'committee').length;
  return {
    year: context.period.year,
    toMonth: context.period.toMonth,
    area: context.area,
    unit:
      context.entityIds.length === 1
        ? context.entityIds[0]
        : context.entityIds.length < count
          ? MULTI_SELECTION
          : '',
  };
}
export function selectedEntityIds(unit: string, analysis: Analysis | undefined) {
  return unit === MULTI_SELECTION ? [...(analysis?.context.entityIds ?? [])] : unit ? [unit] : [];
}
