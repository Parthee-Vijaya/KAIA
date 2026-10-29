import type { Analysis } from '@/domain/types';
const decimal = new Intl.NumberFormat('da-DK', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantity = new Intl.NumberFormat('da-DK', { useGrouping: false, maximumFractionDigits: 4 });
function cell(value: unknown) {
  let text = String(value ?? '');
  if (
    typeof value !== 'number' &&
    !/^-?\d+(?:,\d+)?$/.test(text) &&
    /^[=+@-]/.test(text.trimStart())
  )
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
/** CSV uses readable DKK; JSON preserves integer øre. Only declared monetary columns are converted. */
export function analysisCsv(analysis: Analysis) {
  let headers: string[], rows: unknown[][];
  if (analysis.chart?.type === 'flow') {
    headers = ['Trin', 'Beskrivelse'];
    rows = analysis.chart.rows.map((row) => [row.label, row.description]);
  } else if (analysis.chart) {
    const chart = analysis.chart;
    const keys = [...new Set(chart.rows.flatMap((row) => Object.keys(row)))];
    const moneyKeys = new Set(
      chart.unit === 'ore'
        ? [
            ...chart.series.map((s) => s.key),
            'budget',
            'actual',
            'forecast',
            'variance',
            'start',
            'value',
            'baseline',
            'scenario',
            'amountOre',
            ...(analysis.basisKind === 'illustration' &&
            analysis.illustration?.spec.kind === 'investment'
              ? ['cost', 'benefit', 'capacityValue', 'net', 'cumulative']
              : []),
          ]
        : [],
    );
    headers = keys.map((key) =>
      key === 'label'
        ? 'Enhed / periode'
        : key === 'pupils'
          ? 'Syntetiske elever (antal)'
          : key === 'observed'
            ? 'Realiseret måned (1 = ja)'
            : `${chart.series.find((s) => s.key === key)?.label || (analysis.basisKind === 'illustration' && key === 'net' ? 'Årets kontante netto' : key)}${moneyKeys.has(key) ? ` (${chart.series.some((s) => s.key === key) ? chart.displayUnit || 'kr.' : 'kr.'})` : chart.series.some((s) => s.key === key) && chart.displayUnit ? ` (${chart.displayUnit})` : chart.unit === 'percent' ? ' (%)' : ''}`,
    );
    rows = chart.rows.map((row) =>
      keys.map((key) =>
        typeof row[key] === 'number'
          ? moneyKeys.has(key)
            ? decimal.format(Number(row[key]) / 100)
            : quantity.format(row[key])
          : row[key],
      ),
    );
  } else {
    headers = ['Nøgletal', 'Værdi', 'Enhed'];
    rows = analysis.metrics.map((metric) => [
      metric.label,
      metric.unit === 'ore' ? decimal.format(metric.value / 100) : quantity.format(metric.value),
      metric.displayUnit ||
        (metric.unit === 'ore' ? 'kr.' : metric.unit === 'percent' ? '%' : 'antal'),
    ]);
  }
  return (
    '\uFEFF' +
    [
      [`SIMULEREDE DATA — ${analysis.datasetVersion}`],
      [analysis.title],
      [analysis.chart?.subtitle || ''],
      [
        analysis.chart?.type === 'flow'
          ? 'Kvalitativt forløb; ingen måltal eller scores.'
          : 'Beløb vises i kroner med dansk decimalformat. JSON-eksport bevarer heltal i øre.',
      ],
      ...illustrationProvenance(analysis),
      headers,
      ...rows,
    ]
      .map((row) => row.map(cell).join(';'))
      .join('\r\n')
  );
}

/** Preserve the exact supplied assumptions/calculation alongside the readable chart, never infer new facts. */
function illustrationProvenance(analysis: Analysis): unknown[][] {
  if (analysis.basisKind !== 'illustration') return [];
  const payload = analysis.illustration;
  return [
    ['Grundlag', 'Illustration fra foreslåede antagelser; ikke et udtræk af kommunens regnskab.'],
    ...analysis.sources.map((source) => [
      source.origin === 'assumption'
        ? 'Antagelseskilde'
        : source.origin === 'calculation'
          ? 'Beregningskilde'
          : 'Kilde',
      source.id,
      source.title,
      source.excerpt,
      source.datasetVersion,
    ]),
    ...analysis.assumptions.map((assumption) => ['Forudsætning', assumption]),
    ...(payload
      ? [
          ['Illustrationsversion', payload.version],
          ['Beregningsmodel', payload.spec.kind],
          ['Forudsætninger, præcist format', JSON.stringify(payload.spec)],
          ['Serverresultater, præcist format', JSON.stringify(payload.calculation)],
          ...(payload.spec.kind === 'investment'
            ? payload.spec.terms.map((term) => [
                'Formel',
                term.label,
                `${term.quantityFactors.map((factor) => `${factor.label}: ${factor.valueMilli}/1000`).join(' × ')} ÷ ${term.divisor} × ${term.unitValueOre} øre`,
              ])
            : payload.spec.kind === 'activity'
              ? [
                  [
                    'Formel',
                    'Niveau i år t = startmængde × (1 + årlig ændring / 100)^t; hvert år afrundes fra startmængden',
                    `Startmængde ${payload.spec.initialQuantityMilli}/1000 ${payload.spec.unit}; årlig ændring ${payload.spec.annualChangeBps}/100 procent`,
                  ],
                ]
              : [
                  [
                    'Forløb',
                    'Trinene vises i angivet rækkefølge; der beregnes ingen kvantitative effekter.',
                  ],
                ]),
        ]
      : [
          [
            'Manglende grundlag',
            'Illustrationens strukturerede forudsætninger og beregning er ikke medsendt.',
          ],
        ]),
  ];
}
