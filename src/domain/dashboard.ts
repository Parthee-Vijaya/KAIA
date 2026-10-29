import { z } from 'zod';
import type { Analysis, Area, InsightSuggestion, Period } from './types';

export interface DashboardScope {
  area: Area;
  entityIds: string[];
  period: Period;
}
export interface DashboardQuery {
  area?: Area;
  year?: number;
  fromMonth?: number;
  toMonth?: number;
  entityIds?: string[];
  datasetVersion?: string;
}
export type DashboardPanel =
  | { status: 'ready'; analysis: Analysis }
  | { status: 'missing' | 'unsupported'; code: string; reason: string; analysis?: Analysis };
export type DashboardPanelKey =
  'budget' | 'year' | 'forecast' | 'perPupil' | 'waterfall' | 'heatmap' | 'peer' | 'comparison';
export interface DashboardData {
  dataset: {
    version: string;
    referenceDate: string;
    coverage: { fromYear: number; toYear: number };
    status: 'simulated';
  };
  scope: DashboardScope;
  capabilities: { detail: boolean; perPupil: boolean; municipalBenchmark: boolean };
  suggestions: InsightSuggestion[];
  panels: Record<DashboardPanelKey, DashboardPanel>;
}

const areaSchema = z.enum([
  'schools',
  'facilities',
  'social',
  'health',
  'environment',
  'administration',
  'preparedness',
]);
const yearSchema = z.number().int().min(2020).max(2032);
const monthSchema = z.number().int().min(1).max(12);
const entitySchema = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/);
export const dashboardVersionSchema = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/);
export const dashboardScopeSchema = z
  .object({
    area: areaSchema,
    entityIds: z.array(entitySchema).min(1).max(100),
    period: z
      .object({ year: yearSchema, fromMonth: monthSchema, toMonth: monthSchema })
      .strict()
      .refine((period) => period.fromMonth <= period.toMonth),
  })
  .strict();
export const dashboardQuerySchema = z
  .object({
    area: areaSchema.optional(),
    year: yearSchema.optional(),
    fromMonth: monthSchema.optional(),
    toMonth: monthSchema.optional(),
    entityIds: z.array(entitySchema).min(1).max(100).optional(),
    datasetVersion: dashboardVersionSchema.optional(),
  })
  .strict()
  .refine(
    (query) =>
      query.fromMonth === undefined ||
      query.toMonth === undefined ||
      query.fromMonth <= query.toMonth,
  );
export const dashboardAssumptionsSchema = z
  .object({
    energyPercent: z.number().min(-100).max(200),
    salaryPercent: z.number().min(-50).max(100),
    substitutePercent: z.number().min(-100).max(200),
    pupilsPercent: z.number().min(-50).max(50),
    budgetPercent: z.number().min(-50).max(100),
    maintenancePercent: z.number().min(-100).max(200),
    horizon: z.enum(['remaining', 'annual']),
  })
  .strict();
export const dashboardScenarioSchema = z
  .object({
    context: dashboardScopeSchema,
    datasetVersion: dashboardVersionSchema,
    assumptions: dashboardAssumptionsSchema,
  })
  .strict();
export type DashboardScenarioInput = z.infer<typeof dashboardScenarioSchema>;

/** Reject unknown keys, ambiguous scalar duplicates and coercions such as empty or hexadecimal years. */
export function parseDashboardQuery(parameters: URLSearchParams): DashboardQuery {
  const scalar = ['area', 'year', 'fromMonth', 'toMonth', 'datasetVersion'];
  for (const key of parameters.keys()) {
    if (key !== 'entityId' && !scalar.includes(key)) throw new Error('Ukendt dashboardparameter.');
    if (key !== 'entityId' && parameters.getAll(key).length !== 1)
      throw new Error('En dashboardparameter må kun angives én gang.');
  }
  const input: Record<string, unknown> = {};
  for (const key of scalar) {
    const value = parameters.get(key);
    if (value === null) continue;
    if (['year', 'fromMonth', 'toMonth'].includes(key)) {
      if (!/^\d{1,4}$/.test(value)) throw new Error('Ugyldig dashboardperiode.');
      input[key] = Number(value);
    } else input[key] = value;
  }
  if (parameters.has('entityId')) input.entityIds = parameters.getAll('entityId');
  return dashboardQuerySchema.parse(input);
}
