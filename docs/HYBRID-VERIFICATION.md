# Verificeret hybrid demo

**21. oktober 2026 · Europe/Copenhagen**

- Offentlig frontend: **https://kaia-sand.vercel.app**.
- Vercel-projekt: `parthee-vijayas-projects/kaia`, `prj_AtA9rz1xvcTViLOnOsVGgizbVrFb`.
- Deployment: `dpl_E7tMYcs6cgdMWLCi3qCBVFBpJYSJ`, `READY`, target `production`.
- Deployet kode: commit `c656d67` på `feat/kaia-platform`. Deployet direkte fra lokalt repository; intet GitHub-push eller merge.
- Backend: faktisk lokal produktionsserver, Node 24.19.0, port 3212, HMAC-beskyttet HTTPS-tunnel.
- Database: særskilt lokal PostgreSQL 16.13, port 55433, SCRAM; 224.532 posteringer og 204 dokumenter, version `KAIA-DEMO-2026.09-v3`.

## Udførte kontroller

**126 tests i 9 filer bestået** med `KAIA_DB_TEST=1 npm test`: 18 reelle Postgres-prøver og 108 domæne-/kontrakt-/fixturetests. TypeScript, ESLint, produktionsbuild uden credentials og formatering er gennemført. `npm audit` rapporterer 0 sårbarheder. Vercels eget produktionsbuild er desuden gennemført på platformen med Node 24 og Next.js 16.4.2.

[hybrid-http-verification.json](hybrid-http-verification.json) registrerer **38 beståede faktiske HTTP-kontroller** mod den offentlige Vercel-adresse. De kan gentages med Node 24 og `node scripts/verify-hybrid.mjs`. Det er en reel Vercel → HTTPS-tunnel → lokal backend → Postgres-prøve, uden Entra- eller AI-credentials.

Prøven dækker offentlig loginflade, anonym 401, sikre cookies, tre serverdefinerede profilvalg, fire relevante forslag, afstemte tal/graf, NDJSON-status/analysis/done, læsbart simuleret dokument, gemt indsigt og genlæsning, periodeopfølgning, serverberegnet scenarie, gem/genåbn, rolle-/områdescope og afvist provideradministration. To besøgende med samme visningsprofil får forskellige identiteter; en andens samtale og eksport giver 404, og private indsigter vises ikke på tværs.

Direkte usignerede `/api/session` og `/api/workspace` giver 401 både på localhost og den offentlige tunnel. HMAC-tests afviser ændret body, path/query, origin, cookie og udløbet/fremtidig signatur; nøglen følger aldrig responsen til browseren. De særskilte testfixtures er fortsat deaktiveret på Vercel/produktion.

## Faktisk browserforløb

Den offentlige loginflade viste tydeligt »Demologin · Microsoft-login tilsluttes senere«. Valget Parthee åbnede arbejdsfladen som Direktion / AI Program Lead, med mærkerne Demologin, Simulerede data og Demo hver for sig og uden administratornavigation.

Budgetforslaget gav nettoforbrug **240.265.693 kr.** for januar–september 2026 og afvigelse **6.163.408 kr.**, med samme tal i figur og kilde. Budgetnotatet åbnede i et læsbart panel med mærkningen SIMULERET MATERIALE og korrekt dataversion. Indsigten blev gemt. Efter en faktisk genstart af den lokale backend og genindlæsning af Vercel-siden var session, samtale, analyse og den gemte indsigt bevaret. Browserkonsollen returnerede ingen warnings eller errors i det gennemgåede forløb.

Den afgrænsede Vercel-logforespørgsel for deploymentets første 20 minutter returnerede ingen errorlogs. Der er ikke opsat eller påstået permanent monitorering. Den tidligere responsive gennemgang gælder stadig det bevarede layout; denne nye eksterne browserprøve var ved normal laptopbredde, ikke fysisk iPad.

## Driftsgrænser

Dette er den af Parthee udtrykkeligt ønskede demoautentifikation. Den beviser ikke Microsoft Entra-login. Offentlige demosessioner anvender altid deterministisk Demo og kan ikke udløse modelkald, selv om en privat provider er aktiv. Rigtige modelkonti og Entra-tenant er stadig ikke integrationsafprøvet.

Mac'en skal være tændt, vågen og online. Backend, database og tunnel kører som egne baggrundstjenester og kræver ikke et åbent terminalvindue. Start ved login er konfigureret, men en fysisk Mac-genstart er ikke udført som test.

Cloudflare Quick Tunnel er midlertidig: dens hostname skifter ved genstart af tunnelprocessen eller Mac'en. Vercels `KAIA_REMOTE_BACKEND_URL` skal derefter opdateres, og frontenden redeployes. En genstart af selve backend har derimod bevaret forbindelsen og data, som verificeret ovenfor. Til længerevarende drift kræves en tunnel med stabilt hostname eller en anden fast backendforbindelse. Se [HYBRID-DEMO.md](HYBRID-DEMO.md) for drift, private miljøfiler og publiceringskommandoer.
