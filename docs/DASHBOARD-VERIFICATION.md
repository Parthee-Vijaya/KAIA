# Fremblik-dashboard · 21. oktober 2026

Brugeren valgte **kun Fremblik** efter at have gennemgået de tre klikbare designprototyper. Den faktiske app får derfor én arbejdsflade uden designvælger. De statiske referenceprototyper på https://kaia-design-studio.vercel.app er bevaret separat.

## Implementeret forløb

- Topnavigation, eksisterende logo og Geist, personlig hilsen, serverafledt rolle og stilling samt tilladt område.
- Chatfelt og fire fungerende indsigtsforslag, som afhænger af rolle og scope.
- Flerårsprognose 2026–2032 med basis, budget og illustrativt lavt/højt forløb, nøgletal, tabel, interaktiv signatur, SVG/CSV og klikbart beregningsgrundlag.
- Energiscenarie med eksplicit virkning i resten af året eller hele året. Kun relevante energiudgifter ændres; nulstilling bevarer baseline. Et historisk år kræver et eksplicit helårsvalg.
- Sammenlignelig kommune på samme periode og metric. Strukturtræk og økonomi er simulerede. Et institutionsudsnit opskaleres aldrig til en kommune.
- Undersøg videre åbner en almindelig autoriseret chatanalyse. Gemte indsigter og scenarier bruger eksisterende ejerskab og vedvarende Postgres-lagring.

`GET /api/dashboard` og `POST /api/dashboard/scenario` kontrollerer session, rolle, enheder, periode, snapshot og forbrug. Ingen modelkald eller nye samtaler oprettes ved visning af dashboardet. GET/POST-preview er midlertidige beregningsobjekter; de kan ikke bruges som andres gemte analyser. Alle svar har `private, no-store`. En samlet scopefiltreret datahentning deler samme snapshot mellem panelerne; der caches ingen private dashboarddata offentligt.

Budget, samme periode sidste år, prognose, pris pr. elev, waterfall, heatmap og enhedssammenligning er fælles typesikre analyseobjekter. Fremblik viser de relevante paneler; øvrige analysetyper kan fortsat undersøges i chatten. Beløb lagres som heltal i øre. Decimalprocenter beregnes rationelt med BigInt og fælles afrunding til nærmeste øre; også negative halvtal afstemmer. De otte eksisterende forberedte v4-scenarier beholder deres resultater.

## Gennemførte kontroller

- Node 24: fuld typecheck og lint.
- 296/296 tests i 15 filer, inklusive rigtige databaseintegrationer (`KAIA_DB_TEST=1`). Heraf 103 nye målrettede tests af dashboard, perioder, beregninger, scope, Council, versioner, citationsgrundlag og routekontrakter. Providerkontrakter bruger fixtures.
- 14/14 faktiske HTTP-kontroller på lokal udviklingsserver med normal demologin, cookies kun i RAM: Executive/Council, adgang til data, afvisning af adminforfalskning, 401/403/400, privat cachepolitik, enkelt skole/2025, scenarie +15 % og nulstilling. Ingen testlogin-genvej brugt.
- Skole-dashboard: 1.178 ms. En skole/2025: 98 ms. Scenarier: 202/213 ms. Måling mod lokal udviklingsdatabase; det er ingen SLA.
- Browser: laptop, iPad 834×1112 og mobil 390×844; synlig rolle/område, faktisk områdeskift, år/enhedsfilter, kildepanel og tastaturbetjent energislider. Den historiske scenariebegrænsning blev fundet i browseren og rettet med det eksplicitte virkningsvalg.

## Afsluttende releasekontrol · bestået

- Lokal `npm run build:clean` og Vercels produktionsbuild er bestået. Sidste UI-rettelse er typechecket, lintet og bygget på ny; 20 UI-state-tests er genkørt.
- Offentlig adresse: https://kaia-sand.vercel.app/.
- Vercel-projekt `kaia`, team `parthee-vijayas-projects`, Node 24, Next.js 16.4.2.
- Endeligt deployment: `dpl_GEyskMwCQD86oq7jibL5pdEtPX6D`, READY, fra kodecommit `733d84319ac487a0dad93683fb6877bbe9031096`. Først klargjort som produktion uden domæneskift, kontrolleret gennem Vercels autentificerede adgang og derefter promoveret. Det normale alias er verificeret mod dette deployment.
- Lokal backend: eksisterende beskyttede service på port 3212, runtime `1792597368862`. HMAC-gateway, tunnel og produktions-Postgres er uændrede. Der er ingen datamigration i denne leverance.
- **14/14 faktiske offentlige HTTP-kontroller** gennem Vercel → HMAC → tunnel → ny backend → rigtig Postgres. Samme adgangs- og beregningsprøver som de 14 lokale kontroller. Skole-dashboard 2.669 ms, én skole/2025 411 ms, energiscenarie/reset 446/456 ms. Scenarieeffekten matcher lokal beregning præcist, og reset giver nul.
- Normal demologin og privat arbejdsflade i den offentlige browser er gennemført. Prognose, skjul/vis signatur, tabel, kilde, udvidet diagram og dansk tooltip er afprøvet.
- Faktisk CSV-download bevarer alle fire prognoseserier, også en serie der er skjult visuelt. SVG-download er XML-valideret og indeholder Simulerede data, korrekt dataversion og år 2026–2032.
- Dashboardgenvej → budgetanalyse → tastaturafsendt “Sammenlign op mod sidste års data” → korrekt januar–september begge år → Gem indsigt → genindlæs → Gemte indsigter → genåbn med samme tal, kilde og version: bestået.
- Reduceret bevægelse er aktiveret, bevaret efter genindlæsning og sat tilbage. Browserens rollevisning er dansk; normale profiler har ingen administratorindstillinger.
- Offentlig responsiv kontrol: 1440×1100, 834×1112, 390×844 og 1920×1080. Ingen vandret overflow ved tablet/mobil. Det er viewportkontroller, ikke en prøve på fysisk iPad med skærmtastatur.
- En Recharts-advarsel ved første åbning af et endnu skjult dialogdiagram er rettet med figurens eksplicitte højde. Endelig åbn/luk-kontrol i en frisk browserfane har **0 advarsler og 0 fejl**. Vercels fejl-/fatal-logudtræk for det endelige deployment viste ingen poster under kontrollen.
- 13 kompilerede JS-/CSS-klientfiler er kontrolleret for lokale credentialværdier: 0 fund. Den publicerede backendrelease indeholder 0 `.env`-filer. Ingen credentials er versionsstyret eller returneret i rapporten.

Skærmbilleder og de faktiske eksportfiler ligger i opgavens `artifacts/kaia-dashboard-implementation/`. Maskinlæsbar status: [dashboard-verification.json](dashboard-verification.json).

Under udvikling med samtidige hot reloads opstod én forbigående databasefejl ved genindlæsning. Samme proces genvandt forbindelsen uden konfigurationsændring; PostgreSQL-loggen viste ingen forbindelsesudtømning. Årsagen er ikke fastlagt. Fejlen blev ikke observeret i den afsluttende produktionskontrol; den registreres her uden at hævde en verificeret årsagsrettelse.

Reel Entra-tenant og de fire credentialbaserede modelintegrationer er fortsat ikke afprøvet. Den aktuelle leverance bruger det aftalte demologin og deterministiske analyser uden AI-nøgle. Vercel-frontendens lokale backend kræver fortsat en tændt, online Mac og den eksisterende tunnel.
