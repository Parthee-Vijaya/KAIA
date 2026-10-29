/**
 * BudgetIndsigt -- Globale konstanter og hjælpefunktioner
 * Design system farver, chart-tema, eksempelforespørgsler og formattering
 */

// ============================================================
// Farvepalette -- bruges til UI-komponenter og datavisualisering
// ============================================================
export const COLORS = {
  primary: '#6366f1',
  primaryLight: '#818cf8',
  secondary: '#22d3ee',
  accent: '#f472b6',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',

  // Surface layers (darkest → lightest)
  bgBase: '#09090f',
  bgSurface: '#111118',
  bgRaised: '#1a1a25',
  bgOverlay: '#222230',
  bgDark: '#09090f',
  bgCard: '#111118',

  // Border variants
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderDefault: 'rgba(255,255,255,0.10)',
  borderHover: 'rgba(255,255,255,0.16)',
  border: 'rgba(255,255,255,0.10)',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',

  // Semantic domain colors
  budget: '#3b82f6',       // blue
  budgetLight: '#60a5fa',
  population: '#f59e0b',   // amber
  populationLight: '#fbbf24',
  legislation: '#8b5cf6',  // violet
  legislationLight: '#a78bfa',
};

// ============================================================
// Recharts Dark Theme -- konfiguration til alle grafer
// ============================================================
export const CHART_THEME = {
  // Farverække til dataserier (op til 8 serier)
  colors: [
    '#6366f1', // indigo
    '#22d3ee', // cyan
    '#f472b6', // pink
    '#22c55e', // grøn
    '#eab308', // gul
    '#f97316', // orange
    '#a78bfa', // violet
    '#2dd4bf', // teal
  ],

  // Grid-linjer
  grid: {
    stroke: 'rgba(255, 255, 255, 0.05)',
    strokeDasharray: '3 3',
  },

  // Aksetekst
  text: {
    fill: '#64748b',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },

  // Tooltip-styling
  tooltip: {
    contentStyle: {
      background: '#1a1a25',
      border: '1px solid rgba(255, 255, 255, 0.10)',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      padding: '10px 14px',
    },
    labelStyle: {
      color: '#f8fafc',
      fontWeight: 600,
      marginBottom: '4px',
      fontSize: '13px',
    },
    itemStyle: {
      color: '#cbd5e1',
      fontSize: '12px',
      padding: '2px 0',
    },
    cursor: {
      stroke: 'rgba(99, 102, 241, 0.2)',
      strokeWidth: 1,
      strokeDasharray: '4 4',
    },
  },

  // Legend-styling
  legend: {
    wrapperStyle: {
      paddingTop: '12px',
    },
    iconSize: 10,
    iconType: 'circle',
  },

  // Responsiv container-marginer
  margin: {
    top: 8,
    right: 24,
    bottom: 8,
    left: 24,
  },
};

// ============================================================
// Eksempelforespørgsler -- vises på startsiden som inspiration
// 12 realistiske spørgsmål fra kommunale budgetledere
// ============================================================
export const EXAMPLE_QUERIES = [
  'Har jeg råd til at udskifte inventar på skolen?',
  'Hvad er status på mit budget?',
  'Hvordan påvirker befolkningsudviklingen mit budget?',
  'Er der lovgivning på vej der påvirker min økonomi?',
  'Kan jeg flytte midler fra drift til anlæg?',
  'Hvad er den forventede merudgift på specialundervisning i år?',
  'Hvordan ligger vores forbrug sammenlignet med nabokommunerne?',
  'Hvad koster det at ansætte en ekstra medarbejder resten af året?',
  'Hvilke budgetposter har størst afvigelse lige nu?',
  'Kan jeg finansiere en ny legeplads inden for det eksisterende budget?',
  'Hvordan ser prognosen ud for ældreområdet?',
  'Hvad betyder overenskomstresultatet for mit budget?',
];

