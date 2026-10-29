import { Router } from 'express';
import axios from 'axios';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Du er en AI-rådgiver for kommunale ledere. Du analyserer budgetter, befolkningsdata, og lovgivning for at give holistiske svar.

Regler:
- Svar altid på dansk.
- Inkluder kildehenvisninger når du refererer til data.
- Strukturer svaret med overskrifter og bullet points.
- Giv konkrete tal og procenter når det er muligt.
- Forklar konsekvenser i forhold til kommunens økonomi, borgere, og serviceområder.
- Afslut med anbefalinger til kommunale beslutningstagere.`;

/**
 * Build the user message from question + optional context.
 */
function buildUserMessage(question, context = {}) {
  const parts = [`Spørgsmål: ${question}`];

  if (context.fagomraade) {
    parts.push(`\nFagområde: ${context.fagomraade}`);
  }
  if (context.budgetData) {
    parts.push(
      `\nBudgetdata:\n${typeof context.budgetData === 'string' ? context.budgetData : JSON.stringify(context.budgetData, null, 2)}`
    );
  }
  if (context.populationData) {
    parts.push(
      `\nBefolkningsdata:\n${typeof context.populationData === 'string' ? context.populationData : JSON.stringify(context.populationData, null, 2)}`
    );
  }
  if (context.legislationData) {
    parts.push(
      `\nLovgivningsdata:\n${typeof context.legislationData === 'string' ? context.legislationData : JSON.stringify(context.legislationData, null, 2)}`
    );
  }

  return parts.join('\n');
}

/**
 * Parse the raw OpenAI text response into a structured object.
 * If the model returns JSON inside a code fence we try to parse it;
 * otherwise we fall back to wrapping the plain text.
 */
function parseAIResponse(text) {
  // Try to extract JSON from code fences
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // fall through to plain text handling
    }
  }

  return {
    response: text,
    visualizations: [],
    sources: [],
    followUpQuestions: [],
  };
}

// ---------------------------------------------------------------------------
// Mock response generator (when no API key is configured)
// ---------------------------------------------------------------------------

function generateMockResponse(question, context = {}) {
  const q = question.toLowerCase();
  const fagomraade = context.fagomraade || 'generelt';

  // -- Budget-related questions ----------------------------------------
  if (q.includes('budget') || q.includes('økonomi') || q.includes('udgift')) {
    return {
      response: `## Budgetanalyse – ${fagomraade}\n\nBaseret på de tilgængelige budgetdata for Kalundborg Kommune 2024:\n\n### Hovedpunkter\n- Det samlede driftsbudget er **1.415 mio. kr.** for 2024.\n- Der er identificeret et samlet **merforbrug på ca. 20 mio. kr.** i den aktuelle prognose.\n- Serviceudgifterne ligger **1,4% over** den vedtagne budgetramme.\n\n### Budgetfordeling (driftsbudget 2024, mio. kr.)\n\n| Område | Budget | Prognose | Afvigelse |\n|--------|--------|----------|-----------|\n| Ældre & Sundhed | 420 | 426 | +6,4 |\n| Folkeskole | 280 | 282 | +2,4 |\n| Social & Handicap | 180 | 195 | +15,2 |\n| Beskæftigelse | 150 | 145 | -5,2 |\n| Dagtilbud | 120 | 118 | -2,5 |\n| Specialundervisning | 95 | 105 | +9,9 |\n| Teknik & Miljø | 65 | 64 | -1,2 |\n| Administration | 45 | 47 | +1,6 |\n| Kultur & Fritid | 35 | 34 | -0,6 |\n| Ledelse & Politisk | 25 | 26 | +0,8 |\n\n### Anlægsbudget\nDet samlede anlægsbudget er **208 mio. kr.** fordelt på 7 projekter.\n\n### Anbefalinger\n- Iværksæt strakshandleplan for specialundervisning og socialområdet.\n- Overvej omplacering af mindreforbrug fra beskæftigelsesområdet.\n- Sammenlign nøgletal med sammenlignelige kommuner via ECO-nøgletal.`,
      visualizations: [
        {
          type: 'bar',
          title: 'Budgetfordeling pr. område (mio. kr.)',
          data: [
            { name: 'Ældre & Sundhed', budget: 420, prognose: 426 },
            { name: 'Folkeskole', budget: 280, prognose: 282 },
            { name: 'Social & Handicap', budget: 180, prognose: 195 },
            { name: 'Beskæftigelse', budget: 150, prognose: 145 },
            { name: 'Dagtilbud', budget: 120, prognose: 118 },
            { name: 'Specialunderv.', budget: 95, prognose: 105 },
            { name: 'Teknik & Miljø', budget: 65, prognose: 64 },
            { name: 'Administration', budget: 45, prognose: 47 },
            { name: 'Kultur & Fritid', budget: 35, prognose: 34 },
            { name: 'Ledelse & Pol.', budget: 25, prognose: 26 },
          ],
        },
      ],
      sources: [
        { title: 'Kommunens budgetrapport 2025', url: '#' },
        { title: 'ECO-nøgletal, VIVE', url: 'https://www.eco.dk' },
        { title: 'Danmarks Statistik – REGK11', url: 'https://www.dst.dk' },
      ],
      followUpQuestions: [
        'Hvordan fordeler lønudgifterne sig på faste og variable stillinger?',
        'Hvilke effektiviseringsforslag kan reducere driftsudgifterne?',
        'Hvordan sammenligner vores udgiftsniveau sig med nabokommunerne?',
        'Hvad er de forventede konsekvenser af den nye udligningsreform?',
      ],
    };
  }

  // -- Population / demographics ----------------------------------------
  if (
    q.includes('befolkning') ||
    q.includes('demografi') ||
    q.includes('borgere') ||
    q.includes('indbygger')
  ) {
    return {
      response: `## Befolkningsanalyse\n\nKommunens befolkningsudvikling viser følgende tendenser:\n\n### Nøgletal\n- **Samlet befolkning**: 49.600 (faktisk 2024)\n- **Ændring siden 2020**: -1,3% (ca. 650 færre borgere)\n- **Forsørgerbyrde**: 62,4 (landsgennemsnit: 56,8)\n\n### Aldersfordeling\n- **0-5 år**: 6,5%\n- **6-16 år**: 15,7%\n- **17-25 år**: 8,3%\n- **26-45 år**: 20,6%\n- **46-64 år**: 24,8%\n- **65-79 år**: 17,9%\n- **80+ år**: 6,9%\n\n### Konsekvenser for kommunen\n- Stigende pres på ældreområdet med forventet **8% flere 80+-årige** inden 2030.\n- Faldende børnetal kan give mulighed for konsolidering af dagtilbud.\n- Den høje forsørgerbyrde presser skatteindtægterne.\n\n### Anbefalinger\n- Tilpas kapacitetsplanlægning inden for ældre- og sundhedsområdet.\n- Udarbejd en strategi for tiltrækning af tilflyttere i den erhvervsaktive alder.\n- Koordiner med nabokommuner omkring specialiserede tilbud.`,
      visualizations: [
        {
          type: 'pie',
          title: 'Aldersfordeling 2024',
          data: [
            { name: '0-5 år', value: 3200 },
            { name: '6-16 år', value: 7800 },
            { name: '17-25 år', value: 4100 },
            { name: '26-45 år', value: 10200 },
            { name: '46-64 år', value: 12300 },
            { name: '65-79 år', value: 8900 },
            { name: '80+ år', value: 3440 },
          ],
        },
        {
          type: 'line',
          title: 'Befolkningsudvikling',
          data: [
            { year: '2018', value: 49950 },
            { year: '2019', value: 49850 },
            { year: '2020', value: 49770 },
            { year: '2021', value: 49750 },
            { year: '2022', value: 49750 },
            { year: '2023', value: 49820 },
            { year: '2024', value: 49940 },
          ],
        },
      ],
      sources: [
        { title: 'Danmarks Statistik – FOLK1A', url: 'https://www.dst.dk' },
        {
          title: 'Befolkningsfremskrivning 2025, DREAM',
          url: 'https://www.dreamgruppen.dk',
        },
        {
          title: 'Kommunal nøgletalsdatabase',
          url: 'https://www.noegletal.dk',
        },
      ],
      followUpQuestions: [
        'Hvilke kommuner oplever lignende demografiske tendenser?',
        'Hvordan påvirker befolkningsudviklingen skatteindtægterne?',
        'Hvad koster det at udvide ældreplejen med den forventede vækst?',
        'Hvilke tiltag kan tiltrække børnefamilier til kommunen?',
      ],
    };
  }

  // -- Legislation / reform -----------------------------------------------
  if (
    q.includes('lov') ||
    q.includes('reform') ||
    q.includes('lovgivning') ||
    q.includes('folketinget')
  ) {
    return {
      response: `## Lovgivningsanalyse\n\nBaseret på de seneste lovforslag og reformer er følgende relevant for kommunen:\n\n### Aktuelle Reformer\n- **Barnets Lov (L 93)**: Ny lovgivning der styrker børns rettigheder og ændrer sagsbehandlingen på børneområdet.\n- **Sundhedsreformen**: Ændringer i opgavefordelingen mellem kommuner og regioner.\n- **Udligningsreformen**: Ny model for den kommunale udligning fra 2026.\n\n### Økonomiske Konsekvenser\n- Barnets Lov estimeres til at koste kommunen **8-12 mio. kr. ekstra årligt** i implementeringsfasen.\n- Sundhedsreformen kan flytte opgaver svarende til **15-20 mio. kr.** til kommunen.\n- Udligningsreformen kan betyde en **ændring på +/- 25 mio. kr.** i udligningsbeløbet.\n\n### Anbefalinger\n- Gennemfør en DUT-vurdering af alle nye lovforslag.\n- Afsæt implementeringsmidler i budget 2026.\n- Deltag aktivt i KL's høringssvar for at påvirke den endelige udformning.`,
      visualizations: [
        {
          type: 'bar',
          title: 'Estimeret økonomisk konsekvens (mio. kr.)',
          data: [
            { name: 'Barnets Lov', value: 10 },
            { name: 'Sundhedsreform', value: 17.5 },
            { name: 'Udligningsreform', value: 25 },
          ],
        },
      ],
      sources: [
        {
          title: 'Folketinget – L 93 Barnets Lov',
          url: 'https://www.ft.dk',
        },
        {
          title: 'KL – Reformoversigt 2025',
          url: 'https://www.kl.dk',
        },
        {
          title: 'Social- og Boligstyrelsen',
          url: 'https://www.sbst.dk',
        },
      ],
      followUpQuestions: [
        'Hvad er tidsplanen for implementering af Barnets Lov?',
        'Hvordan forbereder andre kommuner sig på sundhedsreformen?',
        'Hvilke DUT-kompensationer kan forventes fra staten?',
        'Hvilke interne organisationsændringer kræver reformerne?',
      ],
    };
  }

  // -- Anlæg / investering -----------------------------------------------
  if (
    q.includes('anlæg') ||
    q.includes('investering') ||
    q.includes('byggeri') ||
    q.includes('renovation') ||
    q.includes('projekt')
  ) {
    return {
      response: `## Anlægsbudget 2024 - Kalundborg Kommune\n\nDet samlede anlægsbudget er **208 mio. kr.** fordelt på 7 projekter.\n\n### Projektstatus\n\n| Projekt | Budget | Forbrug | Status |\n|---------|--------|---------|--------|\n| Svebølle Skole | 62 mio. | 28,5 mio. | Igangsat |\n| Bakkegården Plejehjem | 48 mio. | 12,2 mio. | Igangsat |\n| Holbækvej Cykelsti | 25 mio. | 18,7 mio. | Igangsat |\n| IT-infrastruktur | 18 mio. | 9,4 mio. | Igangsat |\n| Klimatilpasning | 30 mio. | 5,1 mio. | Forsinket |\n| Ubby Daginstitution | 15 mio. | 1,2 mio. | Planlagt |\n| Gørlev Multihal | 10 mio. | 3,8 mio. | Igangsat |\n\n### Samlet forbrug YTD: **78,9 mio. kr.** (38% af budget)\n\n### Anbefalinger\n- Prioritér Bakkegården-udvidelsen for at imødekomme demografisk pres.\n- Følg op på klimatilpasningsforsinkelsen med miljømyndigheder.\n- Overvej fremrykning af Ubby-projektet.`,
      visualizations: [
        {
          type: 'bar',
          title: 'Anlægsprojekter - Budget vs. Forbrug (mio. kr.)',
          data: [
            { name: 'Svebølle Skole', budget: 62, forbrug: 28.5 },
            { name: 'Bakkegården', budget: 48, forbrug: 12.2 },
            { name: 'Holbækvej', budget: 25, forbrug: 18.7 },
            { name: 'IT-infra', budget: 18, forbrug: 9.4 },
            { name: 'Klimatilp.', budget: 30, forbrug: 5.1 },
            { name: 'Ubby', budget: 15, forbrug: 1.2 },
            { name: 'Gørlev', budget: 10, forbrug: 3.8 },
          ],
        },
      ],
      sources: [
        { title: 'Kalundborg Kommune - Anlægsrapport 2024', url: '#' },
        { title: 'Anlægsbudget 2024-2027', url: '#' },
      ],
      followUpQuestions: [
        'Hvornår forventes Bakkegården færdig?',
        'Hvad er konsekvenserne af klimatilpasningsforsinkelsen?',
        'Kan vi fremrykke anlægsprojekter?',
        'Hvad er den samlede anlægsplan for 2024-2027?',
      ],
    };
  }

  // -- Personale / rekruttering ------------------------------------------
  if (
    q.includes('personale') ||
    q.includes('medarbejder') ||
    q.includes('rekruttering') ||
    q.includes('ansætte') ||
    q.includes('vikar')
  ) {
    return {
      response: `## Personaleanalyse - Kalundborg Kommune\n\n### Nøgletal\n- **Samlet antal medarbejdere**: ca. 3.200 fuldtidsstillinger\n- **Samlet lønsum**: 1.100 mio. kr.\n- **Gennemsnitligt sygefravær**: 7,2% (landsgennemsnit: 6,8%)\n- **Vakancerate**: 4,8% (92 ubesatte stillinger)\n\n### Kritiske områder\n\n| Område | Vakancer | Sygefravær | Vikarpct. |\n|--------|----------|------------|-----------|\n| Ældre & Sundhed | 42 | 8,2% | 12,5% |\n| Folkeskole | 18 | 6,5% | 8,2% |\n| Dagtilbud | 12 | 7,8% | 9,1% |\n| Social & Handicap | 15 | 9,1% | 14,3% |\n| Øvrige | 5 | 5,2% | 4,8% |\n\n### OK24-effekt\nDen nye overenskomst medfører en lønstigning på **3,4%** i 2024, svarende til **37 mio. kr.** i merudgifter. Lavtlønsgrupper (SOSU, pædagogmedhjælpere) har fået ekstra lønløft.\n\n### Anbefalinger\n- Fokusér rekrutteringsindsatsen på SOSU-området.\n- Reducer vikarforbruget via bedre planlægning og fastholdelsestiltag.\n- Overvej velfærdsteknologi som supplement til personalemangel.`,
      visualizations: [
        {
          type: 'bar',
          title: 'Vakancer pr. område',
          data: [
            { name: 'Ældre & Sundhed', vakancer: 42, sygefravær: 8.2 },
            { name: 'Folkeskole', vakancer: 18, sygefravær: 6.5 },
            { name: 'Social & Handicap', vakancer: 15, sygefravær: 9.1 },
            { name: 'Dagtilbud', vakancer: 12, sygefravær: 7.8 },
            { name: 'Øvrige', vakancer: 5, sygefravær: 5.2 },
          ],
        },
      ],
      sources: [
        { title: 'KL Løn- og personalestatistik 2024', url: 'https://www.kl.dk' },
        { title: 'OK24 Overenskomstresultat', url: 'https://www.kl.dk' },
      ],
      followUpQuestions: [
        'Hvordan reducerer vi sygefraværet?',
        'Hvad koster vikarer sammenlignet med fastansatte?',
        'Hvilke fastholdelsestiltag virker bedst?',
        'Hvad er den forventede pensionsafgang de næste 5 år?',
      ],
    };
  }

  // -- Likviditet / kasse ------------------------------------------------
  if (
    q.includes('likviditet') ||
    q.includes('kasse') ||
    q.includes('kassebeholdning') ||
    q.includes('kassekreditregel')
  ) {
    return {
      response: `## Likviditetsanalyse - Kalundborg Kommune\n\n### Aktuel status (september 2024)\nKassebeholdningen er **148,5 mio. kr.**, et fald fra **195,2 mio. kr.** primo januar.\n\n### Likviditetsudvikling\n| Kvartal | Beholdning |\n|---------|------------|\n| Q1 2024 | 185,2 mio. kr. |\n| Q2 2024 | 162,8 mio. kr. |\n| Q3 2024 | 148,5 mio. kr. |\n| Q4 2024 (forecast) | 135,0 mio. kr. |\n\n### Kommunens mål\n- **Minimumsmål**: 100 mio. kr.\n- **Kassekreditreglen**: Min. 50 mio. kr. (gennemsnit over 365 dage)\n\n### Forecast\nMed nuværende trend rammer kommunen minimumsmålet i **marts 2025**.\n\n### Anbefalinger\n- Fremryk planlagt lånoptag på 15 mio. kr.\n- Stram anlægsstyring og udskyd ikke-kritiske projekter.\n- Månedlig likviditetsrapportering til Økonomiudvalget.`,
      visualizations: [
        {
          type: 'line',
          title: 'Likviditetsudvikling 2024 (mio. kr.)',
          data: [
            { month: 'Jan', beholdning: 195.2, minimum: 100 },
            { month: 'Feb', beholdning: 188.4, minimum: 100 },
            { month: 'Mar', beholdning: 185.2, minimum: 100 },
            { month: 'Apr', beholdning: 178.6, minimum: 100 },
            { month: 'Maj', beholdning: 170.3, minimum: 100 },
            { month: 'Jun', beholdning: 162.8, minimum: 100 },
            { month: 'Jul', beholdning: 158.2, minimum: 100 },
            { month: 'Aug', beholdning: 152.5, minimum: 100 },
            { month: 'Sep', beholdning: 148.5, minimum: 100 },
            { month: 'Okt', beholdning: 142.0, minimum: 100 },
            { month: 'Nov', beholdning: 138.5, minimum: 100 },
            { month: 'Dec', beholdning: 135.0, minimum: 100 },
          ],
        },
      ],
      sources: [
        { title: 'Likviditetsrapport Q3 2024', url: '#' },
        { title: 'KommuneKredit - Lånerammer', url: 'https://www.kommunekredit.dk' },
      ],
      followUpQuestions: [
        'Hvornår rammer vi minimumsmålet?',
        'Kan vi fremrykke lånoptaget?',
        'Hvilke anlægsprojekter kan udskydes?',
        'Hvad er likviditetsprognosen for 2025?',
      ],
    };
  }

  // -- Fallback / general ------------------------------------------------
  return {
    response: `## Analyse – ${fagomraade}\n\nTak for dit spørgsmål. Her er en generel analyse baseret på de tilgængelige data:\n\n### Kontekst\nDit spørgsmål berører aspekter af kommunens drift inden for **${fagomraade}**. For at give det mest præcise svar er data fra følgende kilder inddraget:\n\n- Kommunens budgettal og regnskabsdata\n- Danmarks Statistik (befolkning og socioøkonomiske nøgletal)\n- Relevant lovgivning og reformer fra Folketinget\n\n### Overordnede Observationer\n- Kommunen oplever generelt stigende udgiftspres drevet af demografi og nye lovkrav.\n- Serviceudgifterne ligger tæt på den udmeldte ramme med begrænset råderum.\n- Der er behov for tværgående prioritering og effektivisering.\n\n### Anbefalinger\n- Konkretisér spørgsmålet til et specifikt fagområde for mere detaljeret analyse.\n- Overvej at kombinere budget-, befolknings- og lovgivningsdata for en holistisk vurdering.\n- Brug BudgetIndsigts datakilder til at sammenligne med landsgennemsnit og benchmarks.`,
    visualizations: [],
    sources: [
      { title: 'Danmarks Statistik', url: 'https://www.dst.dk' },
      { title: 'KL – Kommunernes Landsforening', url: 'https://www.kl.dk' },
    ],
    followUpQuestions: [
      'Kan du specificere hvilke budgetposter du er interesseret i?',
      'Ønsker du en sammenligning med andre kommuner?',
      'Skal analysen fokusere på et bestemt fagområde?',
      'Vil du se befolkningsfremskrivninger for de næste 5 år?',
    ],
  };
}

