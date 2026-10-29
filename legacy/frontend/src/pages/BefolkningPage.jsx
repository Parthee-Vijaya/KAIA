import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { Users, TrendingUp, DollarSign, RefreshCw } from 'lucide-react'
import { POPULATION_FORECAST, calcDemographicBudgetImpact } from '../data/budgetAssumptions'
import { fetchPopulationData } from '../services/dstApi'
import { COLORS, CHART_THEME, formatCurrency } from '../utils/constants'

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

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={CHART_THEME.tooltip.contentStyle}>
      {label && <p style={CHART_THEME.tooltip.labelStyle}>{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2" style={CHART_THEME.tooltip.itemStyle}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
          <span style={{ color: COLORS.textSecondary }}>{entry.name}:</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
            {typeof entry.value === 'number' ? entry.value.toLocaleString('da-DK') : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// Mock actual population data (simulating what DST API would return)
const MOCK_ACTUAL = {
  '0-5': 3130,
  '6-16': 7860,
  '17-25': 4020,
  '26-45': 10050,
  '46-64': 12480,
  '65-79': 9100,
  '80+': 3440,
}

// Population trends for multiple age groups
const POPULATION_TRENDS = {
  '80+': {
    label: 'Ældre (80+ år)',
    color: '#ef4444',
    data: [
      { year: '2018', actual: 2620, prognose: 2600 },
      { year: '2019', actual: 2710, prognose: 2700 },
      { year: '2020', actual: 2830, prognose: 2790 },
      { year: '2021', actual: 2960, prognose: 2900 },
      { year: '2022', actual: 3090, prognose: 3010 },
      { year: '2023', actual: 3280, prognose: 3100 },
      { year: '2024', actual: 3440, prognose: 3100 },
      { year: '2025', actual: null, prognose: 3249 },
      { year: '2026', actual: null, prognose: 3405 },
      { year: '2027', actual: null, prognose: 3568 },
      { year: '2028', actual: null, prognose: 3740 },
    ],
  },
  '65-79': {
    label: 'Yngre ældre (65-79 år)',
    color: '#f59e0b',
    data: [
      { year: '2018', actual: 7800, prognose: 7750 },
      { year: '2019', actual: 7980, prognose: 7920 },
      { year: '2020', actual: 8150, prognose: 8100 },
      { year: '2021', actual: 8350, prognose: 8280 },
      { year: '2022', actual: 8520, prognose: 8460 },
      { year: '2023', actual: 8710, prognose: 8640 },
      { year: '2024', actual: 8900, prognose: 8900 },
      { year: '2025', actual: null, prognose: 9105 },
      { year: '2026', actual: null, prognose: 9315 },
      { year: '2027', actual: null, prognose: 9530 },
      { year: '2028', actual: null, prognose: 9750 },
    ],
  },
  '0-5': {
    label: 'Småbørn (0-5 år)',
    color: '#22c55e',
    data: [
      { year: '2018', actual: 3480, prognose: 3500 },
      { year: '2019', actual: 3420, prognose: 3450 },
      { year: '2020', actual: 3360, prognose: 3400 },
      { year: '2021', actual: 3310, prognose: 3350 },
      { year: '2022', actual: 3270, prognose: 3300 },
      { year: '2023', actual: 3230, prognose: 3250 },
      { year: '2024', actual: 3200, prognose: 3200 },
      { year: '2025', actual: null, prognose: 3130 },
      { year: '2026', actual: null, prognose: 3065 },
      { year: '2027', actual: null, prognose: 3010 },
      { year: '2028', actual: null, prognose: 2970 },
    ],
  },
  '6-16': {
    label: 'Skolebørn (6-16 år)',
    color: '#6366f1',
    data: [
      { year: '2018', actual: 8200, prognose: 8250 },
      { year: '2019', actual: 8150, prognose: 8180 },
      { year: '2020', actual: 8080, prognose: 8100 },
      { year: '2021', actual: 8010, prognose: 8020 },
      { year: '2022', actual: 7950, prognose: 7940 },
      { year: '2023', actual: 7860, prognose: 7860 },
      { year: '2024', actual: 7800, prognose: 7800 },
      { year: '2025', actual: null, prognose: 7680 },
      { year: '2026', actual: null, prognose: 7560 },
      { year: '2027', actual: null, prognose: 7450 },
      { year: '2028', actual: null, prognose: 7350 },
    ],
  },
}

// Migration data
const MIGRATION_DATA = [
  { year: '2018', tilflytning: 1850, fraflytning: 1920, net: -70 },
  { year: '2019', tilflytning: 1920, fraflytning: 1880, net: 40 },
  { year: '2020', tilflytning: 1780, fraflytning: 1850, net: -70 },
  { year: '2021', tilflytning: 1960, fraflytning: 1890, net: 70 },
  { year: '2022', tilflytning: 2100, fraflytning: 1950, net: 150 },
  { year: '2023', tilflytning: 2250, fraflytning: 2020, net: 230 },
  { year: '2024', tilflytning: 2180, fraflytning: 2050, net: 130 },
]

const MIGRATION_BY_AGE = [
  { group: '0-17 år', tilflytning: 380, fraflytning: 310, net: 70 },
  { group: '18-25 år', tilflytning: 520, fraflytning: 680, net: -160 },
  { group: '26-45 år', tilflytning: 650, fraflytning: 480, net: 170 },
  { group: '46-64 år', tilflytning: 380, fraflytning: 350, net: 30 },
  { group: '65+ år', tilflytning: 250, fraflytning: 230, net: 20 },
]

// Skeleton loader
function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="shimmer h-4 w-16 rounded" />
        </td>
      ))}
    </tr>
  )
}

