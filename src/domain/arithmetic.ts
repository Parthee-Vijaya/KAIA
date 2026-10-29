/** Exact rounding to the nearest øre, with half ties towards +∞, matching Math.round. */
export function roundMoneyRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new Error('Beløbsberegningen kræver en positiv nævner.');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded =
    remainder >= 0n
      ? quotient + (remainder * 2n >= denominator ? 1n : 0n)
      : quotient - (-remainder * 2n > denominator ? 1n : 0n);
  const value = Number(rounded);
  if (!Number.isSafeInteger(value)) throw new Error('Beløbet overstiger sikre heltal i øre.');
  return value;
}

function decimalRatio(value: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isFinite(value)) throw new Error('Procenten skal være et endeligt tal.');
  const [coefficient, exponent = '0'] = value.toString().toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const [whole, fractional = ''] = coefficient.replace(/^[+-]/, '').split('.');
  const scale = fractional.length - Number(exponent);
  const digits = BigInt(whole + fractional) * (negative ? -1n : 1n);
  return scale < 0
    ? { numerator: digits * 10n ** BigInt(-scale), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(scale) };
}

/** Decimal percentages and the optional variable-cost share are multiplied before one final rounding. */
export function percentageEffectOre(
  amountOre: number,
  percent: number,
  share = { numerator: 1, denominator: 1 },
): number {
  if (
    !Number.isSafeInteger(amountOre) ||
    !Number.isSafeInteger(share.numerator) ||
    !Number.isSafeInteger(share.denominator) ||
    share.denominator <= 0
  )
    throw new Error('Beløbsberegningen kræver heltal i øre og en gyldig omkostningsandel.');
  const ratio = decimalRatio(percent);
  return roundMoneyRatio(
    BigInt(amountOre) * ratio.numerator * BigInt(share.numerator),
    ratio.denominator * 100n * BigInt(share.denominator),
  );
}
