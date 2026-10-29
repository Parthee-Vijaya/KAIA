import type { AccessContext } from '../domain/types';
import { SOURCE_CATALOG } from './catalog';
import { entityRegistry } from '../domain/data';
import { assertScope, canUseDetailedData } from '../domain/policy';
import type { CatalogSource, SourceRequest } from './types';

export class IntegrationPolicyError extends Error {
  readonly code = 'INTEGRATION_ACCESS_DENIED';
  constructor(message = 'Du har ikke adgang til den valgte kilde, operation eller afgrænsning.') {
    super(message);
    this.name = 'IntegrationPolicyError';
  }
}

export function authorizeSource(access: AccessContext, request: SourceRequest): CatalogSource {
  const source = SOURCE_CATALOG.find((item) => item.id === request.sourceId);
  if (
    !access.userId ||
    !access.tenantId ||
    !access.objectId ||
    !source ||
    !access.roles.some((role) => source.roles.includes(role))
  )
    throw new IntegrationPolicyError();
  if (
    !source.areas.includes(request.area) ||
    request.unitIds.some((id) => source.unitIds.length > 0 && !source.unitIds.includes(id))
  )
    throw new IntegrationPolicyError();
  try {
    assertScope(access, request.unitIds, entityRegistry(), request.area);
  } catch {
    throw new IntegrationPolicyError();
  }
  if (
    !source.operations.includes(request.operation) ||
    (request.operation === 'ingest' && !access.roles.includes('KAIA.Admin'))
  )
    throw new IntegrationPolicyError();
  if (request.operation === 'detail' && !canUseDetailedData(access))
    throw new IntegrationPolicyError(
      'Din adgang omfatter aggregerede oplysninger, ikke detaljerede posteringer.',
    );
  const { year, fromMonth, toMonth } = request.period;
  if (
    !Number.isInteger(year) ||
    year < source.period.fromYear ||
    year > source.period.toYear ||
    !Number.isInteger(fromMonth) ||
    !Number.isInteger(toMonth) ||
    fromMonth < 1 ||
    toMonth > 12 ||
    fromMonth > toMonth
  )
    throw new IntegrationPolicyError('Kilden dækker ikke den valgte periode.');
  if (
    request.periodRange &&
    (!Number.isInteger(request.periodRange.fromYear) ||
      !Number.isInteger(request.periodRange.toYear) ||
      request.periodRange.fromYear < source.period.fromYear ||
      request.periodRange.toYear > source.period.toYear ||
      request.periodRange.fromYear > request.periodRange.toYear)
  )
    throw new IntegrationPolicyError('Kilden dækker ikke det valgte årsspænd.');
  return source;
}
