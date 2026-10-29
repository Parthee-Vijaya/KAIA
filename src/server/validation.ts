import { mobilityAssumptionsSchema } from '@/domain/mobility';
import { z } from 'zod';
import { ApiError } from './errors';
export const roles = z.enum([
  'KAIA.Admin',
  'KAIA.Executive',
  'KAIA.Finance',
  'KAIA.DepartmentHead',
  'KAIA.Council',
]);
export const areas = z.enum([
  'schools',
  'facilities',
  'social',
  'health',
  'environment',
  'administration',
  'preparedness',
]);
export const assumptionsSchema = z
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
export const contextSchema = z
  .object({
    period: z
      .object({
        year: z.number().int().min(2020).max(2032),
        fromMonth: z.number().int().min(1).max(12),
        toMonth: z.number().int().min(1).max(12),
      })
      .refine((p) => p.fromMonth <= p.toMonth),
    entityIds: z.array(z.string().max(100)).max(100),
    area: areas,
    intent: z.string().max(100).optional(),
    scenario: assumptionsSchema.optional(),
    metric: z.enum(['net', 'energy', 'perPupil', 'perCapita']).optional(),
    comparison: z
      .object({
        kind: z.enum(['year', 'municipality']),
        year: z.number().int().min(2020).max(2032).optional(),
        municipalityId: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
    mobilityAssumptions: mobilityAssumptionsSchema.optional(),
    projectionEndYear: z.number().int().min(2020).max(2032).optional(),
  })
  .strict();
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const expected = new URL(process.env.KAIA_APP_URL || 'http://127.0.0.1:3210').origin;
  if (request.headers.get('origin') !== expected)
    throw new ApiError(403, 'Ugyldig forespørgselsoprindelse.');
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(415, 'Forespørgslen skal være JSON.');
  if (Number(request.headers.get('content-length') || 0) > 24000)
    throw new ApiError(413, 'Forespørgslen er for stor.');
  const text = await request.text();
  if (text.length > 24000) throw new ApiError(413, 'Forespørgslen er for stor.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Ugyldig JSON.');
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'Kontrollér felter, periode og værdier.');
  return parsed.data;
}
