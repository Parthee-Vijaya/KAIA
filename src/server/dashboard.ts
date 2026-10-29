import { z } from 'zod';
import {
  buildDashboard,
  buildDashboardScenario,
  resolveDashboardScope,
} from '@/domain/dashboard-analysis';
import {
  dashboardQuerySchema,
  dashboardScenarioSchema,
  type DashboardData,
  type DashboardQuery,
  type DashboardScenarioInput,
} from '@/domain/dashboard';
import type { AccessContext, Analysis } from '@/domain/types';
import { loadDashboardDataset, loadDatasetShell } from './repository';
import { ApiError } from './errors';

export async function getDashboard(
  access: AccessContext,
  input: DashboardQuery,
): Promise<DashboardData> {
  const query = dashboardQuerySchema.parse(input);
  const shell = await loadDatasetShell(access, query.datasetVersion);
  let scope;
  try {
    scope = resolveDashboardScope(access, shell, query);
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new ApiError(400, 'Kontrollér dashboardets periode og enheder.');
    throw error;
  }
  const dataset = await loadDashboardDataset(access, scope, shell);
  return buildDashboard(dataset, access, scope);
}

export async function getDashboardScenario(
  access: AccessContext,
  input: DashboardScenarioInput,
): Promise<{ analysis: Analysis }> {
  const body = dashboardScenarioSchema.parse(input);
  const shell = await loadDatasetShell(access, body.datasetVersion);
  const scope = resolveDashboardScope(access, shell, {
    area: body.context.area,
    entityIds: body.context.entityIds,
    ...body.context.period,
    datasetVersion: body.datasetVersion,
  });
  const referenceYear = Number(shell.referenceDate.slice(0, 4)),
    referenceMonth = Number(shell.referenceDate.slice(5, 7));
  if (
    body.assumptions.horizon === 'remaining' &&
    (scope.period.year < referenceYear ||
      (scope.period.year === referenceYear && referenceMonth === 12))
  )
    throw new ApiError(
      422,
      'Det valgte år har ingen resterende prognosemåneder. Vælg en eksplicit helårsvirkning for et historisk år.',
    );
  const dataset = await loadDashboardDataset(access, scope, shell, { includeForecast: false });
  try {
    return { analysis: buildDashboardScenario(dataset, access, scope, body.assumptions) };
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new ApiError(400, 'Kontrollér scenariets felter, periode og værdier.');
    if (error instanceof Error && error.message.startsWith('Scenariet mangler'))
      throw new ApiError(422, error.message);
    throw error;
  }
}
