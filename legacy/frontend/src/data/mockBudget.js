// BudgetIndsigt - Kommunalt budgetdata for Kalundborg Kommune 2024
// Alle beløb i millioner DKK

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
];

/**
 * Beregner Year-To-Date (YTD) sum fra månedlige realiseringer.
 * Ignorerer null-værdier (fremtidige måneder).
 */
function calcYTD(monthlyValues) {
  return monthlyValues
    .filter((v) => v !== null)
    .reduce((sum, v) => sum + v, 0);
}

/**
 * Beregner forventet årsresultat baseret på nuværende forbrug.
 * Benytter lineær fremskrivning af gennemsnitligt månedligt forbrug.
 */
function calcForecast(monthlyValues, annualBudget) {
  const realized = monthlyValues.filter((v) => v !== null);
  if (realized.length === 0) return annualBudget;
  const avgMonthly = realized.reduce((s, v) => s + v, 0) / realized.length;
  return Math.round(avgMonthly * 12 * 10) / 10;
}

// Nuværende måned (0-indekseret) - simulerer at vi er i september 2024
const CURRENT_MONTH_INDEX = 8; // September = index 8

/**
 * BUDGET_2024 - Hovedbudgetdata med 10 kontoområder
 *
 * Hver post indeholder:
 * - id: Unikt kontoområde-ID
 * - name: Dansk navn på området
 * - budget: Vedtaget budget i mio. DKK
 * - monthlyRealization: Faktiske udgifter pr. måned (null = ikke realiseret endnu)
 * - lastYearMonthly: Månedlige udgifter fra 2023
 * - lastYearTotal: Samlet forbrug i 2023
 * - status: 'green' | 'yellow' | 'red' baseret på budgetoverholdelse
 * - ansvarlig: Navn på budgetansvarlig chef
 * - kontonr: Kommunalt kontonummer
 * - subcategories: Underkonti med delbudgetter (summerer til parent budget)
 * - kpis: Nøgletal for området
 */
