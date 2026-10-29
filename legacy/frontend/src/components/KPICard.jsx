import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { COLORS } from '../utils/constants'

const STATUS_COLORS = {
  green: COLORS.success,
  yellow: COLORS.warning,
  red: COLORS.danger,
}

function KPICard({ title, value, subtitle, trend, trendLabel, icon: Icon, status, index = 0 }) {
  const isPositive = trend > 0
  const isNegative = trend < 0
  const isNeutral = trend === 0 || trend === undefined || trend === null

  const trendColor = isPositive ? COLORS.success : isNegative ? COLORS.danger : '#94a3b8'
  const trendBg = isPositive
    ? 'rgba(34, 197, 94, 0.1)'
    : isNegative
      ? 'rgba(239, 68, 68, 0.1)'
      : 'rgba(148, 163, 184, 0.1)'

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus

  const statusColor = status ? STATUS_COLORS[status] || STATUS_COLORS.green : null

  const glassStyle = {
    background: COLORS.bgSurface,
    border: '1px solid ' + COLORS.borderSubtle,
    borderLeft: statusColor ? `3px solid ${statusColor}` : '1px solid ' + COLORS.borderSubtle,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{
        y: -2,
        transition: { duration: 0.2 },
      }}
      className="rounded-xl p-5 cursor-default group"
      style={glassStyle}
    >
      <div className="flex items-start justify-between mb-3">
        {/* Icon */}
        {Icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                       transition-colors duration-200"
            style={{ background: `${COLORS.primary}1F` }}
          >
            <Icon className="w-5 h-5" style={{ color: COLORS.primaryLight }} />
          </div>
        )}

        {/* Trend badge */}
        {!isNeutral && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
            style={{ background: trendBg, color: trendColor }}
          >
            <TrendIcon className="w-3 h-3" />
            <span>
              {isPositive ? '+' : ''}
              {typeof trend === 'number' ? `${trend.toFixed(1)}%` : trend}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <p className="overline mb-1">
        {title}
      </p>

      {/* Value */}
      <p className="text-2xl font-bold tracking-tight mb-1" style={{ color: COLORS.textPrimary }}>
        {value}
      </p>

      {/* Subtitle & trend label */}
      <div className="flex items-center justify-between gap-2">
        {subtitle && (
          <p className="text-xs truncate" style={{ color: COLORS.textSecondary, opacity: 0.7 }}>
            {subtitle}
          </p>
        )}
        {trendLabel && (
          <p className="text-xs shrink-0" style={{ color: trendColor }}>
            {trendLabel}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default KPICard
