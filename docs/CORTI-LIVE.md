# Corti-live med demodata

Den konkrete forbindelse er `corti-s1-instant` på `https://ai.fr.corti.app/v1`, API-key-autentifikation og højst 2.400 outputtokens pr. modelkald. Det er en S1-model med hurtig streaming. API-nøglen ligger krypteret med AES-256-GCM i den lokale produktionsdatabase; krypteringsnøglen ligger i backendens private miljø. Ingen Corti-credentials er lagt på Vercel, i frontendkode, Git eller denne vejledning. De modtagne client-credentials bruges ikke i den valgte API-key-forbindelse; FR OAuth er ikke integrationsafprøvet.

## Adgang

Almindelig offentlig demologin giver fortsat Demo uden modelkald. En særskilt privat servertildeling giver én eksisterende besøgsidentitet Corti-adgang. Identiteten blev fundet gennem dens eget åbne analysesnapshot og kontrolleret mod den aktive session i databasen. Tildelingen baseres ikke på profilnavn, stilling eller et klientindsendt rollefelt. Rolle, enhedsscope, samtaleejerskab og dokumentadgang gælder fortsat.

Tildelingen gemmes i Postgres som `live-grant:<ownerId>` og bindes til den testede models konfigurationsfingerprint. En ændret nøgle/model kræver ny test og tildeling. Den gælder højst 30 dage, med højst 60 liveforespørgsler pr. UTC-døgn og ét samtidigt svar. Den eksisterende grænse på 60 analyser pr. time gælder også. Kvote og lease håndhæves atomisk i databasen på tværs af processer. Fejlede forespørgsler tæller med; genstart nulstiller ikke kvoten. En afbrudt proces efterlader højst en kort, udløbende lease.

Den aktive demologin skal bevares i den pågældende browser. En demologin varer otte timer; logud, udløb eller et nyt login opretter en anden besøgsidentitet, som ikke arver den private tildeling. Andre personer, der vælger “Parthee”, får fortsat hver deres private Demo. Det globale providervalg er ikke ændret af tildelingen.

Privat driftskommando, efter en rigtig forbindelsestest:

```sh
node --env-file=/private/path/backend.env node_modules/tsx/dist/cli.mjs \
  scripts/grant-live.ts --owner-file /private/path/owner.json \
  --provider corti --days 30 --daily-limit 60
```

Ejerfilens format er `{"ownerId":"demo:<eksisterende UUID>"}`. Brug den verificerede serveridentitet; filen indeholder ingen login-cookie. Kommandoen printer kun status, udbyder, udløb og grænse. Der findes ingen offentlig HTTP-rute til at udstede tildelinger. `revokeLiveAccessForOwner` kan tilbagekalde adgangen og annullere igangværende forespørgsler fra den samme identitet.

## Fra frit spørgsmål til svar

1. Serveren validerer session, tildeling, kvote, versionsbinding og spørgsmålets størrelse. En ejerbundet request starter, så Stop også gælder under planlægningen.
2. Corti får tilladte enhedsnavne/ID'er, analysekapabiliteter, snapshotreference og tilladt tidligere kontekst. Ét `select_analysis_plan`-værktøj vælger en typet afgrænsning. Modellen får ikke rå posteringer, credentials, andre brugeres samtaler eller mulighed for at vælge roller.
3. Serveren kontrollerer planens enheder, periode, metric og scenarie mod adgangspolitikken. CPR/individuelle borgersager og faktiske kommunale økonomital kan ikke åbnes gennem en modelplan. Nye problemstillinger kan blive en illustration med afgrænsede, eksplicitte modelantagelser.
4. Eksisterende analyser henter autoriserede databaseudsnit og beregner tal, nøgletal, diagram og kildeobjekter med samme deterministiske økonomikode som Demo. Illustrationer bruger deres eget validerede antagelsesgrundlag og får særskilte antagelses- og beregningskilder; de får ingen opdigtede referencer til posteringer. Kvalitative spørgsmål kan få et procesdiagram uden økonomiske måltal.
5. Corti får et begrænset beregningsgrundlag, serverformaterede værdier og nummererede kildeuddrag og streamer sin danske formulering. Der er højst to modelkald: plan og svar. Modellen får ingen SQL-/shelladgang og skal ikke beregne nye tal.
6. Svar, dataversion, kildeobjekter og `formulation: {provider, model}` gemmes i samme ejede analyse. **Vis data**, diagram, tabel og eksport følger dette objekt. `[1]`-henvisninger i live-teksten kan åbnes som de øvrige kildeknapper. Stop bruger den vedvarende annulleringskontrol og kan forhindre lagring gennem den offentlige gateway.

