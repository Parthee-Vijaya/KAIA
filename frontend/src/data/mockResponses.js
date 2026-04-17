// BudgetIndsigt - Mock AI-svar til kommunale budgetspørgsmål
// Hvert svar simulerer en holistisk AI-rådgivning med data, lovgivning og anbefalinger

const MOCK_RESPONSES = [
  // ─────────────────────────────────────────────────────
  // 1. Inventar på skolen
  // ─────────────────────────────────────────────────────
  {
    id: 'inventar-skole',
    keywords: ['inventar', 'skole', 'udskifte', 'møbler', 'indkøb skole'],
    query: 'Har jeg råd til at udskifte inventar på skolen?',
    response: `## Vurdering af inventarudskiftning på skoleområdet

### Budgetmæssig status

Folkeskoleområdets budget for 2024 er på **280 mio. DKK**, og den aktuelle realisering efter 9 måneder viser et forbrug på **203,9 mio. DKK**. Det svarer til en forbrugsprocent på **72,8%**, hvilket er **marginalt over** den lineære budgetramme (75% af året er gået, men skoleåret har en skæv udgiftsprofil).

Den årlige prognose peger mod et samlet forbrug på ca. **277,6 mio. DKK**, hvilket giver et lille råderum på ca. **2,4 mio. DKK**.

### Analyse af muligheder

**Driftsbudgettet** har et begrænset overskud, men der er flere faktorer at overveje:

- **Anlægsbudget**: Kontroller om der er afsat midler til vedligeholdelse og inventar i anlægsbudgettet for 2024. Typisk er der en pulje til "bygningsvedligeholdelse og inventar" under konto 3.22
- **Overførsel fra 2023**: Folkeskoleområdet havde et mindreforbrug på **13 mio. DKK** i 2023. Hvis overførselsreglen tillader det, kan en del af dette beløb disponeres
- **Elevtalsprognose**: Antallet af skolebørn (6-16 år) forventes at falde med **1,5% årligt**. Det kan frigøre midler på sigt, men kræver politisk beslutning om omfordeling

### Lovgivningsmæssige krav

Ifølge **Folkeskoleloven § 40** og **Arbejdsmiljøloven** er kommunen forpligtet til at sikre et forsvarligt undervisningsmiljø. Undervisningsmiljøvurderingen (UMV) bør dokumentere behovet.

### Anbefaling

**Ja, der er rum for en begrænset inventarudskiftning**, men jeg anbefaler:

1. Prioritér baseret på UMV-rapporter og akutte behov
2. Indhent 3 tilbud via indkøbsaftale (SKI 50.50)
3. Overvej faseopdeling: Mest kritiske skoler først
4. Budget ca. **1,5-2,0 mio. DKK** kan forsvares inden for rammen`,

    visualizations: [
      {
        type: 'bar',
        title: 'Folkeskole - Budget vs. Realisering 2024 (mio. DKK)',
        data: [
          { name: 'Jan', budget: 23.3, realiseret: 22.5 },
          { name: 'Feb', budget: 23.3, realiseret: 23.1 },
          { name: 'Mar', budget: 23.3, realiseret: 23.8 },
          { name: 'Apr', budget: 23.3, realiseret: 22.9 },
          { name: 'Maj', budget: 23.3, realiseret: 24.2 },
          { name: 'Jun', budget: 23.3, realiseret: 23.0 },
          { name: 'Jul', budget: 23.3, realiseret: 18.5 },
          { name: 'Aug', budget: 23.3, realiseret: 21.8 },
          { name: 'Sep', budget: 23.3, realiseret: 24.1 },
          { name: 'Okt', budget: 23.3, realiseret: null },
          { name: 'Nov', budget: 23.3, realiseret: null },
          { name: 'Dec', budget: 23.3, realiseret: null },
        ],
      },
      {
        type: 'line',
        title: 'Elevtalsudvikling og prognose (6-16 år)',
        data: [
          { year: '2022', antal: 8050 },
          { year: '2023', antal: 7920 },
          { year: '2024', antal: 7800 },
          { year: '2025', antal: 7680 },
          { year: '2026', antal: 7560 },
          { year: '2027', antal: 7450 },
          { year: '2028', antal: 7350 },
        ],
      },
    ],

    sources: [
      { name: 'Kalundborg Kommune Budget 2024 - Folkeskoleområdet', type: 'budget', url: '#budget-folkeskole', confidence: 0.95 },
      { name: 'Folkeskoleloven § 40 - Kommunens forpligtelser', type: 'lovgivning', url: 'https://www.retsinformation.dk/eli/lta/2022/1396', confidence: 0.90 },
      { name: 'Danmarks Statistik FOLK1A - Befolkningstal', type: 'statistik', url: 'https://www.statbank.dk/FOLK1A', confidence: 0.98 },
      { name: 'SKI Indkøbsaftale 50.50 - Møbler og inventar', type: 'rapport', url: 'https://www.ski.dk/aftaler/50-50/', confidence: 0.85 },
    ],

    followUpQuestions: [
      'Hvad siger undervisningsmiljøvurderingen for vores skoler?',
      'Kan vi søge statslige puljer til skoleinventar?',
      'Hvad er den forventede besparelse ved faldende elevtal?',
      'Hvordan prioriterer andre kommuner inventarudskiftning?',
    ],

    insights: [
      'Folkeskoleområdet har et råderum på ca. 2,4 mio. DKK i 2024, men det er under pres fra stigende specialundervisningsudgifter.',
      'Faldende elevtal (7.800 i 2024 mod 7.350 i 2028) kan frigøre midler, men kræver aktiv politisk beslutning.',
      'Inventarudskiftning bør kobles til UMV for at sikre lovmedholdelighed og prioritering.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 2. Samlet budgetstatus
  // ─────────────────────────────────────────────────────
  {
    id: 'budget-status',
    keywords: ['status', 'budget', 'samlet', 'oversigt', 'økonomi', 'hvordan går det'],
    query: 'Hvad er status på mit budget?',
    response: `## Budgetstatus - Kalundborg Kommune, september 2024

### Overordnet vurdering

Det samlede driftsbudget for 2024 er på **1.415 mio. DKK**. Efter 9 måneder er det samlede forbrug på **1.061,5 mio. DKK**, svarende til en forbrugsprocent på **75,0%**. Med 75% af året gået er vi dermed **præcist på den lineære budgetlinje** samlet set.

Dog dækker det samlede billede over **væsentlige forskelle** mellem fagområderne.

### Områder med budgetpres (rød/gul)

- **Specialundervisning**: Prognose **104,9 mio. DKK** mod budget 95 mio. DKK = **+10,4% overskridelse**. Stigende antal visitationer driver udgifterne. Kræver akut handleplan.
- **Social & Handicap**: Prognose **195,2 mio. DKK** mod budget 180 mio. DKK = **+8,4% overskridelse**. Øget tilgang af borgere med komplekse behov.
- **Ældre & Sundhed**: Prognose **426,4 mio. DKK** mod budget 420 mio. DKK = **+1,5% overskridelse**. Demografisk pres fra stigende ældrebefolkning.
- **Folkeskole**: Prognose **282,4 mio. DKK** mod budget 280 mio. DKK = **+0,9%**. Marginalt over budget.

### Områder under budget (grøn)

- **Beskæftigelse**: Forbrug under budget pga. lavere ledighed end forventet. **Mindreforbrug 5,2 mio. DKK**.
- **Kultur & Fritid**: Stabil drift, mindreforbrug **0,6 mio. DKK**.
- **Teknik & Miljø**: Under budget med forventet mindreforbrug på **1,2 mio. DKK**.

### Samlet prognose

Den samlede årsprognose viser et **merforbrug på ca. 18-22 mio. DKK** (1,3-1,6%). De primære drivere er specialundervisning og det specialiserede socialområde.

### Anbefalede handlinger

1. **Iværksæt strakshandleplan** for specialundervisning og socialområdet
2. **Månedlig opfølgning** med budgetansvarlige chefer
3. **Overvej omplacering** af midler fra beskæftigelsesområdet
4. **Forbered sag til Økonomiudvalget** om evt. tillægsbevilling`,

    visualizations: [
      {
        type: 'bar',
        title: 'Budgetafvigelse pr. område (mio. DKK, prognose vs. budget)',
        data: [
          { name: 'Specialunderv.', afvigelse: 9.9, budget: 95 },
          { name: 'Social & Hand.', afvigelse: 15.2, budget: 180 },
          { name: 'Ældre & Sundh.', afvigelse: 6.4, budget: 420 },
          { name: 'Folkeskole', afvigelse: 2.4, budget: 280 },
          { name: 'Administration', afvigelse: 1.6, budget: 45 },
          { name: 'Dagtilbud', afvigelse: -2.5, budget: 120 },
          { name: 'Teknik & Miljø', afvigelse: -1.2, budget: 65 },
          { name: 'Kultur & Fritid', afvigelse: -0.6, budget: 35 },
          { name: 'Beskæftigelse', afvigelse: -5.2, budget: 150 },
          { name: 'Ledelse & Pol.', afvigelse: 0.8, budget: 25 },
        ],
      },
      {
        type: 'pie',
        title: 'Budgetfordeling 2024 (mio. DKK)',
        data: [
          { name: 'Ældre & Sundhed', value: 420 },
          { name: 'Folkeskole', value: 280 },
          { name: 'Social & Handicap', value: 180 },
          { name: 'Beskæftigelse', value: 150 },
          { name: 'Dagtilbud', value: 120 },
          { name: 'Specialundervisning', value: 95 },
          { name: 'Teknik & Miljø', value: 65 },
          { name: 'Administration', value: 45 },
          { name: 'Kultur & Fritid', value: 35 },
          { name: 'Ledelse & Politisk', value: 25 },
        ],
      },
    ],

    sources: [
      { name: 'Kalundborg Kommune - Økonomirapport september 2024', type: 'budget', url: '#okonomirapport-sep', confidence: 0.97 },
      { name: 'Forventet regnskab 3 - September 2024', type: 'budget', url: '#fr3-2024', confidence: 0.95 },
      { name: 'KL Budgetlægning 2024 - Vejledning', type: 'rapport', url: 'https://www.kl.dk/okonomi-og-administration/budgetlaegning/', confidence: 0.88 },
    ],

    followUpQuestions: [
      'Hvad driver overskridelsen på specialundervisning?',
      'Kan vi omprioritere midler mellem områderne?',
      'Hvad er likviditetsprognosen for Q4?',
      'Hvordan sammenligner vi os med nabokommunerne?',
    ],

    insights: [
      'Samlet budgetoverholdelse er acceptabel, men specialiserede områder (specialundervisning, social) udgør en voksende strukturel udfordring.',
      'Beskæftigelsesområdets mindreforbrug (5,2 mio. DKK) kan delvist modsvare merforbruget, men kræver politisk beslutning om omplacering.',
      'Likviditetsbeholdningen er faldet fra 185 mio. DKK (Q1) til 148 mio. DKK (Q3) - tendensen bør overvåges.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 3. Befolkningsudviklingens budgetpåvirkning
  // ─────────────────────────────────────────────────────
  {
    id: 'befolkning-budget',
    keywords: ['befolkning', 'demografi', 'udvikling', 'befolkningsudvikling', 'demografisk'],
    query: 'Hvordan påvirker befolkningsudviklingen mit budget?',
    response: `## Demografisk budgetpåvirkning - Kalundborg Kommune

### Befolkningsprognosen i overblik

Kalundborg Kommunes samlede befolkning er ca. **49.600 borgere** i 2024. Prognosen viser en **svagt faldende** samlet befolkning, men med **markante forskydninger** mellem aldersgrupperne.

### De to store demografiske bevægelser

**1. Faldende børnetal** (udgiftsreduktion på sigt)
- Småbørn (0-5 år): Fra **3.200** i 2024 til **2.970** i 2028 (-7,2%)
- Skolebørn (6-16 år): Fra **7.800** til **7.350** (-5,8%)
- Potentiel besparelse: ca. **42-50 mio. DKK årligt** i 2028 ift. 2024-niveau
- **OBS**: Besparelserne er ikke automatiske - kræver aktiv kapacitetstilpasning (lukning af dagtilbudspladser, sammenlægning af klasser)

**2. Stigende ældrebefolkning** (udgiftsstigning)
- Yngre ældre (65-79): Fra **8.900** til **9.750** (+9,6%)
- Ældre 80+ år: Fra **3.100** til **3.740** (+20,6%)
- Forventet merudgift: ca. **98-115 mio. DKK årligt** i 2028 ift. 2024-niveau
- Primært drevet af 80+ gruppen med en gennemsnitlig udgift på **125.000 DKK/borger**

### Nettopåvirkning

Det demografiske **nettopres** er ca. **55-65 mio. DKK ekstra om året** inden 2028. Dette er en **strukturel udfordring** der ikke kan løses med engangsbesparelser.

### Strategiske overvejelser

- **Konvertering**: Kan lukkede daginstitutioner konverteres til ældreboliger?
- **Rekruttering**: Ældreområdet vil kræve 80-120 flere medarbejdere over 4 år
- **Teknologi**: Investering i velfærdsteknologi kan reducere personalebehovet med 10-15%
- **KL-forhandlinger**: Demografigarantien i bloktilskuddet kompenserer delvist`,

    visualizations: [
      {
        type: 'area',
        title: 'Befolkningsudvikling pr. aldersgruppe (2024-2028)',
        data: [
          { year: '2024', '0-5': 3200, '6-16': 7800, '65-79': 8900, '80+': 3100 },
          { year: '2025', '0-5': 3130, '6-16': 7680, '65-79': 9105, '80+': 3249 },
          { year: '2026', '0-5': 3065, '6-16': 7560, '65-79': 9315, '80+': 3405 },
          { year: '2027', '0-5': 3010, '6-16': 7450, '65-79': 9530, '80+': 3568 },
          { year: '2028', '0-5': 2970, '6-16': 7350, '65-79': 9750, '80+': 3740 },
        ],
      },
      {
        type: 'bar',
        title: 'Demografisk budgetpres pr. aldersgruppe (mio. DKK ændring ift. 2024)',
        data: [
          { name: '0-5 år', '2026': -11.5, '2028': -19.6 },
          { name: '6-16 år', '2026': -17.3, '2028': -32.4 },
          { name: '17-25 år', '2026': -0.3, '2028': -0.6 },
          { name: '26-64 år', '2026': -5.3, '2028': -10.2 },
          { name: '65-79 år', '2026': 18.7, '2028': 38.3 },
          { name: '80+ år', '2026': 38.1, '2028': 80.0 },
        ],
      },
    ],

    sources: [
      { name: 'Danmarks Statistik FRDK121 - Befolkningsfremskrivning', type: 'statistik', url: 'https://www.statbank.dk/FRDK121', confidence: 0.96 },
      { name: 'KL Demografisk Udgiftspres 2024-2028', type: 'rapport', url: 'https://www.kl.dk/okonomi-og-administration/', confidence: 0.90 },
      { name: 'Kalundborg Kommune - Befolkningsprognose 2024', type: 'statistik', url: '#befolkningsprognose', confidence: 0.94 },
    ],

    followUpQuestions: [
      'Hvad er den konkrete merudgift på ældreområdet i 2026?',
      'Kan vi genbruge børneområdets bygninger til ældreformål?',
      'Hvordan håndterer sammenlignelige kommuner det demografiske pres?',
      'Hvad indeholder KL\'s demografigaranti?',
    ],

    insights: [
      'Det demografiske nettopres er 55-65 mio. DKK/år i 2028 - primært drevet af 80+ gruppen der vokser med 20,6%.',
      'Faldende børnetal giver potentielle besparelser, men de kræver aktive politiske beslutninger om kapacitetstilpasning.',
      'Investeringer i velfærdsteknologi nu kan reducere den fremtidige personalemangel med 10-15%.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 4. Kommende lovgivning
  // ─────────────────────────────────────────────────────
  {
    id: 'lovgivning-okonomi',
    keywords: ['lovgivning', 'lov', 'reform', 'regulering', 'regler', 'lovforslag'],
    query: 'Er der lovgivning på vej der påvirker min økonomi?',
    response: `## Lovgivningsoverblik med budgetkonsekvenser

### Vedtagne love med ikrafttrædelse 2024-2025

**1. Ældreloven (L 134)**
- **Status**: Vedtaget, ikrafttrædelse 1. juli 2025
- **Indhold**: Ny ældrereform med fokus på frit valg, helhedsplaner og kvalitetsstandarder
- **Budgetkonsekvens**: Estimeret merudgift **8-12 mio. DKK/år** for Kalundborg
- **DUT-kompensation**: 70% via bloktilskud, **nettomerudgift ca. 3-4 mio. DKK**
- **Handling påkrævet**: Implementeringsplan inden Q1 2025

**2. Barnets Lov (følgelovgivning)**
- **Status**: Følgeregulering vedtaget
- **Indhold**: Skærpede krav til forebyggende indsatser og sagsbehandling
- **Budgetkonsekvens**: Merudgift **3-5 mio. DKK/år** til flere sagsbehandlere og tidlig indsats
- **DUT-kompensation**: Delvis kompenseret, **nettomerudgift ca. 1-2 mio. DKK**

### Lovforslag under behandling i Folketinget

**3. L 87 - Ændring af beskæftigelsesindsatsloven**
- **Status**: 2. behandling planlagt november 2024
- **Indhold**: Forenkling af beskæftigelsesindsats, færre proceskrav
- **Budgetkonsekvens**: Potentiel **besparelse 2-3 mio. DKK/år** på administration
- **Risiko**: Kan medføre dårligere resultater og dermed højere overførselsudgifter

**4. L 112 - Specialundervisning og inklusion**
- **Status**: 1. behandling gennemført, udvalgsbehandling igangsat
- **Indhold**: Nye visitationskrav og dokumentationspligt for specialundervisning
- **Budgetkonsekvens**: Merudgift **2-4 mio. DKK/år** til administration og visitation

### Samlet økonomisk påvirkning

Den samlede **nettopåvirkning** af identificeret lovgivning er en **merudgift på ca. 8-15 mio. DKK/år** med fuld indfasning. Beløbet er efter DUT-kompensation.

### Anbefaling

Indarbejd et **lovgivningsreservebeløb** på minimum **10 mio. DKK** i budget 2025 til håndtering af nye lovkrav.`,

    visualizations: [
      {
        type: 'bar',
        title: 'Forventet budgetpåvirkning af ny lovgivning (mio. DKK/år, netto efter DUT)',
        data: [
          { name: 'Ældreloven', merudgift: 3.5, dutKompensation: 8.5 },
          { name: 'Barnets Lov', merudgift: 1.5, dutKompensation: 3.0 },
          { name: 'Beskæft.reform', merudgift: -2.5, dutKompensation: 0 },
          { name: 'Specialunderv.', merudgift: 3.0, dutKompensation: 1.0 },
        ],
      },
    ],

    sources: [
      { name: 'Folketinget ODA - L 134 Ældreloven', type: 'lovgivning', url: 'https://oda.ft.dk/api/Sag?$filter=typeid eq 3', confidence: 0.92 },
      { name: 'KL DUT-forhandlinger 2024', type: 'rapport', url: 'https://www.kl.dk/okonomi-og-administration/dut/', confidence: 0.88 },
      { name: 'Social- og Boligministeriet - Ældreloven', type: 'lovgivning', url: 'https://www.sm.dk/arbejdsomraader/aeldre', confidence: 0.90 },
      { name: 'Børne- og Undervisningsministeriet - Barnets Lov', type: 'lovgivning', url: 'https://www.uvm.dk/', confidence: 0.85 },
    ],

    followUpQuestions: [
      'Hvad indebærer ældreloven konkret for vores hjemmepleje?',
      'Hvornår træder specialundervisningsændringerne i kraft?',
      'Hvad er DUT-kompensationen for Barnets Lov?',
      'Hvilke kommuner har allerede implementeret ældrelovens krav?',
    ],

    insights: [
      'Samlet netto lovgivningspres er 8-15 mio. DKK/år - ældreloven er den største post med 3-4 mio. DKK netto.',
      'Beskæftigelsesreformen kan give en besparelse, men risikerer at øge overførselsudgifterne på sigt.',
      'Et lovgivningsreservebeløb på 10 mio. DKK i budget 2025 anbefales for at imødegå implementeringsomkostninger.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 5. Ældreområdets prognose
  // ─────────────────────────────────────────────────────
  {
    id: 'aeldreprognose',
    keywords: ['ældre', 'ældreområdet', 'prognose', 'pleje', 'hjemmepleje', 'plejehjem'],
    query: 'Hvad er prognosen for ældreområdet?',
    response: `## Prognose for Ældre & Sundhed

### Aktuel status (september 2024)

Ældreområdet har et budget på **420 mio. DKK** i 2024. Det aktuelle forbrug er **314,6 mio. DKK** efter 9 måneder. Årsprognosen peger mod **426,4 mio. DKK**, en overskridelse på **6,4 mio. DKK** (1,5%).

### Udgiftsstruktur

| Delområde | Budget | Prognose | Afvigelse |
|-----------|--------|----------|-----------|
| Hjemmepleje | 145 mio. | 150,2 mio. | +5,2 mio. |
| Plejehjem | 168 mio. | 170,8 mio. | +2,8 mio. |
| Sygepleje | 42 mio. | 41,5 mio. | -0,5 mio. |
| Genoptræning | 28 mio. | 27,2 mio. | -0,8 mio. |
| Hjælpemidler | 22 mio. | 22,4 mio. | +0,4 mio. |
| Forebyggelse | 15 mio. | 14,3 mio. | -0,7 mio. |

### Demografisk fremskrivning (2024-2028)

Gruppen af **80+ årige** vokser fra **3.100 til 3.740 borgere** (+20,6%) over 4 år. Med en gennemsnitlig udgift på **125.000 DKK pr. borger** i denne gruppe giver det et **demografisk pres på ca. 80 mio. DKK ekstra i 2028**.

Gruppen af **65-79 årige** vokser fra **8.900 til 9.750** (+9,6%), med en lavere enhedsudgift på 45.000 DKK, men det bidrager stadig med **38 mio. DKK** i ekstra udgifter.

### Nøgleindikatorer

- **Visiterede timer hjemmepleje**: 1.245 borgere (+4,2% ift. 2023)
- **Plejehjemsbeboere**: 412 pladser, **belægning 98,3%**
- **Venteliste plejehjem**: 18 borgere (garantiperiode udfordret)
- **Sygefravær personale**: 8,2% (landsgennemsnit 7,4%)

### Handlingsplan

1. **Akut**: Kapacitetsudvidelse med 12 plejehjemspladser (anlæg krævet)
2. **Kort sigt**: Investér i velfærdsteknologi (skærme, sensorer, robotstøvsugere) - ROI 18-24 mdr.
3. **Mellemlang sigt**: Rekrutteringsstrategi - 80-120 nye medarbejdere over 4 år
4. **Langt sigt**: Strukturel tilpasning af servicemodel i samarbejde med regionen`,

    visualizations: [
      {
        type: 'line',
        title: 'Ældreudgifter - Prognose 2024-2028 (mio. DKK)',
        data: [
          { year: '2024', udgift: 426, budget: 420 },
          { year: '2025', udgift: 448, budget: 440 },
          { year: '2026', udgift: 475, budget: 460 },
          { year: '2027', udgift: 505, budget: 480 },
          { year: '2028', udgift: 538, budget: 500 },
        ],
      },
      {
        type: 'area',
        title: 'Ældrebefolkning 65+ (antal borgere)',
        data: [
          { year: '2024', '65-79 år': 8900, '80+ år': 3100 },
          { year: '2025', '65-79 år': 9105, '80+ år': 3249 },
          { year: '2026', '65-79 år': 9315, '80+ år': 3405 },
          { year: '2027', '65-79 år': 9530, '80+ år': 3568 },
          { year: '2028', '65-79 år': 9750, '80+ år': 3740 },
        ],
      },
    ],

    sources: [
      { name: 'Kalundborg Kommune - Budget 2024, Ældre & Sundhed', type: 'budget', url: '#budget-aeldre', confidence: 0.96 },
      { name: 'Danmarks Statistik FRDK121 - Befolkningsfremskrivning', type: 'statistik', url: 'https://www.statbank.dk/FRDK121', confidence: 0.94 },
      { name: 'VIVE - Udgiftsbehov på ældreområdet 2024', type: 'rapport', url: 'https://www.vive.dk/', confidence: 0.87 },
    ],

    followUpQuestions: [
      'Hvad koster det at bygge 12 nye plejehjemspladser?',
      'Hvilke velfærdsteknologier har bedst ROI?',
      'Hvordan løser vi rekrutteringsudfordringen?',
      'Hvad er konsekvenserne af den nye ældrereform?',
    ],

    insights: [
      'Ældreområdet står over for en strukturel udgiftsvækst på 25-30% over 4 år, drevet af 80+ befolkningens vækst.',
      'Plejehjemsbelegningen er kritisk høj (98,3%) - kapacitetsudvidelse er nødvendig inden udgangen af 2025.',
      'Velfærdsteknologi kan reducere personalebehov med 10-15%, men kræver investering nu for at nå ROI inden presset topper.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 6. Ansættelse af flere lærere
  // ─────────────────────────────────────────────────────
  {
    id: 'ansaet-laerere',
    keywords: ['ansætte', 'lærere', 'lærer', 'flere lærere', 'personale skole', 'normeringer'],
    query: 'Kan vi ansætte flere lærere næste år?',
    response: `## Analyse: Mulighed for læreransættelser i 2025

### Økonomisk ramme

Folkeskoleområdets budget for 2024 er **280 mio. DKK**. Lønudgifter udgør ca. **72%** af det samlede budget (ca. 201 mio. DKK), svarende til ca. **385 fuldtidsstillinger** (lærere, pædagoger, ledere).

En fuldtidslærer koster i gennemsnit ca. **520.000 DKK/år** inkl. pension, feriepenge og overhead (OK21-niveau + forventet OK24-regulering).

### Muligheder for finansiering

**Scenarie A: Inden for nuværende ramme**
- Prognosen viser et mindreforbrug på ca. **2,4 mio. DKK** i 2024
- Faldende elevtal frigør potentielt **1-2 stillinger** via naturlig afgang
- **Resultat**: 3-4 ekstra lærere er muligt ved omfordeling

**Scenarie B: Med demografibesparelse**
- Elevtallet falder med ca. **120 elever** fra 2024 til 2025
- Ved fuld kapacitetstilpasning frigøres ca. **4,3 mio. DKK**
- **Resultat**: Op til 8 ekstra lærere, men kræver lukning af 1-2 klasser

**Scenarie C: Med tillægsbevilling**
- 10 ekstra lærere kræver tillægsbevilling på ca. **5,2 mio. DKK**
- Skal finansieres via servicerammen eller kasseforbrug
- **Resultat**: Politisk beslutning nødvendig

### Rekrutteringsudfordring

- Kalundborg har en **vakancerate på 6,8%** for lærerstillinger (landsgennemsnit: 4,2%)
- Gennemsnitlig ansættelsestid: **47 dage** fra opslag til ansættelse
- **Lærermangel** er størst i naturfag og specialundervisning

### Anbefaling

Anbefaler **Scenarie B** kombineret med en rekrutteringsstrategi:
1. Tilpas klassestørrelser baseret på faldende elevtal
2. Anvend besparelsen til 5-6 ekstra lærerstillinger
3. Fokusér rekruttering på mangelfag (naturfag, specialpæd.)
4. Overvej samarbejde med UC Sjælland om praktikpladser`,

    visualizations: [
      {
        type: 'bar',
        title: 'Finansieringsscenarier - Antal ekstra lærere',
        data: [
          { name: 'Scenarie A\n(Nuværende ramme)', laerere: 4, omkostning: 2.1 },
          { name: 'Scenarie B\n(Demografibesparelse)', laerere: 8, omkostning: 4.2 },
          { name: 'Scenarie C\n(Tillægsbevilling)', laerere: 10, omkostning: 5.2 },
        ],
      },
      {
        type: 'line',
        title: 'Elev-lærer ratio udvikling',
        data: [
          { year: '2022', ratio: 11.2, landsgennemsnit: 10.8 },
          { year: '2023', ratio: 11.0, landsgennemsnit: 10.7 },
          { year: '2024', ratio: 10.8, landsgennemsnit: 10.6 },
          { year: '2025', ratio: 10.5, landsgennemsnit: 10.5 },
          { year: '2026', ratio: 10.2, landsgennemsnit: 10.4 },
        ],
      },
    ],

    sources: [
      { name: 'Kalundborg Kommune - Folkeskolebudget 2024', type: 'budget', url: '#budget-folkeskole', confidence: 0.95 },
      { name: 'KL Løn- og personalestatistik 2024', type: 'statistik', url: 'https://www.kl.dk/okonomi-og-administration/loen-og-personale/', confidence: 0.90 },
      { name: 'OK21 overenskomst - Lærernes Centralorganisation', type: 'rapport', url: 'https://www.dlf.org/', confidence: 0.92 },
    ],

    followUpQuestions: [
      'Hvad koster den nye overenskomst for lærerne?',
      'Hvilke skoler har størst behov for ekstra lærere?',
      'Kan vi bruge vikarer eller timelærere som alternativ?',
      'Hvad er erfaringerne med tværkommunalt samarbejde om speciallærere?',
    ],

    insights: [
      'Faldende elevtal giver en unik mulighed for at forbedre normeringen uden at øge budgettet - men kræver aktiv kapacitetstilpasning.',
      'Rekrutteringsudfordringen (6,8% vakance) er den største barriere - lønnen er ikke det primære problem.',
      'En forbedret elev-lærer ratio fra 10,8 til 10,2 vil bringe Kalundborg på niveau med landsgennemsnittet i 2026.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 7. Overenskomstens omkostning
  // ─────────────────────────────────────────────────────
  {
    id: 'overenskomst-omkostning',
    keywords: ['overenskomst', 'OK24', 'lønstigning', 'løn', 'forhandling', 'koster overenskomst'],
    query: 'Hvad koster den nye overenskomst?',
    response: `## Omkostningsanalyse: OK24 overenskomst

### Overordnet ramme

Den kommunale overenskomst OK24 er aftalt med en samlet økonomisk ramme på **8,8%** over 3 år (2024-2026). For Kalundborg Kommune med en samlet lønsum på ca. **1.100 mio. DKK** betyder det:

- **2024**: 3,4% = ca. **37,4 mio. DKK** ekstraudgift
- **2025**: 2,8% = ca. **30,8 mio. DKK** ekstraudgift (kumulativt)
- **2026**: 2,6% = ca. **28,6 mio. DKK** ekstraudgift (kumulativt)
- **Samlet 3-årig merudgift**: ca. **96,8 mio. DKK**

### Fordeling på fagområder

| Område | Lønsum 2024 | OK24-effekt/år | Andel |
|--------|------------|----------------|-------|
| Ældre & Sundhed | 285 mio. | 9,7 mio. | 26% |
| Folkeskole | 201 mio. | 6,8 mio. | 18% |
| Dagtilbud | 88 mio. | 3,0 mio. | 8% |
| Social & Handicap | 126 mio. | 4,3 mio. | 12% |
| Beskæftigelse | 62 mio. | 2,1 mio. | 6% |
| Øvrige | 338 mio. | 11,5 mio. | 30% |

### Finansiering

OK24 er **fuldt kompenseret** via:
- **Reguleringsordningen**: Automatisk lønregulering i overensstemmelse med det private arbejdsmarked
- **PL-regulering i bloktilskud**: KL har indregnet OK24-effekten i bloktilskudsforhandlingerne
- **Skatteindtægter**: Lønstigninger øger skattegrundlaget med ca. 1-2 års forsinkelse

**Dog** er der en **timing-risiko**: Kompensationen kommer med forsinkelse, og de første 6-12 måneder kan give likviditetspres.

### Særlige opmærksomhedspunkter

- **Lavtlønsgrupper** (SOSU, pædagogmedhjælpere) har fået ekstra lønløft på 2-5%, hvilket belaster ældre- og dagtilbudsområdet relativt mere
- **Arbejdstidsregler**: Nye fleksibilitetsaftaler kan give driftsbesparelser, men kræver lokal implementering
- **Pension**: Pensionsforhøjelse på 0,29%-point øger den samlede udgift marginalt

### Anbefaling

1. Indregn OK24-effekten i budget 2025 med fuld virkning
2. Sikr likviditetsreserve på min. **15 mio. DKK** til timing-forskelle
3. Implementér de nye arbejdstidsaftaler aktivt for at høste besparelsespotentiale`,

    visualizations: [
      {
        type: 'bar',
        title: 'OK24 merudgift pr. fagområde (mio. DKK/år)',
        data: [
          { name: 'Ældre & Sundhed', merudgift: 9.7 },
          { name: 'Folkeskole', merudgift: 6.8 },
          { name: 'Social & Handicap', merudgift: 4.3 },
          { name: 'Dagtilbud', merudgift: 3.0 },
          { name: 'Beskæftigelse', merudgift: 2.1 },
          { name: 'Øvrige', merudgift: 11.5 },
        ],
      },
    ],

    sources: [
      { name: 'KL - OK24 Overenskomstresultat', type: 'rapport', url: 'https://www.kl.dk/okonomi-og-administration/loen-og-personale/overenskomster/', confidence: 0.95 },
      { name: 'Forhandlingsfællesskabet - OK24 aftale', type: 'rapport', url: 'https://www.forhandlingsfaellesskabet.dk/', confidence: 0.93 },
      { name: 'Kalundborg Kommune - Lønbudget 2024', type: 'budget', url: '#loenbudget', confidence: 0.92 },
    ],

    followUpQuestions: [
      'Hvordan påvirker OK24 konkret vores ældreområde?',
      'Er der besparelsespotentiale i de nye arbejdstidsregler?',
      'Hvornår kommer den fulde bloktilskudskompensation?',
      'Kan vi forvente yderligere lønstigninger ud over OK24?',
    ],

    insights: [
      'OK24 koster Kalundborg ca. 37 mio. DKK/år i 2024, men er primært finansieret via bloktilskud og reguleringsordning.',
      'Timing-risikoen er reel: Kompensation kommer med 6-12 måneders forsinkelse, hvilket presser likviditeten.',
      'Lavtlønsgrupper (SOSU, pædagogmedhjælpere) har fået ekstra lønløft, hvilket rammer ældre- og børneområdet hårdest.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 8. Specialundervisningsbudgettet
  // ─────────────────────────────────────────────────────
  {
    id: 'specialundervisning',
    keywords: ['specialundervisning', 'special', 'inklusion', 'visitation', 'segregering', 'specialtilbud'],
    query: 'Hvordan ser specialundervisningsbudgettet ud?',
    response: `## Dybdegående analyse af specialundervisningsbudgettet

### Alarmerende udvikling

Specialundervisningsbudgettet er i **rød status**. Med et budget på **95 mio. DKK** og en prognose på **104,9 mio. DKK** er vi på vej mod en overskridelse på **9,9 mio. DKK (10,4%)**. Dette er det område med den **relativt største budgetoverskridelse** i kommunen.

### Udgiftsudvikling

| År | Budget | Regnskab | Afvigelse |
|----|--------|----------|-----------|
| 2021 | 78 mio. | 81 mio. | +3,8% |
| 2022 | 82 mio. | 88 mio. | +7,3% |
| 2023 | 88 mio. | 95,5 mio. | +8,5% |
| 2024 | 95 mio. | *104,9 mio.* | *+10,4%* |

Udgiftsvæksten har været **gennemsnitligt 8,8% om året** de seneste 3 år - langt over den generelle budgetvækst.

### Drivere bag udgiftsvæksten

1. **Stigende visitationstal**: Fra 287 elever (2021) til 342 elever (2024) = **+19,2%**
2. **Dyrere tilbud**: Gennemsnitlig årspris pr. elev steget fra 272.000 DKK til 307.000 DKK = **+12,9%**
3. **Flere STU-elever**: Særligt tilrettelagt ungdomsuddannelse stiger i omfang
4. **Længere forløb**: Gennemsnitlig varighed er steget fra 2,3 til 2,8 år

### Sammenligning med andre kommuner

Kalundborgs udgift pr. elev til specialundervisning ligger **14% over** gennemsnittet for sammenlignelige kommuner (ECO-nøgletal). Segregeringsandelen er **6,2%** mod landsgennemsnittet på **5,4%**.

### Handlemuligheder

**Kort sigt (0-12 mdr.)**:
- Revisitation af alle specialundervisningselever med udgift over 400.000 DKK
- Genforhandling af takster med regionale og private tilbud
- Indførelse af udgiftsloft med dispensationsmulighed

**Mellemlang sigt (1-3 år)**:
- Styrk almenområdets kapacitet til inklusion (co-teaching, ressourcecentre)
- Etablér kommunale specialtilbud som alternativ til dyre eksterne pladser
- Implementér tidlig indsats-model baseret på evidensbaserede metoder

**Lang sigt (3-5 år)**:
- Kulturændring mod mere inkluderende praksis
- Kompetenceudvikling af lærere og pædagoger
- Tværsektorielt samarbejde (PPR, socialrådgivere, sundhedspleje)`,

    visualizations: [
      {
        type: 'line',
        title: 'Specialundervisning - Udgiftsudvikling (mio. DKK)',
        data: [
          { year: '2021', budget: 78, regnskab: 81 },
          { year: '2022', budget: 82, regnskab: 88 },
          { year: '2023', budget: 88, regnskab: 95.5 },
          { year: '2024', budget: 95, regnskab: 104.9 },
          { year: '2025 (prog.)', budget: 100, regnskab: 115 },
        ],
      },
      {
        type: 'bar',
        title: 'Antal visiterede elever og gennemsnitspris',
        data: [
          { year: '2021', elever: 287, prisPerElev: 272 },
          { year: '2022', elever: 305, prisPerElev: 288 },
          { year: '2023', elever: 328, prisPerElev: 291 },
          { year: '2024', elever: 342, prisPerElev: 307 },
        ],
      },
    ],

    sources: [
      { name: 'Kalundborg Kommune - Specialundervisningsbudget 2024', type: 'budget', url: '#budget-special', confidence: 0.96 },
      { name: 'ECO-nøgletal 2024 - Sammenlignelige kommuner', type: 'statistik', url: 'https://www.noegletal.dk/', confidence: 0.91 },
      { name: 'KL - Det specialiserede børneområde 2024', type: 'rapport', url: 'https://www.kl.dk/kommunale-opgaver/boern-og-unge/det-specialiserede-boerneomraade/', confidence: 0.88 },
      { name: 'VIVE - Inklusion og specialundervisning i kommunerne', type: 'rapport', url: 'https://www.vive.dk/', confidence: 0.85 },
    ],

    followUpQuestions: [
      'Hvilke specialtilbud er de dyreste?',
      'Kan vi etablere et kommunalt specialtilbud?',
      'Hvad gør andre kommuner for at reducere specialundervisningsudgifterne?',
      'Hvad er PPR\'s kapacitet til tidlig indsats?',
    ],

    insights: [
      'Specialundervisningsudgifterne vokser med 8,8% årligt og er den største budgetrisiko på børneområdet.',
      'Kalundborg segregerer 6,2% af eleverne - over landsgennemsnittet på 5,4%. En reduktion til gennemsnittet ville spare ca. 8 mio. DKK/år.',
      'Gennemsnitsprisen pr. specialundervisningselev er steget 12,9% siden 2021 - genforhandling af takster er nødvendig.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 9. Likviditet
  // ─────────────────────────────────────────────────────
  {
    id: 'likviditet',
    keywords: ['likviditet', 'kasse', 'kassebeholdning', 'kassekreditregel', 'pengebeholdning'],
    query: 'Hvordan ser likviditeten ud?',
    response: `## Likviditetsanalyse - Kalundborg Kommune 2024

### Aktuel status (september 2024)

Kassebeholdningen ultimo september er **148,5 mio. kr.**, hvilket er et fald fra **195,2 mio. kr.** primo januar. Det svarer til et fald på **46,7 mio. kr.** over 9 måneder.

### Likviditetsudvikling 2024

| Kvartal | Primo | Ultimo | Ændring |
|---------|-------|--------|---------|
| Q1 | 195,2 | 185,2 | -10,0 |
| Q2 | 185,2 | 162,8 | -22,4 |
| Q3 | 162,8 | 148,5 | -14,3 |
| Q4 (forecast) | 148,5 | 135,0 | -13,5 |

### Kassekreditreglen

Kommunens **gennemsnitlige likviditet over 365 dage** er ca. **168 mio. kr.** Kassekreditreglen kræver minimum **50 mio. kr.** Kommunens eget minimumsmål er **100 mio. kr.**

Forecast viser at vi ender året på **135 mio. kr.**, hvilket er **35 mio. kr. over minimumsmålet** men med **faldende tendens**.

### Drivere bag likviditetsfaldet

1. **Anlægsudgifter**: 78,9 mio. kr. udbetalt YTD (planlagt: 65 mio. kr.)
2. **Forskudt skatteafregning**: 12,5 mio. kr. efterregulering
3. **Merforbrug drift**: 18-22 mio. kr. merforug (spec. specialundervisning + social)
4. **Lånoptag**: 15 mio. kr. planlagt lån ikke optaget endnu

### Anbefaling

1. **Fremrykning af lånoptag** på 15 mio. kr. - kontakt KommuneKredit
2. **Stram anlægsstyring** - udskyd ikke-kritiske anlægsprojekter til 2025
3. **Månedlig likviditetsrapportering** til Økonomiudvalget
4. **Sikr minimumsmålet**: Med nuværende trend rammer vi 100 mio. i marts 2025`,
    visualizations: [
      {
        type: 'line',
        title: 'Likviditetsudvikling 2024 (mio. kr.)',
        data: [
          { month: 'Jan', beholdning: 195.2, minimum: 100, kassekreditregel: 50 },
          { month: 'Feb', beholdning: 188.4, minimum: 100, kassekreditregel: 50 },
          { month: 'Mar', beholdning: 185.2, minimum: 100, kassekreditregel: 50 },
          { month: 'Apr', beholdning: 178.6, minimum: 100, kassekreditregel: 50 },
          { month: 'Maj', beholdning: 170.3, minimum: 100, kassekreditregel: 50 },
          { month: 'Jun', beholdning: 162.8, minimum: 100, kassekreditregel: 50 },
          { month: 'Jul', beholdning: 158.2, minimum: 100, kassekreditregel: 50 },
          { month: 'Aug', beholdning: 152.5, minimum: 100, kassekreditregel: 50 },
          { month: 'Sep', beholdning: 148.5, minimum: 100, kassekreditregel: 50 },
          { month: 'Okt', beholdning: 142.0, minimum: 100, kassekreditregel: 50 },
          { month: 'Nov', beholdning: 138.5, minimum: 100, kassekreditregel: 50 },
          { month: 'Dec', beholdning: 135.0, minimum: 100, kassekreditregel: 50 },
        ],
      },
    ],
    sources: [
      { name: 'Kalundborg Kommune - Likviditetsrapport Q3 2024', type: 'budget', url: '#likviditet-q3', confidence: 0.96 },
      { name: 'KommuneKredit - Lånerammer 2024', type: 'rapport', url: 'https://www.kommunekredit.dk/', confidence: 0.88 },
    ],
    followUpQuestions: [
      'Hvornår rammer vi minimumsmålet på 100 mio. kr.?',
      'Kan vi fremrykke lånoptaget fra KommuneKredit?',
      'Hvilke anlægsprojekter kan udskydes?',
      'Hvad er likviditetsprognosen for 2025?',
    ],
    insights: [
      'Likviditeten er faldet 46,7 mio. kr. på 9 måneder - primært drevet af anlægsudgifter og merforbrug på drift.',
      'Forecast viser 135 mio. kr. ultimo 2024, 35 mio. kr. over minimumsmålet men med faldende trend.',
      'Fremrykning af lånoptag på 15 mio. kr. vil stabilisere likviditeten på kort sigt.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 10. Anlæg/investering
  // ─────────────────────────────────────────────────────
  {
    id: 'anlaeg',
    keywords: ['anlæg', 'investering', 'anlægsbudget', 'byggeri', 'renovation', 'projekt'],
    query: 'Hvad er status på anlægsprojekterne?',
    response: `## Anlægsbudget 2024 - Kalundborg Kommune

### Overblik

Det samlede anlægsbudget for 2024 er **208 mio. kr.** fordelt på **7 projekter**. Det samlede forbrug YTD er **78,9 mio. kr.** (38% af budget).

### Projektoversigt

| Projekt | Budget | Forbrug | Fremdrift | Status |
|---------|--------|---------|-----------|--------|
| Svebølle Skole - Renovering | 62 mio. | 28,5 mio. | 46% | Igangsat |
| Bakkegården Plejehjem - Udvidelse | 48 mio. | 12,2 mio. | 25% | Igangsat |
| Holbækvej Cykelsti | 25 mio. | 18,7 mio. | 75% | Igangsat |
| IT-infrastruktur | 18 mio. | 9,4 mio. | 52% | Igangsat |
| Klimatilpasning Kalundborg by | 30 mio. | 5,1 mio. | 17% | Forsinket |
| Ubby Daginstitution | 15 mio. | 1,2 mio. | 8% | Planlagt |
| Gørlev Multihal | 10 mio. | 3,8 mio. | 38% | Igangsat |

### Opmærksomhedspunkter

- **Klimatilpasning** er **forsinket** pga. miljøgodkendelse - forventet 3-6 måneders forsinkelse
- **Bakkegården** er kritisk for at imødekomme det demografiske pres på plejehjemspladser
- **Holbækvej** forventes afsluttet til tiden i Q4 2024

### Anlægsfinansiering

- Lånoptag: 85 mio. kr. (planlagt)
- Kvalitetsfondsmidler: 45 mio. kr.
- Egenfinansiering: 78 mio. kr.`,
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
          { name: 'Ubby Daginstit.', budget: 15, forbrug: 1.2 },
          { name: 'Gørlev Multihal', budget: 10, forbrug: 3.8 },
        ],
      },
    ],
    sources: [
      { name: 'Kalundborg Kommune - Anlægsrapport september 2024', type: 'budget', url: '#anlaeg-sep', confidence: 0.95 },
      { name: 'Anlægsbudget 2024-2027 - Byrådets vedtagelse', type: 'budget', url: '#anlaeg-vedtaget', confidence: 0.97 },
    ],
    followUpQuestions: [
      'Hvornår forventes Bakkegården færdig?',
      'Hvad er konsekvenserne af forsinkelsen på klimatilpasning?',
      'Kan vi fremrykke Ubby-projektet?',
      'Hvad er de samlede anlægsudgifter over perioden 2024-2027?',
    ],
    insights: [
      'Anlægsforbruget er 78,9 mio. kr. YTD mod forventet 65 mio. kr. - primært drevet af Svebølle Skole og Holbækvej.',
      'Klimatilpasningsprojektet er forsinket 3-6 måneder - miljøgodkendelse afventes.',
      'Bakkegården-udvidelsen er kritisk for at imødekomme den stigende ældrebolig-efterspørgsel.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 11. Benchmark
  // ─────────────────────────────────────────────────────
  {
    id: 'benchmark',
    keywords: ['benchmark', 'sammenlign', 'sammenligning', 'nabokommuner', 'nøgletal', 'ECO'],
    query: 'Hvordan ligger vi sammenlignet med nabokommunerne?',
    response: `## Benchmark - Kalundborg vs. sammenlignelige kommuner

### Metode
Sammenligningen bygger på ECO-nøgletal 2024 og omfatter de nærmeste kommuner i Region Sjælland med sammenlignelig størrelse og demografi.

### Udgifter pr. borger (kr./borger, udvalgte områder)

| Område | Kalundborg | Holbæk | Slagelse | Odsherred | Sorø | Landssnit |
|--------|-----------|--------|----------|-----------|------|-----------|
| Ældre & Sundhed | 8.468 | 7.920 | 8.150 | 9.210 | 7.680 | 7.850 |
| Folkeskole | 5.645 | 5.420 | 5.380 | 5.890 | 5.250 | 5.310 |
| Specialunderv. | 1.915 | 1.650 | 1.780 | 2.050 | 1.520 | 1.690 |
| Dagtilbud | 2.419 | 2.380 | 2.290 | 2.510 | 2.340 | 2.350 |
| Administration | 907 | 920 | 880 | 950 | 860 | 890 |

### Kalundborg-specifikke styrker
- **Lav arbejdsløshed** (3,2% vs. 3,8% landssnit) pga. Novo Nordisk og industriklyngen
- **Stærk beskæftigelsesindsats** - udgifter under gennemsnit
- **Effektiv administration** - på niveau med sammenlignelige

### Kalundborg-specifikke udfordringer
- **Ældre & Sundhed**: 7,9% over landsgennemsnittet - drevet af demografisk pres
- **Specialundervisning**: 13,3% over landsgennemsnittet - høj segregeringsandel
- **Geografi**: Stor kommune (605 km²) giver højere transportudgifter

### Anbefaling
1. Prioritér indsats på specialundervisning og ældreområdet
2. Lær af Sorø Kommunes model for inklusion
3. Udnyt stordriftsfordele fra Novo-klyngen bedre`,
    visualizations: [
      {
        type: 'bar',
        title: 'Udgift pr. borger - udvalgte områder (kr.)',
        data: [
          { name: 'Ældre & Sundhed', Kalundborg: 8468, Holbæk: 7920, Slagelse: 8150, Landssnit: 7850 },
          { name: 'Folkeskole', Kalundborg: 5645, Holbæk: 5420, Slagelse: 5380, Landssnit: 5310 },
          { name: 'Specialunderv.', Kalundborg: 1915, Holbæk: 1650, Slagelse: 1780, Landssnit: 1690 },
          { name: 'Dagtilbud', Kalundborg: 2419, Holbæk: 2380, Slagelse: 2290, Landssnit: 2350 },
        ],
      },
    ],
    sources: [
      { name: 'ECO-nøgletal 2024 - Kommunal sammenligning', type: 'statistik', url: 'https://www.noegletal.dk/', confidence: 0.93 },
      { name: 'VIVE - Kommunale nøgletal 2024', type: 'rapport', url: 'https://www.vive.dk/', confidence: 0.90 },
      { name: 'KL - Kommunernes økonomi 2024', type: 'rapport', url: 'https://www.kl.dk/', confidence: 0.88 },
    ],
    followUpQuestions: [
      'Hvad gør Sorø anderledes på specialundervisningsområdet?',
      'Hvordan reducerer vi udgifterne på ældreområdet?',
      'Kan vi lære af Holbæks tilgang til ældre & sundhed?',
      'Hvad er forskellen i demografi mellem os og nabokommunerne?',
    ],
    insights: [
      'Kalundborg ligger 7,9% over landsgennemsnittet på ældreområdet og 13,3% over på specialundervisning.',
      'Den lave arbejdsløshed (3,2%) er en styrke drevet af den industrielle klynge med Novo Nordisk.',
      'Sorø Kommune har laveste udgifter til specialundervisning i regionen - deres inklusionsmodel bør undersøges.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 12. Velfærdsteknologi
  // ─────────────────────────────────────────────────────
  {
    id: 'velfaerdsteknologi',
    keywords: ['velfærdsteknologi', 'teknologi', 'robot', 'sensor', 'digitalisering ældre', 'automatisering pleje'],
    query: 'Hvad er potentialet for velfærdsteknologi?',
    response: `## Velfærdsteknologi - ROI-analyse for Kalundborg Kommune

### Baggrund
Med 3.440 borgere over 80 år og en voksende ældrebefolkning er velfærdsteknologi et centralt redskab til at håndtere det demografiske pres uden proportional stigning i personaleudgifter.

### Teknologioversigt og ROI

| Teknologi | Investering | Årlig besparelse | ROI-periode | Berørte borgere |
|-----------|------------|------------------|-------------|-----------------|
| Skærmbesøg (hjemmepleje) | 2,5 mio. | 4,2 mio. | 7 mdr. | 350 borgere |
| Sensorgulve (plejehjem) | 3,8 mio. | 2,1 mio. | 22 mdr. | 412 pladser |
| Medicinrobot | 1,2 mio. | 1,8 mio. | 8 mdr. | 280 borgere |
| Robotstøvsugere | 0,8 mio. | 1,1 mio. | 9 mdr. | 4 plejehjem |
| GPS-tracking (demens) | 0,6 mio. | 0,9 mio. | 8 mdr. | 85 borgere |
| Virtuel genoptræning | 1,5 mio. | 2,0 mio. | 9 mdr. | 420 forløb/år |

### Samlet potentiale

- **Total investering**: 10,4 mio. kr.
- **Årlig besparelse**: 12,1 mio. kr.
- **Gennemsnitlig ROI**: 11 måneder
- **Personalereduktion**: Svarende til 18-22 fuldtidsstillinger (via naturlig afgang)

### Erfaringer fra andre kommuner
- **Odense**: Skærmbesøg har reduceret fysiske besøg med 28%
- **Aarhus**: Sensorgulve har reduceret faldulykker med 42%
- **Aalborg**: Medicinrobotter har frigjort 15 min/borger/dag

### Anbefaling

Start med **skærmbesøg** og **medicinrobot** som har kortest ROI (7-8 mdr.). Implementér i 3 faser:
1. **Q1 2025**: Skærmbesøg + medicinrobot (3,7 mio. kr.)
2. **Q3 2025**: Sensorgulve på Bakkegården og Rørmosegård (2,4 mio. kr.)
3. **Q1 2026**: GPS-tracking + virtuel genoptræning + robotstøvsugere (4,3 mio. kr.)`,
    visualizations: [
      {
        type: 'bar',
        title: 'Velfærdsteknologi - Investering vs. Årlig besparelse (mio. kr.)',
        data: [
          { name: 'Skærmbesøg', investering: 2.5, besparelse: 4.2 },
          { name: 'Sensorgulve', investering: 3.8, besparelse: 2.1 },
          { name: 'Medicinrobot', investering: 1.2, besparelse: 1.8 },
          { name: 'Robotstøvsugere', investering: 0.8, besparelse: 1.1 },
          { name: 'GPS-tracking', investering: 0.6, besparelse: 0.9 },
          { name: 'Virtuel genoptrn.', investering: 1.5, besparelse: 2.0 },
        ],
      },
    ],
    sources: [
      { name: 'Center for Velfærdsteknologi - ROI-beregninger 2024', type: 'rapport', url: 'https://www.cfv.dk/', confidence: 0.90 },
      { name: 'KL - Velfærdsteknologi i kommunerne 2024', type: 'rapport', url: 'https://www.kl.dk/', confidence: 0.88 },
      { name: 'VIVE - Evaluering af skærmbesøg 2023', type: 'rapport', url: 'https://www.vive.dk/', confidence: 0.92 },
    ],
    followUpQuestions: [
      'Hvad er erfaringerne fra Odense med skærmbesøg?',
      'Hvilke plejehjem bør prioriteres først?',
      'Hvordan håndterer vi medarbejdernes bekymringer?',
      'Kan vi søge statslige puljer til velfærdsteknologi?',
    ],
    insights: [
      'Samlet ROI på velfærdsteknologi er 11 måneder med en årlig besparelse på 12,1 mio. kr. efter fuld implementering.',
      'Skærmbesøg har den bedste ROI (7 mdr.) og bør prioriteres som første indsats.',
      'Velfærdsteknologi kan reducere personalebehovet med 18-22 fuldtidsstillinger via naturlig afgang over 2-3 år.',
    ],
  },

  // ─────────────────────────────────────────────────────
  // 13. Budget 2025
  // ─────────────────────────────────────────────────────
  {
    id: 'budget-2025',
    keywords: ['budget 2025', 'næste år', 'budgetforhandling', 'budgetlægning', 'serviceramme 2025'],
    query: 'Hvad er udfordringerne i budget 2025?',
    response: `## Budget 2025 - Kendte udfordringer for Kalundborg Kommune

### Overordnet ramme

Budget 2025 skal håndtere et samlet udgiftspres på ca. **102 mio. kr.** ud over det nuværende budget 2024 på **1.415 mio. kr.** (drift).

### Kendte kostdrivere

| Driver | Beløb | Kategori |
|--------|-------|----------|
| Demografi (flere ældre, færre børn netto) | +55 mio. kr. | Strukturel |
| OK24 - lønstigning (fuld årsvirkning) | +37 mio. kr. | Overenskomst |
| Ny lovgivning (ældrelov, barnets lov m.m.) | +10 mio. kr. | Lovgivning |
| PL-regulering (2,8%) | +40 mio. kr. | Prisfremskrivning |
| Specialundervisning - fortsat vækst | +8 mio. kr. | Strukturel |
| Anlægsbudget - nye behov | +15 mio. kr. | Anlæg |
| **Samlet udgiftspres** | **+165 mio. kr.** | |

### Finansieringskilder

| Kilde | Beløb |
|-------|-------|
| Bloktilskud-regulering (inkl. DUT) | +95 mio. kr. |
| Skatteindtægter (vækst + PL) | +52 mio. kr. |
| Budgetgaranti (beskæftigelse) | +5 mio. kr. |
| Effektiviseringer (krav: 1%) | -14 mio. kr. |
| **Samlet finansiering** | **+138 mio. kr.** |

### Ubalance

**Nettoubalance: ca. 27 mio. kr.** som skal findes via:
- Yderligere effektiviseringer
- Servicerammetilpasninger
- Kasseforbrug (begrænset af likviditet)
- Omprioriteringer mellem områder

### Strategiske valg

1. **Demografitilpasning børn**: Lukning/sammenlægning af 1-2 dagtilbud og klasser kan spare 8-12 mio. kr.
2. **Specialundervisning**: Inklusionsstrategi kan reducere væksten med 4-6 mio. kr.
3. **Velfærdsteknologi**: Investering på 10 mio. kr. giver besparelse på 12 mio. kr./år fra 2026
4. **Rekrutteringsstrategi**: Reduceret vikarforbrug kan spare 5-8 mio. kr.

### Tidsplan

- **August 2024**: Budgetforslag fremlagt
- **September 2024**: 1. behandling i byrådet
- **Oktober 2024**: Budgetforhandlinger
- **November 2024**: 2. behandling og vedtagelse`,
    visualizations: [
      {
        type: 'bar',
        title: 'Budget 2025 - Udgiftspres pr. kategori (mio. kr.)',
        data: [
          { name: 'Demografi', beloeb: 55 },
          { name: 'PL-regulering', beloeb: 40 },
          { name: 'OK24 løn', beloeb: 37 },
          { name: 'Anlæg', beloeb: 15 },
          { name: 'Lovgivning', beloeb: 10 },
          { name: 'Specialunderv.', beloeb: 8 },
        ],
      },
    ],
    sources: [
      { name: 'Kalundborg Kommune - Budgetoplæg 2025', type: 'budget', url: '#budget-2025-oplaeg', confidence: 0.94 },
      { name: 'KL - Økonomiaftale 2025', type: 'rapport', url: 'https://www.kl.dk/okonomi-og-administration/', confidence: 0.92 },
      { name: 'Finansministeriet - Bloktilskudsberegning 2025', type: 'rapport', url: 'https://www.fm.dk/', confidence: 0.90 },
    ],
    followUpQuestions: [
      'Hvilke effektiviseringer er realistiske?',
      'Kan vi hæve skatten for at dække ubalancen?',
      'Hvad er konsekvenserne af at lukke en daginstitution?',
      'Hvordan prioriterer andre kommuner budget 2025?',
    ],
    insights: [
      'Budget 2025 har en nettoubalance på ca. 27 mio. kr. efter kendte finansieringskilder.',
      'Demografi er den største enkeltstående kostdriver med +55 mio. kr. - primært drevet af ældreområdet.',
      'Investering i velfærdsteknologi (10 mio. kr.) er den mest rentable strategi med 12 mio. kr./år i besparelse fra 2026.',
    ],
  },
];

/**
 * Finder det mest relevante mock-svar baseret på keyword-matching.
 * Returnerer null hvis intet match med tilstrækkelig score.
 *
 * @param {string} question - Brugerens spørgsmål
 * @param {number} threshold - Minimum match-score (0-1) for at returnere et svar
 * @returns {object|null} Mock-svar objekt eller null
 */
export function findMockResponse(question, threshold = 0.2) {
  if (!question || typeof question !== 'string') return null;

  const normalizedQuestion = question.toLowerCase().trim();

  let bestMatch = null;
  let bestScore = 0;

  for (const response of MOCK_RESPONSES) {
    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of response.keywords) {
      if (normalizedQuestion.includes(keyword.toLowerCase())) {
        matchedKeywords++;
        // Længere keywords giver højere score (mere specifikt match)
        score += keyword.length / 10;
      }
    }

    // Normaliser score baseret på antal keywords
    if (response.keywords.length > 0) {
      score = (score * matchedKeywords) / response.keywords.length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = response;
    }
  }

  return bestScore >= threshold ? bestMatch : null;
}

/**
 * Returnerer alle tilgængelige mock-spørgsmål til UI-visning.
 */
export function getAvailableQuestions() {
  return MOCK_RESPONSES.map((r) => ({
    id: r.id,
    query: r.query,
  }));
}

export { MOCK_RESPONSES };
export default MOCK_RESPONSES;
