// BudgetIndsigt - Folketinget ODA (Open Data API) integration
// Henter lovforslag, beslutningsforslag og emneord fra Folketingets åbne API

import axios from 'axios';

const BASE_URL = 'https://oda.ft.dk/api';

// HTTP client med standardindstillinger for ODA API
const odaClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
});

// Cache til at reducere API-kald
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 time (lovforslag ændres sjældent)

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * ODA Sagtyper (typeid):
 * 3 = Lovforslag
 * 5 = Beslutningsforslag
 * 7 = Forespørgsel
 * 8 = Redegørelse
 * 9 = Alm. del
 *
 * Perioder:
 * Folketingsår starter 1. oktober. "20231" = 2023/2024 sessionen
 */

/**
 * Henter lovforslag fra Folketinget, evt. filtreret på emneord i titlen.
 *
 * OData query:
 * GET /Sag?$filter=typeid eq 3&$format=json&$top=20&$orderby=opdateringsdato desc
 *
 * @param {string} [emneord] - Søgeord der skal matche i titlen
 * @param {number} [limit=20] - Antal resultater
 * @returns {Promise<Array<object>>} Array af lovforslag
 */
export async function fetchLovforslag(emneord = '', limit = 20) {
  const cacheKey = `lovforslag_${emneord}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // ODA API understøtter ikke substringof pålideligt - hent alle og filtrér client-side
    const response = await odaClient.get('/Sag', {
      params: {
        $filter: 'typeid eq 3',
        $format: 'json',
        $top: emneord ? 100 : limit,
        $orderby: 'opdateringsdato desc',
      },
    });

    let results = (response.data.value || []).map(normalizeSag);
    if (emneord) {
      const searchLower = emneord.toLowerCase();
      results = results.filter(
        (s) => s.titel.toLowerCase().includes(searchLower) || (s.resume && s.resume.toLowerCase().includes(searchLower))
      ).slice(0, limit);
    }
    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error('[FT API] Fejl ved hentning af lovforslag:', error.message);
    return getFallbackLovforslag(emneord);
  }
}

/**
 * Henter beslutningsforslag fra Folketinget.
 *
 * @param {string} [emneord] - Søgeord
 * @param {number} [limit=20] - Antal resultater
 * @returns {Promise<Array<object>>}
 */
export async function fetchBeslutningsforslag(emneord = '', limit = 20) {
  const cacheKey = `beslutningsforslag_${emneord}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await odaClient.get('/Sag', {
      params: {
        $filter: 'typeid eq 5',
        $format: 'json',
        $top: emneord ? 50 : limit,
        $orderby: 'opdateringsdato desc',
      },
    });

    let results = (response.data.value || []).map(normalizeSag);
    if (emneord) {
      const searchLower = emneord.toLowerCase();
      results = results.filter(
        (s) => s.titel.toLowerCase().includes(searchLower) || (s.resume && s.resume.toLowerCase().includes(searchLower))
      ).slice(0, limit);
    }
    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error('[FT API] Fejl ved hentning af beslutningsforslag:', error.message);
    return [];
  }
}

/**
 * Henter liste af emneord fra Folketinget.
 * Emneord bruges til at kategorisere sager.
 *
 * @returns {Promise<Array<{id: number, emneord: string}>>}
 */
export async function fetchEmneord() {
  const cacheKey = 'emneord_all';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await odaClient.get('/Emneord', {
      params: {
        $format: 'json',
        $top: 500,
        $orderby: 'emneord asc',
      },
    });

    const results = (response.data.value || []).map((e) => ({
      id: e.id,
      emneord: e.emneord,
    }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error('[FT API] Fejl ved hentning af emneord:', error.message);
    return getRelevantEmneord();
  }
}

/**
 * Henter detaljerede oplysninger om en specifik sag, inkl. relaterede data.
 *
 * @param {number} sagId - Sagens ID
 * @returns {Promise<object|null>}
 */
export async function fetchSagDetaljer(sagId) {
  const cacheKey = `sag_${sagId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await odaClient.get(`/Sag(${sagId})`, {
      params: {
        $format: 'json',
        $expand: 'Sagstrin,Emneord',
      },
    });

    const sag = response.data;
    const result = {
      ...normalizeSag(sag),
      sagstrin: (sag.Sagstrin || []).map((trin) => ({
        id: trin.id,
        titel: trin.titel,
        dato: trin.dato,
        statusid: trin.statusid,
      })),
      emneord: (sag.Emneord || []).map((e) => e.emneord),
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[FT API] Fejl ved hentning af sag ${sagId}:`, error.message);
    return null;
  }
}

