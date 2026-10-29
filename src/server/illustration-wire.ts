import { z } from 'zod';
import { illustrationSpecSchema } from '@/domain/illustrations';
import type { IllustrationSpec } from '@/domain/types';
import { ApiError } from './errors';

const title = z.string().trim().min(1).max(120);
const assumptions = z.array(z.string().trim().min(1).max(300)).max(8).default([]);
const years = z.number().int().min(1).max(20);
const unit = z.enum(['timer', 'minutter', 'besøg', 'elever', 'borgere', 'km', 'enheder']);
const term = z
  .object({
    label: z.string().trim().min(1).max(80),
    kind: z.enum(['upfrontCost', 'annualCost', 'annualBenefit']),
    quantityFactors: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(60),
            value: z
              .number()
              .min(0)
              .max(1_000_000)
              .describe(
                'Naturligt antal, fx 15 minutter eller 100 medarbejdere; højst3 decimaler.',
              ),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    divisor: z.union([z.literal(1), z.literal(60), z.literal(1000)]),
    unitValueDkk: z
      .number()
      .min(0)
      .max(100_000_000)
      .describe('Naturlig pris i kroner, fx 750000 kr. eller 350 kr./time; højst2 decimaler.'),
    quantityUnit: unit.optional(),
    cashRealizationPercent: z
      .number()
      .min(0)
      .max(100)
      .describe('Naturlig procent 0–100; 0 betyder ingen kontant besparelse.')
      .optional(),
  })
  .strict();

/** This is the only numerical representation advertised to a model. */
export const naturalIllustrationSpecSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('investment'),
      title,
      years,
      terms: z.array(term).min(1).max(6),
      assumptions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('activity'),
      title,
      years,
      initialQuantity: z
        .number()
        .min(0)
        .max(1_000_000_000)
        .describe('Naturligt startantal; højst3 decimaler.'),
      annualChangePercent: z
        .number()
        .min(-100)
        .max(100)
        .describe('Naturlig årlig procentændring, fx 2 for2%; højst2 decimaler.'),
      unit,
      assumptions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('process'),
      title,
      steps: z
        .array(
          z
            .object({
              label: z.string().trim().min(1).max(80),
              description: z.string().trim().min(1).max(400),
            })
            .strict(),
        )
        .min(3)
        .max(6),
      assumptions,
    })
    .strict(),
]);
export type NaturalIllustrationSpec = z.infer<typeof naturalIllustrationSpecSchema>;

/** Exact decimal expansion of the JSON number's decimal representation; no floating-point monetary rounding. */
export function decimalToScaled(value: number, digits: 2 | 3): number {
  if (!Number.isFinite(value)) throw new ApiError(422, 'Modelantagelser skal være endelige tal.');
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!match) throw new ApiError(422, 'Modelantagelsens talformat kunne ikke læses.');
  const fraction = match[3] || '';
  const power = Number(match[4] || 0) - fraction.length + digits;
  let integer = BigInt(match[2] + fraction);
  if (power >= 0) integer *= 10n ** BigInt(power);
  else {
    const divisor = 10n ** BigInt(-power);
    if (integer % divisor !== 0n)
      throw new ApiError(422, `Modelantagelsen må højst have ${digits} decimaler.`);
    integer /= divisor;
  }
  if (match[1]) integer = -integer;
  const scaled = Number(integer);
  if (!Number.isSafeInteger(scaled))
    throw new ApiError(422, 'Modelantagelsen overskrider den præcise talrepræsentation.');
  return scaled;
}

export function illustrationFromNatural(input: unknown): IllustrationSpec {
  const parsed = naturalIllustrationSpecSchema.safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      422,
      'Illustrationens antagelser skal bruge ét entydigt format med naturlige tal.',
    );
  const spec = parsed.data;
  const converted =
    spec.kind === 'investment'
      ? {
          kind: spec.kind,
          title: spec.title,
          years: spec.years,
          assumptions: spec.assumptions,
          terms: spec.terms.map(
            ({ unitValueDkk, cashRealizationPercent, quantityFactors, ...rest }) => ({
              ...rest,
              quantityFactors: quantityFactors.map(({ label, value }) => ({
                label,
                valueMilli: decimalToScaled(value, 3),
              })),
              unitValueOre: decimalToScaled(unitValueDkk, 2),
              ...(cashRealizationPercent !== undefined
                ? { cashRealizationBps: decimalToScaled(cashRealizationPercent, 2) }
                : {}),
            }),
          ),
        }
      : spec.kind === 'activity'
        ? {
            kind: spec.kind,
            title: spec.title,
            years: spec.years,
            unit: spec.unit,
            assumptions: spec.assumptions,
            initialQuantityMilli: decimalToScaled(spec.initialQuantity, 3),
            annualChangeBps: decimalToScaled(spec.annualChangePercent, 2),
          }
        : spec;
  const result = illustrationSpecSchema.safeParse(converted);
  if (!result.success)
    throw new ApiError(
      422,
      'Illustrationens antagelser kunne ikke omsættes til en gyldig beregningsmodel.',
    );
  return result.data;
}

/** Owned persisted models keep their internal representation; only the prompt gets natural units. */
export function illustrationToNatural(input: IllustrationSpec): NaturalIllustrationSpec {
  const spec = illustrationSpecSchema.parse(input);
  if (spec.kind === 'investment')
    return {
      kind: spec.kind,
      title: spec.title,
      years: spec.years,
      assumptions: spec.assumptions,
      terms: spec.terms.map(({ unitValueOre, cashRealizationBps, quantityFactors, ...rest }) => ({
        ...rest,
        quantityFactors: quantityFactors.map(({ label, valueMilli }) => ({
          label,
          value: valueMilli / 1000,
        })),
        unitValueDkk: unitValueOre / 100,
        ...(cashRealizationBps !== undefined
          ? { cashRealizationPercent: cashRealizationBps / 100 }
          : {}),
      })),
    };
  if (spec.kind === 'activity')
    return {
      kind: spec.kind,
      title: spec.title,
      years: spec.years,
      unit: spec.unit,
      assumptions: spec.assumptions,
      initialQuantity: spec.initialQuantityMilli / 1000,
      annualChangePercent: spec.annualChangeBps / 100,
    };
  return spec;
}

/** A model response uses exactly one natural representation; internal storage is never accepted as model output. */
export function modelIllustrationSpec(input: unknown): IllustrationSpec {
  return illustrationFromNatural(input);
}
