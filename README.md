# K.A.I.A.

En webbaseret kommunal dialog- og analyseplatform. Stil et spørgsmål, undersøg den fælles beregning og dens kilder, sammenlign enheder, og ændr forudsætninger i et scenarie.

**Aktuel præsentation:** Vercel-frontend med lokal backend/Postgres og tydeligt demologin uden Entra, efter Parthees beslutning af 21. oktober 2026. Tre faste profiler giver adskilte besøgsidentiteter og ingen offentlig administrator. Se [hybriddriften](docs/HYBRID-DEMO.md). De oprindelige Entra-/cloudvejledninger bevares som næste driftsmulighed.

**Åbn https://kaia-sand.vercel.app**. V4-datagrundlaget er beskrevet i [den tidligere v4-verifikation](docs/EXPANDED-VERIFICATION.md). Fremblik-dashboardets implementering og aktuelle kontroller fremgår af [dashboardrapporten](docs/DASHBOARD-VERIFICATION.md). Start en ny samtale til det nye datagrundlag; tidligere gemte samtaler beholder deres snapshot. Mac'en skal være tændt og online; den midlertidige tunneladresse skal opdateres på Vercel efter tunnelgenstart.

**Alle kommunale tal, elevtal, dokumenter og beslutninger er simulerede.** Det gælder også peerkommunernes økonomi, befolkning, elevtal og strukturtræk. Enhedsnavne er verificeret hos Kalundborg Kommune; de seks kommuners navne og koder er verificeret hos Danmarks Statistik. Officielle navnekilder bruges aldrig som dokumentation for de fiktive økonomital eller en faktisk kommunal rangering. K.A.I.A. står for Kommunal AI Analyse.

## Aktuel leverance

- Next.js 16.4.2 App Router, React 19, strict TypeScript og Node 24 LTS.
- Godkendt **Fremblik-dashboard** med tydelig personlig profil, chat, budgetstatus, sammenligning med sidste år, serverberegnet flerårsprognose, energiscenarie og sammenligningskommune. DGITA-paletten uden pastelflader, lokalt pakkede Geist-fonte og Phosphor-ikoner.
- Budgetoversigten ligger direkte under de fire indsigtsforslag. Den viser periodiseret budget, forbrug/prognose, budgetafvigelse og årsændring i kroner samt den tilgængelige årsprocent. Sammenligningen bruger samme måneder og enheder begge år med adgang til figur, tabel, eksport og beregningskilder; manglende historik forklares.
- Skoleområdet viser de største budgetafvigelser i kroner direkte i Fremblik, med sidste års afvigelse for samme måneder ved siden af og ændringen i afvigelsens størrelse. Begge års beløb åbner skolens udgiftsbidrag i den respektive periode med waterfall og demokilder. Listen bruger serverberegnede nettoafvigelser; elevnormaliserede sammenligningstal bruges ikke som totalbudget. Manglende historik vises som en forklaring, mens årets beløb bevares.
- Én diskret **Simulerede data**-markering nederst til højre. Den oprindelige datastatus bevares i kildeobjekter og eksporter; Demo/provider vises særskilt.
- Svar leveres løbende i et animeret svarkort. Demo streamer sin allerede beregnede tekst uden modelkald; live-forbindelser streamer modellens faktiske tekst. Stop bruger en ejerbundet serveranmodning og en atomisk databasekontrol, så et bekræftet stoppet svar ikke gemmes. Var svaret allerede gemt, fortæller brugerfladen det. Migration `0005_analysis_requests.sql` skal anvendes før opdateringen. **Dæmp bevægelse** og `prefers-reduced-motion` stopper animationen uden at skjule status eller tekst.
- **Vis data** åbner en grafisk vej fra afgrænsning og kilder gennem beregningsregler til tal, figur og tabel. Budget, skolebidrag, årssammenligning, scenarie og flerårsprognose bruger det samme gemte analyseobjekt. Se [verifikation af svaroplevelsen](docs/ANSWER-EXPERIENCE-VERIFICATION.md).
- Relevante **antagelser i Vis data** kan justeres med sliders og præcise talfelter. En midlertidig serverberegning opdaterer graf, tal og formler, og den aktive udbyder streamer en ny forklaring efter en kort pause. Nulstil genskaber det gemte svar uden modelkald. Se [beregnings- og driftskontrakten](docs/LIVE-ASSUMPTIONS.md); migration `0006_explanation_requests.sql` skal anvendes før backendopdateringen.
- Åbne kommunale spørgsmål kan få et konkret regneeksempel eller et tematisk procesdiagram med synlige forudsætninger. Den nøglefrie Demo og Corti bruger samme validerede beregningslag; se [plausible svar](docs/PLAUSIBLE-ANSWERS.md).
- Personligt tenantafgrænset Entra/OIDC-login med PKCE, state og nonce; roller, enhedsscope og ejerskab håndhæves på serveren.
- Vedvarende Postgres med typesikkert Drizzle-skema, parametriserede transaktioner, migrationer og idempotent seed.
- **1.245.024 posteringer og 1.742 demodokumenter for 2020–2032**, 16 skoler, 8 faciliteter og 7 udvalg i en modelleret demoorganisation.
- **6 kommuner og 16.506 månedlige benchmarkrækker** i en separat sammenligningstabel: Kalundborg, Odsherred, Holbæk, Slagelse, Sorø og Ringsted. Kalundborgs sammenligningsgrundlag kommer fra de samme posteringer som resten af appen.
- Budget, regnskab, afvigelser, flerårsprognoser til 2032, sammenligninger mellem år og kommuner, dokumenter, pris-/mængdeforklaring og demografimodel.
- Seks diagramtyper med tabel, udvidet visning og eksport. Samme analyseobjekt driver tal, tekst, figur og kilder.
- Gemte samtaler, indsigter og navngivne scenarier. Scenariesliders genberegner de berørte konti på serveren.
- Reel adapterkode og administratorens forbindelsestest for Mistral, Corti Models, Azure OpenAI og OpenAI. Demo bruger beregningslaget uden modelkald.
- Datakatalog, adgangskontrolleret kilderouter, Postgres-lake, begrænsede MCP-/CLI-gateways og et valgfrit verificeret offentligt DST-snapshot.

