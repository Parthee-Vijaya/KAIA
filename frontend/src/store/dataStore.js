// BudgetIndsigt - Zustand store for external data (DST, Folketinget)
// Håndterer state for live data fra Danmarks Statistik og Folketingets API
import { create } from 'zustand';

const useDataStore = create((set, get) => ({
  // ─── State ─────────────────────────────────────────

  // Danmarks Statistik befolkningsdata
  populationData: null,

  // Folketingets lovgivningsdata
  legislationData: null,

  // Valgt fagområde til filtrering
  selectedFagomraade: 'skole',

  // Loading states for individuelle API'er
  isLoadingDS: false,  // Danmarks Statistik
  isLoadingFT: false,  // Folketinget

  // Tidsstempler for seneste opdatering
  lastUpdatedDS: null,
  lastUpdatedFT: null,

  // Fejlmeddelelser
  errorDS: null,
  errorFT: null,

  // ─── Actions ───────────────────────────────────────

  /**
   * Sæt befolkningsdata fra Danmarks Statistik.
   *
   * @param {object|null} data - Befolkningsdata objekt
   */
  setPopulationData: (data) =>
    set({
      populationData: data,
      lastUpdatedDS: data ? new Date().toISOString() : get().lastUpdatedDS,
      errorDS: null,
    }),

  /**
   * Sæt lovgivningsdata fra Folketinget.
   *
   * @param {object|null} data - Lovgivningsdata objekt
   */
  setLegislationData: (data) =>
    set({
      legislationData: data,
      lastUpdatedFT: data ? new Date().toISOString() : get().lastUpdatedFT,
      errorFT: null,
    }),

  /**
   * Sæt det valgte fagområde.
   *
   * @param {string} id - Fagområde-ID (f.eks. 'skole', 'sundhed', 'social')
   */
  setFagomraade: (id) => set({ selectedFagomraade: id }),

  /**
   * Sæt loading state for Danmarks Statistik.
   *
   * @param {boolean} isLoading
   */
  setLoadingDS: (isLoading) => set({ isLoadingDS: isLoading }),

  /**
   * Sæt loading state for Folketinget.
   *
   * @param {boolean} isLoading
   */
  setLoadingFT: (isLoading) => set({ isLoadingFT: isLoading }),

  /**
   * Sæt fejl for Danmarks Statistik.
   *
   * @param {string|null} error
   */
  setErrorDS: (error) => set({ errorDS: error, isLoadingDS: false }),

  /**
   * Sæt fejl for Folketinget.
   *
   * @param {string|null} error
   */
  setErrorFT: (error) => set({ errorFT: error, isLoadingFT: false }),

  /**
   * Returnerer true hvis nogen af de eksterne API'er loader.
   *
   * @returns {boolean}
   */
  isAnyLoading: () => get().isLoadingDS || get().isLoadingFT,

  /**
   * Returnerer true hvis der er fejl i nogen af de eksterne API'er.
   *
   * @returns {boolean}
   */
  hasErrors: () => !!(get().errorDS || get().errorFT),

  /**
   * Nulstil alle data og state til initial values.
   */
  resetAll: () =>
    set({
      populationData: null,
      legislationData: null,
      isLoadingDS: false,
      isLoadingFT: false,
      lastUpdatedDS: null,
      lastUpdatedFT: null,
      errorDS: null,
      errorFT: null,
    }),

  /**
   * Returnerer en status-oversigt for alle datakilderne.
   *
   * @returns {object} Status med felt for hver kilde
   */
  getDataSourceStatus: () => {
    const state = get();
    return {
      dst: {
        loaded: state.populationData !== null,
        loading: state.isLoadingDS,
        lastUpdated: state.lastUpdatedDS,
        error: state.errorDS,
      },
      ft: {
        loaded: state.legislationData !== null,
        loading: state.isLoadingFT,
        lastUpdated: state.lastUpdatedFT,
        error: state.errorFT,
      },
    };
  },
}));

export default useDataStore;
