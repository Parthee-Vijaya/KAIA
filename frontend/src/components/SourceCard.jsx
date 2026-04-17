import { motion } from 'framer-motion'
import { FileText, Database, Scale, BarChart3, ExternalLink } from 'lucide-react'
import { COLORS } from '../utils/constants'

const TYPE_ICONS = {
  document: FileText,
  data: Database,
  law: Scale,
  statistics: BarChart3,
}

const TYPE_LABELS = {
  document: 'Dokument',
  data: 'Data',
  law: 'Lovgivning',
  statistics: 'Statistik',
}

function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return COLORS.success
  if (confidence >= 0.5) return COLORS.warning
  return COLORS.danger
}

function SourceCard({ sources }) {
  if (!sources || sources.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-4"
    >
      <p className="overline mb-2">
        Kilder
      </p>

      <div className="flex flex-wrap gap-2">
        {sources.map((source, index) => {
          const Icon = TYPE_ICONS[source.type] || FileText
          const confidenceColor = getConfidenceColor(source.confidence ?? 1)
          const confidenceWidth = `${(source.confidence ?? 1) * 100}%`

          const isClickable = !!source.url
          const Tag = isClickable ? 'a' : 'div'
          const linkProps = isClickable
            ? { href: source.url, target: '_blank', rel: 'noopener noreferrer' }
            : {}

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: 0.05 * index }}
            >
              <Tag
                {...linkProps}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
                  group transition-all duration-200 chip-interactive
                  ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                style={{
                  background: COLORS.bgSurface,
                  border: '1px solid ' + COLORS.borderSubtle,
                }}
              >
                {/* Number badge */}
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px]
                             font-bold shrink-0"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: COLORS.primaryLight }}
                >
                  {index + 1}
                </span>

                {/* Type icon */}
                <Icon className="w-3 h-3 shrink-0" style={{ color: COLORS.textSecondary }} />

                {/* Name */}
                <span
                  className="font-medium max-w-[160px] truncate"
                  style={{ color: COLORS.textSecondary }}
                >
                  {source.name}
                </span>

                {/* Confidence bar */}
                {source.confidence !== undefined && (
                  <div
                    className="w-8 h-1 rounded-full overflow-hidden shrink-0"
                    style={{ background: 'rgba(255, 255, 255, 0.06)' }}
                    title={`Konfidensgrad: ${Math.round(source.confidence * 100)}%`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: confidenceWidth,
                        background: confidenceColor,
                      }}
                    />
                  </div>
                )}

                {/* External link indicator */}
                {isClickable && (
                  <ExternalLink
                    className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
                    style={{ color: COLORS.textSecondary }}
                  />
                )}
              </Tag>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

export default SourceCard