// ---------------------------------------------------------------------------
// POST /ask
// ---------------------------------------------------------------------------

router.post('/ask', async (req, res) => {
  try {
    const { question, context } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Feltet "question" er påkrævet.' });
    }

    // -- Live OpenAI call ------------------------------------------------
    if (process.env.OPENAI_API_KEY) {
      const userMessage = buildUserMessage(question, context);

      const openaiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.4,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const rawText =
        openaiResponse.data.choices?.[0]?.message?.content ?? '';
      const structured = parseAIResponse(rawText);

      return res.json({
        response: structured.response,
        visualizations: structured.visualizations || [],
        sources: structured.sources || [],
        followUpQuestions: structured.followUpQuestions || [],
        model: 'gpt-4o',
        usage: openaiResponse.data.usage || null,
      });
    }

    // -- Mock fallback ---------------------------------------------------
    const mock = generateMockResponse(question, context);
    return res.json({
      ...mock,
      model: 'mock',
      usage: null,
    });
  } catch (err) {
    console.error('[AI /ask Error]', err.response?.data || err.message);

    if (err.response?.status === 401) {
      return res.status(401).json({ error: 'Ugyldig OpenAI API-nøgle.' });
    }
    if (err.response?.status === 429) {
      return res
        .status(429)
        .json({ error: 'Rate limit nået. Prøv igen om lidt.' });
    }

    return res.status(500).json({
      error: 'Kunne ikke behandle AI-forespørgslen.',
      message:
        process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /analyze-legislation
// ---------------------------------------------------------------------------

router.post('/analyze-legislation', async (req, res) => {
  try {
    const { legislationTitle, legislationText, fagomraade } = req.body;

    if (!legislationTitle) {
      return res
        .status(400)
        .json({ error: 'Feltet "legislationTitle" er påkrævet.' });
    }

    // -- Live OpenAI call ------------------------------------------------
    if (process.env.OPENAI_API_KEY) {
      const prompt = [
        `Analysér følgende lovforslag og vurdér dets budgetmæssige konsekvenser for en kommune.`,
        `\nLovforslagets titel: ${legislationTitle}`,
        legislationText ? `\nLovtekst (uddrag):\n${legislationText}` : '',
        fagomraade ? `\nFagområde: ${fagomraade}` : '',
        `\nGiv din vurdering struktureret med:`,
        `1. Resumé af lovforslaget`,
        `2. Forventede økonomiske konsekvenser (DUT)`,
        `3. Berørte serviceområder`,
        `4. Implementeringsrisici`,
        `5. Anbefalinger til kommunen`,
      ]
        .filter(Boolean)
        .join('\n');

      const openaiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const text =
        openaiResponse.data.choices?.[0]?.message?.content ?? '';

      return res.json({
        analysis: text,
        legislationTitle,
        fagomraade: fagomraade || 'generelt',
        model: 'gpt-4o',
      });
    }

    // -- Mock fallback ---------------------------------------------------
    return res.json({
      analysis: `## Lovgivningsanalyse: ${legislationTitle}\n\n### 1. Resumé\nLovforslaget omhandler ændringer der berører **${fagomraade || 'flere fagområder'}** i kommunen. Forslaget indeholder krav om ændret sagsbehandling, nye dokumentationspligter, og udvidede borgerrettigheder.\n\n### 2. Forventede Økonomiske Konsekvenser\n- **Implementeringsomkostninger**: 3-5 mio. kr. (engangsudgift)\n- **Løbende merudgifter**: 1,5-2,5 mio. kr. årligt\n- **DUT-kompensation**: Forventet delvis dækning via bloktilskuddet\n\n### 3. Berørte Serviceområder\n- Primært: ${fagomraade || 'Tværgående serviceområder'}\n- Sekundært: Administration og IT-systemer\n- Indirekte: Borgerservice og kommunikation\n\n### 4. Implementeringsrisici\n- Kort implementeringsperiode kan presse organisationen.\n- Behov for kompetenceudvikling af medarbejdere.\n- IT-tilpasninger kan forsinkes.\n\n### 5. Anbefalinger\n- Nedsæt en implementeringsgruppe hurtigst muligt.\n- Afsæt øremærkede midler i det kommende budget.\n- Følg KL's vejledning og erfaringsdeling med andre kommuner.`,
      legislationTitle,
      fagomraade: fagomraade || 'generelt',
      model: 'mock',
    });
  } catch (err) {
    console.error(
      '[AI /analyze-legislation Error]',
      err.response?.data || err.message
    );

    return res.status(500).json({
      error: 'Kunne ikke analysere lovgivningen.',
      message:
        process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

export default router;
