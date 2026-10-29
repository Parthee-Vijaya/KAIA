import { describe, expect, it } from 'vitest';
import { buildIllustration } from '../src/domain/illustrations';
import { entityRegistry, type Dataset } from '../src/domain/data';
import type { AccessContext } from '../src/domain/types';
import {
  decimalToScaled,
  illustrationFromNatural,
  illustrationToNatural,
  modelIllustrationSpec,
} from '../src/server/illustration-wire';

const natural = () => ({
  kind: 'investment' as const,
  title: 'Illustrativ investering',
  years: 5,
  assumptions: ['Alle tal er antagelser.'],
  terms: [
    {
      label: 'Opstart',
      kind: 'upfrontCost' as const,
      quantityFactors: [{ label: 'Antal', value: 1 }],
      divisor: 1,
      unitValueDkk: 750000,
    },
    {
      label: 'Drift',
      kind: 'annualCost' as const,
      quantityFactors: [{ label: 'Antal', value: 1 }],
      divisor: 1,
      unitValueDkk: 120000,
    },
    {
      label: 'Frigjort tid',
      kind: 'annualBenefit' as const,
      quantityFactors: [
        { label: 'Medarbejdere', value: 100 },
        { label: 'Minutter pr. uge', value: 15 },
        { label: 'Uger', value: 46 },
      ],
      divisor: 60,
      unitValueDkk: 350,
      quantityUnit: 'timer',
      cashRealizationPercent: 0,
    },
  ],
});
const shell: Dataset = {
  version: 'NATURAL-FIXTURE',
  seed: 'natural-fixture',
  referenceDate: '2026-09-30',
  coverage: { fromYear: 2023, toYear: 2032 },
  entities: entityRegistry().filter((entity) => entity.id === 'school-hoeng'),
  rows: [],
  documents: [],
  demography: [],
};
const user: AccessContext = {
  userId: 'fixture',
  tenantId: 'fixture',
  objectId: 'fixture',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
};
const context = {
  area: 'schools' as const,
  entityIds: ['school-hoeng'],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
};

describe('exact natural-number illustration wire contract', () => {
  it.each([
    [0.29, 2, 29],
    [1.005, 3, 1005],
    [15, 3, 15000],
    [-12.34, 2, -1234],
    [0.001, 3, 1],
    [1e-2, 2, 1],
    [750000, 2, 75000000],
  ] as const)('converts %s exactly at%d decimals', (value, digits, expected) => {
    expect(decimalToScaled(value, digits)).toBe(expected);
  });
  it.each([
    [0.001, 2],
    [1.0001, 3],
    [0.1 + 0.2, 3],
    [Infinity, 2],
    [NaN, 2],
    [1e20, 2],
  ] as const)('rejects nonfinite, excess precision or unsafe %s', (value, digits) => {
    expect(() => decimalToScaled(value, digits)).toThrow();
  });
  it('converts fixed kroner amounts and quantities once, without model multiplication', () => {
    const spec = illustrationFromNatural(natural());
    if (spec.kind !== 'investment') throw new Error('Expected investment');
    expect(spec.terms[0]).toMatchObject({
      quantityFactors: [{ valueMilli: 1000 }],
      divisor: 1,
      unitValueOre: 75000000,
    });
    expect(spec.terms[1].unitValueOre).toBe(12000000);
    expect(spec.terms[2].quantityFactors.map((factor) => factor.valueMilli)).toEqual([
      100000, 15000, 46000,
    ]);
    expect(spec.terms[2].unitValueOre).toBe(35000);
    expect(spec.terms[2].cashRealizationBps).toBe(0);
  });
  it('calculates the15to20minute example from natural values with unchanged investment and no cash gain', () => {
    for (const [minutes, capacity] of [
      [15, 40250000],
      [20, 53666667],
    ] as const) {
      const wire = natural();
      wire.terms[2].quantityFactors[1].value = minutes;
      const result = buildIllustration(
        'En illustration',
        user,
        context,
        illustrationFromNatural(wire),
        shell,
      );
      const calculation = result.illustration!.calculation;
      if (calculation.kind !== 'investment') throw new Error('Expected investment');
      expect(calculation.upfrontCostOre).toBe(75000000);
      expect(calculation.annualCostOre).toBe(12000000);
      expect(calculation.annualCapacityValueOre).toBe(capacity);
      expect(calculation.annualCashBenefitOre).toBe(0);
    }
  });
  it('sends the saved previous model back in natural units and round-trips it exactly', () => {
    const original = illustrationFromNatural(natural());
    const payload = illustrationToNatural(original);
    expect(payload).toEqual(natural());
    expect(JSON.stringify(payload)).not.toMatch(/valueMilli|unitValueOre|cashRealizationBps/);
    expect(illustrationFromNatural(payload)).toEqual(original);
  });
  it('scales activity quantities and percentage points exactly', () => {
    const wire = {
      kind: 'activity',
      title: 'Illustrative besøg',
      years: 3,
      initialQuantity: 125.555,
      annualChangePercent: -2.35,
      unit: 'besøg',
      assumptions: [],
    };
    const spec = illustrationFromNatural(wire);
    expect(spec).toMatchObject({ initialQuantityMilli: 125555, annualChangeBps: -235 });
    expect(illustrationToNatural(spec)).toEqual(wire);
  });
  it('rejects internal storage fields and mixed fields as model output', () => {
    const spec = illustrationFromNatural(natural());
    expect(() => modelIllustrationSpec(spec)).toThrow();
    if (spec.kind !== 'investment') throw new Error('Expected investment');
    const mixed = { ...natural(), terms: [{ ...natural().terms[0], unitValueOre: 75000000 }] };
    expect(() => modelIllustrationSpec(mixed)).toThrow();
    expect(() => modelIllustrationSpec({ ...spec, initialQuantity: 1 })).toThrow();
  });
  it.each([
    { ...natural(), years: 21 },
    { ...natural(), terms: [{ ...natural().terms[0], unitValueDkk: 0.001 }] },
    {
      ...natural(),
      terms: [{ ...natural().terms[0], quantityFactors: [{ label: 'Antal', value: 1.0001 }] }],
    },
    { ...natural(), terms: [{ ...natural().terms[2], cashRealizationPercent: 100.01 }] },
    { ...natural(), terms: [{ ...natural().terms[2], cashRealizationPercent: 0.001 }] },
  ])('rejects bounds/precision errors without guessing corrected values %#', (input) => {
    expect(() => illustrationFromNatural(input)).toThrow();
  });
});
