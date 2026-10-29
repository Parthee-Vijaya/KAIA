# Klikbare skoleafvigelser i Fremblik · 21. oktober 2026

## Implementering

Skoleområdet viser de fem største budgetafvigelser direkte efter budget-/årsoversigten i Fremblik. Der sorteres efter beløbets størrelse uanset fortegn; merforbrug, mindreforbrug og balance angives med tekst. Alle tilladte skoler kan foldes ud. Klik på et beløb åbner en almindelig analyse med den pågældende skole, samme måneder og år samt kontobidrag i et waterfall-diagram, tabel og relevante demokilder.

Listen genbruger `panels.comparison.analysis.chart.rows[].variance`, som serveren allerede beregner i hele øre for skolen samlet. `budget` og `actual` i samme skolepanel er pr. elev og bruges derfor ikke som totalbeløb eller til at rekonstruere afvigelsen. Klienten sorterer og skalerer kun de dekorative bjælker. Skolen matches entydigt med det autoriserede enhedsregister; ukendte eller tvetydige navne giver en forklaring, ingen alternativ ID-gætning.

Modulet kontrollerer perioder, enheder, dataversion, komplette rækker, præcise beløb og simulerede økonomikilder. Council-profiler får en forklaring om aggregeret adgang og ingen institutionsoplysninger. Et andet fagområde viser ikke skolemodulet. Et nyt spørgsmål fra Fremblik sender arbejdsfladens eksplicitte dataversion, også når der endnu ikke er en tidligere analyse.

Økonomiske bidrag beskriver, hvilke konti der summerer til afvigelsen. De er ikke i sig selv bevis for en årsag; de tilknyttede simulerede dokumenter kan åbnes særskilt. Navnekilder bruges ikke som økonomisk belæg.

## Lokal browserkontrol

- Normal demoprofil, uden testlogin. Skoleområdet januar–september 2026 viser top fem og kan udvides til alle 16 tilladte skoler.
- Tastaturaktivering af Herredsåsens beløb åbner en skoleafgrænset analyse. Vikarbidrag og energi kan undersøges, og den simulerede skoleopfølgning åbner med samme periode og afvigelse.
- År 2025 og Høng Skole viser kun den valgte skole med 599.665,88 kr. i afvigelse. Skift tilbage til alle enheder giver en ny, korrekt rangliste.
- Tablet 834×1112 og mobil 390×844: ingen vandret dokumentoverløb eller afklippede rækker, synligt tastaturfokus og knapper med mindst 44 px højde. Kontrollen er af browserens viewport, ikke fysisk iPad/skærmtastatur.
- Frisk lokal browserfane: ingen konsoladvarsler eller fejl under disse forløb.

## Automatiske kontroller og publicering

- Node 24.19.0: fuld typecheck, lint og `npm run build:clean` bestået.
- `KAIA_DB_TEST=1 npm test`: **390/390 tests i 19 filer** bestået, inklusive rigtige Postgres-integrationer. De 54 nye målrettede prøver omfatter 43 komponent-/presentation-/hook-fixtures og 11 faktiske domænekontrakter med `analyze` og `buildDashboard`.
- Domæneprøverne afstemmer rå skoleafvigelse mod de seks kontobidrag for historisk regnskab, indeværende år, blandet regnskab/prognose og fremtidig prognose. Tidligere elevmetric, årssammenligning og scenarie må ikke ændre klikspørgsmålets nettoafgrænsning. Negative afvigelser, kildereferencer og afvisning af manglende adgang indgår.
- Offentlig adresse: https://kaia-sand.vercel.app/. Vercel-deployment `dpl_8WVUeTMjuiqyfTiMWbw2E2cn7tdS`, READY fra kodecommit `984b5b09b3e8b71e70cf51fa2ca538a2a9cf8c3b`. Vercels produktionsbuild er bestået. Den beskyttede staging blev kontrolleret før promovering; sessionstatus gav 200/ready/database og privat cachepolitik, anonymt dashboard gav 401. Det normale alias peger på dette deployment.
- **17/17 faktiske offentlige HTTP-kontroller** gennem Vercel → gateway → lokal backend → rigtig Postgres: normal Executive/Council-login og logout, anonym 401, provideradgang 403, privat/no-store, budget, én skole i 2025, energiscenarie og eksakt nulstilling, ugyldige forespørgsler, forfalsket Admin-rolle og institutionsscope. Den ekstra prøve afstemmer Herredsåsens rå `variance` til den komplette række i diagrammets simulerede beregningskilde. Dashboard 2.372 ms, én skole 387 ms, scenarie/reset 415/417 ms. Det er målinger fra prøven, ingen SLA.
- Offentlig browser med normal demoprofil: top fem vises uden chat, Vis alle giver 16 rækker, og Enter på Herredsåsens beløb åbner en analyse med korrekt skolefilter og januar–september 2026. De seks tabelbidrag summerer til **948.593,70 kr.**, præcis som beløbet i listen. Den tilknyttede simulerede budgetopfølgning kan åbnes og beskriver samme periode og bidrag.
- Det offentlige skolemodul er visuelt gennemgået ved 1440×1100. Den friske browserfane viste ingen konsoladvarsler eller fejl. Vercels fejl-/fatal-logudtræk for dette deployment viste ingen poster i kontrolvinduet.

Skærmbilleder af den offentlige liste, analyse og dokument ligger i opgavens `artifacts/kaia-school-variances/`. Maskinlæsbar status: [school-variances-verification.json](school-variances-verification.json). De tidligere verifikationsrapporter bevares som historisk evidens.

Der er ingen server-, API-, database- eller datageneratorændringer. Backend behøver ingen migration eller genstart. Den eksisterende Vercel-frontend med lokal backend kræver fortsat en online Mac og tunnel. Reel Entra-tenant og credentialbaserede AI-kald er ikke prøvet i denne leverance.
