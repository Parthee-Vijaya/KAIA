import type { AccessContext, Area, DemoDocument, Entity } from './types';
const roles = new Set([
  'KAIA.Admin',
  'KAIA.Executive',
  'KAIA.Finance',
  'KAIA.DepartmentHead',
  'KAIA.Council',
]);
export class AccessDeniedError extends Error {
  readonly status = 403;
  readonly code = 'ACCESS_DENIED';
  constructor(message = 'Du har ikke adgang til det valgte område.') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}
export function isAdmin(access: AccessContext): boolean {
  return access.roles.includes('KAIA.Admin');
}
export function isCouncilOnly(access: AccessContext): boolean {
  return (
    access.roles.includes('KAIA.Council') &&
    !access.roles.some((r) => r !== 'KAIA.Council' && roles.has(r))
  );
}
export function hasIdentity(access: AccessContext): boolean {
  return Boolean(
    access.userId && access.tenantId && access.objectId && access.roles.some((r) => roles.has(r)),
  );
}
export function canAccessEntity(
  access: AccessContext,
  entity: Entity,
  entities: Entity[] = [],
): boolean {
  if (!hasIdentity(access) || !access.areas.includes(entity.area)) return false;
  return (
    access.unitIds.includes('*') ||
    access.unitIds.includes(entity.id) ||
    entities.some(
      (e) => e.type === 'committee' && e.area === entity.area && access.unitIds.includes(e.id),
    )
  );
}
export function allowedEntities(access: AccessContext, entities: Entity[]): Entity[] {
  return entities.filter((e) => canAccessEntity(access, e, entities));
}
export function assertScope(
  access: AccessContext,
  entityIds: string[],
  entities: Entity[],
  area?: Area,
): void {
  if (!hasIdentity(access) || (area && !access.areas.includes(area))) throw new AccessDeniedError();
  if (
    entityIds.length === 0 ||
    entityIds.some(
      (id) => !entities.some((e) => e.id === id && canAccessEntity(access, e, entities)),
    )
  )
    throw new AccessDeniedError();
}
export function canAccessDocument(
  access: AccessContext,
  doc: DemoDocument,
  entities: Entity[],
): boolean {
  if (
    !hasIdentity(access) ||
    !access.areas.includes(doc.area) ||
    (isCouncilOnly(access) && doc.classification !== 'political')
  )
    return false;
  // A document may describe several units: require its complete scope, never leak a mixed-scope extract.
  return (
    doc.entityIds.length > 0 &&
    doc.entityIds.every((id) =>
      entities.some((e) => e.id === id && canAccessEntity(access, e, entities)),
    )
  );
}
export function assertDocumentAccess(
  access: AccessContext,
  doc: DemoDocument,
  entities: Entity[],
): void {
  if (!canAccessDocument(access, doc, entities))
    throw new AccessDeniedError('Du har ikke adgang til denne kilde.');
}
export function canUseDetailedData(access: AccessContext): boolean {
  return hasIdentity(access) && !isCouncilOnly(access);
}
