# Redigerbare antagelser i Vis data

Åbn **Vis data** på et gemt svar. Relevante tal kan ændres med sliders eller et præcist talfelt. Graf, nøgletal, beregningsregler og kilder opdateres fra samme serverberegnede forhåndsvisning. Efter en kort pause formulerer den aktive udbyder en ny forklaring som en rigtig tekststream. Med den private Corti-tildeling bruges Corti; almindelige demobesøgende bruger stadig Demo uden modelkald. Dashboardets midlertidige beregningskort bevarer deres eksisterende visning og energikontrol; editoren er knyttet til ejede, gemte svar.

Forhåndsvisningen gemmer ikke en ny samtale, indsigt eller et scenarie og overskriver ikke det valgte svar. **Nulstil** genskaber det valgte svar uden modelkald. Lukning, nulstilling og nye ændringer annullerer en igangværende forklaring. Ved fejl kan beregningen eller forklaringen forsøges igen hver for sig.

## Beregningskontrakt

- Basis er præcis den ejede `analysisId`, der blev åbnet, også når samtalen indeholder nyere svar. Dataversion, område, enheder og referenceperiode afledes på serveren.
- `POST /api/analysis-adjustments` har `describe`, `preview` og `explain`. Klienten sender kun analyse-ID og værdier til serverafledte felter. Labels, feltstier, rolle, scope, model og kildeobjekter kan ikke vælges af klienten.
- `describe` læser ejerskab og snapshotmetadata uden posteringer eller modelkald. `preview` genberegner ud fra det uændrede basissnapshot og de aktuelle værdier. `explain` foretager samme beregning igen og sender et begrænset, serverformateret før/efter-grundlag til ét afsluttende modelkald. Der bruges ingen modelplanlægger ved sliderændringer.
- Beregninger bruger de eksisterende deterministiske økonomi- og illustrationsmodeller med øre, tusindedele, basispoint og BigInt, hvor det er relevant. Modellen skal forklare resultaterne og udfører ingen økonomiberegning.
- Gamle og nye kilder har særskilte reference-ID'er. En kilde til det gamle scenarie fremstilles ikke som belæg for en ny antagelse. Kun det aktuelt accepterede beregningsobjekt leverer graf, tal og forklaringens citationsmapping.
- En kort debounce begrænser beregninger; forklaringen starter efter cirka ét sekund uden ændringer. Sekvensnumre og previewfingerprint afviser forældede svar, også ved A→B→A. Den gamle forklaring fjernes straks ved en ændring.

## Felter og betydning

Økonomiske scenarier kan justere energi, løn, vikarforbrug, elevaktivitet, vedligehold og budgetramme. Kun de påvirkede poster ændres. Resterende prognosemåneder holdes adskilt fra illustrativ helårsvirkning. Elevaktivitet ændrer kun den eksisterende variable omkostningsandel; budgetrammen ændrer ikke automatisk forbruget.

Almindelige budget-, prognose- og sammenligningssvar kan undersøges som et nyt nulscenarie med samme enheder og dataversion. Scenariets figur viser nettotaler og en særskilt helårsbaseline. Den oprindelige references måneder og eventuelle udgift pr. elev må ikke sammenlignes direkte med dette helårsbeløb. Kortet og modellens grundlag gør denne forskel tydelig. Scenarieeffekten kommer altid fra den nye beregnings egen baseline og ændring.

Investeringsillustrationer kan justere tidshorisont, mængdefaktorer, enhedsværdi og kontant realiseringsandel. Kapacitetsværdi og frigjorte timer er stadig ikke automatisk kontante besparelser. Aktivitetsillustrationer kan justere startniveau, årlig ændring og tidshorisont. Kvalitative procesdiagrammer og svar uden et relevant talgrundlag får ingen opdigtede numeriske kontroller.

## Adgang og drift

Alle tre operationer kontrollerer session, ejerskab, aktuelt enhedsscope og dataversion. Posteringer indlæses kun ved økonomiske scenarier. Preview er begrænset af serverens previewbudget; forklaringer bruger det almindelige analysebudget og den samme private live-tildeling, døgnkvote og samtidighedslease som chatten. Offentlig Demo giver ingen adgang til den private Corti-forbindelse.

Migration **`0006_explanation_requests.sql` skal anvendes før den nye backendkode**. Den tilføjer opgavetypen `explanation` til den eksisterende ejerbundne annulleringskontrol. En afsluttet forklaring gemmer intet analysesnapshot; en almindelig afsluttet analyse skal fortsat have et analyse-ID. Migrationen er idempotent og ændrer ikke datasnapshot eller gemte analyser. Der kræves intet nyt seed og ingen nye credentials.

Hybriddriften bruger den eksisterende Vercel-gateway og lokale backend. Ingen database- eller providerhemmeligheder sendes til klienten. Kortvarige forhåndsvisninger kan forsvinde ved reload; det oprindelige gemte svar består.

## Verifikation

**910/910 tests i 43 filer**, typecheck, lint, formatering og produktionsbuild er bestået med Node 24 og `KAIA_DB_TEST=1`. De nye prøver omfatter deterministisk økonomi og illustrationer, før/efter-kilder, API-adgang, stale svar og netværksbrud, debounce, reset, StrictMode og annulleringskontrakter. Tolv nye prøver bruger rigtig lokal Postgres og kontrollerer opgavetype, ejerskab, replay, pre-cancel, samtidige Stop/completion samt databasekravet om, at kun forklaringsopgaver kan afsluttes uden et analysesnapshot.

