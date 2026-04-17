import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import useBudgetStore from '../store/budgetStore'
import { BUDGET_2024, BUDGET_SUMMARY, MONTHS, CURRENT_MONTH_INDEX, getBudgetOverviewChartData } from '../data/mockBudget'
import { calculateMechanicalForecast, generateForecastSeries, calculateDeviation } from '../utils/forecast'
import { COLORS, CHART_THEME, formatCurrency, formatPercent } from '../utils/constants'

// Shared chart styling
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

// Custom tooltip
function GlassTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={CHART_THEME.tooltip.contentStyle}>
      {label && <p style={CHART_THEME.tooltip.labelStyle}>{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2" style={CHART_THEME.tooltip.itemStyle}>
          <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ background: entry.color }} />
          <span style={{ color: COLORS.textSecondary }}>{entry.name}:</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
            {typeof entry.value === 'number' ? `${entry.value.toFixed(1)} mio.` : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// Tab styles
function TabButton({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
        isActive
          ? 'text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
    >
      <span className="relative z-10">{label}</span>
      {isActive && (
        <motion.div
          layoutId="budget-tab-indicator"
          className="absolute inset-0 rounded-md z-0"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  )
}

// Status badge
function StatusBadge({ status }) {
  const config = {
    green: { label: 'OK', bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
    yellow: { label: 'Obs', bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308' },
    red: { label: 'Kritisk', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  }
  const c = config[status] || config.green
  return (
    <span
      className="px-2 py-0.5 text-[10px] font-semibold rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  )
}

// ===== OVERBLIK TAB =====
function OverblikTab() {
  const overviewData = useMemo(() => getBudgetOverviewChartData(), [])
  const [expandedAreas, setExpandedAreas] = useState({})
  const toggleArea = (areaId) => setExpandedAreas(prev => ({ ...prev, [areaId]: !prev[areaId] }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total budget', value: formatCurrency(BUDGET_SUMMARY.totalBudget * 1_000_000) },
          { label: 'Total realisering YTD', value: formatCurrency(BUDGET_SUMMARY.totalYTD * 1_000_000) },
          { label: 'Forecast helår', value: formatCurrency(BUDGET_SUMMARY.totalForecast * 1_000_000) },
          {
            label: 'Afvigelse',
            value: `${BUDGET_SUMMARY.totalDeviation > 0 ? '+' : ''}${formatCurrency(BUDGET_SUMMARY.totalDeviation * 1_000_000)}`,
            highlight: BUDGET_SUMMARY.totalDeviation > 0,
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{
              background: '#111118',
              border: `1px solid ${kpi.highlight ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            <p className="overline mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.highlight ? 'text-amber-400' : 'text-white'}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Budget vs Realisering chart */}
      <div
        className="rounded-xl p-6"
        style={{ background: '#111118', border: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Budget vs. Realisering pr. område</h3>
        <p className="text-xs text-slate-500 mb-4">Alle beløb i mio. kr.</p>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={overviewData} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} angle={-25} textAnchor="end" height={60} interval={0} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend
              wrapperStyle={CHART_THEME.legend.wrapperStyle}
              iconType="circle"
              iconSize={CHART_THEME.legend.iconSize}
              formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{value}</span>}
            />
            <Bar name="Budget" dataKey="budget" fill={CHART_THEME.colors[0]} radius={[4, 4, 0, 0]} maxBarSize={36} opacity={0.6} />
            <Bar name="Forbrug YTD" dataKey="forbrug" fill={CHART_THEME.colors[1]} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar name="Prognose" dataKey="prognose" fill={CHART_THEME.colors[2]} radius={[4, 4, 0, 0]} maxBarSize={36} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Budget areas table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: '#111118', border: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
          <h3 className="text-sm font-semibold text-white">Alle budgetområder</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a25' }}>
                {['Område', 'Budget', 'YTD Realisering', 'Forecast', 'Afvigelse', 'Afv. %', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BUDGET_2024.map((area) => (
                <React.Fragment key={area.id}>
                  <tr
                    className="border-t transition-colors hover:bg-white/[0.02] cursor-pointer"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.04)' }}
                    onClick={() => area.subcategories && toggleArea(area.id)}
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        {area.subcategories && (
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedAreas[area.id] ? 'rotate-90' : ''}`}
                          />
                        )}
                        {area.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{area.budget.toFixed(1)} mio.</td>
                    <td className="px-4 py-3 text-slate-300">{area.ytd.toFixed(1)} mio.</td>
                    <td className="px-4 py-3 text-slate-300">{area.forecast.toFixed(1)} mio.</td>
                    <td className={`px-4 py-3 font-medium ${area.deviation > 0 ? 'text-red-400' : area.deviation < -1 ? 'text-green-400' : 'text-slate-300'}`}>
                      {area.deviation > 0 ? '+' : ''}{area.deviation.toFixed(1)} mio.
                    </td>
                    <td className={`px-4 py-3 font-medium ${area.deviationPct > 2 ? 'text-red-400' : area.deviationPct < -1 ? 'text-green-400' : 'text-slate-400'}`}>
                      {area.deviationPct > 0 ? '+' : ''}{area.deviationPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={area.status} />
                    </td>
                  </tr>
                  {expandedAreas[area.id] && area.subcategories && area.subcategories.map((sub) => (
                    <tr
                      key={sub.id}
                      className="border-t"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.02)', background: 'rgba(99, 102, 241, 0.03)' }}
                    >
                      <td className="px-4 py-2 text-slate-400 text-xs pl-10">{sub.name}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{sub.budget.toFixed(1)} mio.</td>
                      <td className="px-4 py-2 text-slate-500 text-xs" colSpan={5} />
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t-2"
                style={{ borderColor: 'rgba(99, 102, 241, 0.2)', background: 'rgba(99, 102, 241, 0.05)' }}
              >
                <td className="px-4 py-3 text-white font-bold">Total</td>
                <td className="px-4 py-3 text-white font-bold">{BUDGET_SUMMARY.totalBudget.toFixed(1)} mio.</td>
                <td className="px-4 py-3 text-white font-bold">{BUDGET_SUMMARY.totalYTD.toFixed(1)} mio.</td>
                <td className="px-4 py-3 text-white font-bold">{BUDGET_SUMMARY.totalForecast.toFixed(1)} mio.</td>
                <td className={`px-4 py-3 font-bold ${BUDGET_SUMMARY.totalDeviation > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {BUDGET_SUMMARY.totalDeviation > 0 ? '+' : ''}{BUDGET_SUMMARY.totalDeviation.toFixed(1)} mio.
                </td>
                <td className={`px-4 py-3 font-bold ${BUDGET_SUMMARY.totalDeviationPct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {BUDGET_SUMMARY.totalDeviationPct > 0 ? '+' : ''}{BUDGET_SUMMARY.totalDeviationPct.toFixed(1)}%
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </motion.div>
  )
}

// ===== REALISERING TAB =====
function RealiseringTab() {
  const { selectedArea: selectedAreaId, setArea, updateRealization, getRealizations, resetAreaRealizations, realizations } = useBudgetStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const currentAreaId = selectedAreaId || BUDGET_2024[0]?.id
  const selectedArea = BUDGET_2024.find((a) => a.id === currentAreaId) || BUDGET_2024[0]
  const effectiveValues = getRealizations(currentAreaId)
  const hasOverrides = Object.keys(realizations).some((key) => key.startsWith(`${currentAreaId}-`))

  const handleValueChange = (monthIndex, rawValue) => {
    const parsed = rawValue === '' ? null : parseFloat(rawValue)
    if (rawValue !== '' && isNaN(parsed)) return
    updateRealization(currentAreaId, monthIndex, parsed)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Area selector */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {selectedArea.name}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-2 left-0 w-64 rounded-xl py-1.5 z-30 shadow-2xl"
                style={{
                  background: '#1a1a25',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                }}
              >
                {BUDGET_2024.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => { setArea(area.id); setDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      area.id === currentAreaId
                        ? 'text-indigo-400 bg-indigo-500/10'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {area.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {hasOverrides && (
          <button
            onClick={() => resetAreaRealizations(currentAreaId)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg
                       transition-colors"
            style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            <RotateCcw className="w-3 h-3" />
            Nulstil ændringer
          </button>
        )}
      </div>

      {/* Monthly grid */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: '#111118', border: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
          <h3 className="text-sm font-semibold text-white">{selectedArea.name} - Månedlig realisering</h3>
          <p className="text-xs text-slate-500 mt-0.5">Beløb i mio. kr. -- redigér felter for aktuelle måneder</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a25' }}>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase w-28">Måned</th>
                {MONTHS.map((m) => (
                  <th key={m} className="px-2 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase w-20">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Last year row */}
              <tr className="border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.04)' }}>
                <td className="px-3 py-2.5 text-xs text-slate-500 font-medium">2023</td>
                {selectedArea.lastYearMonthly.map((val, i) => (
                  <td key={i} className="px-2 py-2.5 text-center text-xs text-slate-600">
                    {val !== null ? val.toFixed(1) : '-'}
                  </td>
                ))}
              </tr>

              {/* This year row (editable) */}
              <tr className="border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.04)' }}>
                <td className="px-3 py-2.5 text-xs text-white font-medium">2024</td>
                {effectiveValues.map((val, i) => {
                  const isPast = i <= CURRENT_MONTH_INDEX
                  const isOverridden = realizations[`${currentAreaId}-${i}`] !== undefined
                  return (
                    <td key={i} className="px-1 py-1.5 text-center">
                      {isPast ? (
                        <input
                          type="number"
                          step="0.1"
                          value={val !== null ? val : ''}
                          onChange={(e) => handleValueChange(i, e.target.value)}
                          className={`w-full text-center text-xs rounded-md px-1 py-1.5 outline-none transition-colors ${
                            isOverridden
                              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                              : 'bg-white/5 text-white border border-transparent'
                          }`}
                          style={{ minWidth: '50px' }}
                        />
                      ) : (
                        <span className="text-xs text-slate-700">-</span>
                      )}
                    </td>
                  )
                })}
              </tr>

              {/* Variance row */}
              <tr className="border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <td className="px-3 py-2.5 text-xs text-slate-500 font-medium">Afvigelse</td>
                {effectiveValues.map((val, i) => {
                  if (val === null || selectedArea.lastYearMonthly[i] === null) {
                    return <td key={i} className="px-2 py-2.5 text-center text-xs text-slate-700">-</td>
                  }
                  const diff = val - selectedArea.lastYearMonthly[i]
                  return (
                    <td
                      key={i}
                      className={`px-2 py-2.5 text-center text-xs font-medium ${
                        diff > 0.2 ? 'text-red-400' : diff < -0.2 ? 'text-green-400' : 'text-slate-500'
                      }`}
                    >
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}

// ===== FORECAST TAB =====
function ForecastTab() {
  const { selectedArea: selectedAreaId } = useBudgetStore()
  const selectedArea = BUDGET_2024.find((a) => a.id === (selectedAreaId || BUDGET_2024[0]?.id)) || BUDGET_2024[0]

  // Generate forecast data
  const forecastData = useMemo(() => {
    return generateForecastSeries(
      selectedArea.monthlyRealization,
      selectedArea.lastYearMonthly,
      selectedArea.lastYearTotal
    )
  }, [selectedArea])

  const forecastResult = useMemo(() => {
    return calculateMechanicalForecast(
      selectedArea.monthlyRealization,
      selectedArea.lastYearMonthly,
      selectedArea.lastYearTotal
    )
  }, [selectedArea])

  const deviation = useMemo(() => {
    return calculateDeviation(forecastResult.forecast, selectedArea.budget * 1_000_000)
  }, [forecastResult, selectedArea])

  // Build chart data
  const chartData = useMemo(() => {
    const monthlyBudget = selectedArea.budget / 12
    return forecastData.map((d) => ({
      name: d.month,
      budget: Math.round(monthlyBudget * 10) / 10,
      actual: d.actual,
      forecast: d.projected,
      lastYear: d.lastYear,
    }))
  }, [forecastData, selectedArea])

  // Cumulative chart data
  const cumulativeData = useMemo(() => {
    const monthlyBudget = selectedArea.budget / 12
    let cumBudget = 0
    let cumActual = 0
    let cumForecast = 0
    let lastActual = 0

    return MONTHS.map((month, i) => {
      cumBudget += monthlyBudget
      const point = { name: month, budgetKumuleret: Math.round(cumBudget * 10) / 10 }

      if (forecastData[i].actual !== null) {
        cumActual += forecastData[i].actual
        lastActual = cumActual
        cumForecast = cumActual
        point.actualKumuleret = Math.round(cumActual * 10) / 10
      } else {
        cumForecast += forecastData[i].projected || 0
        point.actualKumuleret = null
      }
      point.forecastKumuleret = Math.round(cumForecast * 10) / 10

      return point
    })
  }, [forecastData, selectedArea])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Forecast summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Vedtaget budget', value: `${selectedArea.budget.toFixed(1)} mio.` },
          { label: 'YTD Realisering', value: `${selectedArea.ytd.toFixed(1)} mio.` },
          {
            label: 'Mekanisk forecast',
            value: `${(forecastResult.forecast / 1_000_000).toFixed(1)} mio.`,
            highlight: deviation.status === 'danger',
          },
          {
            label: 'Afvigelse',
            value: `${deviation.amount > 0 ? '+' : ''}${(deviation.amount / 1_000_000).toFixed(1)} mio. (${deviation.percent > 0 ? '+' : ''}${deviation.percent}%)`,
            highlight: deviation.status !== 'ok',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{
              background: '#111118',
              border: `1px solid ${kpi.highlight ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            <p className="overline mb-1">{kpi.label}</p>
            <p className={`text-base font-bold ${kpi.highlight ? 'text-red-400' : 'text-white'}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly forecast chart */}
      <div
        className="rounded-xl p-6"
        style={{ background: '#111118', border: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <h3 className="text-sm font-semibold text-white mb-1">
          {selectedArea.name} - Månedlig prognose
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Faktisk forbrug (solid) + Forecast (stiplet) + Budget (reference)
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend
              wrapperStyle={CHART_THEME.legend.wrapperStyle}
              iconType="circle"
              iconSize={CHART_THEME.legend.iconSize}
              formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{value}</span>}
            />
            <Line
              name="Budget"
              dataKey="budget"
              stroke={COLORS.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
            />
            <Line
              name="Sidste år"
              dataKey="lastYear"
              stroke={CHART_THEME.colors[3]}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              opacity={0.5}
            />
            <Line
              name="Faktisk"
              dataKey="actual"
              stroke={CHART_THEME.colors[0]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART_THEME.colors[0] }}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1 }}
              connectNulls={false}
            />
            <Line
              name="Forecast"
              dataKey="forecast"
              stroke={CHART_THEME.colors[1]}
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ r: 2, fill: CHART_THEME.colors[1] }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative chart */}
      <div
        className="rounded-xl p-6"
        style={{ background: '#111118', border: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <h3 className="text-sm font-semibold text-white mb-1">
          Kumuleret forbrug vs. budget
        </h3>
        <p className="text-xs text-slate-500 mb-4">Mio. kr., akkumuleret over året</p>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={cumulativeData} margin={CHART_THEME.margin}>
            <defs>
              <linearGradient id="grad-actual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_THEME.colors[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_THEME.colors[0]} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="grad-forecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_THEME.colors[1]} stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART_THEME.colors[1]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend
              wrapperStyle={CHART_THEME.legend.wrapperStyle}
              iconType="circle"
              iconSize={CHART_THEME.legend.iconSize}
              formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{value}</span>}
            />
            <Area
              name="Budget (kumuleret)"
              dataKey="budgetKumuleret"
              stroke={COLORS.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              fill="none"
            />
            <Area
              name="Faktisk (kumuleret)"
              dataKey="actualKumuleret"
              stroke={CHART_THEME.colors[0]}
              strokeWidth={2.5}
              fill="url(#grad-actual)"
              connectNulls={false}
            />
            <Area
              name="Forecast (kumuleret)"
              dataKey="forecastKumuleret"
              stroke={CHART_THEME.colors[1]}
              strokeWidth={2}
              strokeDasharray="8 4"
              fill="url(#grad-forecast)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

// ===== MAIN PAGE =====
function BudgetPage() {
  const { activeTab, setActiveTab, selectedYear, setYear } = useBudgetStore()

  const tabs = [
    { id: 'overblik', label: 'Overblik' },
    { id: 'realisering', label: 'Realisering' },
    { id: 'forecast', label: 'Forecast' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-6 pt-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Budget & Forecast {selectedYear}</h1>
          <p className="text-sm text-slate-400 mt-0.5">Kalundborg Kommune</p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-sm text-white
                     outline-none cursor-pointer hover:border-indigo-500/30 transition-colors"
          style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <option value={2024}>2024</option>
          <option value={2023}>2023</option>
          <option value={2022}>2022</option>
        </select>
      </motion.div>

      {/* Tab navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center gap-1 mb-8 pb-2"
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overblik' && <OverblikTab key="overblik" />}
        {activeTab === 'realisering' && <RealiseringTab key="realisering" />}
        {activeTab === 'forecast' && <ForecastTab key="forecast" />}
      </AnimatePresence>
    </div>
  )
}

export default BudgetPage
