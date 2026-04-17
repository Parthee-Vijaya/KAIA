// BudgetIndsigt - Zustand store for budget state management
// Bruger persist middleware til at gemme brugerens realiseringer i localStorage
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BUDGET_2024, BUDGET_SUMMARY, MONTHS, CURRENT_MONTH_INDEX } from '../data/mockBudget';

const useBudgetStore = create(
  persist(
    (set, get) => ({
      // ─── State ─────────────────────────────────────────

      // Vedtaget budgetdata (fra mockBudget)
      budgetAreas: BUDGET_2024,
      summary: BUDGET_SUMMARY,
      months: MONTHS,
      currentMonthIndex: CURRENT_MONTH_INDEX,

      // Valgt budgetår
      selectedYear: 2024,

      // Valgt kontoområde (null = alle områder)
      selectedArea: null,

      // Brugerindtastede månedlige realiseringer
      // Format: { 'areaId-monthIndex': value }
      realizations: {},

      // Aktiv tab på budgetsiden
      activeTab: 'overblik',

      // Loading state
      isLoading: false,

      // ─── Actions ───────────────────────────────────────

      /**
       * Sæt det valgte budgetår.
       */
      setYear: (year) => set({ selectedYear: year }),

      /**
       * Sæt det valgte kontoområde.
       * Brug null for at vise alle områder.
       */
      setArea: (areaId) => set({ selectedArea: areaId }),

      /**
       * Sæt den aktive tab.
       */
      setActiveTab: (tab) => set({ activeTab: tab }),

      /**
       * Opdatér en brugerindtastet månedlig realisering.
       *
       * @param {string} areaId - Kontoområde-ID
       * @param {number} month - Månedsindex (0-11)
       * @param {number|null} value - Beløb i mio. DKK (null for at slette)
       */
      updateRealization: (areaId, month, value) => {
        const key = `${areaId}-${month}`;
        set((state) => {
          const updated = { ...state.realizations };
          if (value === null || value === undefined) {
            delete updated[key];
          } else {
            updated[key] = value;
          }
          return { realizations: updated };
        });
      },

      /**
       * Hent et array af 12 månedlige værdier for et givet område.
       * Brugerindtastede værdier overskriver de originale data.
       *
       * @param {string} areaId - Kontoområde-ID
       * @returns {Array<number|null>} 12 månedlige værdier
       */
      getRealizations: (areaId) => {
        const area = get().budgetAreas.find((a) => a.id === areaId);
        if (!area) return Array(12).fill(null);

        const realizations = get().realizations;
        return area.monthlyRealization.map((originalValue, monthIndex) => {
          const key = `${areaId}-${monthIndex}`;
          if (realizations[key] !== undefined) {
            return realizations[key];
          }
          return originalValue;
        });
      },

      /**
       * Hent et specifikt kontoområde baseret på ID.
       */
      getArea: (areaId) => {
        return get().budgetAreas.find((a) => a.id === areaId) || null;
      },

      /**
       * Hent det aktuelt valgte kontoområde.
       */
      getSelectedArea: () => {
        const { selectedArea, budgetAreas } = get();
        if (!selectedArea) return null;
        return budgetAreas.find((a) => a.id === selectedArea) || null;
      },

      /**
       * Nulstil brugerindtastede realiseringer for et specifikt område.
       */
      resetAreaRealizations: (areaId) => {
        set((state) => {
          const updated = { ...state.realizations };
          Object.keys(updated).forEach((key) => {
            if (key.startsWith(`${areaId}-`)) {
              delete updated[key];
            }
          });
          return { realizations: updated };
        });
      },

      /**
       * Nulstil alle brugerindtastede realiseringer.
       */
      resetAllRealizations: () => set({ realizations: {} }),

      /**
       * Sæt loading state.
       */
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      // Persist konfiguration
      name: 'budgetindsigt-budget-store',
      // Gem kun brugerspecifikke data, ikke hele budgettet
      partialize: (state) => ({
        selectedYear: state.selectedYear,
        selectedArea: state.selectedArea,
        realizations: state.realizations,
        activeTab: state.activeTab,
      }),
    }
  )
);

export default useBudgetStore;
