// BudgetIndsigt - Budgetforudsætninger og befolkningsprognose
// Baseret på Kalundborg Kommunes demografiske data og KL's beregningsforudsætninger

/**
 * POPULATION_FORECAST - Befolkningsprognose og budgetforudsætninger
 *
 * perCapitaCost: Gennemsnitlig udgift pr. borger i aldersgruppen (DKK/år)
 * Baseret på DUT-regulerede enhedsbeløb og kommunens egne beregninger.
 */
export const POPULATION_FORECAST = {
  year: 2024,
  municipality: 'Kalundborg',
  municipalityCode: '326',
  region: 'Sjælland',
  source: 'Danmarks Statistik FRDK121 + KL beregningsforudsætninger',
  lastUpdated: '2024-03-15',

  assumptions: {
    inflationRate: 0.025, // 2,5% forventet inflation
    priceFremskrivning: 1.028, // PL-regulering 2024
    skatteGrundlagVaekst: 0.012, // 1,2% vækst i skattegrundlag
    udskrivningsprocent: 25.7,
    grundskyldspromille: 23.63,

    ageGroups: [
      {
        group: '0-5',
        label: 'Småbørn (0-5 år)',
        expected: 3200,
        perCapitaCost: 85000,
        primaryServiceArea: 'Dagtilbud',
        description: 'Dagtilbud, sundhedspleje, forebyggende indsatser',
        trend: 'faldende',
        trendPct: -2.1,
        forecast2025: 3130,
        forecast2026: 3065,
        forecast2027: 3010,
        forecast2028: 2970,
      },
      {
        group: '6-16',
        label: 'Skolebørn (6-16 år)',
        expected: 7800,
        perCapitaCost: 72000,
        primaryServiceArea: 'Folkeskole',
        description: 'Folkeskole, SFO, specialundervisning, fritidstilbud',
        trend: 'faldende',
        trendPct: -1.5,
        forecast2025: 7680,
        forecast2026: 7560,
        forecast2027: 7450,
        forecast2028: 7350,
      },
      {
        group: '17-25',
        label: 'Unge (17-25 år)',
        expected: 4100,
        perCapitaCost: 12000,
        primaryServiceArea: 'Beskæftigelse',
        description: 'Uddannelse, beskæftigelsesindsats, kontanthjælp',
        trend: 'stabil',
        trendPct: -0.3,
        forecast2025: 4090,
        forecast2026: 4075,
        forecast2027: 4060,
        forecast2028: 4050,
      },
      {
        group: '26-45',
        label: 'Yngre erhvervsaktive (26-45 år)',
        expected: 10200,
        perCapitaCost: 12000,
        primaryServiceArea: 'Beskæftigelse',
        description: 'Beskæftigelse, kontanthjælp, familieydelser',
        trend: 'svagt faldende',
        trendPct: -1.2,
        forecast2025: 10080,
        forecast2026: 9960,
        forecast2027: 9845,
        forecast2028: 9735,
      },
      {
        group: '46-64',
        label: 'Ældre erhvervsaktive (46-64 år)',
        expected: 12300,
        perCapitaCost: 18000,
        primaryServiceArea: 'Administration',
        description: 'Sundhed, social indsats, forebyggelse, kultur',
        trend: 'svagt faldende',
        trendPct: -0.5,
        forecast2025: 12240,
        forecast2026: 12190,
        forecast2027: 12135,
        forecast2028: 12085,
      },
      {
        group: '65-79',
        label: 'Yngre ældre (65-79 år)',
        expected: 8900,
        perCapitaCost: 45000,
        primaryServiceArea: 'Ældre & Sundhed',
        description: 'Hjemmepleje, genoptræning, forebyggelse, aktivitetstilbud',
        trend: 'stigende',
        trendPct: 2.3,
        forecast2025: 9105,
        forecast2026: 9315,
        forecast2027: 9530,
        forecast2028: 9750,
      },
      {
        group: '80+',
        label: 'Ældre (80+ år)',
        expected: 3100,
        perCapitaCost: 125000,
        primaryServiceArea: 'Ældre & Sundhed',
        description: 'Plejehjem, hjemmepleje, sygepleje, hjælpemidler',
        trend: 'stærkt stigende',
        trendPct: 4.8,
        forecast2025: 3249,
        forecast2026: 3405,
        forecast2027: 3568,
        forecast2028: 3740,
      },
    ],
  },
};