Kildekodens standarddataversion er `KAIA-DEMO-2026.09-v4`, seed `kaia-kalundborg-2026`, reference **30. september 2026**. Dækningen er januar 2020–december 2032: realiserede tal findes til og med september 2026; resten er budget og prognose. Lavt/højt prognoseforløb er **±1 % ekstra årlig multiplikativ følsomhed**, ikke et statistisk interval. Ældre snapshots bevares, og gemte analyser er bundet til deres egen version. En eksisterende deployment skifter først snapshot, når miljø, migration, seed og deployment faktisk er opdateret.

Corti er **credentialsbaseret integrationsafprøvet** gennem den private tildeling og den offentlige Vercel-gateway; se [Corti-rapporten](docs/CORTI-LIVE.md). Rigtigt Entra-login, Corti OAuth og de øvrige modeludbydere er ikke integrationsafprøvet. Den faktiske v4-hybriddrift, database og brugerforløb har [særskilt evidens](docs/EXPANDED-VERIFICATION.md). De historiske [verifikationsrapporter](docs/VERIFICATION.md), [v3-hybridprøver](docs/HYBRID-VERIFICATION.md) og [acceptmatrixen](docs/ACCEPTANCE.md) bevarer deres tidligere rækketal og testresultater.

## Lokal start

Den aktive udviklingscheckout ligger på `/Volumes/J.A.R.V.I.S/ks-sources/kaia`. Se [arbejdsmapper og sikker arkivering](docs/WORKSPACE.md) før oprydning eller flytning; den kørende backend og database har separate placeringer på Mac'en.

Brug Node 24 (`.nvmrc`).

```sh
npm ci
cp .env.example .env.local
```

Udfyld servermiljøet: Postgres, Entra-tenant/client, sessionshemmelighed og en 32-byte krypteringsnøgle. Eksempelværdierne er ikke en produktionskonfiguration. Registrér den præcise callback, normalt `http://127.0.0.1:3210/auth/callback` lokalt.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Åbn **http://127.0.0.1:3210**. Manglende konfiguration vises som opsætningsstatus og giver ingen offentlig adgang til data. `KAIA_DEFAULT_PROVIDER=demo` kræver ingen AI-nøgle og anvender det samme Entra-login som live-AI.

Første Entra-login opretter en identitet uden dataadgang. Tildel den en app-rolle i Entra og et kontrolleret scope som beskrevet i [ENTRA.md](docs/ENTRA.md). Administratoren kan derefter tildele scope til eksisterende identiteter i appen.

### Isolerede lokale testidentiteter

Kun på en lokal udviklingsserver kan `KAIA_TEST_MODE=1` vise en eksplicit mærket testformular. De to personlige profiler bruger de tilladte navne; øvrige profiler er funktioner. Vercel og `NODE_ENV=production` afviser både testlogin og allerede udstedte fixture-sessioner. Dette er ikke en alternativ loginform til en offentlig demo.

Den oprettede lokale arbejdsmappe har en ignoreret `.env.local` og en isoleret Postgres-instans på port 55432 til verifikation. Ingen credentials er versionsstyret. En anden maskine eller Vercel skal have sin egen opsætning.

## Kontroller

```sh
npm run typecheck
npm run lint
npm test
npm run test:database   # kræver en migreret og seedet lokal testdatabase
npm run build:clean     # produktionsbuild med credentials eksplicit tømt
npm audit --audit-level=high
```