Prøv eksempelvis:

- “Kan du vise forskellen i udgift pr. elev mellem Høng Skole og Svebølle Skole sidste år?”
- “Sammenlign samme måneder i år med sidste år.”
- “Hvad betyder det for skoleområdet, hvis energi bliver 15 procent dyrere resten af 2026?”
- “Lav en kort forklaring til udvalget med kilder.”
- “Illustrér en AI-investering på 750.000 kr. og 120.000 kr. årligt over fem år med 100 medarbejdere, 15 minutter om ugen og 350 kr. i timeværdi.”
- “Hvad hvis vi ændrer det til 20 minutter om ugen?”
- “Hvordan kan vi arbejde med bedre trivsel i skolerne?”

Illustrationens antagelser er et udkast, også når modellen fortolker tal fra spørgsmålet. De er ikke observationer fra kommunens datasæt. Investeringsmodellen skelner mellem kontante effekter og kapacitetsværdi; frigivet arbejdstid bliver ikke automatisk en budgetbesparelse. Beregningen bruger heltal/BigInt og højst 20 år frem til senest 2050. Aktivitet fremskrives med en eksplicit årlig ændring. **Vis data** viser antagelser, formel og resultater. Illustrationens specifikation og beregningsresultater gemmes i analyseobjektet og genåbnes med samtalen. En kort opfølgning sender den ejede, tidligere specifikation til planlæggeren og beregner et nyt snapshot. Den nøglefrie Demo kan også vælge forberedte, tematiske illustrationer gennem en deterministisk fortolker. Cortis frie planlægning og liveformulering kræver fortsat den private live-tildeling. Se [plausible svar og deres beregningsgrundlag](PLAUSIBLE-ANSWERS.md).

Modelværktøjet bruger almindelige antal, kroner og procenter. Serveren konverterer dem til den interne repræsentation med tusindedele, øre og basispoint; modellen skal ikke selv udføre denne skalering. Det samme gælder, når et tidligere illustrationssnapshot sendes tilbage som kontekst. Antagelser uden for præcision eller grænser afvises. Ufuldstændig JSON repareres ikke automatisk og fremstilles ikke som et vellykket svar.

“Simulerede data” står fortsat én gang nederst i hjørnet. Providerstatus viser Corti for den godkendte identitet og Demo for øvrige besøgende. En tidligere gemt Demo-analyse bevarer sin oprindelige formuleringstilstand.

## Verifikation 21. oktober 2026

- Den dokumenterede EU-host afviste den konkrete nøgle med 401. Den konkrete FR-host blev verificeret med DNS/TLS og modelkatalog. FR-katalogets HTTP 200 alene er ikke et credentialbevis, da kataloget også svarer uden nøgle.
- En rigtig `corti-s1-instant`-stream på FR svarede HTTP 200 med 56 tekstframes på cirka 2,15 sekunder.
- Applikationens rigtige `testProvider` bestod værktøjskald, indsendelse af værktøjsresultat, streaming og modeloversigt på 2.535 ms. Teststatus er knyttet til den gemte forbindelsesfingerprint.
- Den semantiske Corti-prøve ovenfor valgte `school-hoeng` og `school-sveboelle`, 2025 og `comparison/perPupil` på 2.764 ms, selvom standardfilteret stod på 2026. Serverberegningen gav to diagramrækker fra v4. Prøven gemte ingen analyse.

Efter den sidste periodekontrol er **668/668 tests i 32 filer** bestået med `KAIA_DB_TEST=1`. Det omfatter 47 plannerprøver, 13 reelle live-grant-prøver og 14 reelle Stop-/lagringsprøver i lokal Postgres. Grantprøverne fandt og verificerede rettelsen af JSON-serialisering, som ellers fik tildelingen til at falde sikkert tilbage til Demo. De dækker samtidighed, kvote, tilbagekaldelse, ejerskab og oprydning uden resterende fixturedata. Forecast kræver hele kalenderåret; en ugyldig historisk trend giver 422 frem for et tomt nulresultat.

Typecheck, lint, formatering og Node 24-produktionsbuild er bestået. En eksakt credentialsøgning i alle 23 staged filer gav ingen træffere. Den private produktionsgrant er genoprettet og kontrolleret som JSON-objekt; den vælger testet Corti, mens den globale standard stadig er Demo. Offentlige metadata indeholder ingen secrets eller endpoints for besøgende.

## Offentlig publicering og ende-til-ende-prøve