export const BUDGET_2024 = [
  {
    id: 'administration',
    name: 'Administration',
    kontonr: '6.45',
    ansvarlig: 'Henrik Madsen',
    budget: 45.0,
    monthlyRealization: [3.6, 3.7, 3.8, 3.5, 3.9, 3.7, 3.6, 3.8, 3.7, null, null, null],
    lastYearMonthly: [3.4, 3.5, 3.6, 3.4, 3.7, 3.5, 3.4, 3.6, 3.5, 3.6, 3.5, 3.7],
    lastYearTotal: 42.7,
    status: 'yellow',
    subcategories: [
      { id: 'admin-it', name: 'IT-drift', budget: 12 },
      { id: 'admin-hr', name: 'Personale & HR', budget: 10 },
      { id: 'admin-oekonomi', name: 'Økonomi & Regnskab', budget: 8 },
      { id: 'admin-komm', name: 'Kommunikation', budget: 5 },
      { id: 'admin-byg', name: 'Bygningsdrift', budget: 6 },
      { id: 'admin-jura', name: 'Juridisk afdeling', budget: 4 },
    ],
    kpis: {
      fteCount: 128,
      costPerCitizen: 920,
      sicknessRate: 4.5,
      vacancyRate: 2.1,
      digitaliseringsgrad: 78,
    },
  },
  {
    id: 'dagtilbud',
    name: 'Dagtilbud',
    kontonr: '5.25',
    ansvarlig: 'Maria Jensen',
    budget: 120.0,
    monthlyRealization: [9.8, 10.1, 10.0, 9.9, 10.2, 9.7, 8.5, 9.3, 10.0, null, null, null],
    lastYearMonthly: [9.5, 9.7, 9.8, 9.6, 9.9, 9.4, 8.2, 9.0, 9.7, 9.8, 9.6, 10.0],
    lastYearTotal: 114.2,
    status: 'green',
    subcategories: [
      { id: 'dag-vuggestue', name: 'Vuggestuer', budget: 35 },
      { id: 'dag-boernehave', name: 'Børnehaver', budget: 52 },
      { id: 'dag-dagpleje', name: 'Dagpleje', budget: 15 },
      { id: 'dag-saerlige', name: 'Særlige dagtilbud', budget: 8 },
      { id: 'dag-ledelse', name: 'Ledelse & administration', budget: 10 },
    ],
    kpis: {
      fteCount: 310,
      indskrevneBørn: 1820,
      normeringPrBarn: 5.9,
      sicknessRate: 7.1,
      forældretilfredshed: 82,
    },
  },
  {
    id: 'folkeskole',
    name: 'Folkeskole',
    kontonr: '3.22',
    ansvarlig: 'Peter Andersen',
    budget: 280.0,
    monthlyRealization: [22.5, 23.1, 23.8, 22.9, 24.2, 23.0, 18.5, 21.8, 24.1, null, null, null],
    lastYearMonthly: [21.8, 22.3, 23.0, 22.1, 23.5, 22.2, 17.8, 21.0, 23.3, 23.5, 22.8, 23.7],
    lastYearTotal: 267.0,
    status: 'yellow',
    subcategories: [
      { id: 'skole-almen', name: 'Almenundervisning', budget: 175 },
      { id: 'skole-sfo', name: 'SFO', budget: 42 },
      { id: 'skole-ledelse', name: 'Skoleledelse', budget: 28 },
      { id: 'skole-bygning', name: 'Bygninger', budget: 22 },
      { id: 'skole-it', name: 'IT & Læremidler', budget: 13 },
    ],
    kpis: {
      fteCount: 625,
      elevtal: 4850,
      costPerElev: 57700,
      klassekvotient: 22.3,
      sicknessRate: 5.8,
      trivselsScore: 3.7,
    },
  },
  {
    id: 'specialundervisning',
    name: 'Specialundervisning',
    kontonr: '3.38',
    ansvarlig: 'Lise Thomsen',
    budget: 95.0,
    monthlyRealization: [8.2, 8.5, 8.9, 8.7, 9.1, 8.8, 7.2, 8.4, 9.3, null, null, null],
    lastYearMonthly: [7.5, 7.8, 8.1, 7.9, 8.3, 8.0, 6.5, 7.6, 8.4, 8.5, 8.2, 8.7],
    lastYearTotal: 95.5,
    status: 'red',
    subcategories: [
      { id: 'spec-kommunale', name: 'Specialklasser kommunale', budget: 32 },
      { id: 'spec-eksterne', name: 'Specialskoler eksterne', budget: 28 },
      { id: 'spec-ppr', name: 'PPR & Visitation', budget: 12 },
      { id: 'spec-stu', name: 'STU-forløb', budget: 15 },
      { id: 'spec-inklusion', name: 'Inklusionstiltak', budget: 8 },
    ],
    kpis: {
      fteCount: 185,
      eleverSegregeret: 245,
      eleverInkluderet: 380,
      segregeringsgrad: 5.1,
      costPerElev: 152000,
      ventetidUger: 6.2,
    },
  },
  {
    id: 'aeldre-sundhed',
    name: 'Ældre & Sundhed',
    kontonr: '4.62',
    ansvarlig: 'Anne Christensen',
    budget: 420.0,
    monthlyRealization: [34.2, 34.8, 35.5, 34.9, 36.1, 35.0, 33.8, 34.5, 35.8, null, null, null],
    lastYearMonthly: [33.0, 33.5, 34.2, 33.8, 34.8, 33.6, 32.5, 33.2, 34.5, 34.8, 34.0, 35.5],
    lastYearTotal: 407.4,
    status: 'yellow',
    subcategories: [
      { id: 'aeldre-hjemmepleje', name: 'Hjemmepleje', budget: 145 },
      { id: 'aeldre-plejehjem', name: 'Plejehjem', budget: 168 },
      { id: 'aeldre-sygepleje', name: 'Sygepleje', budget: 42 },
      { id: 'aeldre-genoptraening', name: 'Genoptræning', budget: 28 },
      { id: 'aeldre-hjaelpemidler', name: 'Hjælpemidler', budget: 22 },
      { id: 'aeldre-forebyggelse', name: 'Forebyggelse', budget: 15 },
    ],
    kpis: {
      fteCount: 842,
      costPerCitizen: 35000,
      sicknessRate: 8.2,
      vacancyRate: 4.8,
      serviceUsers: 1245,
    },
  },
  {
    id: 'social-handicap',
    name: 'Social & Handicap',
    kontonr: '5.38',
    ansvarlig: 'Karen Nielsen',
    budget: 180.0,
    monthlyRealization: [15.5, 15.8, 16.2, 15.9, 16.5, 16.0, 14.8, 15.3, 16.4, null, null, null],
    lastYearMonthly: [14.2, 14.5, 14.9, 14.6, 15.1, 14.7, 13.5, 14.0, 15.0, 15.1, 14.8, 15.4],
    lastYearTotal: 175.8,
    status: 'red',
    subcategories: [
      { id: 'soc-botilbud', name: 'Botilbud § 107/108', budget: 72 },
      { id: 'soc-bostoette', name: 'Bostøtte § 85', budget: 35 },
      { id: 'soc-beskaeftigelse', name: 'Beskyttet beskæftigelse', budget: 25 },
      { id: 'soc-paedagogisk', name: 'Socialpædagogisk støtte', budget: 28 },
      { id: 'soc-myndighed', name: 'Myndighedsafdeling', budget: 20 },
    ],
    kpis: {
      fteCount: 395,
      borgereITilbud: 620,
      costPerBorger: 290000,
      sicknessRate: 9.1,
      vacancyRate: 6.3,
      gennemsnitligSagsbehandlingstid: 18,
    },
  },
  {
    id: 'teknik-miljoe',
    name: 'Teknik & Miljø',
    kontonr: '2.28',
    ansvarlig: 'Søren Larsen',
    budget: 65.0,
    monthlyRealization: [4.8, 5.1, 5.5, 5.3, 5.8, 5.4, 5.0, 5.2, 5.6, null, null, null],
    lastYearMonthly: [4.5, 4.8, 5.2, 5.0, 5.5, 5.1, 4.7, 4.9, 5.3, 5.4, 5.1, 5.5],
    lastYearTotal: 61.0,
    status: 'green',
    subcategories: [
      { id: 'tek-veje', name: 'Veje & Broer', budget: 22 },
      { id: 'tek-parker', name: 'Parker & Grønne områder', budget: 12 },
      { id: 'tek-affald', name: 'Affaldshåndtering', budget: 15 },
      { id: 'tek-miljoe', name: 'Miljøtilsyn', budget: 8 },
      { id: 'tek-byggesag', name: 'Byggesagsbehandling', budget: 8 },
    ],
    kpis: {
      fteCount: 145,
      vejKmVedligeholdt: 842,
      byggesagerBehandlet: 385,
      sagsbehandlingstidDage: 32,
      groenneOmraaderHektar: 125,
      affaldssorteringsgrad: 62,
    },
  },
  {
    id: 'kultur-fritid',
    name: 'Kultur & Fritid',
    kontonr: '3.35',
    ansvarlig: 'Mette Holm',
    budget: 35.0,
    monthlyRealization: [2.7, 2.8, 2.9, 2.8, 3.0, 2.9, 2.5, 2.7, 2.9, null, null, null],
    lastYearMonthly: [2.6, 2.7, 2.8, 2.7, 2.9, 2.8, 2.4, 2.6, 2.8, 2.8, 2.7, 2.9],
    lastYearTotal: 33.7,
    status: 'green',
    subcategories: [
      { id: 'kul-bibliotek', name: 'Biblioteker', budget: 12 },
      { id: 'kul-idraet', name: 'Idrætsanlæg', budget: 10 },
      { id: 'kul-musik', name: 'Musikskole', budget: 5 },
      { id: 'kul-kulturhuse', name: 'Kulturhuse', budget: 4 },
      { id: 'kul-foreninger', name: 'Tilskud til foreninger', budget: 4 },
    ],
    kpis: {
      fteCount: 68,
      biblioteksudlaan: 142000,
      musikskoleElever: 485,
      foreningerStoettet: 112,
      besoegendeAarligt: 185000,
    },
  },
  {
    id: 'beskaeftigelse',
    name: 'Beskæftigelse',
    kontonr: '5.57',
    ansvarlig: 'Thomas Poulsen',
    budget: 150.0,
    monthlyRealization: [12.8, 12.5, 12.2, 12.0, 11.8, 12.1, 12.3, 12.0, 11.9, null, null, null],
    lastYearMonthly: [13.5, 13.2, 12.9, 12.7, 12.5, 12.8, 13.0, 12.7, 12.4, 12.2, 12.0, 12.5],
    lastYearTotal: 152.4,
    status: 'green',
    subcategories: [
      { id: 'besk-kontanthjaelp', name: 'Kontanthjælp & overførsler', budget: 65 },
      { id: 'besk-aktivering', name: 'Aktivering & opkvalificering', budget: 32 },
      { id: 'besk-sygedagpenge', name: 'Sygedagpenge', budget: 25 },
      { id: 'besk-fleksjob', name: 'Fleksjob-tilskud', budget: 18 },
      { id: 'besk-admin', name: 'Administration', budget: 10 },
    ],
    kpis: {
      fteCount: 195,
      ledighedsprocent: 4.2,
      aktiveBorgere: 2850,
      afgangTilJob: 58,
      gennemsnitligSagslængdeDage: 142,
      sygedagpengeModtagere: 385,
    },
  },
  {
    id: 'ledelse-politisk',
    name: 'Ledelse & Politisk',
    kontonr: '6.10',
    ansvarlig: 'Kommunaldirektøren',
    budget: 25.0,
    monthlyRealization: [2.0, 2.1, 2.0, 2.1, 2.1, 2.0, 2.0, 2.1, 2.1, null, null, null],
    lastYearMonthly: [1.9, 2.0, 1.9, 2.0, 2.0, 1.9, 1.9, 2.0, 2.0, 2.0, 1.9, 2.1],
    lastYearTotal: 23.6,
    status: 'green',
    subcategories: [
      { id: 'led-byraad', name: 'Byrådshonorarer', budget: 8 },
      { id: 'led-direktion', name: 'Kommunaldirektionen', budget: 7 },
      { id: 'led-valg', name: 'Valg & demokrati', budget: 3 },
      { id: 'led-projekter', name: 'Tværgående projekter', budget: 4 },
      { id: 'led-revision', name: 'Revision & tilsyn', budget: 3 },
    ],
    kpis: {
      byraadsmedlemmer: 25,
      udvalgsmøederAarligt: 96,
      borgerhenvendelserBesvaret: 1450,
      tvaergaaendeProjekter: 8,
      revisionsanmaerkninger: 2,
    },
  },
];

