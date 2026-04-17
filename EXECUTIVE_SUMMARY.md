# Executive Summary: BudgetIndsigt

## AI-drevet budgetrådgiver for kommunale ledere

---

### Hvad er BudgetIndsigt?

BudgetIndsigt er en webbaseret prototype der giver kommunale chefer, økonomikonsulenter og politikere et samlet overblik over kommunens økonomi, demografi og lovgivning — samlet i ét dashboard med AI-drevne anbefalinger.

Løsningen er bygget som proof-of-concept til **Kalundborg Kommune** og demonstrerer hvordan moderne teknologi kan understøtte datadrevet beslutningstagning i den kommunale sektor.

---

### Problemet

Kommunale ledere navigerer i dag mellem adskillige systemer for at danne sig et overblik:

- **Budgetdata** ligger i KMD, OPUS eller regneark
- **Befolkningsdata** hentes manuelt fra Danmarks Statistik
- **Lovgivning** følges via Folketingets hjemmeside og KL-nyhedsbreve
- **Prognoser** beregnes i Excel uden kobling til faktiske tal
- **Tværgående analyser** kræver manuel sammenstilling

Resultatet er at vigtige sammenhænge overses, og beslutninger tages på ufuldstændigt grundlag.

---

### Løsningen

BudgetIndsigt samler alle relevante datakilder i ét intelligent dashboard med fem hovedmoduler:

#### 1. Dashboard — Samlet overblik
Et enkelt skærmbillede der viser kommunens økonomiske sundhedstilstand: budgetudnyttelse, forecast-afvigelser, demografisk pres og aktive lovforslag. Seks aktive advarsler opdateres løbende, og otte AI-genererede indsigter fremhæver de vigtigste tendenser.

#### 2. Budget & Forecast — 1.415 mio. kr. under kontrol
Interaktivt budgetmodul med 10 budgetområder og 29 underkategorier. Tre faner giver overblik, mulighed for at redigere månedlige realiseringer direkte, og se mekaniske prognoser med kumulerede charts. Afvigelser markeres med farvekoder (grøn/gul/rød).

#### 3. Befolkningsmonitor — Demografi som budgetdriver
Realtidsdata fra Danmarks Statistik viser befolkningsudviklingen fordelt på syv aldersgrupper. Til- og fraflytning visualiseres over tid. En AI-analyse beregner automatisk budgeteffekten af demografiske ændringer — f.eks. at 340 flere 80+-årige end forventet estimeres til 42,5 mio. kr. i merudgifter årligt.

#### 4. Lovgivningsmonitor — Fra Christiansborg til kommunekassen
Ti aktive lovforslag med estimeret budgetpåvirkning og DUT-kompensationsstatus. Filtrering efter status og fagområde. Direkte links til Folketingets hjemmeside for detaljeret lovtekst.

#### 5. AI-rådgiver — Svar på komplekse spørgsmål
En chat-baseret AI der besvarer spørgsmål som *"Hvad er status på mit budget?"*, *"Hvad koster det at ansætte flere lærere?"* eller *"Hvordan påvirker befolkningsudviklingen mit budget?"*. Svarene inkluderer inline-grafer, kildeangivelser med troværdighedsscore, og opfølgende spørgsmål. 13 forudskrevne svar dækker budget, likviditet, anlæg, benchmark, velfærdsteknologi og demografi.

---

### Teknisk arkitektur

| Komponent | Teknologi | Formål |
|-----------|-----------|--------|
| Frontend | React 19 + Tailwind CSS + Recharts | Responsivt dashboard med 17+ interaktive grafer |
| Backend | Express 5 (Node.js) | API-lag og statisk serving |
| State | Zustand | Letvægts state management |
| Animation | Framer Motion | Poleret brugeroplevelse |
| Data | Mock + DST API + FT ODA API | Realistiske kommunedata |
| Deployment | Render.com | Single web service, gratis plan |

**29 kildefiler** | **5 sider** | **8 UI-komponenter** | **3 Zustand stores** | **3 API-services**

---

### Kalundborg-specifik data

Alle mock-data er skræddersyet til Kalundborg Kommune:

- **1.415 mio. kr.** driftsbudget fordelt på 10 fagområder
- **208 mio. kr.** anlægsbudget med 7 projekter (Svebølle Skole, Bakkegården, Holbækvej m.fl.)
- **49.600 borgere** fordelt på 7 aldersgrupper med 5-årig prognose
- **4 plejehjem** med 412 pladser og 98,3% belægning
- **13 folkeskoler** og 7.800 elever
- **Novo Nordisk** som største arbejdsgiver med 4.500 ansatte
- Historisk data fra 2018-2024 og prognoser til 2028

---

### Potentiale og næste skridt

BudgetIndsigt demonstrerer konceptet. Med yderligere udvikling kan løsningen:

1. **Integrere med kommunens ERP-system** (KMD, OPUS) for realtids-budgetdata
2. **Koble til OpenAI API** for dynamiske AI-svar baseret på kommunens egne tal
3. **Automatisere budgetopfølgning** med månedlige alerts til udvalgsformænd
4. **Benchmark mod andre kommuner** via ECO-nøgletal fra Social- og Indenrigsministeriet
5. **Udvide til flere kommuner** med konfigurerbar data-model

---

### Konklusion

BudgetIndsigt viser at det er muligt at samle budget, demografi, lovgivning og AI-rådgivning i én løsning der gør kommunale ledere i stand til at træffe bedre beslutninger hurtigere. Prototypen er fuldt funktionel, deploy-klar, og bygget på en skalerbar arkitektur der kan udvides til produktionskvalitet.

---

*Udviklet april 2025 som proof-of-concept for Kalundborg Kommune.*
