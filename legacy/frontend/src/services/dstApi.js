// BudgetIndsigt - Danmarks Statistik API integration
// Henter befolkningsdata og prognoser fra StatBank Denmark (JSON-stat format)

import axios from 'axios';

const BASE_URL = 'https://api.statbank.dk/v1';

// Cache for API-responses (reducerer antal kald og giver fallback ved fejl)
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutter

/**
 * Henter data fra en cacheret nøgle, eller null hvis udløbet/manglende.
 */
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Gemmer data i cachen.
 */
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Bygger et alders-filter array til DST API.
 * DST bruger individuelle aldre som strenge: "0", "1", "2", ..., "100".
 *
 * @param {number} minAge - Minimum alder (inklusiv)
 * @param {number} maxAge - Maximum alder (inklusiv), brug 125 for "100+"
 * @returns {string[]} Array af aldersværdier
 */
export function buildAgeFilter(minAge, maxAge) {
  const values = [];
  const effectiveMax = Math.min(maxAge, 125);
  for (let age = minAge; age <= effectiveMax; age++) {
    values.push(age.toString());
  }
  return values;
}

/**
 * Mapper aldersgruppe-streng til min/max alder.
 *
 * @param {string} group - Aldersgruppe som f.eks. "0-5", "80+"
 * @returns {{ min: number, max: number }}
 */
function parseAgeGroup(group) {
  if (group.endsWith('+')) {
    return { min: parseInt(group), max: 125 };
  }
  const [min, max] = group.split('-').map(Number);
  return { min, max };
}

/**
 * Konverterer kommunenavn til DST kommunekode.
 * Kalundborg = 326, men vi understøtter flere kommuner.
 */
const MUNICIPALITY_CODES = {
  kalundborg: '326',
  koebenhavn: '101',
  aarhus: '751',
  odense: '461',
  aalborg: '851',
  holbaek: '316',
  slagelse: '330',
  odsherred: '306',
  sorø: '340',
  ringsted: '329',
  alle: '000', // Hele Danmark
};

/**
 * Finder kommunekode baseret på navn.
 *
 * @param {string} municipality - Kommunenavn (case-insensitive)
 * @returns {string} Kommunekode
 */
export function getMunicipalityCode(municipality) {
  const normalized = municipality.toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/ kommune$/i, '')
    .trim();
  return MUNICIPALITY_CODES[normalized] || '326'; // Default Kalundborg
}

/**
 * Henter befolkningsdata fra FOLK1A-tabellen (aktuelle befolkningstal).
 *
 * FOLK1A indeholder:
 * - OMRÅDE: Kommunekode
 * - ALDER: Individuel alder 0-125
 * - KØN: "TOT" (total), "M" (mænd), "K" (kvinder)
 * - Tid: Kvartaler som "2024K1", "2024K2" osv.
 *
 * @param {string} municipality - Kommunenavn
 * @param {Array<{group: string}>} ageGroups - Aldersgrupper at hente data for
 * @param {string} [quarter] - Specifikt kvartal, f.eks. "2024K1". Default: seneste
 * @returns {Promise<Array<{group: string, population: number}>>}
 */
