import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, X, ChevronRight } from 'lucide-react'
import { COLORS } from '../utils/constants'

const ALERT_CONFIG = {
  warning: {
    color: COLORS.warning,
    bgColor: 'rgba(234, 179, 8, 0.1)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
    Icon: AlertTriangle,
  },
  danger: {
    color: COLORS.danger,
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    Icon: AlertCircle,
  },
  info: {
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    Icon: Info,
  },
}

function AlertBanner({ alerts }) {
  const [expandedId, setExpandedId] = useState(null)
  const [dismissedIds, setDismissedIds] = useState(new Set())

  if (!alerts || alerts.length === 0) return null

  const visibleAlerts = alerts.filter((_, i) => !dismissedIds.has(i))
  if (visibleAlerts.length === 0) return null

  const handleDismiss = (e, index) => {
    e.stopPropagation()
    setDismissedIds((prev) => new Set([...prev, index]))
    if (expandedId === index) setExpandedId(null)
  }

  const toggleExpand = (index) => {
    setExpandedId(expandedId === index ? null : index)
  }

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-3"
      >
        {alerts.map((alert, index) => {
          if (dismissedIds.has(index)) return null

          const config = ALERT_CONFIG[alert.type] || ALERT_CONFIG.info
          const { Icon } = config
          const isExpanded = expandedId === index

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              onClick={() => toggleExpand(index)}
              className="rounded-xl cursor-pointer group transition-all duration-200"
              style={{
                background: config.bgColor,
                borderLeft: `3px solid ${config.borderColor}`,
                border: `1px solid ${config.borderColor}`,
                borderLeftWidth: '3px',
              }}
            >
              <div className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <Icon
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: config.color }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className="text-sm font-medium truncate"
                        style={{ color: COLORS.textPrimary }}
                      >
                        {alert.title}
                      </h4>
                      <div className="flex items-center gap-1 shrink-0">
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-200
                            ${isExpanded ? 'rotate-90' : ''}`}
                          style={{ color: COLORS.textSecondary }}
                        />
                        <button
                          onClick={(e) => handleDismiss(e, index)}
                          className="p-0.5 rounded text-slate-600 hover:text-slate-300
                                     opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Truncated or full message */}
                    <AnimatePresence mode="wait">
                      {isExpanded ? (
                        <motion.div
                          key="expanded"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <p
                            className="text-xs mt-1.5 leading-relaxed"
                            style={{ color: COLORS.textSecondary }}
                          >
                            {alert.message}
                          </p>
                          {alert.source && (
                            <p className="caption mt-2">
                              Kilde: {alert.source}
                            </p>
                          )}
                        </motion.div>
                      ) : (
                        <motion.p
                          key="collapsed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs mt-0.5 truncate"
                          style={{ color: COLORS.textSecondary, opacity: 0.7 }}
                        >
                          {alert.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

export default AlertBanner