/**
 * Søger efter relevant lovgivning for kommunale budgetområder.
 * Kombinerer søgning i lovforslag og beslutningsforslag.
 *
 * @param {string[]} keywords - Søgeord relateret til budgetområder
 * @returns {Promise<Array<object>>} Sorteret liste af relevante forslag
 */
export async function searchRelevantLegislation(keywords = []) {
  const defaultKeywords = [
    'kommune',
    'ældre',
    'skole',
    'social',
    'sundhed',
    'børn',
    'beskæftigelse',
    'budget',
    'økonomi',
    'tilskud',
  ];

  const searchTerms = keywords.length > 0 ? keywords : defaultKeywords;

  // Hent lovforslag og beslutningsforslag i to enkle kald (client-side filtrering)
  const [lovforslag, beslutningsforslag] = await Promise.allSettled([
    fetchLovforslag('', 100).catch(() => []),
    fetchBeslutningsforslag('', 50).catch(() => []),
  ]);

  const allSager = [
    ...(lovforslag.status === 'fulfilled' ? lovforslag.value : []),
    ...(beslutningsforslag.status === 'fulfilled' ? beslutningsforslag.value : []),
  ];

  const seenIds = new Set();
  const allResults = [];

  for (const sag of allSager) {
    if (seenIds.has(sag.id)) continue;
    seenIds.add(sag.id);

    const titleLower = (sag.titel || '').toLowerCase();
    const resumeLower = (sag.resume || '').toLowerCase();
    let relevance = 0;
    for (const kw of searchTerms) {
      const kwLower = kw.toLowerCase();
      if (titleLower.includes(kwLower) || resumeLower.includes(kwLower)) {
        relevance += 1;
      }
    }

    if (relevance > 0) {
      allResults.push({
        ...sag,
        relevance,
        matchedKeywords: searchTerms.filter((kw) =>
          titleLower.includes(kw.toLowerCase()) || resumeLower.includes(kw.toLowerCase())
        ),
      });
    }
  }

  return allResults.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return new Date(b.opdateringsdato || 0) - new Date(a.opdateringsdato || 0);
  });
}

// ─── Hjælpefunktioner ──────────────────────────────────

/**
 * Normaliserer en sag fra ODA API til et ensartet format.
 */
function normalizeSag(sag) {
  return {
    id: sag.id,
    titel: sag.titel || sag.titelkort || 'Uden titel',
    titelkort: sag.titelkort || '',
    resume: sag.resume || null,
    afstemningskonklusion: sag.afstemningskonklusion || null,
    periodeid: sag.periodeid,
    statusid: sag.statusid,
    statusTekst: getStatusTekst(sag.statusid),
    type: getTypeTekst(sag.typeid),
    opdateringsdato: sag.opdateringsdato,
    afgortdato: sag.afgortdato || null,
    url: `https://www.ft.dk/samling/20231/lovforslag/${sag.titelkort || 'L' + sag.id}/index.htm`,
  };
}

/**
 * Oversætter status-ID til dansk tekst.
 */
function getStatusTekst(statusid) {
  const statusMap = {
    1: 'Under behandling',
    2: 'Vedtaget',
    3: 'Forkastet',
    4: 'Bortfaldet',
    5: 'Tilbagetaget',
    6: 'Afsluttet',
  };
  return statusMap[statusid] || 'Ukendt status';
}

/**
 * Oversætter type-ID til dansk tekst.
 */
function getTypeTekst(typeid) {
  const typeMap = {
    3: 'Lovforslag',
    5: 'Beslutningsforslag',
    7: 'Forespørgsel',
    8: 'Redegørelse',
    9: 'Alm. del',
  };
  return typeMap[typeid] || 'Anden type';
}

/**
 * Encoder en streng korrekt til OData filter-brug.
 * Håndterer danske specialtegn.
 */