function BefolkningPage() {
  const [actualData, setActualData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedTrendGroup, setSelectedTrendGroup] = useState('80+')

  const ageGroups = POPULATION_FORECAST.assumptions.ageGroups

  // Fetch population data on mount
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setIsLoading(true)
      try {
        const dstData = await fetchPopulationData('Kalundborg', ageGroups)
        if (!cancelled) {
          // Check if DST returned real data or fallback
          const hasRealData = dstData?.some((d) => d.source === 'DST FOLK1A')
          if (hasRealData) {
            const mapped = {}
            dstData.forEach((d) => { mapped[d.group] = d.population })
            setActualData(mapped)
          } else {
            // Use mock actual data
            setActualData(MOCK_ACTUAL)
          }
          setLastUpdated(new Date().toISOString())
        }
      } catch {
        if (!cancelled) {
          setActualData(MOCK_ACTUAL)
          setLastUpdated(new Date().toISOString())
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [])

  // Build enriched population data with deviations
  const populationData = useMemo(() => {
    if (!actualData) return []
    return ageGroups.map((g) => {
      const actual = actualData[g.group] || g.expected
      const deviation = actual - g.expected
      const budgetEffect = deviation * g.perCapitaCost
      return {
        group: g.group,
        label: g.label,
        expected: g.expected,
        actual,
        deviation,
        costPerPerson: g.perCapitaCost,
        budgetEffect,
        trend: g.trend,
      }
    })
  }, [actualData, ageGroups])

  // Summary KPIs
  const totalExpected = ageGroups.reduce((s, g) => s + g.expected, 0)
  const totalActual = populationData.reduce((s, g) => s + g.actual, 0)
  const totalDeviation = totalActual - totalExpected
  const totalBudgetEffect = populationData.reduce((s, g) => s + g.budgetEffect, 0)

  // Chart data for age group comparison
  const ageChartData = useMemo(() => {
    return populationData.map((g) => ({
      name: g.group,
      Forventet: g.expected,
      Faktisk: g.actual,
    }))
  }, [populationData])

  // Format helpers
  const fmtNum = (n) => new Intl.NumberFormat('da-DK').format(n)
  const fmtMio = (n) => {
    const abs = Math.abs(n)
    const sign = n >= 0 ? '+' : '-'
    return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')} mio. kr.`
  }

  const glassCardStyle = {
    background: '#111118',
    border: '1px solid rgba(255,255,255,0.06)',
  }

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
          <h1 className="text-2xl font-bold text-white">Befolkningsmonitor</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Sidst opdateret: {lastUpdated ? new Date(lastUpdated).toLocaleDateString('da-DK', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }) : 'Indlæser...'}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="chip-interactive flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 rounded-lg
                     transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Opdater
        </button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
      >
        <div className="rounded-xl p-5" style={glassCardStyle}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total befolkning</p>
          </div>
          {isLoading ? (
            <div className="shimmer h-7 w-24 rounded" />
          ) : (
            <p className="text-2xl font-bold text-white">{fmtNum(totalActual)}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">Forventet: {fmtNum(totalExpected)}</p>
        </div>

        <div className="rounded-xl p-5" style={glassCardStyle}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(234, 179, 8, 0.12)' }}>
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Afvigelse fra prognose</p>
          </div>
          {isLoading ? (
            <div className="shimmer h-7 w-20 rounded" />
          ) : (
            <p className={`text-2xl font-bold ${totalDeviation > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              {totalDeviation > 0 ? '+' : ''}{fmtNum(totalDeviation)}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1">personer</p>
        </div>

        <div className="rounded-xl p-5" style={glassCardStyle}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
              <DollarSign className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Estimeret budgeteffekt</p>
          </div>
          {isLoading ? (
            <div className="shimmer h-7 w-28 rounded" />
          ) : (
            <p className={`text-2xl font-bold ${totalBudgetEffect > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {fmtMio(totalBudgetEffect)}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1">årligt</p>
        </div>
      </motion.div>

      {/* Age distribution chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-xl p-6 mb-8"
        style={glassCardStyle}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Aldersfordeling - Prognose vs. Realitet</h3>
        <p className="text-xs text-slate-500 mb-4">Antal borgere pr. aldersgruppe</p>
        {isLoading ? (
          <div className="shimmer h-[320px] w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={ageChartData} margin={CHART_THEME.margin}>
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
              <Bar name="Forventet" dataKey="Forventet" fill={CHART_THEME.colors[0]} radius={[4, 4, 0, 0]} maxBarSize={48} opacity={0.6} />
              <Bar name="Faktisk" dataKey="Faktisk" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {ageChartData.map((entry, i) => {
                  const isOver = entry.Faktisk > entry.Forventet
                  return <Cell key={i} fill={isOver ? CHART_THEME.colors[2] : CHART_THEME.colors[1]} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Deviation table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="rounded-xl overflow-hidden mb-8"
        style={glassCardStyle}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
          <h3 className="text-sm font-semibold text-white">Befolkningsafvigelser og budgeteffekt</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a25' }}>
                {['Aldersgruppe', 'Forventet', 'Faktisk', 'Afvigelse', 'Udgift pr. person', 'Budgeteffekt'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : (
                populationData.map((g) => (
                  <tr
                    key={g.group}
                    className="border-t transition-colors hover:bg-white/[0.02]"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.04)' }}
                  >
                    <td className="px-4 py-3 text-white font-medium">{g.label}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtNum(g.expected)}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtNum(g.actual)}</td>
                    <td className={`px-4 py-3 font-medium ${
                      g.deviation > 0 ? 'text-red-400' : g.deviation < 0 ? 'text-green-400' : 'text-slate-400'
                    }`}>
                      {g.deviation > 0 ? '+' : ''}{fmtNum(g.deviation)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{fmtNum(g.costPerPerson)} kr.</td>
                    <td className={`px-4 py-3 font-medium ${
                      g.budgetEffect > 0 ? 'text-red-400' : g.budgetEffect < 0 ? 'text-green-400' : 'text-slate-400'
                    }`}>
                      {fmtMio(g.budgetEffect)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && (
              <tfoot>
                <tr
                  className="border-t-2"
                  style={{ borderColor: 'rgba(99, 102, 241, 0.2)', background: 'rgba(99, 102, 241, 0.05)' }}
                >
                  <td className="px-4 py-3 text-white font-bold">Total</td>
                  <td className="px-4 py-3 text-white font-bold">{fmtNum(totalExpected)}</td>
                  <td className="px-4 py-3 text-white font-bold">{fmtNum(totalActual)}</td>
                  <td className={`px-4 py-3 font-bold ${totalDeviation > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {totalDeviation > 0 ? '+' : ''}{fmtNum(totalDeviation)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">-</td>
                  <td className={`px-4 py-3 font-bold ${totalBudgetEffect > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {fmtMio(totalBudgetEffect)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>

      {/* Population trend chart with group selector */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="rounded-xl p-6 mb-8"
        style={glassCardStyle}
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-white">Befolkningsudvikling over tid</h3>
            <p className="text-xs text-slate-500">Historisk data + prognose (stiplet)</p>
          </div>
          <select
            value={selectedTrendGroup}
            onChange={(e) => setSelectedTrendGroup(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white outline-none cursor-pointer hover:border-indigo-500/30 transition-colors"
            style={{ background: '#1a1a25', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {Object.entries(POPULATION_TRENDS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={POPULATION_TRENDS[selectedTrendGroup].data} margin={CHART_THEME.margin}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis {...axisProps} domain={['auto', 'auto']} />
              <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
              <Legend
                wrapperStyle={CHART_THEME.legend.wrapperStyle}
                iconType="circle"
                iconSize={CHART_THEME.legend.iconSize}
                formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{value}</span>}
              />
              <Line
                name="Prognose"
                dataKey="prognose"
                stroke={COLORS.textSecondary}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: COLORS.textSecondary }}
              />
              <Line
                name="Faktisk"
                dataKey="actual"
                stroke={POPULATION_TRENDS[selectedTrendGroup].color}
                strokeWidth={2.5}
                dot={{ r: 4, fill: POPULATION_TRENDS[selectedTrendGroup].color }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 1 }}
                connectNulls={false}
              />
              <ReferenceLine x="2024" stroke="rgba(99, 102, 241, 0.3)" strokeDasharray="3 3" label={{ value: 'Nu', fill: COLORS.textSecondary, fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Migration trend over time */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="rounded-xl p-6 mb-8"
        style={glassCardStyle}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Til- og fraflytning over tid</h3>
        <p className="text-xs text-slate-500 mb-4">Antal personer pr. år</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={MIGRATION_DATA} margin={CHART_THEME.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Legend
              wrapperStyle={CHART_THEME.legend.wrapperStyle}
              iconType="circle"
              iconSize={CHART_THEME.legend.iconSize}
              formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{value}</span>}
            />
            <Bar name="Tilflytning" dataKey="tilflytning" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={32} opacity={0.8} />
            <Bar name="Fraflytning" dataKey="fraflytning" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Net migration by age group */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="rounded-xl p-6 mb-8"
        style={glassCardStyle}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Nettoflytning pr. aldersgruppe (2024)</h3>
        <p className="text-xs text-slate-500 mb-4">Positive tal = nettotilflytning</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={MIGRATION_BY_AGE} margin={CHART_THEME.margin} layout="vertical">
            <CartesianGrid {...gridProps} horizontal={false} vertical={true} />
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="group" {...axisProps} width={80} />
            <Tooltip content={<GlassTooltip />} cursor={CHART_THEME.tooltip.cursor} />
            <Bar name="Netto" dataKey="net" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {MIGRATION_BY_AGE.map((entry, i) => (
                <Cell key={i} fill={entry.net >= 0 ? '#22c55e' : '#ef4444'} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* AI Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="rounded-xl p-6"
        style={{
          ...glassCardStyle,
          borderLeft: '3px solid rgba(245, 158, 11, 0.3)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(245, 158, 11, 0.12)' }}
          >
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white">AI Analyse</h3>
        </div>
        <div className="markdown-content">
          <p>
            Befolkningsanalysen viser at der er <strong>340 flere borgere over 80 ar</strong> end kommunen
            forventede i budgetforudsaetningerne. Dette er den mest kritiske afvigelse og svarer til en
            estimeret merudgift pa <strong>42,5 mio. kr. arligt</strong>.
          </p>
          <p>
            Den dobbelte demografiske udfordring - faldende bornetal og stigende aeldrebefolkning - skaber
            et strukturelt pres pa kommunens okonomi. Mens faldet i 0-5 arige (70 faerre) giver en
            besparelse pa ca. 6 mio. kr., opvejer dette langt fra merudgifterne til aeldrepleje.
          </p>
          <h3>Anbefalinger</h3>
          <ul>
            <li><strong>Akut:</strong> Revurder budgettet for Aeldre & Sundhed med en tillaegsbevilling pa minimum 35-40 mio. kr.</li>
            <li><strong>Kort sigt:</strong> Undersoeg kapaciteten pa eksisterende plejehjem og hjemmeplejeordninger</li>
            <li><strong>Mellemlang sigt:</strong> Opdater befolkningsprognosemodellen med nye demografiske tendenser</li>
            <li><strong>Langsigt:</strong> Planlaeg for 3.700+ borgere over 80 ar i 2028 - kraever strukturelle tilpasninger</li>
          </ul>
          <h3>Risikoscenarier</h3>
          <table>
            <thead>
              <tr>
                <th>Scenarie</th>
                <th>80+ i 2025</th>
                <th>Merudgift</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Optimistisk</td><td>3.300</td><td>25 mio. kr.</td></tr>
              <tr><td>Baseline</td><td>3.440</td><td>42 mio. kr.</td></tr>
              <tr><td>Pessimistisk</td><td>3.600</td><td>63 mio. kr.</td></tr>
            </tbody>
          </table>
          <blockquote>
            <strong>Konklusion:</strong> Den demografiske udvikling udgoer den stoerste enkeltstaaende
            budgetrisiko for kommunen. Handling er paakraevet inden naeste budgetforhandling.
          </blockquote>
        </div>
      </motion.div>
    </div>
  )
}

export default BefolkningPage
