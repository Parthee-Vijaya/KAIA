export const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('da-DK', { maximumFractionDigits: digits }).format(value);
export const money = (ore: number, compact = false) =>
  compact && Math.abs(ore) >= 100000000
    ? `${number(ore / 100000000, 1)} mio. kr.`
    : `${number(ore / 100)} kr.`;
export const metricValue = (value: number, unit: string, displayUnit?: string) =>
  unit === 'ore'
    ? money(value, true)
    : unit === 'percent'
      ? `${number(value, 1)} %`
      : number(value, Number.isInteger(value) ? 0 : 2) + (displayUnit ? ` ${displayUnit}` : '');
