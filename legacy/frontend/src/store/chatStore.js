// BudgetIndsigt - Zustand store for chat/Q&A state management
import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  // ─── State ─────────────────────────────────────────

  /**
   * Chat-beskeder.
   * Hvert message-objekt:
   * {
   *   id: string,
   *   role: 'user' | 'assistant',
   *   content: string,             // Markdown-formateret tekst
   *   visualizations: Array,        // Chart-konfigurationer (kun assistant)
   *   sources: Array,               // Kildehenvisninger (kun assistant)
   *   followUpQuestions: Array,      // Opfølgningsspørgsmål (kun assistant)
   *   insights: Array,              // AI-indsigter (kun assistant)
   *   timestamp: string,            // ISO timestamp
   *   loading: boolean,             // True mens svaret genereres
   * }
   */
  messages: [],

  // Loading state - true mens AI genererer svar
  isLoading: false,

  // Fejlmeddelelse
  error: null,

  // ─── Actions ───────────────────────────────────────

  /**
   * Tilføj en ny besked (user eller assistant).
   * Returnerer det tildelte besked-ID.
   *
   * @param {object} message - Besked med mindst { role, content }
   * @returns {string} Beskedens ID
   */
  addMessage: (message) => {
    const msg = {
      id: `${message.role || 'msg'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: message.role || 'user',
      content: message.content || '',
      visualizations: message.visualizations || [],
      sources: message.sources || [],
      followUpQuestions: message.followUpQuestions || [],
      insights: message.insights || [],
      timestamp: message.timestamp || new Date().toISOString(),
      loading: message.loading || false,
    };
    set((state) => ({
      messages: [...state.messages, msg],
      error: null,
    }));
    return msg.id;
  },

  /**
   * Sæt loading state.
   *
   * @param {boolean} isLoading
   */
  setLoading: (isLoading) => set({ isLoading }),

  /**
   * Sæt fejlmeddelelse.
   *
   * @param {string|null} error
   */
  setError: (error) => set({ error, isLoading: false }),

  /**
   * Ryd alle beskeder og nulstil tilstand.
   */
  clearMessages: () => set({ messages: [], error: null, isLoading: false }),

  /**
   * Opdatér den seneste besked med nye data.
   * Bruges typisk til at udfylde et assistant-svar efter loading.
   *
   * @param {object} updates - Felter der skal opdateres
   */
  updateLastMessage: (updates) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return state;

      const lastIndex = messages.length - 1;
      messages[lastIndex] = {
        ...messages[lastIndex],
        ...updates,
        loading: false,
      };

      return {
        messages,
        isLoading: false,
      };
    });
  },

  /**
   * Opdatér en specifik besked baseret på ID.
   *
   * @param {string} messageId - Beskedens ID
   * @param {object} updates - Felter der skal opdateres
   */
  updateMessage: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    }));
  },

  /**
   * Hent den seneste assistant-besked.
   *
   * @returns {object|null}
   */
  getLastAssistantMessage: () => {
    const msgs = get().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i];
    }
    return null;
  },

  /**
   * Hent antal beskeder.
   *
   * @returns {number}
   */
  getMessageCount: () => get().messages.length,
}));

export default useChatStore;
