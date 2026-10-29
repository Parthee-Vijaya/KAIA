# Drift på Vercel

**Aktuel præsentation:** Vercel leverer frontenden og en tynd, signeret gateway til backend/Postgres på Mac'en. Login er eksplicit demo efter Parthees beslutning af 21. oktober 2026. Se [HYBRID-DEMO.md](HYBRID-DEMO.md). Nedenstående trin beskriver den alternative fulde cloudopsætning med hosted Postgres og Entra; de er ikke forudsætninger for den autoriserede hybride præsentation.

Applikationen bruger Next.js 16 App Router, strict TypeScript, React, Node-runtime og serverbaserede NDJSON-svar. Alle private API-responses har `Cache-Control: private, no-store`. Postgres er den autoritative lagring for identiteter, scopes, sessions, posteringer, dokumenter, samtaler, indsigter, scenarier, provideropsætning og krypterede credentials. Lokal filskrivning eller serverless-proceshukommelse er ikke en erstatning for databasen.

## Klargøring

1. Tilknyt en vedvarende Postgres-database i den ønskede region, fx gennem en Vercel Marketplace-integration. Brug den pooled URL i `DATABASE_URL` med TLS i produktion. Driveren bruger `prepare:false`, to rå SQL-forbindelser og én særskilt Drizzle-forbindelse pr. instans, med 20 sekunders idle-timeout. Drizzle definerer det typesikre skema; parameteriseret `postgres`-SQL håndterer filtrerede forespørgsler og transaktioner. De adskilte pools holder Drizzles serializers ude af rå JSONB-transaktioner.
2. Opret og begræns Entra-app'en som beskrevet i [ENTRA.md](ENTRA.md). Brug et fast hostnavn til callbacken. Installer ikke lokale fixtures på offentlig hosting.
3. Angiv miljøvariabler fra `.env.example` som Vercel servermiljø, særskilt pr. miljø. `KAIA_TEST_MODE` skal være `0` eller fraværende. Selv en fejlagtig værdi `1` giver ikke testlogin på Vercel eller i produktion. Sæt `KAIA_APP_URL` til det præcise HTTPS-hostnavn.
4. Kør migration og seed fra et godkendt driftsmiljø med den valgte databases URL:

```sh
npm ci
npm run db:migrate
npm run db:seed
```

Migrationer er en eksplicit handling, og kører ikke under build eller ved en normal serverless-request. Seed bruger fast seed, dataversion og referencedato. Eksisterende dataversion valideres med indholdshash og genbruges. Samme versionsnavn med ændrede data afvises. Identiteter, scopes, samtaler og konfiguration slettes ikke. Brug en ny versionsstreng, når datasættets seed, reference eller generator ændres. `kaia_datasets` registrerer indlæsningen.

5. Kør `npm run typecheck`, `npm run lint`, `npm test` og `npm run build`. Build kræver ingen produktionshemmeligheder eller databaseforbindelse. Build-succes er ikke dokumentation for login eller eksterne integrationer.
6. Opret Vercel-projektet med Next.js-detektion og Node 24.x som angivet i `package.json`. Repositoryets `vercel.json` sætter Node-functionens maksimale varighed. `/api/analyze` og forbindelsestesten har en grænse på 120 sekunder; anvend en plan, der tillader denne varighed. Endpointkald har egne kortere deadlines.
7. Gennemfør rigtigt Entra-login, tildel første administrators scope med CLI'et, test tenant-/rolle-/scopeisolering og afprøv de valgte AI-forbindelser. Vedlæg faktiske testresultater til driftsgodkendelsen.

## Data og lake

Kildekodens standarddemo bruger `KAIA-DEMO-2026.09-v4`, et fast simuleret snapshot pr. 30. september 2026 med **1.245.024 posteringer, 1.742 dokumenter, 6 kommuner og 16.506 separate benchmarkrækker** for 2020–2032. Den kræver ikke offentlige API'er. Alle kommuners økonomi, befolkning, elever og struktur er syntetisk; kun navne/koder er officielle. V4 skal vælges i backendens miljø og indlæses eksplicit; ændring af `.env.example` opdaterer ingen eksisterende deployment.

