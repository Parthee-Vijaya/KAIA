import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Loader2 } from 'lucide-react'
import { EXAMPLE_QUERIES, COLORS } from '../utils/constants'

const MAX_HEIGHT = 200

function ChatInput({ onSend, isLoading = false, hasMessages = false }) {
  const [value, setValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const textareaRef = useRef(null)

  // Rotate placeholder text
  useEffect(() => {
    if (hasMessages || isFocused || value) return

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_QUERIES.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [hasMessages, isFocused, value])

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend?.(trimmed)
    setValue('')
    // Reset height after send
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = value.trim().length > 0 && !isLoading

  const currentPlaceholder = hasMessages
    ? 'Stil et opf\u00f8lgende sp\u00f8rgsm\u00e5l...'
    : EXAMPLE_QUERIES[placeholderIndex]

  const containerStyle = {
    background: COLORS.bgSurface,
    border: isFocused
      ? '1px solid rgba(99, 102, 241, 0.3)'
      : `1px solid ${COLORS.borderDefault}`,
    boxShadow: isFocused
      ? '0 0 0 3px rgba(99, 102, 241, 0.06)'
      : 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-3xl mx-auto"
    >
      <div className="rounded-2xl overflow-hidden" style={containerStyle}>
        <div className="flex items-end gap-3 px-4 py-3">
          {/* Textarea */}
          <div className="flex-1 relative min-h-[24px]">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              rows={1}
              className="w-full bg-transparent text-sm leading-relaxed
                         placeholder-transparent outline-none resize-none"
              style={{
                maxHeight: `${MAX_HEIGHT}px`,
                color: COLORS.textPrimary,
                caretColor: COLORS.primary,
              }}
              placeholder={currentPlaceholder}
              disabled={isLoading}
            />

            {/* Custom animated placeholder (search mode) */}
            {!value && !hasMessages && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 0.35, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="absolute left-0 top-0 text-sm
                             pointer-events-none truncate max-w-full leading-relaxed"
                  style={{ color: COLORS.textSecondary }}
                >
                  {currentPlaceholder}
                </motion.span>
              </AnimatePresence>
            )}

            {/* Static placeholder for chat mode */}
            {!value && hasMessages && (
              <span
                className="absolute left-0 top-0 text-sm pointer-events-none leading-relaxed"
                style={{ color: COLORS.textSecondary, opacity: 0.5 }}
              >
                Stil et opfølgende spørgsmål...
              </span>
            )}
          </div>

          {/* Send button */}
          <motion.button
            onClick={handleSend}
            disabled={!canSend}
            whileTap={canSend ? { scale: 0.92 } : {}}
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${canSend ? 'btn-primary' : ''}`}
            style={{
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: COLORS.textSecondary }} />
            ) : (
              <ArrowUp
                className="w-4 h-4 transition-colors duration-200"
                style={{ color: canSend ? COLORS.textPrimary : 'rgba(255, 255, 255, 0.2)' }}
              />
            )}
          </motion.button>
        </div>

        {/* Bottom hint text */}
        <div className="px-4 pb-2">
          <p className="caption">
            Tryk Enter for at sende, Shift+Enter for ny linje
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default ChatInput