/**
 * Samlet forventet befolkningstal for kommunen.
 */
export const TOTAL_POPULATION_EXPECTED = POPULATION_FORECAST.assumptions.ageGroups.reduce(
  (sum, g) => sum + g.expected,
  0
);

/**
 * Labels til aldersgruppediagrammer.
 */
export const AGE_GROUP_LABELS = POPULATION_FORECAST.assumptions.ageGroups.map((g) => ({
  group: g.group,
  label: g.label,
  shortLabel: g.group,
}));

/**
 * Beregner det samlede demografiske budgetpres pr. år.
 * Returnerer objekt med totalCost og breakdown pr. aldersgruppe.
 */
export function calcDemographicBudgetImpact(year = 2024) {
  const { ageGroups, priceFremskrivning } = POPULATION_FORECAST.assumptions;

  const yearDiff = year - 2024;
  const plFaktor = Math.pow(priceFremskrivning, yearDiff);

  const breakdown = ageGroups.map((g) => {
    // Vælg den korrekte fremskrivning baseret på årstal
    let population = g.expected;
    if (year === 2025) population = g.forecast2025;
    else if (year === 2026) population = g.forecast2026;
    else if (year === 2027) population = g.forecast2027;
    else if (year >= 2028) population = g.forecast2028;

    const costPerCapita = Math.round(g.perCapitaCost * plFaktor);
    const totalCost = population * costPerCapita;
    const baseCost = g.expected * g.perCapitaCost;
    const change = totalCost - baseCost;

    return {
      group: g.group,
      label: g.label,
      population,
      populationChange: population - g.expected,
      costPerCapita,
      totalCost,
      totalCostMio: Math.round((totalCost / 1_000_000) * 10) / 10,
      changeVsBase: change,
      changeVsBaseMio: Math.round((change / 1_000_000) * 10) / 10,
      serviceArea: g.primaryServiceArea,
    };
  });

  const totalCost = breakdown.reduce((sum, b) => sum + b.totalCost, 0);
  const baseCost = ageGroups.reduce((sum, g) => sum + g.expected * g.perCapitaCost, 0);

  return {
    year,
    totalCost,
    totalCostMio: Math.round((totalCost / 1_000_000) * 10) / 10,
    baseCostMio: Math.round((baseCost / 1_000_000) * 10) / 10,
    changeMio: Math.round(((totalCost - baseCost) / 1_000_000) * 10) / 10,
    totalPopulation: breakdown.reduce((sum, b) => sum + b.population, 0),
    breakdown,
  };
}

/**
 * Genererer befolkningsprognose chart-data for Recharts.
 */
export function getPopulationForecastChartData() {
  const { ageGroups } = POPULATION_FORECAST.assumptions;
  const years = [2024, 2025, 2026, 2027, 2028];

  return years.map((year) => {
    const row = { year: year.toString() };
    ageGroups.forEach((g) => {
      if (year === 2024) row[g.group] = g.expected;
      else if (year === 2025) row[g.group] = g.forecast2025;
      else if (year === 2026) row[g.group] = g.forecast2026;
      else if (year === 2027) row[g.group] = g.forecast2027;
      else if (year === 2028) row[g.group] = g.forecast2028;
    });
    row.total = Object.keys(row)
      .filter((k) => k !== 'year')
      .reduce((sum, k) => sum + row[k], 0);
    return row;
  });
}

/**
 * Genererer data til demografisk budgetpres chart (mio. DKK pr. år).
 */