Kør alle migrationer, herunder `0003_expanded_dataset.sql` og `0004_raw_snapshot_chunks.sql`, før v4-seed. Seed indlæser hele datasættet i Postgres og bevarer det fulde rå generatorudtræk som manifest i `kaia_lake_snapshots` og 125 ordnede tekstdele i `kaia_lake_raw_chunks`. Delhash og rekonstrueret SHA-256 kontrolleres ved genkørsel. Den kuraterede økonomi, dokumenter og kommunebenchmarks ligger i applikationens typesikre tabeller; seed duplikerer ikke hele ledgertabellen i `kaia_lake_rows`. Seed af over en million posteringer er en opsætningsopgave, som køres fra driftsmiljøet, ikke en Vercel-request eller buildhandling.

Forespørgsler filtrerer posteringer og dokumenter efter sessionens områder/enheder; browseren får kun analyseobjekter, aggregerede tabeller og tilladte dokumenter. Serverforespørgslen begrænses til analysens enheder og relevante år: indeværende analyseår, foregående år ved pris-/mængdeforklaring, energianalyse og scenarier, snapshotstart 2020–valgt år til trend, de to sammenligningsår ved årssammenligning og referenceår–slutår ved flerårsprognose. Et begrænset udsnit af energiposter fra 2023 følger med til kontekstindeksets basis. Kommunebenchmark henter kun det valgte fagområde og år ved fuldt områdescope. Opfølgninger i en eksisterende samtale fastholder dens dataversion; kilder og gemte scenarier læses fra samme historiske snapshot. Ingen hel ledger sendes til en AI-model eller klienten.

Lake-adapteren kan gemme rå og kuraterede, versionerede indlæsninger i Postgres med idempotent kilde-/versions-/observationsnøgle. Det tilhørende DDL medtages i migrationen. Eksternt lakeprodukt, MCP-endpoint og CLI-runner kræver eksplicit adapterbinding, konfiguration og integrationsprøve; miljøfelter aktiverer dem ikke alene i chatten. Vercel udfører ikke vilkårlig shell eller vedvarende indlæsningsjobs. Se integrationsdokumentationen for kontrakter, offentligt Statbank-snapshot og faktisk status.

## Drift og gendannelse

Sikkerhedskopiér Postgres og krypteringsnøglen separat. Providerhemmeligheder kan kun gendannes med begge. Rotér session secret for at ugyldiggøre alle eksisterende sessions. Tag en DB-backup før skemamigrationer, og test gendannelse i et separat miljø. Ændringer i scope gælder ved næste request; ændringer i Entra-app-roller kræver nyt login eller sessionsudløb. Auditloggen registrerer udførte adminændringer og vellykkede forbindelsestest uden credentials.

Samtaler, gemte indsigter og scenarier har serverkontrolleret ejer-ID. Snapshot gemmer dataversion, periode, scope, kilder, figurer og forudsætninger. Efter en deployment bruger sessionen og disse artefakter den samme vedvarende database. En reel redeployment-/restore-prøve skal køres i det valgte hostmiljø før produktionsgodkendelse; en lokal refresh-test er ikke den prøve.

## Resterende ekstern opsætning

Det godkendte hybridprojekt er tidligere publiceret på Vercel; den historiske [hybridverifikation](HYBRID-VERIFICATION.md) beskriver v3 og må ikke bruges som bevis for en ny v4-deployment. Der er ikke automatisk oprettet en Entra-registrering, en hosted database eller en ekstern modelkonto. Lokal Postgres og lokale browser-/HTTP-fixtures kan verificere beregninger, ejerskab og varig lagring. Tenantlogin, hosted pooling, cold starts, ny redeployment og faktiske providerkald kræver det konfigurerede miljø og må ikke rapporteres som bestået på baggrund af fixtures.