export async function fetchPopulationData(municipality = 'Kalundborg', ageGroups = [], quarter = '*') {
  const cacheKey = `folk1a_${municipality}_${quarter}_${ageGroups.map(g => g.group).join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const municipalityCode = getMunicipalityCode(municipality);

  // Saml alle relevante aldre fra grupperne
  const allAges = [];
  for (const ag of ageGroups) {
    const { min, max } = parseAgeGroup(ag.group);
    allAges.push(...buildAgeFilter(min, max));
  }

  // Fjern duplikater
  const uniqueAges = [...new Set(allAges)];

  const requestBody = {
    table: 'FOLK1A',
    format: 'JSONSTAT',
    lang: 'da',
    variables: [
      {
        code: 'OMRÅDE',
        values: [municipalityCode],
      },
      {
        code: 'KØN',
        values: ['TOT'],
      },
      {
        code: 'ALDER',
        values: uniqueAges,
      },
      {
        code: 'Tid',
        values: quarter === '*' ? ['*'] : [quarter],
      },
    ],
  };

  try {
    const response = await axios.post(`${BASE_URL}/data`, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const parsed = parseJsonStat(response.data);

    // Aggregér til aldersgrupper
    const result = ageGroups.map((ag) => {
      const { min, max } = parseAgeGroup(ag.group);
      const groupTotal = parsed
        .filter((row) => {
          const age = parseInt(row.ALDER);
          return age >= min && age <= max;
        })
        .reduce((sum, row) => sum + (row.value || 0), 0);

      return {
        group: ag.group,
        population: groupTotal,
        source: 'DST FOLK1A',
        quarter: quarter === '*' ? 'seneste' : quarter,
      };
    });

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[DST API] Fejl ved hentning af befolkningsdata:', error.message);

    // Fallback til statiske data ved fejl
    return ageGroups.map((ag) => ({
      group: ag.group,
      population: ag.expected || 0,
      source: 'fallback (offline)',
      quarter: quarter === '*' ? 'seneste' : quarter,
      error: error.message,
    }));
  }
}

/**
 * Henter befolkningsfremskrivning fra FRDK121-tabellen.
 *
 * FRDK121 indeholder:
 * - OMRÅDE: Kommunekode
 * - ALDER: Individuel alder
 * - KØN: Køn
 * - Tid: År som "2024", "2025" osv.
 *
 * @param {number[]} years - Array af årstal at hente prognose for
 * @param {string} municipality - Kommunenavn
 * @returns {Promise<Array<{year: number, population: number, ageBreakdown: object}>>}
 */
export async function fetchPopulationForecast(years = [2025, 2026, 2027, 2028], municipality = 'Kalundborg') {
  const cacheKey = `frdk121_${municipality}_${years.join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const municipalityCode = getMunicipalityCode(municipality);

  const requestBody = {
    table: 'FRDK121',
    format: 'JSONSTAT',
    lang: 'da',
    variables: [
      {
        code: 'OMRÅDE',
        values: [municipalityCode],
      },
      {
        code: 'KØN',
        values: ['TOT'],
      },
      {
        code: 'ALDER',
        values: buildAgeFilter(0, 105),
      },
      {
        code: 'Tid',
        values: years.map(String),
      },
    ],
  };

  try {
    const response = await axios.post(`${BASE_URL}/data`, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    const parsed = parseJsonStat(response.data);

    // Gruppér efter år
    const result = years.map((year) => {
      const yearData = parsed.filter((row) => row.Tid === year.toString() || row.Tid === String(year));

      // Definer aldersgrupper
      const ageGroupDefs = [
        { group: '0-5', min: 0, max: 5 },
        { group: '6-16', min: 6, max: 16 },
        { group: '17-25', min: 17, max: 25 },
        { group: '26-64', min: 26, max: 64 },
        { group: '65-79', min: 65, max: 79 },
        { group: '80+', min: 80, max: 105 },
      ];

      const ageBreakdown = {};
      let totalPop = 0;

      for (const agDef of ageGroupDefs) {
        const groupPop = yearData
          .filter((row) => {
            const age = parseInt(row.ALDER);
            return age >= agDef.min && age <= agDef.max;
          })
          .reduce((sum, row) => sum + (row.value || 0), 0);

        ageBreakdown[agDef.group] = groupPop;
        totalPop += groupPop;
      }

      return {
        year,
        population: totalPop,
        ageBreakdown,
        source: 'DST FRDK121',
      };
    });

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[DST API] Fejl ved hentning af befolkningsfremskrivning:', error.message);

    // Fallback med estimerede værdier
    return years.map((year) => ({
      year,
      population: null,
      ageBreakdown: null,
      source: 'fallback (offline)',
      error: error.message,
    }));
  }
}

/**
 * Parser JSON-stat format til et simpelt array af objekter.
 *
 * JSON-stat format fra DST:
 * {
 *   "dataset": {
 *     "dimension": { "OMRÅDE": {...}, "KØN": {...}, "ALDER": {...}, "Tid": {...} },
 *     "value": [1234, 5678, ...]
 *   }
 * }
 *
 * @param {object} jsonstatResponse - Rå JSON-stat response fra DST API
 * @returns {Array<object>} Array af objekter med dimension-navne som keys + value
 */
export function parseJsonStat(jsonstatResponse) {
  // JSON-stat kan have data i response.dataset eller direkte i response
  const dataset = jsonstatResponse.dataset || jsonstatResponse;

  if (!dataset || !dataset.dimension || !dataset.value) {
    console.warn('[DST API] Ugyldigt JSON-stat format');
    return [];
  }

  const { dimension, value } = dataset;

  // Hent dimensions i rækkefølge
  const dimIds = dataset.id || Object.keys(dimension);
  const dimSizes = dataset.size || dimIds.map((id) => {
    const dim = dimension[id];
    const cat = dim.category || {};
    const idx = cat.index || {};
    return Object.keys(idx).length;
  });

  // Byg kategori-labels for hver dimension
  const dimCategories = dimIds.map((id) => {
    const dim = dimension[id];
    const cat = dim.category || {};
    const index = cat.index || {};
    const label = cat.label || {};

    // Sortér efter index-værdi
    const entries = Object.entries(index).sort((a, b) => a[1] - b[1]);
    return entries.map(([code]) => ({
      code,
      label: label[code] || code,
    }));
  });

  // Konvertér flat value-array til array af objekter
  const results = [];
  const totalValues = value.length;

  for (let i = 0; i < totalValues; i++) {
    const row = { value: value[i] };

    // Beregn indeks i hver dimension
    let remainder = i;
    for (let d = dimIds.length - 1; d >= 0; d--) {
      const dimSize = dimSizes[d];
      const dimIndex = remainder % dimSize;
      remainder = Math.floor(remainder / dimSize);

      const dimId = dimIds[d];
      const category = dimCategories[d][dimIndex];
      row[dimId] = category ? category.code : dimIndex.toString();
    }

    // Filtrér null/undefined værdier
    if (row.value !== null && row.value !== undefined) {
      results.push(row);
    }
  }

  return results;
}

/**
 * Henter tabel-metadata (tilgængelige dimensioner og værdier).
 * Nyttig til at udforske hvad der er tilgængeligt i en given tabel.
 *
 * @param {string} tableId - Tabel-ID, f.eks. 'FOLK1A'
 * @returns {Promise<object>} Metadata objekt
 */
export async function fetchTableInfo(tableId) {
  const cacheKey = `tableinfo_${tableId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.post(`${BASE_URL}/tableinfo`, {
      table: tableId,
      format: 'JSON',
      lang: 'da',
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    setCache(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`[DST API] Fejl ved hentning af tabelinfo for ${tableId}:`, error.message);
    return null;
  }
}

/**
 * Henter tilgængelige tabeller fra DST baseret på søgeord.
 *
 * @param {string} searchText - Søgetekst
 * @returns {Promise<Array<{id: string, text: string, variables: string[]}>>}
 */
export async function searchTables(searchText) {
  try {
    const response = await axios.post(`${BASE_URL}/tables`, {
      lang: 'da',
      text: searchText,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    return response.data.map((t) => ({
      id: t.id,
      text: t.text,
      variables: t.variables || [],
      firstPeriod: t.firstPeriod,
      latestPeriod: t.latestPeriod,
      active: t.active,
    }));
  } catch (error) {
    console.error('[DST API] Fejl ved tabelsøgning:', error.message);
    return [];
  }
}

/**
 * Rydder hele cachen. Nyttigt ved force-refresh.
 */
export function clearCache() {
  cache.clear();
}

export { BASE_URL, MUNICIPALITY_CODES };
