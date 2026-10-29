'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Table2, ChartNoAxesCombined, Expand, Download, ArrowUpRight } from './icon';
import { displayText } from './display-text';
import type { ChartSpec, ChartRow } from '@/domain/types';
import { number } from '@/domain/format';

const chartUnit = (chart: ChartSpec) =>
  chart.displayUnit?.trim() || (chart.unit === 'ore' ? 'kr.' : chart.unit === 'percent' ? '%' : '');

export function formatChartValue(value: unknown, chart: ChartSpec): string {
  const raw = Number(value);
  const formatted = new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: chart.unit === 'ore' ? 2 : 0,
    maximumFractionDigits: chart.unit === 'ore' ? 2 : Number.isInteger(raw) ? 0 : 3,
  }).format(chart.unit === 'ore' ? raw / 100 : raw);
  return formatted + (chartUnit(chart) ? ` ${chartUnit(chart)}` : '');
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (
    typeof value !== 'number' &&
    !/^-?\d+(?:,\d+)?$/.test(text) &&
    /^[=+@-]/.test(text.trimStart())
  )
    text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Original source labels/data are exported; display-only text cleanup never changes the artifact. */
export function chartCsv(chart: ChartSpec, version: string, dataLabel = 'Simulerede data'): string {
  const flow = chart.type === 'flow';
  const numeric = (value: number) =>
    new Intl.NumberFormat('da-DK', {
      useGrouping: false,
      minimumFractionDigits: chart.unit === 'ore' ? 2 : 0,
      maximumFractionDigits: chart.unit === 'ore' ? 2 : 4,
    }).format(chart.unit === 'ore' ? value / 100 : value);
  const headers = flow
    ? ['Trin', 'Beskrivelse']
    : [
        'Enhed / periode',
        ...chart.series.map(
          (series) => series.label + (chartUnit(chart) ? ` (${chartUnit(chart)})` : ''),
        ),
      ];
  const rows = chart.rows.map((row) =>
    flow
      ? [row.label, row.description]
      : [
          row.label,
          ...chart.series.map((series) => {
            const value = row[series.key];
            return typeof value === 'number' ? numeric(value) : value;
          }),
        ],
  );
  return (
    '\uFEFF' +
    [
      [`${dataLabel} · ${version}`, chart.title, chart.subtitle],
      ['Kilder', ...chart.sourceIds],
      ...(flow ? [['Kvalitativt forløb; ingen kvantitative målinger eller scores.']] : []),
      headers,
      ...rows,
    ]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n')
  );
}

