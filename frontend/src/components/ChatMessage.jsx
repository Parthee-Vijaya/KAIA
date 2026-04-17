import { motion } from 'framer-motion'
import { Bot, User } from 'lucide-react'
import { COLORS } from '../utils/constants'
import Visualization from './Visualization'
import SourceCard from './SourceCard'

/**
 * Parse simple markdown-like content to React elements.
 * Supports: ## headings, **bold**, - bullet lists, 1. numbered lists
 */
function parseMarkdownContent(content) {
  if (!content) return null

  const lines = content.split('\n')
  const elements = []
  let listBuffer = []
  let listType = null // 'ul' or 'ol'
  let listKey = 0

  const flushList = () => {
    if (listBuffer.length > 0) {
      const ListTag = listType === 'ol' ? 'ol' : 'ul'
      const listClass =
        listType === 'ol'
          ? 'list-decimal list-inside space-y-1 ml-1 my-2'
          : 'list-disc list-inside space-y-1 ml-1 my-2'

      elements.push(
        <ListTag key={`list-${listKey++}`} className={listClass}>
          {listBuffer.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed" style={{ color: COLORS.textSecondary }}>
              {parseBold(item)}
            </li>
          ))}
        </ListTag>
      )
      listBuffer = []
      listType = null
    }
  }

  const parseBold = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold" style={{ color: COLORS.textPrimary }}>
            {part.slice(2, -2)}
          </strong>
        )
      }
      return part
    })
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

    // Empty line
    if (!trimmed) {
      flushList()
      return
    }

    // Heading ##
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h3 key={`h-${i}`} className="text-base font-semibold mt-4 mb-2" style={{ color: COLORS.textPrimary }}>
          {parseBold(trimmed.slice(3))}
        </h3>
      )
      return
    }

    // Heading ###
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(
        <h4 key={`h-${i}`} className="text-sm font-semibold mt-3 mb-1.5" style={{ color: COLORS.textPrimary, opacity: 0.9 }}>
          {parseBold(trimmed.slice(4))}
        </h4>
      )
      return
    }

    // Bullet list: - or *
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/)
    if (bulletMatch) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listBuffer.push(bulletMatch[1])
      return
    }

    // Numbered list: 1. 2. etc
    const numberMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (numberMatch) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      listBuffer.push(numberMatch[1])
      return
    }

    // Regular paragraph
    flushList()
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed my-1.5" style={{ color: COLORS.textSecondary }}>
        {parseBold(trimmed)}
      </p>
    )
  })

  flushList()
  return elements
}

// Typing indicator (3 animated dots)
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: COLORS.primaryLight }}
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [0.85, 1.1, 0.85],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

function ChatMessage({ message, onFollowUpClick, isLoading = false }) {
  const { role, content, visualizations, sources, followUpQuestions } = message

  const isUser = role === 'user'
  const isAssistant = role === 'assistant'

  const userBubbleStyle = {
    background: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
  }

  const assistantBubbleStyle = {
    background: COLORS.bgSurface,
    border: '1px solid ' + COLORS.borderSubtle,
  }

  // followUpChipStyle removed — handled by .chip-interactive CSS class

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
    >
      {/* Assistant avatar */}
      {isAssistant && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(99, 102, 241, 0.15)' }}
        >
          <Bot className="w-4 h-4" style={{ color: COLORS.primaryLight }} />
        </div>
      )}

      {/* Message content */}
      <div className={`max-w-[85%] ${isUser ? 'order-1' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${isUser ? 'rounded-tr-md' : 'rounded-tl-md'}`}
          style={isUser ? userBubbleStyle : assistantBubbleStyle}
        >
          {/* Loading state */}
          {isLoading && !content ? (
            <TypingIndicator />
          ) : (
            <>
              {/* Text content */}
              {content && <div className="space-y-0">{parseMarkdownContent(content)}</div>}

              {/* Visualizations */}
              {visualizations && visualizations.length > 0 && (
                <div className="mt-4 space-y-4">
                  {visualizations.map((viz, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{
                        background: COLORS.bgBase,
                        border: '1px solid rgba(99, 102, 241, 0.08)',
                      }}
                    >
                      <Visualization
                        type={viz.type}
                        data={viz.data}
                        title={viz.title}
                        subtitle={viz.subtitle}
                        height={viz.height || 260}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sources */}
        {isAssistant && sources && sources.length > 0 && (
          <SourceCard sources={sources} />
        )}

        {/* Follow-up questions */}
        {isAssistant && followUpQuestions && followUpQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="flex flex-wrap gap-2 mt-3"
          >
            {followUpQuestions.map((question, i) => (
              <button
                key={i}
                onClick={() => onFollowUpClick?.(question)}
                className="chip-interactive px-3 py-1.5 rounded-lg text-xs cursor-pointer text-left"
                style={{ color: COLORS.textSecondary }}
              >
                {question}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(99, 102, 241, 0.25)' }}
        >
          <User className="w-4 h-4" style={{ color: COLORS.primaryLight }} />
        </div>
      )}
    </motion.div>
  )
}

export default ChatMessage