// Tilføj beregnede felter til hvert budgetområde
BUDGET_2024.forEach((area) => {
  area.ytd = Math.round(calcYTD(area.monthlyRealization) * 10) / 10;
  area.forecast = calcForecast(area.monthlyRealization, area.budget);
  area.deviation = Math.round((area.forecast - area.budget) * 10) / 10;
  area.deviationPct = Math.round(((area.forecast - area.budget) / area.budget) * 1000) / 10;
  area.lastYearYTD = Math.round(
    calcYTD(area.lastYearMonthly.slice(0, CURRENT_MONTH_INDEX + 1)) * 10
  ) / 10;
  area.growthVsLastYear =
    Math.round(((area.ytd - area.lastYearYTD) / area.lastYearYTD) * 1000) / 10;
});

/**
 * BUDGET_SUMMARY - Aggregerede nøgletal for hele kommunen
 */
export const BUDGET_SUMMARY = {
  year: 2024,
  municipality: 'Kalundborg Kommune',
  currentMonth: CURRENT_MONTH_INDEX,
  currentMonthName: MONTHS[CURRENT_MONTH_INDEX],

  totalBudget: BUDGET_2024.reduce((sum, a) => sum + a.budget, 0),
  totalYTD: Math.round(BUDGET_2024.reduce((sum, a) => sum + a.ytd, 0) * 10) / 10,
  totalForecast: Math.round(BUDGET_2024.reduce((sum, a) => sum + a.forecast, 0) * 10) / 10,
  totalLastYear: Math.round(BUDGET_2024.reduce((sum, a) => sum + a.lastYearTotal, 0) * 10) / 10,
  totalLastYearYTD: Math.round(
    BUDGET_2024.reduce((sum, a) => sum + a.lastYearYTD, 0) * 10
  ) / 10,

  get totalDeviation() {
    return Math.round((this.totalForecast - this.totalBudget) * 10) / 10;
  },
  get totalDeviationPct() {
    return Math.round(((this.totalForecast - this.totalBudget) / this.totalBudget) * 1000) / 10;
  },
  get growthVsLastYear() {
    return Math.round(
      ((this.totalYTD - this.totalLastYearYTD) / this.totalLastYearYTD) * 1000
    ) / 10;
  },

  areasOverBudget: BUDGET_2024.filter((a) => a.deviation > 0).length,
  areasOnBudget: BUDGET_2024.filter((a) => a.deviation <= 0).length,
  areasRed: BUDGET_2024.filter((a) => a.status === 'red').length,
  areasYellow: BUDGET_2024.filter((a) => a.status === 'yellow').length,
  areasGreen: BUDGET_2024.filter((a) => a.status === 'green').length,

  // Likviditetsprognose (kassebeholdning ultimo kvartaler, mio. DKK)
  liquidity: {
    q1: 185.2,
    q2: 162.8,
    q3: 148.5,
    q4Forecast: 135.0,
  },

  // Skatteindtægter
  taxRevenue: {
    budget: 1820.0,
    realized: 1365.0, // 9 måneder
    forecast: 1830.0,
  },

  // Bloktilskud
  blockGrant: {
    budget: 520.0,
    realized: 390.0,
    forecast: 520.0,
  },
};

