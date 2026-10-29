# Data, begreber og reproducerbare beregninger

Standarddemoen v4 er fuldt simuleret: **1.245.024 posteringer**, **1.742 dokumenter**, **40 registrerede drifts-/udvalgsenheder**, **52 demografiske kohorteobservationer**, **6 kommuner** og **16.506 separate kommunebenchmarkrækker**. Enhedsregisteret omfatter 16 skoler, 8 faciliteter, 9 organisationsenheder og 7 udvalg. Navne og kommunekoder er virkelige; alle økonomital, indbyggertal, elevtal, strukturtræk, dokumenter og beslutninger er fiktive. Navnekilder findes i [NAME-SOURCES.md](NAME-SOURCES.md) og [kommunebenchmarks](MUNICIPAL-BENCHMARKS.md).

## Snapshot og generator

`src/domain/data.ts` indeholder en ren `generateDataset(config)` og en procescache `getDataset()`. Cachen er en optimering for seed og lokale beregninger; Postgres er autoritativ i deployment. `npm run db:seed` indlæser generatorens output idempotent uden at slette brugerdata, adgang eller konfiguration.

Standardværdier:

| Felt      | Værdi                     | Miljøvariabel          |
| --------- | ------------------------- | ---------------------- |
| Version   | `KAIA-DEMO-2026.09-v4`    | `KAIA_DATASET_VERSION` |
| Seed      | `kaia-kalundborg-2026`    | `KAIA_DATASET_SEED`    |
| Reference | `2026-09-30`              | `KAIA_REFERENCE_DATE`  |
| Dækning   | Januar 2020–december 2032 | Fast for v4            |

Det samme seed, version og reference giver de samme rækker, dokumenter og tal. Seed styrer enheders variation i vikarer samt månedlige udsving. Dokumenternes beløb beregnes fra præcis de genererede rækker. Budgetter varierer med størrelse og år; energi har vintersæson, vedligehold sommersæson, og skoleaktivitet et lavere juliniveau. En synlig engangspost er modelleret på Rynkevangskolens vedligehold i august 2026. Seksten underposter pr. kategori, måned og serietype giver analysevolumen uden dublerede beløb. V4 har særskilte, illustrative årlige budgetvækstrater på 3,1 % for løn, 4,5 % for energi, 3,7 % for vikarer, 3,2 % for vedligehold, 2,2 % for aktivitet og 2,1 % for indtægter, samt syntetiske aktivitets- og fakturaforhold. Satserne er generatorantagelser, ikke officielle fremskrivninger.

Der findes budget og prognose for alle **156 måneder**. Regnskab findes alene til og med referenceårets referencemåned: 2020–2025 er afsluttede år, 2026 har januar–september realiseret, og oktober 2026–december 2032 har ingen realiserede tal. Årsprognose vælges måned for måned: faktisk regnskab til reference, derefter prognose. Afsluttede år bruger kun regnskab; fremtidige år kun prognose. Budget vises og beregnes som en særskilt serie. Der summeres aldrig regnskab og prognose for den samme måned. Ændres referencedatoen, ændres rækketallet; de angivne volumener gælder standardreferencen.

Årsdokumenterne dækker alle 13 år med fem dokumenttyper pr. fagområde og tre dokumenttyper pr. driftsenhed. Det giver `7 × 13 × 5 + 33 × 13 × 3 = 1.742` simulerede dokumenter. De ældre versioner v1–v3 beholder deres oprindelige 2023–2028-dækning og må ikke genfortolkes som v4; eksisterende analyser fastholder deres snapshot.

## Præcision og fortegn

Alle beløb lagres som heltal i **øre** og inden for JavaScripts sikre heltalsinterval. PostgreSQL bruger `bigint`; databaseadapteren skal oversætte til sikre heltal. Beløb afrundes først ved fordeling til underposter eller scenarieeffekter, og vises i danske kroner. Interne fordelinger bevarer totalen; energifakturaer er altid heltal kWh × heltal øre/kWh, med det deraf følgende eksplicit modellerede fakturabeløb.

Udgifter er positive. Indtægter er negative. Nettoudgift er summen af begge; nettoafvigelse er forbrug minus budget. Positiv afvigelse betyder et højere nettofinansieringsbehov. Indtægter vises særskilt, så et stigende indtægtsniveau ikke forveksles med større udgift. De fem udgiftskategorier er løn, energi, vikarer, vedligehold og aktivitet.

