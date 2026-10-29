import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowRight, Sparkles } from 'lucide-react'
import { EXAMPLE_QUERIES, COLORS } from '../utils/constants'

function SearchBar({ onSearch, placeholder, exampleQueries }) {
  const queries = exampleQueries || EXAMPLE_QUERIES
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)

  // Rotate placeholder text every 4 seconds
  useEffect(() => {
    if (isFocused || query) return // Don't rotate when focused or has text

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % queries.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [queries.length, isFocused, query])

  const handleSubmit = (e) => {
    e?.preventDefault()
    const trimmed = query.trim()
    if (trimmed && onSearch) {
      onSearch(trimmed)
      setQuery('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChipClick = (suggestion) => {
    if (onSearch) {
      onSearch(suggestion)
    }
  }

  const currentPlaceholder = placeholder || queries[placeholderIndex]

  const glassStyle = {
    background: COLORS.bgSurface,
    border: isFocused
      ? '1px solid rgba(99, 102, 241, 0.4)'
      : `1px solid ${COLORS.borderDefault}`,
    boxShadow: isFocused
      ? '0 0 0 3px rgba(99, 102, 241, 0.08)'
      : 'none',
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
  }

  // Show first 4 queries as suggestion chips
  const suggestions = queries.slice(0, 4)

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={glassStyle}
        >
          <form onSubmit={handleSubmit} className="flex items-center gap-3 px-5 py-4">
            <Search className="w-5 h-5 shrink-0" style={{ color: COLORS.textSecondary }} />

            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-base placeholder-transparent outline-none"
                style={{ color: COLORS.textPrimary, caretColor: COLORS.primary }}
                placeholder={currentPlaceholder}
              />

              {/* Custom animated placeholder */}
              {!query && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 0.4, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="absolute left-0 top-1/2 -translate-y-1/2 text-base
                               pointer-events-none truncate max-w-full"
                    style={{ color: COLORS.textSecondary }}
                  >
                    {currentPlaceholder}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>

            {/* Send button */}
            <AnimatePresence>
              {query.trim() && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  type="submit"
                  className="btn-primary rounded-lg flex items-center justify-center shrink-0 w-9 h-9"
                >
                  <ArrowRight className="w-4 h-4" style={{ color: COLORS.textPrimary }} />
                </motion.button>
              )}
            </AnimatePresence>
          </form>
        </div>
      </motion.div>

      {/* Suggestion chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="flex flex-wrap items-center justify-center gap-2 mt-4"
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: COLORS.primary, opacity: 0.5 }} />
        {suggestions.map((suggestion, i) => (
          <SuggestionChip
            key={i}
            text={suggestion}
            onClick={() => handleChipClick(suggestion)}
            delay={0.3 + i * 0.06}
          />
        ))}
      </motion.div>
    </div>
  )
}

function SuggestionChip({ text, onClick, delay }) {
  // Truncate long queries for chip display
  const displayText = text.length > 50 ? text.slice(0, 47) + '...' : text

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      onClick={onClick}
      className="chip-interactive px-3 py-1.5 text-xs rounded-lg cursor-pointer"
      style={{ color: COLORS.textSecondary }}
    >
      {displayText}
    </motion.button>
  )
}

export default SearchBar