/**
 * Genererer chart-data til månedlig budget vs. realisering for et område.
 */
export function getMonthlyChartData(areaId) {
  const area = BUDGET_2024.find((a) => a.id === areaId);
  if (!area) return [];

  const monthlyBudget = Math.round((area.budget / 12) * 10) / 10;

  return MONTHS.map((month, i) => ({
    name: month,
    budget: monthlyBudget,
    realiseret: area.monthlyRealization[i],
    sidsteÅr: area.lastYearMonthly[i],
  }));
}

/**
 * Genererer akkumuleret (kumulativ) chart-data for et budgetområde.
 */
export function getCumulativeChartData(areaId) {
  const area = BUDGET_2024.find((a) => a.id === areaId);
  if (!area) return [];

  let cumBudget = 0;
  let cumRealized = 0;
  let cumLastYear = 0;
  const monthlyBudget = area.budget / 12;

  return MONTHS.map((month, i) => {
    cumBudget += monthlyBudget;
    if (area.monthlyRealization[i] !== null) {
      cumRealized += area.monthlyRealization[i];
    }
    cumLastYear += area.lastYearMonthly[i];

    return {
      name: month,
      budgetKumuleret: Math.round(cumBudget * 10) / 10,
      realiseretKumuleret: area.monthlyRealization[i] !== null
        ? Math.round(cumRealized * 10) / 10
        : null,
      sidsteÅrKumuleret: Math.round(cumLastYear * 10) / 10,
    };
  });
}

