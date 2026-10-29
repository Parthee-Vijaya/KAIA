# Verifikation: seks trin og skolekapacitet

25. oktober 2026. Forløbet bruger `KAIA-MOBILITY-v1` oven på `KAIA-DEMO-2026.09-v4` med reference 30. september 2026.

## Gennemført lokalt

- Typecheck, lint og formateringskontrol bestået.
- Produktionsbuild uden produktionshemmeligheder bestået.
- 1.012 tests i 46 filer bestået, inklusive 26 nye model-/Postgres-kontroller. Den afsluttende kørsel brugte `KAIA_DB_TEST=1 vitest run --maxWorkers=2 --no-file-parallelism`. Første brede parallelle kørsel ramte lokale database-/hooktidsgrænser; ingen tidsgrænse er hævet for at få slutkørslen til at bestå.
- 56 faktiske HTTP-kontroller mod det lokale produktionsbuild: normal demosession, stream, seks gemte trin, historik/graf/nøgletal, sliders, immutable baseline, separat scenarie, planudkast, ejerskab, feltvalidering, afvist klientrolle, fingeraftryk, godkendelse, genåbning, eksport og Council-afvisning.
- Browserforløb: normal login → Fremblik → samlet spørgsmål → Se analyseforløb → ændring af klasser med tastatur → serverberegning → gemt scenarie → gennemgang og godkendelse af internt demoudkast. Laptop 1280×720 og iPad 820×1180 gennemgået. Panellets horisontale overløb blev fundet og rettet. Fokus og sliderbetjening kontrolleret; reduceret bevægelse dækkes af CSS og eksisterende appindstilling.
- Credential-scan af ændrede/nye filer og klientens JavaScript fandt ingen af de konfigurerede hemmeligheder.

## Reel Corti-prøve

Den konfigurerede `corti-s1-instant` i region `fr` leverede 83 streambidder på det nye grundlag med de forventede tal og kildehenvisninger. Prøven brugte den rigtige provideradapter og rigtige credentials med syntetisk, afgrænset fixture. Det var ikke en autentificeret prøve af den offentlige private Corti-session. Offentlige besøgende bevarer Demo som udbyder; ingen nye live-rettigheder er tildelt.

## Publicering

Vercel-frontend og den eksisterende lokale backend opdateres som én hybridleverance. Migration `0007_plan_drafts.sql` er anvendt uden seed eller omskrivning af eksisterende økonomidata. Privat snapshotsikring omfatter 20 analyser og 3 indsigter før opdateringen. De 56 HTTP-kontroller er også bestået på den offentlige adresse efter den endelige publicering. De 20 private analyser og 3 indsigter er verificeret uændrede ved SHA-256-sammenligning.

Endelig kodecommit: `7888395`. Vercel-deployment `dpl_8zwzzJDvzaeTac5967hf2M867ake` er READY og promoveret til https://kaia-sand.vercel.app/. Lokal backendrelease: `1792921366575`; eksisterende tunnel og database er bevaret. Kildevisningens rå rækker er lagt bag en udfoldning og kontrolleret både lukket og åbent uden horisontalt overløb. Efter den sidste rettelse bestod 31 relevante tests samt nyt produktionsbuild, typecheck, lint og formateringskontrol.

Den offentlige browserprøve dækkede normal login, bevaret Fremblik og fire forslag, seks trin, klikbar beregningskilde, kombineret scenarie (+25 % tilflytning og to klasser), gemt analyse, planens konkrete driftsændring, særskilt godkendelse og genindlæsning. Godkendelsen viste Handling som Gennemført, mens ekstern integration fortsat stod Ikke tilsluttet.

Sanerede kørselsartefakter, lokal/offentlig HTTP-kontrol, Corti-adapterprøve og snapshotsikring ligger i opgavens `artifacts/kaia-mobility-flow/`. Browserprøven er ikke en fysisk iPad-prøve.

## Afgrænsning

Godkendelsen er en intern demoøvelse. Eksternt fagsystem, formel sagsoprettelse, faktiske elevoplysninger og kommunale myndighedsbeslutninger er ikke tilsluttet eller testet. Forecasting er den dokumenterede deterministiske model, ikke en trænet ekstern prognoseservice. Sliders foretager serverberegning uden Corti-kald; chatten kan anvende den autoriserede aktive model.
