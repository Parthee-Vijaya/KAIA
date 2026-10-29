import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Trash2 } from 'lucide-react'
import ChatMessage from '../components/ChatMessage'
import ChatInput from '../components/ChatInput'
import useChatStore from '../store/chatStore'
import { sendQuestion } from '../services/aiService'
import { EXAMPLE_QUERIES } from '../utils/constants'

function QuestionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q')
  const scrollRef = useRef(null)
  const hasProcessedInitial = useRef(false)

  const { messages, isLoading, addMessage, updateLastMessage, setLoading, setError, clearMessages } = useChatStore()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (initialQuery && !hasProcessedInitial.current && messages.length === 0) {
      hasProcessedInitial.current = true
      handleSend(initialQuery)
      setSearchParams({}, { replace: true })
    }
  }, [initialQuery])

  const handleSend = async (question) => {
    if (!question.trim() || isLoading) return

    addMessage({ role: 'user', content: question })
    addMessage({ role: 'assistant', content: '', loading: true })
    setLoading(true)

    try {
      const response = await sendQuestion(question)
      updateLastMessage({
        content: response.response || response.content || '',
        visualizations: response.visualizations || [],
        sources: response.sources || [],
        followUpQuestions: response.followUpQuestions || [],
        loading: false,
      })
    } catch (error) {
      console.error('AI fejl:', error)
      updateLastMessage({
        content: 'Beklager, der opstod en fejl. Prøv venligst igen.',
        loading: false,
      })
      setError(error.message)
    }
  }

  const handleFollowUp = (question) => {
    handleSend(question)
  }

  const handleClear = () => {
    clearMessages()
    hasProcessedInitial.current = false
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {hasMessages && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 max-w-4xl mx-auto w-full"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-slate-500">{messages.length} beskeder</span>
          </div>
          <button
            onClick={handleClear}
            className="chip-interactive flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-white
                       rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Ny samtale
          </button>
        </motion.div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {!hasMessages ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                  <span className="text-gradient">Stil et spørgsmål</span>
                </h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto mb-10">
                  Få AI-drevet indsigt i dit kommunale budget, befolkningsdata og lovgivning
                </p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {EXAMPLE_QUERIES.slice(0, 6).map((query, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                    whileHover={{ y: -2 }}
                    onClick={() => handleSend(query)}
                    className="card-interactive text-left px-4 py-3 rounded-xl text-xs text-slate-400 cursor-pointer group"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-500 mb-1.5 group-hover:text-indigo-400 transition-colors" />
                    <span className="group-hover:text-slate-200 transition-colors">{query}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="py-4 space-y-2">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onFollowUpClick={handleFollowUp}
                  isLoading={msg.loading}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-4"
           style={{ background: 'linear-gradient(to top, rgba(10,10,15,0.95), transparent)' }}>
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          hasMessages={hasMessages}
        />
      </div>
    </div>
  )
}

export default QuestionPage