const xml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
function wrapFlowText(text: string, max = 91): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).flatMap((word) => {
      const parts: string[] = [];
      for (let start = 0; start < word.length; start += max)
        parts.push(word.slice(start, start + max));
      return parts;
    })) {
      if (line && `${line} ${word}`.length > max) {
        lines.push(line);
        line = '';
      }
      line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

/** The vector export carries the same qualitative steps, never the internal order as measured data. */
export function flowSvg(chart: ChartSpec, version: string, dataLabel = 'Simulerede data'): string {
  let y = 108;
  const elements = chart.rows
    .map((row, index) => {
      const lines = wrapFlowText(String(row.description ?? ''));
      const titleLines = wrapFlowText(row.label, 76);
      const height = 54 + titleLines.length * 20 + lines.length * 18;
      const title = titleLines
        .map(
          (line, i) =>
            `<text x="65" y="${y + 29 + i * 20}" font-size="14" font-weight="600">${xml(line)}</text>`,
        )
        .join('');
      const description = lines
        .map(
          (line, i) =>
            `<text x="65" y="${y + 36 + titleLines.length * 20 + i * 18}" font-size="12" fill="#535e70">${xml(line)}</text>`,
        )
        .join('');
      const result = `<rect x="20" y="${y}" width="860" height="${height}" rx="8" fill="#ffffff" stroke="#e4e5e8"/><text x="36" y="${y + 29}" font-size="11" fill="#006f71">${index + 1}</text>${title}${description}`;
      y += height + 22;
      return result;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${y + 62}" viewBox="0 0 900 ${y + 62}" role="img" aria-label="${xml(chart.title)}"><rect width="100%" height="100%" fill="#fff"/><g font-family="Geist Sans, Arial, sans-serif" fill="#252525"><text x="20" y="29" font-size="17">${xml(chart.title)}</text><text x="20" y="54" font-size="11">${xml(chart.subtitle)}</text><text x="20" y="77" font-size="11" fill="#535e70">Kvalitativt forløb · ingen måltal eller scores</text>${elements}<text x="20" y="${y + 14}" font-size="10">${xml(`${dataLabel} · ${version} · K.A.I.A.`)}</text><text x="20" y="${y + 34}" font-size="10">${xml(`Kilder: ${chart.sourceIds.join(', ')}`)}</text></g></svg>`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function CategoryTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const text = String(payload?.value ?? '');
  const lines: string[] = [''];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if ((lines[last] + ' ' + word).trim().length > 25 && lines[last]) lines.push(word);
    else lines[last] = (lines[last] + ' ' + word).trim();
  }
  if (lines.length > 2) {
    lines[1] = lines[1].slice(0, 22) + '…';
    lines.length = 2;
  }
  return (
    <text x={x - 5} y={y} textAnchor="end" fill="#535e70" fontSize={10}>
      {lines.map((line, i) => (
        <tspan key={i} x={x - 5} dy={i === 0 ? (lines.length > 1 ? -4 : 3) : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
export function AnalysisChart({
  chart: sourceChart,
  version,
  onExpand,
  onExplain,
  large = false,
  compact = false,
  initialTable = false,
  summary,
  dataLabel = 'Simulerede data',
}: {
  chart: ChartSpec;
  version: string;
  onExpand?: (chart: ChartSpec) => void;
  onExplain?: () => void;
  large?: boolean;
  compact?: boolean;
  initialTable?: boolean;
  summary?: ReactNode;
  dataLabel?: string;
}) {
  const chart = useMemo<ChartSpec>(
    () => ({
      ...sourceChart,
      title: displayText(sourceChart.title),
      subtitle: displayText(sourceChart.subtitle),
      rows: sourceChart.rows.map((row) => ({ ...row, label: displayText(row.label) })),
      series: sourceChart.series.map((series) => ({ ...series, label: displayText(series.label) })),
    }),
    [sourceChart],
  );
  const [table, setTable] = useState(initialTable);
  const [heatSelection, setHeatSelection] = useState<{ chart: ChartSpec; label: string }>();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const holder = useRef<HTMLDivElement>(null);
  const lineLike = chart.type === 'line' || chart.type === 'scenario';
  function seriesColor(series: ChartSpec['series'][number]) {
    if (!compact || !lineLike) return series.color;
    return series.key === 'low' || series.key === 'high' || series.key === 'budget'
      ? '#464f5e'
      : series.key === 'base'
        ? '#bc4d30'
        : series.color;
  }
  const formatter = (value: unknown) => formatChartValue(value, chart);
  const axis = (v: number) =>
    chart.unit === 'ore'
      ? Math.abs(v) >= 100000000
        ? `${number(v / 100000000, 1)} mio.`
        : `${number(v / 100000, 0)} t.${chartUnit(chart)}`
      : number(v);
  const horizontal =
    (chart.type === 'bar' || chart.type === 'stacked') &&
    (chart.rows.length > 2 || chart.rows.some((row) => row.label.length > 16));
  const chartHeight = horizontal
    ? Math.max(large ? 430 : compact ? 230 : 300, chart.rows.length * (compact ? 29 : 38) + 55)
    : large
      ? 430
      : compact
        ? 230
        : 300;
  const heatMaximum =
    chart.type === 'heatmap'
      ? Math.max(
          1,
          ...chart.rows.flatMap((row) =>
            chart.series.map((series) =>
              typeof row[series.key] === 'number' ? Math.abs(Number(row[series.key])) : 0,
            ),
          ),
        )
      : 1;
  const heatColumns = {
    gridTemplateColumns: `minmax(${compact ? 105 : 130}px,1.3fr) repeat(${chart.series.length},minmax(${compact ? 22 : 75}px,1fr))`,
  };
  const waterfallRows: ChartRow[] = [];
  let cumulative = 0;
  if (chart.type === 'waterfall')
    for (const row of chart.rows) {
      const value = Number(row[chart.series[0]?.key] ?? 0);
      const start = typeof row.start === 'number' ? row.start : cumulative;
      waterfallRows.push({
        ...row,
        _range: [
          Math.min(start, start + value),
          Math.max(start, start + value),
        ] as unknown as number,
        _value: value,
      });
      cumulative = start + value;
    }
  function exportSvg() {
    if (sourceChart.type === 'flow') {
      download('kaia-diagram.svg', flowSvg(sourceChart, version, dataLabel), 'image/svg+xml');
      return;
    }
    const svg = holder.current?.querySelector('svg.recharts-surface');
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    const width = Number(svg.getAttribute('width')) || 900;
    const height = Number(svg.getAttribute('height')) || 300;
    const root = document.createElementNS(ns, 'svg');
    root.setAttribute('xmlns', ns);
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height + 110));
    root.setAttribute('viewBox', `0 0 ${width} ${height + 110}`);
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', '100%');
    background.setAttribute('height', '100%');
    background.setAttribute('fill', '#fff');
    root.append(background);
    function label(text: string, y: number, size: number) {
      const node = document.createElementNS(ns, 'text');
      node.setAttribute('x', '20');
      node.setAttribute('y', String(y));
      node.setAttribute('fill', '#252525');
      node.setAttribute('font-family', 'Arial, sans-serif');
      node.setAttribute('font-size', String(size));
      node.textContent = text;
      root.append(node);
    }
    label(sourceChart.title, 28, 16);
    label(sourceChart.subtitle, 50, 11);
    const copy = svg.cloneNode(true) as SVGElement;
    copy.setAttribute('y', '65');
    root.append(copy);
    label(`${dataLabel} · ${version} · ${chartUnit(sourceChart)} · K.A.I.A.`, height + 95, 10);
    download('kaia-diagram.svg', new XMLSerializer().serializeToString(root), 'image/svg+xml');
  }
  function exportCsv() {
    download(
      'kaia-diagram.csv',
      chartCsv(sourceChart, version, dataLabel),
      'text/csv;charset=utf-8',
    );
  }
  return (
    <section
      className={`chart-panel ${large ? 'large' : ''} ${compact ? 'compact' : ''}`}
      aria-label={chart.title}
      ref={holder}
    >
      <div className="chart-header">
        <div>
          <h3>{chart.title}</h3>
          <p>{chart.subtitle}</p>
        </div>
        <div className="chart-tools">
          <button
            title={table ? 'Vis diagram' : 'Vis tabel'}
            aria-label={table ? 'Vis diagram' : 'Vis tabel'}
            onClick={() => setTable(!table)}
          >
            {table ? <ChartNoAxesCombined size={16} /> : <Table2 size={16} />}
          </button>
          {onExpand && (
            <button
              aria-label="Udvid diagram"
              title="Udvid diagram"
              onClick={() => onExpand(sourceChart)}
            >
              <Expand size={16} />
            </button>
          )}
          <button
            aria-label="Eksportér diagram som SVG"
            title="Eksportér diagram som SVG"
            onClick={exportSvg}
            disabled={table}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      {summary}
      {table ? (
        <div className="data-table-scroll">
          <table>
            <caption>
              {chart.subtitle} · {version}.{' '}
              {chart.type === 'flow'
                ? 'Kvalitativt forløb uden måltal.'
                : chartUnit(chart)
                  ? `Enhed: ${chartUnit(chart)}.`
                  : 'Enhed fremgår af figurteksten.'}
            </caption>
            <thead>
              <tr>
                <th scope="col">{chart.type === 'flow' ? 'Trin' : 'Enhed / periode'}</th>
                {chart.type === 'flow' ? (
                  <th scope="col">Beskrivelse</th>
                ) : (
                  chart.series.map((s) => (
                    <th scope="col" key={s.key}>
                      {s.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{row.label}</th>
                  {chart.type === 'flow' ? (
                    <td>{row.description}</td>
                  ) : (
                    chart.series.map((s) => (
                      <td key={s.key}>{row[s.key] == null ? '—' : formatter(row[s.key])}</td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : chart.type === 'flow' ? (
        <ol
          aria-label="Procesforløb uden kvantitative målinger"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))',
            gap: 12,
            listStyle: 'none',
            padding: 0,
            margin: '12px 0 18px',
          }}
        >
          {chart.rows.map((row, index) => (
            <li
              key={index}
              style={{
                border: '1px solid #e4e5e8',
                borderRadius: 8,
                padding: 18,
                background: '#fff',
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: '#006f71',
                  marginBottom: 11,
                }}
              >
                Trin {index + 1}
              </span>
              <strong
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 550,
                  lineHeight: 1.5,
                  overflowWrap: 'anywhere',
                }}
              >
                {row.label}
              </strong>
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.75,
                  color: '#535e70',
                  margin: '8px 0 0',
                  overflowWrap: 'anywhere',
                }}
              >
                {row.description}
              </p>
            </li>
          ))}
        </ol>
      ) : chart.type === 'heatmap' ? (
        <div className="heatmap" aria-label={chart.title}>
          {compact && (
            <div className="heatmap-row heatmap-heading" style={heatColumns}>
              <strong>Enhed</strong>
              {chart.series.map((series) => (
                <span key={series.key}>{series.label}</span>
              ))}
            </div>
          )}
          {chart.rows.map((row, i) => (
            <div className="heatmap-row" style={heatColumns} key={i}>
              <strong>{row.label}</strong>
              {chart.series.map((s) => {
                const raw = row[s.key];
                const known = typeof raw === 'number' && Number.isFinite(raw);
                const v = known ? raw : 0;
                const label = `${row.label} · ${s.label}: ${known ? formatter(v) : 'Datagrundlag mangler'}`;
                return (
                  <button
                    type="button"
                    className="heatmap-cell"
                    key={s.key}
                    title={label}
                    aria-label={label}
                    aria-pressed={heatSelection?.chart === chart && heatSelection.label === label}
                    onFocus={() => setHeatSelection({ chart, label })}
                    onPointerEnter={() => setHeatSelection({ chart, label })}
                    onClick={() => setHeatSelection({ chart, label })}
                    style={{
                      background: '#f6f7f8',
                      color: '#252525',
                      border: '1px solid #e4e5e8',
                      position: 'relative',
                      overflow: 'hidden',
                      minWidth: 0,
                      borderRadius: 4,
                      padding: compact ? '6px 3px' : '9px 8px',
                      textAlign: 'center',
                    }}
                  >
                    {!compact && <small>{s.label}</small>}
                    {known ? (compact ? (v > 0 ? '+' : v < 0 ? '−' : '0') : formatter(v)) : '—'}
                    {known && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: 0,
                          height: 3,
                          width: `${(Math.abs(v) / heatMaximum) * 100}%`,
                          background: v < 0 ? '#006f71' : v > 0 ? '#bc4d30' : '#464f5e',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="heatmap-detail" role="status">
            {heatSelection?.chart === chart
              ? heatSelection.label
              : 'Vælg en måned med mus eller tastatur for at se afvigelsen i kroner.'}
          </p>
        </div>
      ) : (
        <div className="chart-canvas" style={{ height: chartHeight }}>
          <ResponsiveContainer
            width="100%"
            height={chartHeight}
            minWidth={0}
            initialDimension={{ width: 900, height: chartHeight }}
          >
            {lineLike ? (
              <LineChart data={chart.rows} margin={{ top: 15, right: 24, left: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e4e5e8" strokeDasharray="3 5" />
                <XAxis
                  dataKey="label"
                  stroke="#535e70"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  dy={9}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  includeHidden
                  tickFormatter={axis}
                  stroke="#535e70"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={75}
                />
                <Tooltip
                  formatter={formatter}
                  contentStyle={{ border: '1px solid #e4e5e8', borderRadius: 8, fontSize: 12 }}
                />
                {chart.highlightLabel &&
                  chart.rows.some((row) => row.label === chart.highlightLabel) && (
                    <ReferenceLine
                      x={chart.highlightLabel}
                      stroke="#535e70"
                      strokeDasharray="3 4"
                      label={{
                        value: `Valgt år · ${chart.highlightLabel}`,
                        position: 'insideTopLeft',
                        fill: '#535e70',
                        fontSize: 10,
                      }}
                    />
                  )}
                {chart.series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={seriesColor(s)}
                    strokeWidth={
                      compact
                        ? s.key === 'low' || s.key === 'high'
                          ? 1
                          : s.key === 'budget'
                            ? 1.3
                            : 2.4
                        : 2.4
                    }
                    strokeOpacity={compact && (s.key === 'low' || s.key === 'high') ? 0.5 : 1}
                    strokeDasharray={
                      s.dashed || (compact && (s.key === 'low' || s.key === 'high'))
                        ? '5 5'
                        : undefined
                    }
                    dot={compact ? false : { r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    hide={hiddenSeries.has(s.key)}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart
                data={chart.type === 'waterfall' ? waterfallRows : chart.rows}
                layout={horizontal ? 'vertical' : 'horizontal'}
                stackOffset={chart.type === 'stacked' ? 'sign' : 'none'}
                margin={{ top: 15, right: 18, left: 12, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={horizontal}
                  horizontal={!horizontal}
                  stroke="#e4e5e8"
                  strokeDasharray="3 5"
                />
                {chart.type === 'stacked' && (
                  <ReferenceLine
                    {...(horizontal ? { x: 0 } : { y: 0 })}
                    stroke="#535e70"
                    strokeWidth={1}
                  />
                )}
                {horizontal ? (
                  <>
                    <XAxis
                      type="number"
                      tickFormatter={axis}
                      stroke="#535e70"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      height={35}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={<CategoryTick />}
                      tickLine={false}
                      axisLine={false}
                      width={165}
                      interval={0}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="label"
                      stroke="#535e70"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={12}
                      dy={9}
                      height={50}
                    />
                    <YAxis
                      tickFormatter={axis}
                      stroke="#535e70"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={75}
                    />
                  </>
                )}
                <Tooltip
                  formatter={(v, _, item) =>
                    chart.type === 'waterfall'
                      ? formatter((item.payload as Record<string, unknown>)._value)
                      : formatter(v)
                  }
                  contentStyle={{ border: '1px solid #e4e5e8', borderRadius: 8, fontSize: 12 }}
                />
                {chart.type !== 'stacked' && (
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                  />
                )}
                {chart.type === 'waterfall' ? (
                  <Bar
                    dataKey="_range"
                    name="Forklaringsbidrag"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={80}
                    isAnimationActive={false}
                  >
                    {waterfallRows.map((r, i) => (
                      <Cell key={i} fill={Number(r._value) >= 0 ? '#bc4d30' : '#006f71'} />
                    ))}
                  </Bar>
                ) : (
                  chart.series.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      fill={s.color}
                      hide={hiddenSeries.has(s.key)}
                      radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                      stackId={chart.type === 'stacked' ? 'cost' : undefined}
                      maxBarSize={52}
                      isAnimationActive={false}
                    />
                  ))
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {!table && (lineLike || chart.type === 'stacked') && (
        <div
          className="chart-line-legend"
          role="group"
          aria-label="Vis eller skjul dataserier"
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 12,
          }}
        >
          {chart.series.map((series) => {
            const visible = !hiddenSeries.has(series.key);
            const shortLabels: Record<string, string> = {
              base: 'Basis',
              budget: 'Budget',
              low: 'Lavt',
              high: 'Højt',
            };
            return (
              <button
                key={series.key}
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  border: 0,
                  borderRadius: 4,
                  background: 'transparent',
                  padding: '4px 7px',
                  minHeight: 28,
                  fontSize: 11,
                  color: '#535e70',
                  opacity: visible ? 1 : 0.5,
                }}
                aria-pressed={visible}
                title={`${visible ? 'Skjul' : 'Vis'} ${series.label}`}
                onClick={() =>
                  setHiddenSeries((previous) => {
                    const next = new Set(previous);
                    if (next.has(series.key)) next.delete(series.key);
                    else next.add(series.key);
                    return next;
                  })
                }
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 15,
                    borderTop: `2px ${series.dashed || (compact && (series.key === 'low' || series.key === 'high')) ? 'dashed' : 'solid'} ${seriesColor(series)}`,
                    opacity: compact && (series.key === 'low' || series.key === 'high') ? 0.5 : 1,
                  }}
                />
                {compact ? shortLabels[series.key] || series.label : series.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="chart-footer">
        <span>
          {!/simuler/i.test(dataLabel) && `${dataLabel} · `}
          {version}
        </span>
        <div className="chart-data-actions">
          {onExplain && (
            <button className="text-button chart-explain" onClick={onExplain}>
              Vis data <ArrowUpRight size={13} />
            </button>
          )}
          <button className="text-button" onClick={exportCsv}>
            Hent CSV
            <Download size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}
