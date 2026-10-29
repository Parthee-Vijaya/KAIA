# Flerårsprognoser i K.A.I.A.

Alle kommunale beløb, aktivitetsmål, elevtal og fremtidige budgetter er **simulerede**. Standardversionen `KAIA-DEMO-2026.09-v4` har 1.245.024 posteringer og 1.742 dokumenter fra 2020–2032 med reference 30. september 2026. Flerårsberegningen er et reproducerbart demonstrationsforløb. Den er ikke en prognose for Kalundborg Kommunes faktiske økonomi.

## Beregningsgrundlag

`applyMultiYearProjection(base, dataset, access, endYear)` i `src/domain/projections.ts` bruger analysens eksisterende enheder og område. Adgang kontrolleres igen på serveren. Funktionen udvider aldrig enhedsscope. Kommunalbestyrelsesmedlemmer får kun årsaggregater for hele deres tilladte område, uden posteringers ID'er, navngivne enhedssammenligninger eller kategorifordeling.

Slutåret skal være et heltal fra dataversionens referenceår til og med 2032. Hver figur starter i referenceåret og viser hele kalenderår. Ved standardreference 30. september 2026 består 2026 af realiseret januar–september og prognose oktober–december. Årene efter referenceåret har ingen realiserede tal. Budget og årsprognose er separate serier; de lægges ikke sammen.

Budget og basis læses direkte fra de versionerede posteringer. Der foretages ingen ekstra ekstrapolation oven på datageneratorens fremtidige beløb. Kategoriernes beløbsændringer beregnes fra ledgeren. Energifakturaernes mængde og mængdevægtede enhedspris beskrives, når alle relevante fakturaer har et afstemt pris- og mængdegrundlag. Beløbsændringer i øvrige kategorier dokumenterer ikke en bestemt pris- eller aktivitetsårsag.

Der kræves budget og det relevante actual/forecast-grundlag for hver valgt enhed og hver af årets tolv måneder, med samme kontokategorier på begge sider. Et ældre gemt snapshot kan mangle de nye prognoseår. Det giver en tydelig besked om manglende grundlag, ingen nul-graf og et forslag om en ny analyse på det aktuelle snapshot. Gamle samtalers dataversion ændres ikke.

## Følsomhedsspænd

Lavt, basis og højt er tre tydeligt forklarede demonstrationsforløb. Lavt og højt ændrer kun fremtidige udgiftsposter; allerede realiserede poster og indtægter bevares.

For en fremtidig udgiftspost i år `y`, referenceår `r` og basisbeløb `b` i øre:

```text
lav post = afrund_øre(b × (99/100)^(y − r + 1))
høj post = afrund_øre(b × (101/100)^(y − r + 1))
```

Den eksplicitte antagelse er **±1 % ekstra årlig multiplikativ følsomhed** omkring det eksisterende basisforløb, kumuleret. Det er ikke præcis ±1 procentpoint oven i generatorens kategorivise vækstrater. Hvis et basisforløb eksempelvis vokser med 3,1 %, bliver næste års lave/høje vækst `(1,031 × 0,99 − 1)` / `(1,031 × 1,01 − 1)`, altså 2,069 % / 4,131 %, før eventuelle andre modelændringer. I referenceåret påvirkes kun måneder efter referencedatoen én gang. Året derefter har to trin; efterfølgende år ét ekstra trin hver. Beløb beregnes som heltalsbrøker med `BigInt`, afrundes pr. post til nærmeste øre og summeres præcist. Den lave og høje samlede nettoudgift sorteres, så korrektioner med negativt fortegn ikke vender intervallets etiketter om.

Dette spænd er **ikke** et statistisk konfidensinterval, en sandsynlighedsfordeling eller en certificeret prognose. Det tilføjer en synlig, fast følsomhedsantagelse til et i forvejen simuleret basisforløb. Energimetricens spænd påvirker alene energiposter.

## Nøgletal og fortegn

- `net`: alle udgifter plus negativt bogførte indtægter inden for den samme afgrænsning.
- `energy`: alene energikategorien; øvrige kategorier indgår ikke.
- `perPupil`: hvert års netto divideret med samme års syntetiske elevtal fra `pupilsForYear` for præcis de valgte skoler. Resultatet afrundes til øre pr. elev. Udviklingen i elevtal giver ingen automatisk proportional ændring i faste udgifter.
- `perCapita`: giver en forklaring om manglende grundlag, indtil der findes en befolkningsserie knyttet til præcis den forespurgte organisatoriske afgrænsning. Et enkelt fagområde sidestilles ikke med kommunens samlede befolkning.

Samlet vækst beregnes som `(årets nøgletal − referenceårets nøgletal) / abs(referenceårets nøgletal) × 100`. Ved nul i referenceåret er procenten ikke defineret og vises ikke som nul. Årlige vækstrater findes tilsvarende i figurens dataobjekt.

## Figur, tabel og evidens

Diagrammet viser helårsbudget, basis, lavt og højt. Prognose- og følsomhedsserier er stiplede. Data er heltalsøre; den fælles diagramkomponent viser kroner, eller kroner pr. elev som angivet i figurteksten. Det samme analyseobjekt leverer svar, nøgletal, diagram og eksport.

Hver årsrække indeholder også realiseret del, prognosedel, antal realiserede/prognosticerede måneder, årlig vækst og samlet vækst. Fremtidige realiserede værdier er `null`, aldrig et opdigtet nulforbrug. Den eksisterende diagramtabel og CSV viser de fire tegnede serier; øvrige felter findes i analyseobjektet og den læsbare beregningskilde.

Den nye `DEMO-CALC-PROJECTION-*`-kilde fastholder dataversion, seed, reference, afgrænsning, udtræksmetode, fortegn, alle års fulde beløb og følsomhedsformel. For pr. elev bevares også det samlede kronegrundlag og årets nævner. En detaljeret bruger får højst ti eksempel-ID'er; metoden beskriver det fulde udtræk. Council får kun aggregater og ingen række-ID'er. Officielle navnekilder bruges ikke som belæg for økonomital.

## Kontroller

`tests/projections.test.ts` bruger databasefrie fixtures. Testene kontrollerer præcise ørebeløb, periodevalg, manglende år og måneder, uændrede realiserede poster, følsomhed alene på fremtidige udgifter, uændrede indtægter, energiudsnit, årlige elevnævnere, rolle/enhedsscope, Council-aggregater, versionskonsistens og reproducerbarhed. Reelle model- eller databaseintegrationer indgår ikke i disse tests.