Periodiseret budget, forbrug og prognose sammenlignes for ens måneder. Udvikling over flere år bruger samme månedsspænd hvert år. Udgift pr. elev er periodens nettoudgift divideret med de samme skolers syntetiske elevtal i det pågældende år; det er ikke et kommunalt regnskabsnøgletal. Årsbudget og årsprognose er altid januar–december og mærkes som helår. Manglende regnskab i fremtidige måneder bliver ikke præsenteret som realiseret nulforbrug.

Flerårsprognosen viser referenceåret til det valgte slutår, højst 2032. Lavt og højt skalerer alene fremtidige udgiftsposter med henholdsvis `0,99^(år − referenceår + 1)` og `1,01^(år − referenceår + 1)`. Det er **±1 % ekstra årlig multiplikativ følsomhed** omkring basisforløbet. Det er ikke en ændring på præcis ±1 procentpoint i hver kategoris vækstrate og ikke et statistisk konfidensinterval. Realiserede tal og alle indtægter bevares. Se [den præcise formel](FORECASTS.md).

## Sammenligning mellem kommuner

Kalundborg, Odsherred, Holbæk, Slagelse, Sorø og Ringsted har officielle navne/koder, men alle seks kommuners økonomi og struktur i demoen er syntetisk. Kalundborgs månedlige områdeaggregater og nævnere kommer fra det samme kommunale simulerede datagrundlag; der genereres ikke en konkurrerende Kalundborgbaseline. Fem peers genererer 13.755 rækker, og 2.751 Kalundborgaggregater giver 16.506 benchmarkrækker i alt. Disse rækker tælles ikke med i de 1.245.024 institutionsposteringer.

Kommunesammenligningen kræver adgang til hele det analyserede fagområde og bruger samme år, måneder, nettodefinition og nævner. Skoleområdet normaliseres pr. elev; øvrige områder pr. indbygger. En enkelt skoles budget kan ikke sammenlignes med en hel peerkommunes skoleområde. Peerudvælgelsen vægter udelukkende simuleret befolkning, andel 65+, skolebørnsandel og landlighed; den er ingen virkelig kommunal rangering. Kilder til økonomiske udsagn er DEMO-beregningskilder og versionsbundne benchmarkrækker, aldrig navnekilderne. Se [MUNICIPAL-BENCHMARKS.md](MUNICIPAL-BENCHMARKS.md) for formler og proveniens.

## Analyse og kilder

`analyze(question, access, previous?, overrides?, dataset?)` bruger en deterministisk fortolker til enhedsaliaser, år/måneder/kvartaler, analyseform og opfølgning. Kontekst fastholder periode, scope og scenarie. Databaserouten kan levere et allerede adgangsfiltreret `Dataset`; motoren kontrollerer scope igen. Alle registermetadata bevares, så et udtrykkeligt spørgsmål om en forbudt enhed afvises, frem for at ændre spørgsmålet til en tilladt enhed.

Den fælles `Analysis` indeholder tal, kilder, diagramrækker, periode, dataversion, antagelser og opfølgninger. Tekst, tabel og figur kommer fra det samme beregningsobjekt. En beregningskilde indeholder filter, dækningsperiode, antal rækker, præcise aggregater og højst ti eksempelrække-ID'er. Det samlede beregningsresultat er også indlejret i kilden, så grafens og tekstens værdier kan efterprøves uden at sende alle posteringer til browseren. Officielle navne-URL'er er aldrig økonomisk belæg.

Dokument-ID'er starter med `DEMO-DOC-`. Dokumenter har simuleret status, periode, dokumentdato, klassifikation, enheder, relaterede dokumenter og faktareferencer. Søgning kombinerer tekst, år, emne og adgang; embeddings er ikke nødvendige. Områdedokumenter kræver adgang til alle berørte enheder; enkeltinstitutionsdokumenter gør afgrænsede scopes brugbare. Politiske roller får kun politisk klassificerede dokumenter og aggregerede resultater.

Alle påstande om årsager skelner mellem observerede regnskabsændringer, forklaringer i simulerede dokumenter og illustrative antagelser. Spørgsmål uden relevante data giver en forklaring og fungerende alternative spørgsmål.

## Scenarieformler

