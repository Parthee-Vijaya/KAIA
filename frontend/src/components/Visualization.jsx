import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { CHART_THEME, COLORS } from '../utils/constants'

const chartPalette = CHART_THEME.colors

// Custom glassmorphic tooltip
function GlassTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div style={CHART_THEME.tooltip.contentStyle}>
      {label && (
        <p style={CHART_THEME.tooltip.labelStyle}>{label}</p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2" style={CHART_THEME.tooltip.itemStyle}>
          <span
            className="w-2 h-2 rounded-full shrink-0 inline-block"
            style={{ background: entry.color }}
          />
          <span style={{ color: COLORS.textSecondary }}>{entry.name}:</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
            {typeof entry.value === 'number' ? entry.value.toLocaleString('da-DK') : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// Custom label for pie chart
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  if (percent < 0.05) return null // Don't show labels for tiny slices

  return (
    <text
      x={x}
      y={y}
      fill={COLORS.textPrimary}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '11px', fontWeight: 500 }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// Custom legend
function GlassLegend({ payload }) {
  if (!payload || payload.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1" style={CHART_THEME.legend.wrapperStyle}>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5" style={{ fontSize: '12px', color: COLORS.textSecondary }}>
          <span
            className="rounded-full shrink-0 inline-block"
            style={{
              width: `${CHART_THEME.legend.iconSize}px`,
              height: `${CHART_THEME.legend.iconSize}px`,
              background: entry.color,
            }}
          />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// Shared axis/grid props derived from CHART_THEME
const axisProps = {
  tick: CHART_THEME.text,
  axisLine: { stroke: 'rgba(255, 255, 255, 0.04)' },
  tickLine: false,
}

const gridProps = {
  strokeDasharray: CHART_THEME.grid.strokeDasharray,
  stroke: CHART_THEME.grid.stroke,
  vertical: false,
}

function Visualization({ type = 'bar', data, title, subtitle, height = 300 }) {
  // Extract data keys (excluding the category/name key)
  const dataKeys = useMemo(() => {
    if (!data || data.length === 0) return []
    const firstItem = data[0]
    return Object.keys(firstItem).filter(
      (key) =>
        key !== 'name' &&
        key !== 'label' &&
        key !== 'kategori' &&
        typeof firstItem[key] === 'number'
    )
  }, [data])

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-40 text-sm"
        style={{ color: COLORS.textSecondary }}
      >
        Ingen data tilg\u00e6ngelig
      </div>
    )
  }

  const nameKey =
    data[0].name !== undefined
      ? 'name'
      : data[0].label !== undefined
        ? 'label'
        : 'kategori'

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={nameKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend content={<GlassLegend />} />
            {dataKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={chartPalette[i % chartPalette.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
            ))}
          </BarChart>
        )

      case 'line':
        return (
          <LineChart data={data} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={nameKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend content={<GlassLegend />} />
            {dataKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={chartPalette[i % chartPalette.length]}
                strokeWidth={2}
                dot={{ r: 2.5, fill: chartPalette[i % chartPalette.length] }}
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1 }}
              />
            ))}
            {/* Reference line at 0 if data crosses zero */}
            {data.some((d) => dataKeys.some((k) => d[k] < 0)) && (
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
            )}
          </LineChart>
        )

      case 'area':
        return (
          <AreaChart data={data} margin={CHART_THEME.margin}>
            <defs>
              {dataKeys.map((key, i) => (
                <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={chartPalette[i % chartPalette.length]}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={chartPalette[i % chartPalette.length]}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={nameKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend content={<GlassLegend />} />
            {dataKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={chartPalette[i % chartPalette.length]}
                strokeWidth={2}
                fill={`url(#gradient-${key})`}
              />
            ))}
          </AreaChart>
        )

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKeys[0] || 'value'}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              outerRadius="80%"
              innerRadius="40%"
              paddingAngle={2}
              label={PieLabel}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
              ))}
            </Pie>
            <Tooltip content={<GlassTooltip />} />
            <Legend content={<GlassLegend />} />
          </PieChart>
        )

      case 'composed':
        return (
          <ComposedChart data={data} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={nameKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend content={<GlassLegend />} />
            {dataKeys.map((key, i) => {
              // First key as bar, rest as lines
              if (i === 0) {
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={chartPalette[i % chartPalette.length]}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                    opacity={0.8}
                  />
                )
              }
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={chartPalette[i % chartPalette.length]}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: chartPalette[i % chartPalette.length] }}
  />
              )
            })}
          </ComposedChart>
        )

      default:
        return (
          <BarChart data={data} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={nameKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Bar dataKey={dataKeys[0]} fill={chartPalette[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        )
    }
  }

  return (
    <div className="w-full">
      {/* Title */}
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <h3 className="heading-sm">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="caption mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  )
}

export default Visualization