/**
 * Genererer oversigtsdata til pie/bar charts med alle områder.
 */
export function getBudgetOverviewChartData() {
  return BUDGET_2024.map((area) => ({
    name: area.name,
    budget: area.budget,
    forbrug: area.ytd,
    prognose: area.forecast,
    afvigelse: area.deviation,
    status: area.status,
  }));
}

/**
 * Returnerer top-N budgetrisici sorteret efter størst overskridelse.
 */
export function getTopRisks(n = 5) {
  return [...BUDGET_2024]
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, n)
    .filter((a) => a.deviation > 0)
    .map((a) => ({
      name: a.name,
      budget: a.budget,
      forecast: a.forecast,
      deviation: a.deviation,
      deviationPct: a.deviationPct,
      status: a.status,
      ansvarlig: a.ansvarlig,
    }));
}

/**
 * INVESTMENT_BUDGET_2024 - Anlægsbudget med 7 igangværende/planlagte projekter
 *
 * Alle beløb i mio. DKK. Total anlægsramme: 208 mio. kr.
 * - completion: Færdiggørelsesgrad i procent
 * - status: 'igangsat' | 'forsinket' | 'planlagt'
 */
export const INVESTMENT_BUDGET_2024 = [
  { id: 'anlæg-1', name: 'Svebølle Skole - Renovering & tilbygning', budget: 62, spent: 28.5, completion: 46, status: 'igangsat', year: '2023-2025', ansvarlig: 'Peter Andersen' },
  { id: 'anlæg-2', name: 'Bakkegården Plejehjem - Udvidelse 12 pladser', budget: 48, spent: 12.2, completion: 25, status: 'igangsat', year: '2024-2026', ansvarlig: 'Anne Christensen' },
  { id: 'anlæg-3', name: 'Holbækvej - Cykelsti & trafiksikkerhed', budget: 25, spent: 18.7, completion: 75, status: 'igangsat', year: '2023-2024', ansvarlig: 'Søren Larsen' },
  { id: 'anlæg-4', name: 'IT-infrastruktur - Kommunal digitalisering', budget: 18, spent: 9.4, completion: 52, status: 'igangsat', year: '2024-2025', ansvarlig: 'Henrik Madsen' },
  { id: 'anlæg-5', name: 'Klimatilpasning - Regnvandshåndtering Kalundborg by', budget: 30, spent: 5.1, completion: 17, status: 'forsinket', year: '2024-2027', ansvarlig: 'Søren Larsen' },
  { id: 'anlæg-6', name: 'Ubby Daginstitution - Nybyggeri', budget: 15, spent: 1.2, completion: 8, status: 'planlagt', year: '2025-2026', ansvarlig: 'Maria Jensen' },
  { id: 'anlæg-7', name: 'Gørlev Multihal - Renovering', budget: 10, spent: 3.8, completion: 38, status: 'igangsat', year: '2024-2025', ansvarlig: 'Mette Holm' },
];

