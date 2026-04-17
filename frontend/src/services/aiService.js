// BudgetIndsigt - AI Service
// Orchestrerer svar fra mock-data, eksterne API'er og backend AI

import axios from 'axios';
import { findMockResponse, getAvailableQuestions } from '../data/mockResponses';
import { BUDGET_2024, BUDGET_SUMMARY, getMonthlyChartData, getTopRisks } from '../data/mockBudget';
import {
  POPULATION_FORECAST,
  calcDemographicBudgetImpact,
  getTopDemographicDrivers,
} from '../data/budgetAssumptions';
import { fetchPopulationData } from './dstApi';
import { searchRelevantLegislation } from './ftApi';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

/**
 * Sender et spørgsmål og returnerer et struktureret AI-svar.
 *
 * Flow:
 * 1. Søg i mock-responses (keyword-matching)
 * 2. Hvis match -> Berig med live data og returnér
 * 3. Hvis intet match -> Byg kontekst og send til backend AI
 *
 * @param {string} question - Brugerens spørgsmål
 * @param {object} [context] - Yderligere kontekst (selectedArea, year, etc.)
 * @returns {Promise<object>} Struktureret svar med response, visualizations, sources, etc.
 */
export async function sendQuestion(question, context = {}) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return createErrorResponse('Indtast venligst et spørgsmål.');
  }

  const trimmedQuestion = question.trim();

  // Step 1: Søg i mock-responses
  const mockResponse = findMockResponse(trimmedQuestion);

  if (mockResponse) {
    // Berig mock-svaret med live data asynkront (best-effort)
    const enriched = await enrichWithLiveData(mockResponse, context);
    return {
      ...enriched,
      source: 'mock',
      timestamp: new Date().toISOString(),
    };
  }

  // Step 2: Byg kontekst og send til backend
  try {
    const fullContext = buildContext(trimmedQuestion, context);
    const backendResponse = await callBackendAI(trimmedQuestion, fullContext);
    return {
      ...backendResponse,
      source: 'ai',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[AI Service] Backend fejl:', error.message);

    // Step 3: Fallback - generer et generisk svar
    return createFallbackResponse(trimmedQuestion);
  }
}

/**
 * Bygger kontekst fra alle datatilgange til brug i AI-prompt.
 *
 * @param {string} question - Spørgsmålet
 * @param {object} context - Yderligere kontekst
 * @returns {object} Samlet kontekstobjekt
 */
export function buildContext(question, context = {}) {
  const { selectedArea, year = 2024 } = context;

  // Budgetdata
  const budgetData = {
    summary: {
      municipality: BUDGET_SUMMARY.municipality,
      year: BUDGET_SUMMARY.year,
      totalBudget: BUDGET_SUMMARY.totalBudget,
      totalYTD: BUDGET_SUMMARY.totalYTD,
      totalForecast: BUDGET_SUMMARY.totalForecast,
      areasOverBudget: BUDGET_SUMMARY.areasOverBudget,
    },
    areas: BUDGET_2024.map((a) => ({
      name: a.name,
      budget: a.budget,
      ytd: a.ytd,
      forecast: a.forecast,
      deviation: a.deviation,
      status: a.status,
    })),
    topRisks: getTopRisks(3),
  };

  // Specifikt område hvis valgt
  if (selectedArea) {
    const area = BUDGET_2024.find((a) => a.id === selectedArea);
    if (area) {
      budgetData.selectedAreaDetails = {
        ...area,
        monthlyChart: getMonthlyChartData(selectedArea),
      };
    }
  }

  // Demografidata
  const populationData = {
    municipality: POPULATION_FORECAST.municipality,
    totalPopulation: POPULATION_FORECAST.assumptions.ageGroups.reduce(
      (sum, g) => sum + g.expected,
      0
    ),
    ageGroups: POPULATION_FORECAST.assumptions.ageGroups.map((g) => ({
      group: g.group,
      expected: g.expected,
      trend: g.trend,
      trendPct: g.trendPct,
    })),
    budgetImpact2028: calcDemographicBudgetImpact(2028),
    topDrivers: getTopDemographicDrivers(2028).slice(0, 3),
  };

  return {
    question,
    year,
    budgetData,
    populationData,
    availableQuestions: getAvailableQuestions(),
    contextInfo: `Kalundborg Kommune, ${BUDGET_SUMMARY.municipality}. Budget ${year}. Data pr. ${BUDGET_SUMMARY.currentMonthName} ${year}.`,
  };
}

/**
 * Kalder backend AI-endpoint.
 *
 * @param {string} question - Spørgsmålet
 * @param {object} context - Kontekstobjekt
 * @returns {Promise<object>} AI-svar
 */