// ============================================================
// Fagområder -- kommunale sektorinddelinger med nøgleord
// Bruges til filtrering og kategorisering af budgetdata
// ============================================================
export const FAGOMRAADER = [
  {
    id: 'skole',
    label: 'Skole & Uddannelse',
    emneord: ['uddannelse', 'folkeskole', 'specialundervisning', 'SFO', 'klub', 'PPR'],
  },
  {
    id: 'aeldre',
    label: 'Ældre & Sundhed',
    emneord: ['sundhed', 'ældre', 'pleje', 'hjemmepleje', 'plejehjem', 'genoptræning'],
  },
  {
    id: 'teknik',
    label: 'Teknik & Miljø',
    emneord: ['miljø', 'byggeri', 'infrastruktur', 'veje', 'park', 'renovation'],
  },
  {
    id: 'social',
    label: 'Social & Beskæftigelse',
    emneord: ['beskæftigelse', 'social', 'integration', 'kontanthjælp', 'sygedagpenge', 'handicap'],
  },
  {
    id: 'kultur',
    label: 'Kultur & Fritid',
    emneord: ['kultur', 'fritid', 'sport', 'bibliotek', 'musik', 'foreninger'],
  },
];

// ============================================================
// API Endpoints -- konfiguration til backend-kommunikation
// ============================================================
export const API_ENDPOINTS = {
  // Budget data
  budget: '/api/budget',
  budgetDetail: (id) => `/api/budget/${id}`,
  budgetForecast: '/api/budget/forecast',

  // AI chat
  chat: '/api/chat',
  chatStream: '/api/chat/stream',

  // Kilder og dokumentation
  sources: '/api/sources',
  sourceDetail: (id) => `/api/sources/${id}`,

  // Nøgletal og benchmarks
  kpi: '/api/kpi',
  benchmarks: '/api/benchmarks',

  // Befolkningsprognoser
  population: '/api/population',

  // Lovgivning og reguleringer
  legislation: '/api/legislation',
};

// ============================================================
// Navigationslinkk og kilde-typer (bevaret fra eksisterende)
// ============================================================
export const NAV_LINKS = [
  { path: '/', label: 'Dashboard' },
  { path: '/budget', label: 'Budget' },
  { path: '/befolkning', label: 'Befolkning' },
  { path: '/lovgivning', label: 'Lovgivning' },
];

export const SOURCE_TYPES = {
  document: 'Dokument',
  data: 'Data',
  law: 'Lovgivning',
  statistics: 'Statistik',
};

// ============================================================
// Formatteringsfunktioner
// ============================================================

/**
 * Formaterer et beløb i danske kroner med passende enhed.
 * Håndterer millioner (mio. kr.) og milliarder (mia. kr.).
 *
 * @param {number} amount - Beløb i hele kroner
 * @returns {string} Formateret beløbsstreng
 *
 * @example
 * formatCurrency(1500000)    // "1,5 mio. kr."
 * formatCurrency(2300000000) // "2,3 mia. kr."
 * formatCurrency(45000)      // "45.000 kr."
 * formatCurrency(-800000)    // "-0,8 mio. kr."
 */
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '—';

  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  // Milliarder (>= 1.000.000.000)
  if (abs >= 1_000_000_000) {
    const value = abs / 1_000_000_000;
    const formatted = value % 1 === 0
      ? value.toFixed(0)
      : value.toFixed(1).replace('.', ',');
    return `${sign}${formatted} mia. kr.`;
  }

  // Millioner (>= 1.000.000)
  if (abs >= 1_000_000) {
    const value = abs / 1_000_000;
    const formatted = value % 1 === 0
      ? value.toFixed(0)
      : value.toFixed(1).replace('.', ',');
    return `${sign}${formatted} mio. kr.`;
  }

  // Tusinder -- brug dansk punktum som tusind-separator
  const formatted = abs.toLocaleString('da-DK', {
    maximumFractionDigits: 0,
  });

  return `${sign}${formatted} kr.`;
}

/**
 * Formaterer en procentværdi med dansk komma-notation.
 *
 * @param {number} value - Procentværdi (f.eks. 4.5 for 4,5%)
 * @param {number} [decimals=1] - Antal decimaler
 * @returns {string} Formateret procentstreng
 *
 * @example
 * formatPercent(4.56)     // "4,6%"
 * formatPercent(-2.1)     // "-2,1%"
 * formatPercent(0)        // "0,0%"
 * formatPercent(12.345, 2) // "12,35%"
 */
export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';

  const formatted = value.toFixed(decimals).replace('.', ',');
  return `${formatted}%`;
}