Når to scenarier har samme helårsbaseline og virkningsperiode, leverer serveren desuden forskellen mellem det valgte og det justerede scenarie. Eksempelvis er effekten af 15→25 % noget andet end den samlede virkning af 0→25 %. Grundlaget og prompten skelner disse beløb; ellers kan modellen kun beskrive den nye beregnings egen baseline og effekt.

Den lokale browserprøve ændrede energiprisen fra 15 til 25 % og viste 1.845.536,03 kr. i effekt mod samme helårsbaseline. Decimalværdi, tastaturbetjening og nulstilling til det oprindelige 15 %-scenarie blev også prøvet. Dette er en lokal Demo-prøve og et fixture-/database-testresultat; den faktiske Corti- og publiceringsprøve beskrives nedenfor.

### Publiceret og afprøvet gennem Vercel · 21. oktober 2026

Kode `72d7a8e116ecfc146c070c2f4e9ee6ed4b0d0699`, lokal backendrelease `1792611563503` og Vercel `dpl_4ZTALxcYT53TnrshC1hP4yDpRoRW` er publiceret. Vercels eget produktionsbuild blev READY, stage-sessionen svarede klar, og `kaia-sand.vercel.app` blev verificeret til denne deployment efter promotion. Migration 0006 blev anvendt eksplicit i både udviklings- og produktionsdatabasen. Dataversion v4, providerkonfiguration, Postgres-processer og tunnel blev bevaret; der blev ikke kørt seed.

Den eksisterende, privat godkendte browseridentitet gennemførte **seks faktiske Corti-forklaringer** på `corti-s1-instant` og afbrød én igangværende forklaring ved en ny sliderændring:

- Energi 15→25 %: helårsbaseline 321.829.076,34 kr., nyt scenarie 323.674.612,37 kr., samlet virkning 1.845.536,03 kr. og justering mod det valgte 15 %-scenarie 738.214,70 kr. Corti skelnede de to virkninger korrekt.
- Hurtige skift fra 25 % via skyderens grænser tilbage til 25 % fjernede den gamle forklaring straks og gav én afsluttet forklaring til det sidste valg. Streamstatus blev observeret under en efterfølgende ændring til 20 %.
- Et svar ved 23 % blev afbrudt under streaming af en ændring til 22 %. Den nye tekst og figur brugte 22 %, det tidligere job blev `cancelled`, og den nye forklaring afsluttede uden resterende live-job.
- Nulstil genskabte 15 %-scenariet og de oprindelige fire kilder. Den private live-tæller var 23 både før og efter nulstilling; åbning af panelet og reload brugte heller ingen modelkald.
- En tidligere gemt investeringsindsigt med 10 minutter pr. uge blev justeret til 20 minutter, selv om samtalen senere indeholdt et procesdiagram. Den nye model gav 1.533,333 timer og 536.666,67 kr. årlig kapacitetsværdi mod det valgte snapshots 766,667 timer og 268.333,33 kr. Kontant effekt var fortsat 0 kr. Den gamle beregningskilde blev åbnet og viste det rigtige 10-minuttersgrundlag.
- Efter alle previewprøver og reload var de **17 gemte analyser og to indsigtssnapshots byte-identiske** med kontrollen før arbejdet. Seks explanation-jobs var `completed`, ét var `cancelled`, ingen havde et analyse-ID, og ingen kørte videre. Den private døgnmåler steg fra 18 til 25, svarende til de seks afsluttede og den afbrudte forklaringsanmodning.

En separat offentlig prøve med friske normale demobesøg bestod **97/97 API-kontroller**. Den kontrollerede blandt andet Demo-isolation, sliderberegning, uændrede realiserede måneder, diagramafstemning, streamens ephemeral-identitet, ingen ekstra samtaler, uændret eksport, ukendte felter, ugyldige værdier, forkert origin, pre-cancel og andre besøgendes manglende adgang. Der blev ikke foretaget betalte modelkald i denne prøve; testbesøgene blev logget ud. To første probeversioner havde fejl i selve testforventningen (JSON-nøglerækkefølge og ugyldig felttype) og er bevaret særskilt; applikationskoden blev ikke ændret for at få prøven grøn.

Layoutet blev visuelt gennemgået ved normal laptopstørrelse, 768 × 1024 og 1440 × 1000. Tabletprøven målte 753 CSS-pixel i både indholds- og viewportbredde og 686 pixel i både dialogens indre bredde og scrollbredde, uden vandret overflow. Kontrollerne blev vist i to kolonner over grafen. Den midlertidige viewport blev nulstillet. Browserens warn/error-log var tom ved slutkontrollen, og der var præcis én **Simulerede data**-markering.

Eksakt søgning efter de private credentialværdier i alle 20 ændrede opgavefiler og 11 klientchunks gav ingen træffere. Sanitiseret evidens ligger i chatmappens `artifacts/kaia-assumption-sliders/`: `production-migration.json`, `public-demo-isolation.json`, `live-checkpoints.json`, `persistence-readback.json` og `secrets-scan.json`. Billeder: `live-energy-assumptions.jpg`, `corti-streaming.jpg` og `assumptions-ipad.jpg`.

Dette verificerer den konkrete private Corti-/hybridforbindelse og den offentlige Demo-isolation. Entra, Corti OAuth og de øvrige modeludbydere er ikke integrationsafprøvet i denne udvidelse. Modelteksten kan variere; graf, tal, formler og kildeuddrag er fortsat det autoritative beregningsgrundlag.