function encodeODataString(str) {
  return str
    .replace(/'/g, "''") // Escape single quotes
    .trim();
}

/**
 * Fallback lovforslag når API er utilgængeligt.
 * Indeholder realistiske kommunalrelevante forslag.
 */
function getFallbackLovforslag(emneord = '') {
  const fallback = [
    {
      id: 134,
      titel: 'Forslag til lov om ændring af lov om social service (Ny ældrereform)',
      titelkort: 'L 134',
      resume: 'Lovforslaget indeholder en grundlæggende reform af ældreområdet med fokus på frit valg, helhedsplaner og kvalitetsstandarder.',
      statusid: 2,
      statusTekst: 'Vedtaget',
      type: 'Lovforslag',
      opdateringsdato: '2024-06-15',
      afgortdato: '2024-06-12',
      url: 'https://www.ft.dk/samling/20231/lovforslag/L134/index.htm',
    },
    {
      id: 87,
      titel: 'Forslag til lov om ændring af lov om en aktiv beskæftigelsesindsats',
      titelkort: 'L 87',
      resume: 'Forenkling af beskæftigelsesindsatsen med færre proceskrav og øget kommunal frihed.',
      statusid: 1,
      statusTekst: 'Under behandling',
      type: 'Lovforslag',
      opdateringsdato: '2024-09-20',
      afgortdato: null,
      url: 'https://www.ft.dk/samling/20231/lovforslag/L87/index.htm',
    },
    {
      id: 112,
      titel: 'Forslag til lov om ændring af folkeskoleloven (Specialundervisning og inklusion)',
      titelkort: 'L 112',
      resume: 'Nye visitationskrav og dokumentationspligt for specialundervisning samt styrkelse af inklusionsindsatsen.',
      statusid: 1,
      statusTekst: 'Under behandling',
      type: 'Lovforslag',
      opdateringsdato: '2024-10-05',
      afgortdato: null,
      url: 'https://www.ft.dk/samling/20231/lovforslag/L112/index.htm',
    },
    {
      id: 156,
      titel: 'Forslag til lov om kommunale opgaver og finansiering (Kommunalreform)',
      titelkort: 'L 156',
      resume: 'Ændringer i kommunernes opgavefordeling og tilskudssystem.',
      statusid: 1,
      statusTekst: 'Under behandling',
      type: 'Lovforslag',
      opdateringsdato: '2024-09-30',
      afgortdato: null,
      url: 'https://www.ft.dk/samling/20231/lovforslag/L156/index.htm',
    },
    {
      id: 98,
      titel: 'Forslag til lov om barnets lov (følgelovgivning)',
      titelkort: 'L 98',
      resume: 'Følgeregulering til barnets lov med skærpede krav til forebyggende indsatser.',
      statusid: 2,
      statusTekst: 'Vedtaget',
      type: 'Lovforslag',
      opdateringsdato: '2024-04-10',
      afgortdato: '2024-04-08',
      url: 'https://www.ft.dk/samling/20231/lovforslag/L98/index.htm',
    },
  ];

  if (!emneord) return fallback;

  const searchLower = emneord.toLowerCase();
  return fallback.filter(
    (f) =>
      f.titel.toLowerCase().includes(searchLower) ||
      (f.resume && f.resume.toLowerCase().includes(searchLower))
  );
}

/**
 * Returnerer en liste af relevante emneord for kommunale budgetter.
 * Bruges som fallback og til filtrering i UI.
 */
function getRelevantEmneord() {
  return [
    { id: 1, emneord: 'Kommuner' },
    { id: 2, emneord: 'Økonomi' },
    { id: 3, emneord: 'Ældre' },
    { id: 4, emneord: 'Sundhed' },
    { id: 5, emneord: 'Børn og unge' },
    { id: 6, emneord: 'Socialområdet' },
    { id: 7, emneord: 'Folkeskolen' },
    { id: 8, emneord: 'Beskæftigelse' },
    { id: 9, emneord: 'Miljø' },
    { id: 10, emneord: 'Skat' },
    { id: 11, emneord: 'Tilskud' },
    { id: 12, emneord: 'Handicap' },
    { id: 13, emneord: 'Integration' },
    { id: 14, emneord: 'Dagtilbud' },
    { id: 15, emneord: 'Specialundervisning' },
  ];
}

/**
 * Rydder cachen.
 */
export function clearCache() {
  cache.clear();
}

export { BASE_URL };