async function callBackendAI(question, context) {
  const response = await axios.post(
    `${BACKEND_URL}/api/ai/ask`,
    {
      question,
      context,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  return normalizeBackendResponse(response.data);
}

/**
 * Normaliserer et backend-svar til det forventede format.
 */
function normalizeBackendResponse(data) {
  return {
    query: data.query || data.question || '',
    response: data.response || data.answer || 'Intet svar modtaget.',
    visualizations: data.visualizations || [],
    sources: (data.sources || []).map((s) => ({
      name: s.name || s.title || 'Ukendt kilde',
      type: s.type || 'rapport',
      url: s.url || '#',
      confidence: s.confidence || 0.8,
    })),
    followUpQuestions: data.followUpQuestions || data.followUps || [],
    insights: data.insights || [],
  };
}

/**
 * Beriger et mock-svar med live data fra eksterne API'er.
 * Fejl i live-data påvirker ikke det returnerede svar.
 *
 * @param {object} mockResponse - Mock-svar objekt
 * @param {object} context - Kontekst
 * @returns {Promise<object>} Beriget svar
 */
async function enrichWithLiveData(mockResponse, context = {}) {
  const enriched = { ...mockResponse };

  try {
    // Parallelt hent live data (best-effort, fejl ignoreres)
    const [livePopulation, liveLegislation] = await Promise.allSettled([
      fetchPopulationData('Kalundborg', POPULATION_FORECAST.assumptions.ageGroups).catch(
        () => null
      ),
      searchRelevantLegislation([]).catch(() => null),
    ]);

    // Tilføj live befolkningsdata hvis tilgængeligt
    if (livePopulation.status === 'fulfilled' && livePopulation.value) {
      enriched.livePopulationData = livePopulation.value;
    }

    // Tilføj live lovgivningsdata hvis tilgængeligt
    if (liveLegislation.status === 'fulfilled' && liveLegislation.value) {
      enriched.liveLegislationCount = liveLegislation.value.length;
    }
  } catch {
    // Stille fejl - mock-svaret returneres uændret
  }

  return enriched;
}

/**
 * Genererer et fallback-svar når hverken mock eller backend er tilgængeligt.
 *
 * @param {string} question - Spørgsmålet
 * @returns {object} Generisk svar
 */
function createFallbackResponse(question) {
  const summary = BUDGET_SUMMARY;
  const topRisks = getTopRisks(3);

  return {
    query: question,
    response: `## Jeg kunne ikke finde et specifikt svar

Jeg har begrænset information til at besvare dit specifikke spørgsmål lige nu. Her er hvad jeg kan fortælle dig om den aktuelle budgetsituation:

### Overordnet status - ${summary.municipality}

Det samlede budget for ${summary.year} er **${summary.totalBudget} mio. DKK**. Pr. ${summary.currentMonthName} er forbruget **${summary.totalYTD} mio. DKK**, og den samlede prognose peger mod **${summary.totalForecast} mio. DKK**.

${topRisks.length > 0 ? `### Områder med størst budgetpres\n\n${topRisks.map((r) => `- **${r.name}**: Prognose ${r.forecast} mio. DKK mod budget ${r.budget} mio. DKK (${r.deviationPct > 0 ? '+' : ''}${r.deviationPct}%)`).join('\n')}` : ''}

### Prøv et af disse spørgsmål

Jeg kan give detaljerede svar på f.eks.:
- "Hvad er status på mit budget?"
- "Hvordan påvirker befolkningsudviklingen mit budget?"
- "Er der lovgivning på vej der påvirker min økonomi?"
- "Hvad er prognosen for ældreområdet?"`,

    visualizations: [
      {
        type: 'pie',
        title: 'Budgetfordeling 2024',
        data: BUDGET_2024.map((a) => ({ name: a.name, value: a.budget })),
      },
    ],

    sources: [
      {
        name: 'Kalundborg Kommune - Budget 2024',
        type: 'budget',
        url: '#budget-2024',
        confidence: 0.95,
      },
    ],

    followUpQuestions: [
      'Hvad er status på mit budget?',
      'Hvordan påvirker befolkningsudviklingen mit budget?',
      'Er der lovgivning på vej der påvirker min økonomi?',
    ],

    insights: [
      `${summary.areasRed} områder er i rød status og kræver opmærksomhed.`,
      `Den samlede prognose viser en afvigelse på ${summary.totalDeviation} mio. DKK.`,
    ],

    source: 'fallback',
  };
}

/**
 * Opretter et fejl-svar.
 */
function createErrorResponse(message) {
  return {
    query: '',
    response: `## Fejl\n\n${message}`,
    visualizations: [],
    sources: [],
    followUpQuestions: [],
    insights: [],
    source: 'error',
    error: message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Streaming-support til fremtidig brug.
 * Returnerer en ReadableStream-lignende callback-baseret streaming.
 *
 * @param {string} question - Spørgsmålet
 * @param {function} onChunk - Callback der modtager tekst-chunks
 * @returns {Promise<object>} Det fulde svar når streaming er færdig
 */
export async function streamResponse(question, onChunk) {
  // Hent det fulde svar først
  const fullResponse = await sendQuestion(question);

  if (typeof onChunk !== 'function') {
    return fullResponse;
  }

  // Simuler streaming ved at sende svaret i chunks
  const text = fullResponse.response;
  const chunkSize = 15; // tegn pr. chunk
  const delayMs = 20; // ms mellem chunks

  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    onChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return fullResponse;
}

/**
 * Chat API objekt - primær eksport til brug i komponenter.
 * Ensartet interface uanset om svaret kommer fra mock, backend eller fallback.
 */
export const chatAPI = {
  /**
   * Sender en besked og returnerer struktureret svar.
   *
   * @param {string} message - Brugerens besked
   * @param {object} [options] - Valgfrie options (selectedArea, year, stream)
   * @returns {Promise<object>} Svar med response, visualizations, sources, etc.
   */
  async sendMessage(message, options = {}) {
    const { stream = false, onChunk, ...context } = options;

    if (stream && typeof onChunk === 'function') {
      return streamResponse(message, onChunk);
    }

    return sendQuestion(message, context);
  },

  /**
   * Returnerer foreslåede spørgsmål.
   */
  getSuggestedQuestions() {
    return getAvailableQuestions();
  },

  /**
   * Returnerer aktuel budgetoversigt som quick-context.
   */
  getBudgetSummary() {
    return {
      ...BUDGET_SUMMARY,
      areas: BUDGET_2024.map((a) => ({
        id: a.id,
        name: a.name,
        budget: a.budget,
        status: a.status,
        deviation: a.deviation,
      })),
    };
  },
};

export default chatAPI;
