# Svaroplevelse og beregningsgrundlag · 21. oktober 2026

Brugeren har godkendt én datamarkering nederst i hjørnet, en synlig analyse-/streaminganimation og en grafisk forklaring under **Vis data**, inklusive prognoser og scenarier. Fremblik, logo, farvepalet, Geist og Phosphor-ikoner bevares.

## Faktisk implementering

- `DataStatusBadge` monteres én gang på login og én gang i arbejdsfladens respektive skærm. Faste databadges i header, skoleliste, budget, diagrammer og indstillinger er fjernet. Præsentationsfunktionen `displayText` fjerner gentagne datastatusfraser og kvalifikatorer fra viste tekster. SourceRef, dokument-ID, dataversion, diagramobjekt og eksport bevares originale. Demo/provider og loginform er fortsat særskilte statusser.
- Demo leverer den faktiske, allerede beregnede konklusion og forklaring i NDJSON `text`-events før den gemte `analysis`. Leveringen bruger cirka fem ord pr. bid, 25 ms mellem bidder og højst 1,5 sekund samlet pacing. Ingen modelkald, opdigtet fremskridtsprocent eller gemt dobbeltformulering. Live-adapterens eksisterende stream er bevaret. Gatewayen videresender streamens body og anvender `private, no-store, no-transform`.
- `StreamingAnswer` viser navn, aktiv formuleringstilstand, faktiske statusbeskeder, en neutral ventegrafik og modtaget tekst med diskret markør. Statusområdet ligger uden for tekstens `aria-busy`, så skærmlæserbeskeder ikke tilbageholdes. Dæmpet bevægelse og OS-indstillingen understøttes. Den eksisterende kontekstbevarende genafsendelse bruges.
- **Vis data** er særskilt fra **Hent CSV** og **Vis tabel**. Det virker fra svar, udvidede diagrammer, dashboardets årssammenligning, flerårsprognose, kommunevisning, energikort og scenarieeditorens preview. Det åbner den præcise analyse, som figuren/tallene tilhører.
- `AnalysisBasis` viser en datavej med fire trin: afgrænsning, grundlag, beregning og resultat. Perioder, enheder, dataversion, kilder, regneregler, faktiske beløb, tabel og antagelser kommer fra det autoriserede analyseobjekt. Den viser ingen intern modelreasoning. Manglende rå input rekonstrueres ikke fra afrundede nøgletal. Ukendt grundlag erstattes ikke med nul, og officielle navnekilder bruges ikke som økonomisk belæg.
- Prognoser viser realiserede og forventede måneder, hele beregningsår, normaliseringsprincip og følsomhedsantagelser. Scenarier adskiller helårsbaseline fra ændring i de resterende prognosemåneder. Kilder kan åbnes fra panelet; et forsinket dokumentkald kan ikke erstatte en nyere valgt kilde.

## Lokale kontroller

- Node 24.19.0: **514/514 tests i 25 filer**, inklusive rigtig lokal Postgres. Stream-, provider- og React-komponentkontrakter bruger desuden fixtures; dette er ikke bevis for en ekstern modelkonto. De 30 basisprøver dækker også korrekt kr./elev og kr./indbygger på normaliserede forskelle; rå budgettotaler bevarer kroner.
- Typecheck, lint, fuld formateringskontrol og credentialfrit produktionsbuild er bestået efter den sidste enhedsrettelse.
- Normal lokal demoprofil: modtaget deltekst observeret og fotograferet før finalanalysen. Budgettets **Vis data** viste 240.265.680,51 kr. minus 234.102.238,50 kr. = 6.163.442,01 kr. i januar–september 2026, identisk med den serverberegnede analyse. En dokumentkilde kunne åbnes herfra.
- Høngs kontobidrag for januar–september 2025 afstemte til 599.665,88 kr. med seks bidrag. Flerårsvisningen viste 2026–2032, årets elevtal og 9 realiserede/3 forventede måneder i 2026 samt 0/12 i senere år.
- Energi +15 % resten af året: baseline 321.829.076,34 kr.; ændring 1.107.321,33 kr.; scenarie 322.936.397,67 kr. Forklaringen viste årsbaseline, månedsskel og valgte procentforudsætninger. Direkte **Vis data** i Frembliks energikort åbnede samme type forklaring fra det aktuelle preview.
- Stop under synlig scenariestream gav stopbesked og bevarede spørgsmålet i input. Enter genafsendte spørgsmålet med korrekt afgrænsning og gav færdig scenarieanalyse.
- Dæmpet bevægelse blev slået til i UI; den aktive streamingmarkørs beregnede CSS-animation var `none`. Indstillingen blev efterfølgende gendannet. Der var én datamarkering og ingen browseradvarsler/-fejl.
- Laptop 1440×1100, tablet 834×1112 og mobil 390×844 er gennemgået. Forklaringsdialogens bredde var lig dens scrollbredde: 752 px på tablet, 326 px på mobil. Dette er viewportprøver, ikke en fysisk iPad-test.

## Publicering og eksterne prøver

Første publicering: kode `e664257ad14e98f8f9cdf1528c3e175241ea18da`, lokal backendrelease `1792604700011`, Vercel `dpl_7vo8ebUytWpBdBYqYCWLze1HsNmr`. Det offentlige alias er kontrolleret til denne deployment. Vercel-build og stage-session var klar; `private, no-store, no-transform`.

Den første offentlige transportprøve gav **23/24 kontroller over 19 HTTP-kald**. Der kom 34 separate tekstbidder i 34 separate bodylæsninger over 868 ms, første tekst efter 325 ms og slut efter 1.197 ms. Teksten afstemte præcist til konklusion og forklaring; Demo var aktiv uden dobbeltformulering. Browseren viste deltekst og Stop før slutresultatet. **Stop-persistens fejlede:** Efter transportabort ved første tekst blev der alligevel gemt et svar. Den lokale AbortSignal-prøve beviste derfor ikke Stop gennem Vercel og tunnelen.