`npm test` afprøver deterministisk økonomi, perioder, scenarier, adgang, kilder, integrationer og providerkontrakter. Databasetests er særskilt tilvalg; de afprøver rigtig Postgres og rydder kun egne fixture-rækker. Browsergennemgangen er beskrevet i rapporten. CI-workflowet kører også database og secretfrit build, men en lokal grøn kørsel er ikke en verificeret GitHub Actions-kørsel.

## Hosting og integrationer

[Vercel-vejledningen](docs/VERCEL.md) beskriver også den alternative cloudopsætning med pooled Postgres, eksplicit migration, seed, Node-runtime, callbacks, servermiljø og driftsprøver. `vercel.json` indeholder Next.js-indstillinger og afgrænsede function-deadlines. Den aktuelle publicerede hybrid bruger den lokale database i stedet.

Providerhemmeligheder bliver på serveren og GUI-gemte værdier krypteres med AES-256-GCM. Indstillingerne viser kun ikkehemmelig konfiguration og status. Gem, test og aktivér en forbindelse; testen foretager et rigtigt værktøjskald og en rigtig stream. Et skift til demo foretager ingen eksterne modelkald.

Corti-live bruger en skemavalideret fritekstplan efterfulgt af serverberegning og et rigtigt streamet svar. Nye problemstillinger kan blive til illustrationer med synlige antagelser, beregnede grafer eller kvalitative procesdiagrammer. En testet forbindelse kan tildeles én eksisterende demobesøgende gennem en privat serverhandling; andre besøgende beholder Demo. [Corti-opsætning og verifikation](docs/CORTI-LIVE.md) beskriver adgang, kvoter, kilder og den konkrete FR-forbindelse.

MCP-/CLI-kontrakter har fungerende fixtures og kræver et konkret godkendt endpoint til ekstern drift. Ingen kommunal MCP-server eller ERP-forbindelse påstås tilsluttet. Standarddemoens kontekstserier er simulerede; det særskilt mærkede offentlige snapshot er tilvalg.

## Dokumentation

| Dokument                                                | Indhold                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| [DESIGN.md](docs/DESIGN.md)                             | Referencer, tokens, typografi, motion og arbejdsflader                  |
| [DATA.md](docs/DATA.md)                                 | Fortegn, periodisering, prognoser, nøgletal og scenarieformler          |
| [FORECASTS.md](docs/FORECASTS.md)                       | Flerårsprognoser, årlige beløb og den præcise følsomhedsformel          |
| [MUNICIPAL-BENCHMARKS.md](docs/MUNICIPAL-BENCHMARKS.md) | Officielle kommunenavne, syntetiske peers og ens sammenligningsgrundlag |
| [NAME-SOURCES.md](docs/NAME-SOURCES.md)                 | Verificerede officielle enhedsnavne og kilde-URL'er                     |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Identitet, beregninger, søgning, lake og integrationsgrænser            |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md)                 | MCP, CLI, idempotens, DST og præcis teststatus                          |
| [ENTRA.md](docs/ENTRA.md)                               | App-roller, scope, identitet, callbacks og bootstrap                    |
| [PROVIDERS.md](docs/PROVIDERS.md)                       | Fire udbydere, endpoints, credentials og kapabilitetstest               |
| [VERCEL.md](docs/VERCEL.md)                             | Hosting, migration, miljø, backup og resterende opsætning               |
| [DEMONSTRATION.md](docs/DEMONSTRATION.md)               | Kort præsentationsforløb fra en autoriseret session                     |
| [ACCEPTANCE.md](docs/ACCEPTANCE.md)                     | Målpromptens acceptkriterier og evidens                                 |
| [VERIFICATION.md](docs/VERIFICATION.md)                 | Udførte lokale kontroller og ikke afprøvede integrationer               |

## Repository

Arbejdet ligger på `feat/kaia-platform` med historik fra det eksisterende `Parthee-Vijaya/KAIA`. Den tidligere Vite-/Express-prototype er bevaret i `legacy/` og indgår ikke i build, runtime, dependencies eller den nye app. Dens mock-data er ikke K.A.I.A.'s datagrundlag. Frontenden er deployet til Vercel fra den lokale kode; GitHub er ikke pushed eller merged.

### Flyttemønstre og skolekapacitet

K.A.I.A. · Kommunal AI Analyse har et samlet demoforløb med seks synlige trin fra spørgsmål til kontrolleret handling. Fremblik og chatfeltet er bevaret. [Forløb, model og præsentationsmanuskript](docs/MOBILITY-FLOW.md).

Den detaljerede analyse har nu kontrolleret afspilning af de seks trin og fire grafiske visninger med filtre på skole, prognoseår og flyttetype. Se [rolig gennemgang og datadetaljer](docs/VISUAL-DEPTH.md).