Kode `5d032178aa01a7d3a6d8a869e1e652ad0a3e29ee`, lokal backendrelease `1792606969082` (proces 35181 ved kontrollen) og Vercel `dpl_2jTYcDQa3fYWc6jRfUauXg5F2z1k` er publiceret. Vercel gennemførte eget produktionsbuild og stage-sessionen var klar. Efter promotion blev `kaia-sand.vercel.app` verificeret til denne deployment. Postgres og tunnel blev ikke genstartet; konfiguration og tildeling blev bevaret. Ingen ny datamigration eller seed var nødvendig.

I den eksisterende, privat godkendte browserprofil er tre **rigtige Corti-svar gennem Vercel** gennemført og kontrolleret mod de ejede, gemte analyseobjekter:

- Frit spørgsmål om Høng og Svebølle sidste år gav 2025, to skoler og udgift pr. elev. Corti viste 76.770,97 og 76.598,37 kr./elev samt den serverberegnede forskel 172,60 kr./elev. En faktisk deltekst med skrivemarkør blev observeret og fotograferet, før slutresultatet kom.
- “Vis de samme to skoler for januar til september 2026” bevarede de to enheder og metric, ændrede perioden korrekt og viste den serverberegnede forskel 154,57 kr./elev. Kildehenvisningerne i begge gemte modeltekster var gyldige.
- Energi +15 % for alle 16 skoler resten af 2026 gav baseline 321.829.076,34 kr., ændring 1.107.321,33 kr. og scenarie 322.936.397,67 kr. Modelteksten, beregningspanelet og den gemte graf havde samme værdier. Summen af figurens 12 måneder blev kontrolleret med BigInt; januar–september var uændret, og kun de tre forventede måneder ændredes.

En privat Corti-forespørgsel blev stoppet under planlægningen med bekræftelse fra serveren. Ejerens antal analyser var 12 både før og efter, den seneste request var `cancelled`, og live-leasen var frigivet. Enter genafsendte med et nyt request-ID og gav det færdige energiscenarie ovenfor. Efter reload var alle tre live-formuleringer og Corti-status bevaret. En `[1]`-knap i den genåbnede Corti-tekst åbnede den rigtige 2025-kilde med de to skoler og samme dataversion. Browseren havde én datamarkering og ingen warn/error ved kontrollen.

Separat offentlig isolationsprøve med friske, almindelige demobesøgende: **38/38 kontroller over 30 faktiske HTTP-kald**. En ny “Parthee”/Executive så kun Demo og fik et Demo-svar uden Corti- eller privat endpointmetadata. Streaming, Stop uden ekstra lagring, ejerskab, scope, adminafvisning og anonym adgang blev kontrolleret. Præcis én QA-analyse blev gemt; begge testbesøgenes sessioner blev logget ud. Dette er en Demo-isolationsprøve, mens de tre private browserforløb ovenfor er de credentialsbaserede Corti-prøver.

Den færdige lokale klientbuild blev desuden søgt igennem efter de konkrete Corti-hemmeligheder: ingen træffere i 11 JavaScript-/JSON-/map-chunks. Sanitiserede integrationsrapporter ligger i chatmappens `artifacts/kaia-corti-live/`: `provider-connection.json`, `semantic-plan.json`, `private-grant.json`, `saved-live-answers.json`, `private-live-stop.json`, `live-scenario.json` og `public-demo-isolation.json`. Billeder: `streaming-corti-live.jpg` og `corti-live-answer.jpg`. Rapporterne indeholder ingen credentials, login-cookies eller ejeridentiteter.

Der påstås ingen rigtig Entra-tenantprøve, FR OAuth-prøve eller integrationsprøve med de tre andre modeludbydere. En model kan stadig formulere en faglig vurdering uhensigtsmæssigt; højere udgift er eksempelvis ikke i sig selv et kvalitetsmål. Beregninger og belæg kan kontrolleres i **Vis data**.