/**
 * BUDGET_HISTORY - Historisk regnskabsdata for 2022 og 2023
 *
 * Alle beløb i mio. DKK. Indeholder vedtaget budget og faktisk regnskab.
 */
export const BUDGET_HISTORY = {
  2022: {
    totalBudget: 1340,
    totalRegnskab: 1358,
    areas: [
      { id: 'administration', budget: 42, regnskab: 41.5 },
      { id: 'dagtilbud', budget: 112, regnskab: 110.8 },
      { id: 'folkeskole', budget: 265, regnskab: 267.0 },
      { id: 'specialundervisning', budget: 82, regnskab: 88.0 },
      { id: 'aeldre-sundhed', budget: 395, regnskab: 402.5 },
      { id: 'social-handicap', budget: 165, regnskab: 170.2 },
      { id: 'teknik-miljoe', budget: 60, regnskab: 58.5 },
      { id: 'kultur-fritid', budget: 33, regnskab: 32.8 },
      { id: 'beskaeftigelse', budget: 163, regnskab: 164.5 },
      { id: 'ledelse-politisk', budget: 23, regnskab: 23.2 },
    ],
  },
  2023: {
    totalBudget: 1380,
    totalRegnskab: 1393,
    areas: [
      { id: 'administration', budget: 43.5, regnskab: 42.7 },
      { id: 'dagtilbud', budget: 115, regnskab: 114.2 },
      { id: 'folkeskole', budget: 270, regnskab: 267.0 },
      { id: 'specialundervisning', budget: 88, regnskab: 95.5 },
      { id: 'aeldre-sundhed', budget: 405, regnskab: 407.4 },
      { id: 'social-handicap', budget: 172, regnskab: 175.8 },
      { id: 'teknik-miljoe', budget: 62, regnskab: 61.0 },
      { id: 'kultur-fritid', budget: 34, regnskab: 33.7 },
      { id: 'beskaeftigelse', budget: 155, regnskab: 152.4 },
      { id: 'ledelse-politisk', budget: 24, regnskab: 23.6 },
    ],
  },
};

/**
 * MONTHLY_LIQUIDITY - Månedlig likviditetsopfølgning 2024
 *
 * Alle beløb i mio. DKK.
 * - minimumTarget: Kommunens eget likviditetsmål
 * - kassekreditReglen: Lovkrav for gennemsnitlig kassebeholdning
 * - monthly: Faktisk balance, indbetalinger og udbetalinger (null = fremtidig)
 * - forecast: Prognose for resterende måneder
 */
export const MONTHLY_LIQUIDITY = {
  year: 2024,
  minimumTarget: 100,
  kassekreditReglen: 50,
  monthly: [
    { month: 'Jan', balance: 195.2, inflow: 210.5, outflow: 185.3 },
    { month: 'Feb', balance: 188.4, inflow: 175.2, outflow: 182.0 },
    { month: 'Mar', balance: 185.2, inflow: 190.8, outflow: 193.6 },
    { month: 'Apr', balance: 178.6, inflow: 168.4, outflow: 175.0 },
    { month: 'May', balance: 170.3, inflow: 182.1, outflow: 190.4 },
    { month: 'Jun', balance: 162.8, inflow: 175.5, outflow: 183.0 },
    { month: 'Jul', balance: 158.2, inflow: 160.4, outflow: 165.0 },
    { month: 'Aug', balance: 152.5, inflow: 172.3, outflow: 178.0 },
    { month: 'Sep', balance: 148.5, inflow: 185.0, outflow: 189.0 },
    { month: 'Okt', balance: null, inflow: null, outflow: null },
    { month: 'Nov', balance: null, inflow: null, outflow: null },
    { month: 'Dec', balance: null, inflow: null, outflow: null },
  ],
  forecast: [
    { month: 'Okt', balance: 142.0 },
    { month: 'Nov', balance: 138.5 },
    { month: 'Dec', balance: 135.0 },
  ],
};

export { MONTHS, CURRENT_MONTH_INDEX, calcYTD, calcForecast };
