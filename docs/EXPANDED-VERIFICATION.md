# Verificeret udvidelse af data, sammenligninger og prognoser

21. oktober 2026 · Europe/Copenhagen.

Den offentlige demo på **https://kaia-sand.vercel.app** bruger nu `KAIA-DEMO-2026.09-v4`. Frontenden er deployet fra commit `0f031c0` til Vercel-projektet `parthee-vijayas-projects/kaia`, deployment `dpl_22ez6ay2DNCA8cie2MgSde2UEG37`, status **READY**, target production. Den lokale produktionsbackend er opdateret fra samme build. Der er ikke foretaget GitHub-push eller merge.

## Faktisk indlæste data

Den særskilte hybride Postgres-database indeholder **1.245.024 posteringer, 1.742 dokumenter, 6 kommuneprofiler og 16.506 benchmarkrækker** i v4. Dækningen er 2020–2032 med fast reference 30. september 2026. Alle kommunale økonomi-, befolknings-, elev- og strukturværdier er syntetiske. Kun navne og kommunekoder er verificeret i officielle kilder.

[Databaseprøven](expanded-database-verification.json) har **13 beståede kontroller mod den faktiske hybrid-database**. Den kontrollerer de persisterede antal, perioder, fravær af fremtidige regnskabsposter og fuld afstemning af hver Kalundborg-kombination af fagområde, år, måned og posttype mod egne posteringer. Alle 125 rå tekstdele er læst og valideret med individuelle checksums; den samlede rekonstruktion har præcis samme SHA-256 som det oprindelige generatorsnapshot.

Seed er desuden gentaget mod udviklingsdatabasen med uændret v4-checksum. Ældre v3-data og private samtaler er bevaret. Indlæsningen bruger én transaktion med lås og kollisionskontrol; den genfortolker ikke eksisterende snapshots.

## Automatiserede kontroller

- **193/193 tests** i 13 filer med `KAIA_DB_TEST=1 npm test`: **22 reelle lokale Postgres-prøver** og 171 domæne-/kontrakt-/fixturetests. Postgres-prøverne omfatter nye filtrerede årssammenligninger, kommunebenchmarks, 2032-prognoser og rekonstruktion af rå snapshotdele samt eksisterende sessions-, scope- og ejerbeskyttelse.
- Typecheck, ESLint, Prettier og `git diff --check` består.
- Lokalt produktionsbuild uden produktionscredentials og Vercels eget produktionsbuild består. Node 24.19.0 og Next.js 16.4.2.
- Produktionsafhængighedernes `npm audit --omit=dev --audit-level=high`: 0 sårbarheder. Vercels fulde installationsaudit rapporterede også 0.

[HTTP-prøven](expanded-http-verification.json) har **107 beståede assertions** gennem den offentlige Vercel-adresse, HTTPS-gatewayen, den lokale produktionsbackend og Postgres. Gentages med Node 24 og `node scripts/verify-expanded.mjs`; den opretter egne private demosessioner og gemmer testindsigter i dem.

Ud over login, streaming, dokumenter, gem/genåbn, scenarier, rolle/scope og ejerskab dækker den brugerens formulering »Sammenlign op mod sidste års data«, stavevarianten »sammennlignelig kommune«, eksplicit Holbæk, bevaret kommune ved forklarende opfølgning, ærlig afvisning af en kommune uden benchmark, lav/basis/høj til 2032 og samme værdier i graf og nøgletal. Den kontrollerer også genåbnede v3-analyser, manglende 2032-grundlag i v3 og HTTP 409 ved forsøg på at skifte en eksisterende samtales snapshot.

En afgrænset forespørgsel på det nye deployments errorlogs for de første 15 minutter returnerede ingen errorposter. Der er ikke etableret permanent monitorering.

## Faktisk browserforløb

En eksisterende Parthee-demosession overlevede backendopdateringen og frontenddeploymentet. Den gamle v3-budgetanalyse og gemte indsigt var stadig tilgængelige. Ny samtale viste 2020–2032 i årsfiltret og det nye antal posteringer/dokumenter.

1. »Sammenlign op mod sidste års data på skoleområdet« viste januar–september i begge år: **232.525.154 kr. i 2025** og **240.265.681 kr. i 2026**, forskel **7.740.527 kr. / 3,3 %**. Figuren, nøgletallene og den åbnede beregningskilde stemte overens.
2. Opfølgningen »Sammenlign med en lignende kommune i demoen« foreslog **Sorø** ud fra fiktiv strukturlighed. Den viste **58.889 kr. pr. elev** i Kalundborg og **62.242 kr.** i Sorø, samme måneder og eksplicit syntetiske nævnere. Officielle navnekilder stod separat fra økonomikilden.
3. »Vis prognosen for skoleområdet frem til 2032« bevarede elevmetricen fra samtalen. Den viste syv årspunkter, helårsbudget og lav/basis/høj. For 2032 var basis **91.146,54 kr. pr. elev**, lavt **84.776,30 kr.** og højt **97.910,68 kr.** i den underliggende tabel. Lavt/højt er ±1 % ekstra årlig multiplikativ følsomhed på fremtidige udgifter; det er ikke et statistisk interval.
4. Prognosen blev gemt, siden genindlæst og indsigten genåbnet. Både den oprindelige v3-budgetindsigt og den nye v4-prognose fremgik med deres egne dataversioner. Udvidet graf og tabellen blev åbnet i browseren.

Det bevarede layout er gennemgået ved normal laptopbredde (1280 × 720), iPad-bredde (768 × 1024) og præsentationsstørrelse (1920 × 1080). Ved 768 px var dokumentets bredde 768 px uden vandret overflow. Dette var browseremulering, ikke en fysisk iPad-/skærmtastaturtest. Konsollen viste ingen browserfejl, men én kortvarig Recharts-advarsel om nulstørrelse under størrelses-/panelovergang; den viste graf og tabel fungerede ved alle gennemgåede størrelser.

## Resterende eksterne prøver og drift

Microsoft Entra og de fire modeludbydere er fortsat ikke afprøvet med rigtige credentials. Den publicerede løsning anvender den godkendte demoautentifikation og deterministiske beregninger uden eksterne modelkald. Eksterne model-/tenantprøver må ikke udledes af de beståede fixtures eller HTTP-prøver.

Mac'en skal fortsat være tændt, vågen og online. Quick Tunnel har samme midlertidige hostname som før; en tunnelgenstart kræver opdateret Vercel-endpoint og redeploy. Backendgenstart påvirker ikke den vedvarende database. Se [HYBRID-DEMO.md](HYBRID-DEMO.md).