Otte forberedte scenarier ligger i `src/domain/questions.ts`. Scenarier kan kombineres, men hver kategori får kun én effekt. Ændringer valideres til −100–200 procent. Baseline bevares.

- Energi, løn, vikarer og vedligehold ændrer alene deres egen kontokategori: `effekt = afrund(postering × procent / 100)`.
- Elevtal ændrer alene 28 % af aktivitetsudgifterne: `effekt = afrund(aktivitetspostering × elevprocent / 100 × 0,28)`. Faste udgifter og løn ændres ikke automatisk.
- Budgetprocent ændrer budgetrammen separat. Den ændrer ikke forbruget. Nettoafvigelsen beregnes mod den nye ramme.
- **Resten af året** ændrer alene årets prognosemåneder efter reference. En afsluttet årsperiode har derfor nul resterende virkning.
- **Helår** er en illustrativ virkning på alle årets baselineposter. Historiske posteringer omskrives ikke.

Månedlige scenarier summerer præcis til årsresultatet. Gemte scenarier skal fastholde assumptions, context og datasetVersion fra analyseobjektet; de kan kun reproduceres mod samme snapshot.

## Pris, mængde og samspil

Den lokale energimodel bruger ét homogent kWh-produkt, ens momsgrundlag og matchede enhed/måned/underposter for to år. Hver lokal simuleret faktura er `udgift = pris × mængde`:

```
Priseffekt   = (P1 − P0) × Q0
Mængdeeffekt = (Q1 − Q0) × P0
Samspil      = (P1 − P0) × (Q1 − Q0)
Samlet ændring = P1 × Q1 − P0 × Q0
```

Bidragene afstemmer helt præcist i øre. Første datasætår mangler en foregående periode og giver en tydelig begrænsning. Eventuel uforklaret rest vises eksplicit. Den nuværende homogene fakturamodel har nul rest; andre udgifter ligger i andre kategorier og tilskrives ikke en energipriseffekt. Et eksternt prisindeks kan give kontekst, men er ikke bevis for en lokal kommunal årsag.

## Demografi

Det simulerede kontekstlag har fire aldersgrupper: 0–5, 6–16, 17–64 og 65+. Population, fødsler, dødsfald, indenlandsk nettoflytning, international nettovandring og aldersovergange ind/ud er adskilte felter. Kohortebestanden afstemmes præcist til sidste års bestand plus fødsler minus dødsfald plus de to nettovandringsbidrag plus aldersovergang ind minus aldersovergang ud. Aldersovergange mellem grupperne summerer til nul for hele befolkningen. Alle felter er simulerede.

Første økonomiske model er afgrænset til skoleområdet: procentændringen i 6–16-årige anvendes på 28 % af årets aktivitetsudgifter. Øvrige udgifter holdes faste; ingen skolelukning eller kapacitetsændring forudsættes. En antaget forsinkelse på ét budgetår og kapacitetsforhold omtales som usikkerheder, uden at påstå en automatisk proportional besparelse. Der beregnes ingen skat eller udligning i første version. Eksterne offentlige kontekstserier har deres egen status, kildemetadata og indlæsningskontrakt; standarddemoens kommunale og demografiske tal er fortsat simulerede.

## Målrettet verifikation

`tests/domain.test.ts` kontrollerer fuld reproducerbarhed, volumen, heltalsrepræsentation, referencegrænse, unikke posteringer, dokumentmærkning, rolle/enheds/områdescope, blandede dokumenters adgang, Council-klassifikation, ens perioder, elevnøgletal, graf/metric-afstemning, fire genveje pr. område, alle seks diagramtyper, søgning, scenarieafgrænsning, kombinationer, reset, helår/restår, eksakt pris/mængde-afstemning og demografiens faste udgifter. Testene omfatter også de egentlige demonstrationsspørgsmål (de to gemmeforløb testes i brugergrænsefladen), ukendte spørgsmål og eksplicit efterspurgte virkelige tal. `tests/projections.test.ts`, `tests/municipalities.test.ts` og `tests/comparisons.test.ts` kontrollerer henholdsvis flerårsberegninger, peergenerator/proveniens og ens afgrænsning ved års-/kommunesammenligning. Det er lokale beregninger og fixtures; det beviser ikke Entra-, provider- eller Vercel-integration. Historiske verifikationsrapporter beholder deres oprindelige dataversion og resultater.