Den første offentlige browserprøve bekræftede én datamarkering, budgetforklaring, samme tal i tabel og graf, åbning fra udvidet figur samt flerårsprognosens 9/3- og 0/12-månedsskel. Visuelle filer ligger i chatmappens `artifacts/kaia-answer-evidence/`. Vercels error/fatal-log havde ingen poster ved kontrollen; dette er en afgrænset prøve, ikke langvarig overvågning.

## Serverbekræftet Stop

Stop rettes gennem et særskilt, autentificeret `POST /api/analyze/cancel`. Hver ny afsendelse og genafsendelse får et nyt UUID uden for det gemte kontekst-/retryobjekt. Stop sender en selvstændig keepalive-request og afbryder den lokale stream. Gamle streambidder og forsinkede svar kan ikke overskrive et nyere forsøg.

Migration `0005_analysis_requests.sql` tilføjer en ejerbundet kontroltabel med running/cancelled/completed og reference til den færdige analyse. En tidlig annullering kan reservere ID'et, før analyseforespørgslen ankommer. Et annulleret ID kan ikke genstartes, og en anden bruger kan ikke annullere det. `saveAnalysis` låser kontrolrækken, indsætter samtale/analyse og markerer completed i **samme Postgres-transaktion**. Serverens regelmæssige statuskontrol kan også stoppe igangværende providerarbejde; transaktionslåsen afgør, om noget må gemmes.

Brugerfladen erklærer først stoppet efter serverens bekræftelse. Var beregningen allerede færdig, vises det ærligt, og input/retry ryddes frem for at genafsende det gemte svar. Kan Stop ikke bekræftes, oplyser UI, at svaret kan være gemt. Ny samtale, åbning af et andet snapshot og unmount foretager også et separat stopforsøg. Ældre API-klienter uden requestId virker fortsat; serverbekræftet Stop kræver requestId og cancel-kaldet.

Efter rettelsen er **555/555 tests i 28 filer** bestået med `KAIA_DB_TEST=1`. De 14 nye reelle Postgres-prøver dækker blandt andet 12 samtidige Stop-/lagringskapløb, gentagen lagring, tidlig annullering, ejerskab, uændret eksisterende samtale og rollback uden forældreløse data. Testenes oprydning er kontrolleret. Klient- og HTTP-fixtures dækker uafhængigt cancelsignal, fejlsvar, polling, CSRF, størrelsesgrænse og adgang. Typecheck, lint, formatering og produktionsbuild er grønne. Den lokale browser bekræftede serverens stopbesked, bevaret spørgsmål og vellykket genafsendelse med Enter.

Migrationen er anvendt eksplicit på den lokale produktionsdatabase på port 55433; kontroltabellen er verificeret. Datagenerator, økonomidata, adgangspolitik og providercredentials ændres ikke. Ingen credentialsbaserede Corti-/øvrige modelkald eller rigtig Entra-tenantprøve indgår.

## Afsluttende offentlig verifikation

- Kode: `a013dc328ddc1df1bc774e74740dc73326e3acf9`. Lokal backendrelease: `1792605597051`, proces 90696 ved kontrollen. Vercel: `dpl_9oRxps5BddEwScw3UstzMHjJ3esh`, READY efter kildeupload og remote build. Stage-session var klar med database og Demo; `kaia-sand.vercel.app` blev efter promotion verificeret til denne deployment. Tunnel og Postgres blev ikke genstartet.
- **35/35 kontroller over 30 faktiske offentlige HTTP-kald**: 34 tekstbidder i 34 separate bodylæsninger over 886 ms; første tekst 279 ms, sidste tekst 1.165 ms, færdigt gemt resultat 1.941 ms. Teksten afstemte præcist, rækkefølgen var text → analysis → done, og privat streaming uden transformation blev bevaret.
- Stop ved første tekst efter 258 ms fik `cancelled` efter et selvstændigt kald på 113 ms. Efter yderligere 2.400 ms fandtes stadig præcis den ene godkendte QA-analyse og samtale; ingen ekstra indsigt eller scenarie. Stop efter afsluttet beregning returnerede ærligt `completed` med de rigtige analyse-/samtalereferencer. Gentagne Stop, annullering før start, ejerskab, scope og afvisning af manipulerede input bestod. Testbesøgenes egne sessioner blev logget ud. Den oprindelige fejl er dermed reproduceret, rettet og genprøvet gennem den faktiske offentlige forbindelse.
- Offentlig browser: synlig deltekst før slutresultatet; både serverbekræftet stop og beskeden om allerede færdig beregning blev observeret. Efter Stop var spørgsmålet bevaret, og Enter gav et færdigt scenarie. **Vis data** viste energiscenariets 321.829.076,34 + 1.107.321,33 = 322.936.397,67 kr., de valgte 15 % og 9/3-månedsskel. Budgetpanelet viste samme eksakte beløb og graf som den lokale prøve. Der var én datamarkering og ingen warn/error i browserkonsollen.
- Vercels error/fatal-log var tom ved kontrollen 18:03 UTC. Dette er en afgrænset prøve, ikke en overvågningsperiode.

Sanitiseret HTTP-rapport: chatmappens `artifacts/kaia-answer-evidence/server-confirmed-stop-live.json`. Slutbilleder: `calculation-basis-final-live.jpg` og `scenario-basis-final-live.jpg`. Ingen cookies, sessionstokens eller credentials indgår i rapporten. De offentlige prøver bruger Demo; eksterne modelkonti og rigtig Entra-login er fortsat ikke integrationsafprøvet i denne opgave.