Officielle referencepunkter: [Corti Models quickstart](https://docs.corti.ai/models/quickstart), [miljøer og tenants](https://docs.corti.ai/authentication/environments_tenants), [Chat Completions](https://docs.corti.ai/api-reference/corti-models/chat/create-chat-completion). De offentlige Models-regionssider angiver EU/USA; FR er her verificeret som en konkret forbindelse.

## Åbne illustrationer · 21. oktober 2026

Illustrationers område, institutioner og referenceperiode bindes af serveren til den validerede, aktuelle udvælgelse og den ejede samtale. Modellen skal kun foreslå antagelserne. En eventuelt medsendt modelkontekst valideres før den ignoreres; den kan ikke vælge et tilfældigt smallere område eller udvide adgang. Gyldige, bløde semantiske begrænsninger kan give et generelt procesforslag. Ugyldige modelplaner, netværksfejl og manglende adgang bliver fortsat fejl.

**784/784 tests i 37 filer** er bestået med `KAIA_DB_TEST=1`, herunder en rigtig PostgreSQL-prøve af illustrationens gemte specifikation, beregning, graf, kilder, genåbning, ejerskab og tilbagekaldt enhedsscope. Typecheck, lint, formatering og Node 24-produktionsbuild er bestået. Fixtures dækker de nye modeller, decimalomregning, fejlgrænser, serverbestemt scope, opfølgninger, kildeproveniens, flowdiagrammer og enheder samt CSV-formelinjektion og korrekt øre/krone-konvertering.

Fire nye **credentialsbaserede Corti-planprøver** er bestået mod den eksisterende private forbindelse og produktionssnapshot v4. De bruger normal live-kvote/lease og gemmer ingen analyser:

- AI-investering: 750.000 kr. i opstart og 120.000 kr. i årlig drift over fem år. 100 medarbejdere × 15 minutter × 46 uger / 60 giver 1.150 timer og 402.500 kr. årlig kapacitetsværdi ved 350 kr./time; kontant effekt er 0 kr.
- Opfølgning til 20 minutter bevarer de øvrige forudsætninger og giver 1.533,333 timer og 536.666,67 kr. kapacitetsværdi. Pengeværdien beregnes fra det uafrundede mængdeprodukt.
- 24.000 hjemmeplejebesøg med 2 % årlig vækst giver en beregnet femårsserie med enheden besøg.
- Et åbent spørgsmål om skoletrivsel giver et kvalitativt flowdiagram uden opdigtede økonomiske måltal.

De første integrationsforsøg afslørede en ugyldig indlejret JSON-streng, forkert modelbaseret milli-skalering og et overflødigt periodefelt. Det førte til den naturlige talkontrakt og serverbestemt illustrationsscope ovenfor. Ugyldig JSON blev ikke repareret til en succes. Den endelige rapport ligger i chatmappens `artifacts/kaia-corti-open-dialog/live-illustration-plans.json`; dette er reelle modelplanprøver med deterministisk efterberegning, ikke en påstand om en gennemført browserprøve.

Den første offentlige browserprøve gennemførte investering og 15→20-minutters opfølgning med korrekt gemte beregninger, figurer og kilder. Den fandt samtidig, at slutmodellen manglede det tidligere beregningsgrundlag og derfor kunne beskrive det tidligere minuttal forkert. Opfølgninger får nu den umiddelbart foregående ejede illustrations antagelser og serverformaterede resultater med særskilte, gemte kildehenvisninger. Tidligere modeltekst sendes ikke med. Scope og periode sammenlignes eksplicit; forskellige afgrænsninger må ikke præsenteres som en ren ændringseffekt. Der tilføjes højst to kilder fra den umiddelbare forgænger, så historikken ikke vokser rekursivt i modelinput.

Slutmodellen instrueres i korte svar og danske begreber. Brugerfladen håndterer enkel fremhævning og kildehenvisninger som React-tekst, uden at fortolke model-HTML eller vilkårlige links. Dobbelt punktum efter valuta normaliseres kun i visningen. Efter disse rettelser er **791/791 tests i 38 filer**, typecheck, lint, formatering og produktionsbuild bestået. Den første separate offentlige Demo-isolationsprøve bestod 64/64 kontroller; den udførte ingen betalte modelkald og berørte ikke den private Corti-session.

### Endelig offentlig kontrol

Applikationskode `1c372f9f2b54e77c2e4392f1791a002ba668cb58`, lokal backendrelease `1792609926482` og Vercel `dpl_7sFedtL4Hq8JPhaRE2RqKYo5PAdv` er publiceret. Vercel gennemførte eget build og svarede med en klar opsætningsstatus før promotion. `kaia-sand.vercel.app` blev derefter kontrolleret til denne deployment. Postgres, tunnel, datasnapshot og providerkonfiguration blev bevaret; ingen migration eller seed var nødvendig.

- Det efterfølgende rigtige Corti-svar skelnede korrekt mellem den tidligere 20-minutters model (1.533,333 timer og 536.666,67 kr. årlig kapacitetsværdi) og den nye 10-minutters model (766,667 timer og 268.333,33 kr.). Opstart, drift og kontant effekt var uændrede. Den gamle beregningskilde `[4]` blev åbnet i browseren og viste det tidligere 20-minutters grundlag.
- Et åbent trivselsspørgsmål gav et seks-trins procesdiagram uden økonomiske måltal. Diagrammets læsbare tabel kunne åbnes og lukkes. Begge nye svar blev genåbnet efter reload med Corti-model, graf og kildehenvisninger bevaret.
- Otte direkte læsekontroller af de ejede, faktisk gemte browserresultater bestod: antagelser, før/efter-tekst, BigInt-afstemning af grafens årsnetto og akkumulerede netto, kildeproveniens, gyldige henvisninger, uændret skoleafgrænsning samt gemt indsigt med samme specifikation, figur og fire gamle/nye kilder.
- Stop blev prøvet under en ny Corti-planlægning. Brugerfladen bekræftede annulleringen, antallet af gemte analyser var 17 både før og efter, requesten var `cancelled`, og live-leasen var frigivet.
- Den separate offentlige Demo-isolationsprøve blev kørt igen mod den endelige publicering: **64/64 HTTP-kontroller bestod**. Friske besøgende fik kun Demo; begge prøvesessioner blev logget ud.
- Procesdiagrammet blev visuelt gennemgået ved laptopbredde og 768 × 1024. Ved tabletprøven var både indholds- og viewportbredden 753 CSS-pixel uden vandret overflow. Den udvidede investeringsgraf viste korrekte danske tooltipværdier. Fire svar og én datamarkering var bevaret efter reload, og browserens warn/error-log var tom ved kontrollen.
- Eksakt søgning efter de private credentialværdier i alle ændrede opgavefiler og den færdige klientbuild gav ingen træffere: 41 filer, heraf 11 klientchunks. Ingen credentialværdier blev udskrevet.

Sanitiseret evidens i chatmappens `artifacts/kaia-corti-open-dialog/`: `live-illustration-plans.json`, `saved-browser-answers.json`, `live-stop.json`, `public-demo-isolation.json` og `secrets-scan.json`. Browserbilleder omfatter `live-investment-chart.jpg`, `final-calculation-basis.jpg` og `process-ipad.jpg`. Dette er konkrete Corti- og hybridprøver; Entra, FR OAuth og de øvrige modeludbydere er ikke integrationsafprøvet i denne udvidelse. Den private besøgsidentitet og dens udløb er fortsat beskrevet under Adgang.

## Livejusteringer i Vis data

Den efterfølgende publicering `72d7a8e116ecfc146c070c2f4e9ee6ed4b0d0699` tilføjer redigerbare antagelser i **Vis data** på gemte svar. Graf, tal og formler genberegnes på serveren; efter cirka ét sekund uden ændringer streamer Corti en forklaring med ét afsluttende modelkald. Preview gemmer ingen ny analyse og overskriver ikke det valgte svar. Nulstil og nye ændringer annullerer en igangværende forklaring gennem den samme vedvarende ejerbundne kontrol. Migration 0006 er nødvendig.

**910/910 tests**, seks faktiske Corti-forklaringer, én afbrudt liveforklaring og **97/97 offentlige API-kontroller** er gennemført. Gemte analyser og indsigter blev kontrolleret uændrede efter sliderprøver og reload. Den konkrete Vercel-publicering, beregningskontrakt, browserprøver og private kvotekontroller er dokumenteret i [LIVE-ASSUMPTIONS.md](LIVE-ASSUMPTIONS.md).

## Plausible eksempler i Demo og Corti · 21. oktober 2026

Den efterfølgende release `7819e96a101afdfe47a3663de45d67ede6347a76` giver også nøglefri Demo en deterministisk, tematisk illustrationsfortolker. Åbne kommunale spørgsmål kan blive konkrete regneeksempler, aktivitetsserier eller procesforslag med egne antagelseskilder. Kendte økonomianalyser bruger fortsat deres versionerede datasæt. Specifikke personalegrupper kan ikke få hele områdets nettobudget præsenteret som deres løn. Hårde adgangsafvisninger, ugyldige planer og providerfejl bliver fortsat fejl. Planfejl efter requeststart annullerer nu også requesten før oprydning.

**986/986 tests**, **149/149 offentlige Demo-kontroller**, tre faktiske Corti-svar og én liveforklaring efter ændring af antagelser er gennemført. Et nyt eksempel, opfølgning, kildevisning og genåbning er afprøvet i browseren. Alle tidligere private analysesnapshots og indsigter er uændrede. Kontrakt, konkret publicering og præcis evidens findes i [PLAUSIBLE-ANSWERS.md](PLAUSIBLE-ANSWERS.md).