export function getBudgetPressureChartData() {
  return [2024, 2025, 2026, 2027, 2028].map((year) => {
    const impact = calcDemographicBudgetImpact(year);
    const row = { year: year.toString(), total: impact.totalCostMio };
    impact.breakdown.forEach((b) => {
      row[b.group] = b.totalCostMio;
    });
    return row;
  });
}

/**
 * Returnerer de aldersgrupper der driver størst budgetvækst.
 */
export function getTopDemographicDrivers(year = 2028) {
  const impact = calcDemographicBudgetImpact(year);
  return impact.breakdown
    .filter((b) => b.changeVsBaseMio > 0)
    .sort((a, b) => b.changeVsBaseMio - a.changeVsBaseMio);
}

export const POPULATION_HISTORY = {
  years: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
  ageGroups: {
    '0-5':   [3480, 3420, 3360, 3310, 3270, 3230, 3200],
    '6-16':  [8200, 8150, 8080, 8010, 7950, 7860, 7800],
    '17-25': [4250, 4220, 4180, 4150, 4120, 4080, 4100],
    '26-45': [10800, 10650, 10520, 10420, 10350, 10280, 10200],
    '46-64': [12800, 12720, 12650, 12550, 12450, 12380, 12300],
    '65-79': [7800, 7980, 8150, 8350, 8520, 8710, 8900],
    '80+':   [2620, 2710, 2830, 2960, 3090, 3280, 3440],
  },
  total: [49950, 49850, 49770, 49750, 49750, 49820, 49940],
  migration: {
    tilflytning: [1850, 1920, 1780, 1960, 2100, 2250, 2180],
    fraflytning: [1920, 1880, 1850, 1890, 1950, 2020, 2050],
    netMigration: [-70, 40, -70, 70, 150, 230, 130],
  },
}

export const PER_CAPITA_COST_HISTORY = {
  years: [2020, 2021, 2022, 2023, 2024],
  ageGroups: {
    '0-5':   [78000, 80000, 82000, 83500, 85000],
    '6-16':  [65000, 67000, 69000, 70500, 72000],
    '17-25': [10000, 10500, 11000, 11500, 12000],
    '26-45': [10000, 10500, 11000, 11500, 12000],
    '46-64': [15000, 15500, 16200, 17000, 18000],
    '65-79': [38000, 39500, 41000, 43000, 45000],
    '80+':   [105000, 110000, 115000, 120000, 125000],
  },
}

export const KALUNDBORG_CONTEXT = {
  municipality: 'Kalundborg Kommune',
  municipalityCode: '326',
  region: 'Region Sjælland',
  area: '605 km²',
  coastline: '175 km',
  population: 49600,
  taxRate: 25.7,
  grundskyld: 23.63,
  schools: {
    folkeskoler: 13,
    privatSkoler: 5,
    totalElever: 7800,
    avgClassSize: 21.3,
  },
  nursingHomes: [
    { name: 'Bakkegården', pladser: 120, belaegning: 98.3 },
    { name: 'Rørmosegård', pladser: 108, belaegning: 97.5 },
    { name: 'Solbakken', pladser: 96, belaegning: 99.0 },
    { name: 'Sct. Olofs', pladser: 88, belaegning: 98.9 },
  ],
  topEmployers: [
    { name: 'Novo Nordisk', employees: 4500, sector: 'Pharma' },
    { name: 'Novozymes', employees: 1200, sector: 'Biotek' },
    { name: 'Kalundborg Kommune', employees: 3200, sector: 'Offentlig' },
    { name: 'Ørsted', employees: 250, sector: 'Energi' },
    { name: 'Equinor', employees: 200, sector: 'Energi' },
  ],
  industrialSymbiosis: {
    description: 'Kalundborg Symbiose - verdens første industrielle symbiose',
    partners: 12,
    co2Reduction: 635000,
    waterSavings: '3,6 mio. m³/år',
  },
  unemployment: { rate: 3.2, national: 3.8 },
}
