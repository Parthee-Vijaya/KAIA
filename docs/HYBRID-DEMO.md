# Hybrid demo: Vercel og lokal backend

Denne præsentationsopsætning bruger **demologin uden Microsoft Entra ID**. Brugerfladen markerer det som **“Demologin · Microsoft-login tilsluttes senere”**. Det er en eksplicit demoindstilling, som erstatter kravet om Entra i denne præsentation; den er ikke en verificeret Microsoft-identitet eller kommunal produktionsopsætning.

Vercel leverer den offentlige webadresse og brugerfladen. En beskyttet servergateway forbinder Vercel med den lokale backend på Mac'en. Backend udfører login, adgangskontrol, beregninger og lagring i den lokale Postgres-database. Browseren modtager ingen gatewayhemmelighed eller databaseforbindelse.

## De tre demoprofiler

| Valg på loginfladen                | Visningsprofil | Rolle og adgang                                             |
| ---------------------------------- | -------------- | ----------------------------------------------------------- |
| Parthee · AI Program Lead          | Parthee        | Tværgående overblik inden for demoens tildelte scope        |
| Anne Dandanell · Chef              | Anne Dandanell | Skoleområdets økonomi, institutioner og tilladte dokumenter |
| Udvalgsmedlem · Politisk materiale | Udvalgsmedlem  | Aggregerede oplysninger og politiske demodokumenter         |

Der tilbydes ingen offentlig administratorprofil. Profilerne er forberedte præsentationsvalg; navn eller stilling giver ikke i sig selv rettigheder. Serveren tildeler demoidentitet, rolle og enhedsscope, og de samme adgangsregler håndhæves i analyser, kilder, scenarier, eksport og personlige snapshots. Hvert nyt demologin opretter en særskilt demoidentitet, så personer, der vælger samme visningsprofil, ikke får adgang til hinandens samtaler. Den aktive session skal bevares for at genåbne sit arbejde efter en genindlæsning.

Formularen sender kun `profile=executive`, `profile=school` eller `profile=council` til `POST /auth/demo`. Backend kontrollerer forespørgslens origin og opretter sessionen. Klienten sender ikke roller, tenant-ID eller enhedsrettigheder. En vellykket forespørgsel viderestiller til arbejdsfladen.

## Drift under præsentationen

Mac'en skal være **tændt, vågen og på nettet**, og den lokale backend, Postgres og gatewayforbindelsen skal køre. En fungerende Vercel-side alene er ikke nok til at gennemføre analyser i denne driftsform. Ved afbrudt backendforbindelse skal forbindelsen genskabes, før der logges ind eller sendes flere spørgsmål.

Demotilstanden fungerer **uden AI-API-nøgle**. Den deterministiske fortolker bruger de samme simulerede data, beregninger, dokumenter og diagrammer som en konfigureret AI-forbindelse. Tre mærkater holdes adskilt:

- **Demologin** beskriver autentifikationen.
- **Demo** eller udbyder/model beskriver, hvordan svaret formuleres.
- **Simulerede data** beskriver kommunens tal og beslutninger i begge formuleringstilstande.

Samtaler, indsigter og scenarier gemmes i den lokale Postgres-database. De forsvinder ikke ved et nyt Vercel-deploy. Tilgængeligheden og sikkerhedskopieringen følger den lokale backend og database. Denne opsætning kobler ikke K.A.I.A. til faktiske kommunale systemer.

## Backendens kontrakt

`setupStatus()` angiver `authMode: 'demo' | 'entra'`, `demoEnabled`, `database`, `session`, `entra`, `encryption`, `localTest`, `callbackUrl` og `ready`. I demo afhænger `ready` af database og gyldig sessionsopsætning. Loginformularen forbliver deaktiveret, hvis disse forudsætninger mangler. `GET /api/session` leverer opsætningsstatus og den aktuelle, servervaliderede session.

På backend vælges den autoriserede præsentationstilstand med `KAIA_AUTH_MODE=demo`. `KAIA_APP_URL` skal være den faktiske offentlige applikationsorigin, så origin-kontrol og redirects matcher Vercel-adressen. Sessionshemmelighed og alle gatewaycredentials ligger i servermiljøet. Entra-felter aktiverer ikke automatisk Microsoft-login, mens demoindstillingen er valgt.

## Gateway og miljøer

Browseren bruger de uændrede same-origin-ruter `/api/*` og `/auth/*` på Vercel. `src/proxy.ts` signerer og videresender forespørgsler til én fast HTTPS-backend. Frontendens serverrendering henter session og opsætningsstatus gennem `/api/session`. Gatewayhemmeligheden bruges kun mellem serverne og sendes aldrig til browseren.

| Miljø         | Variabler                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel        | `KAIA_REMOTE_BACKEND_URL`: backendens faste HTTPS-origin; `KAIA_REMOTE_GATEWAY_KEY`: serverbaseret HMAC-hemmelighed; `KAIA_APP_URL`: den stabile Vercel-origin                                           |
| Lokal backend | Samme `KAIA_REMOTE_GATEWAY_KEY`; `KAIA_REQUIRE_GATEWAY=1`; `KAIA_AUTH_MODE=demo`; `KAIA_APP_URL`: frontendens offentlige origin; `DATABASE_URL` og de eksisterende sessions- og krypteringshemmeligheder |

Den lokale Node-server kører på `127.0.0.1:3212`. Den særskilte Cloudflare Quick Tunnel forbinder til denne server. Direkte, usignerede forespørgsler gennem tunnelen skal afvises af gatewaykontrollen. Database- og modelcredentials forbliver på Mac'ens backend og skal ikke sættes på Vercel.

### Aktuel tunnel til præsentationen

Verificeret 21. oktober 2026: `https://weekends-motion-cloudy-skins.trycloudflare.com` peger på `http://127.0.0.1:3212`. Den bruger HTTP/2 mod Cloudflare. Den isolerede LaunchAgent `dk.kaia.demo.tunnel` har `RunAtLoad` og `KeepAlive`; agentfilen ligger i `~/Library/LaunchAgents/`. Runtime og private stdout-/stderr-logs ligger i `~/Library/Application Support/KAIA/hybrid/`. Metrics lytter kun på `127.0.0.1:20242`; `/ready` har svaret HTTP 200 med én aktiv tunnelconnection. Den eksisterende Cloudflare-tunnel og Tailscale-ruterne på 443, 4443, 8443 og 9443 er bevaret uændrede. Tailscale Funnel blev ikke aktiveret, fordi tailnettet kræver en særskilt ekstern aktivering.

Quick Tunnel-adressen er **midlertidig og skifter ved procesgenstart**, herunder efter genstart af Mac'en og indlæsning af LaunchAgenten ved login. `KeepAlive` gør processen vedvarende, men fastholder ikke hostname. Den nye adresse skal efter hver sådan genstart sættes i Vercels servervariabel `KAIA_REMOTE_BACKEND_URL`, hvorefter frontend skal redeployes. Agentens seneste log eller metrics angiver den aktuelle adresse; en tidligere adresse må ikke antages at virke.

`scripts/hybrid-tunnel.plist.example` er en skabelon med placeholders til cloudflared-binary og lokal runtime. Den indeholder ingen lokal brugersti, credentials eller logindhold. Den konkrete agent kører cloudflared med `--protocol http2`, `--url http://127.0.0.1:3212` og `--metrics 127.0.0.1:20242`. Stop eller genstart kun denne agent; brug ikke reset på eksisterende tunnel-/Serve-opsætninger.

Cloudflare beskriver [Quick Tunnels som udviklings-/testforbindelser](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), uden oppetidsgaranti og uden SSE-understøttelse. Appens NDJSON-forløb og eventuel modelstreaming skal verificeres gennem den faktiske gateway; en aktiv tunnel alene beviser ikke streaming. Til fast hosting bør forbindelsen erstattes med en konfigureret tunnel med stabilt hostname. Direkte kald til private backendruter uden gyldig HMAC skal give 401, også via den offentlige tunnel. Dette er kontrolleret 21. oktober 2026: både `/api/session` og `/api/workspace` svarede 401 uden signatur, såvel direkte på `127.0.0.1:3212` som gennem den aktuelle Quick Tunnel.

Vercel-projektet `kaia` under `parthee-vijayas-projects` er nu publiceret på **https://kaia-sand.vercel.app**. Deployment `dpl_E7tMYcs6cgdMWLCi3qCBVFBpJYSJ` er `READY`, target `production`, med kodecommit `c656d67`. 38 faktiske HTTP-kontroller gennem Vercel er bestået, inklusive demologin, analyse, dokument, scenarie, persistens og ejerskab. Browserlogin, graf, kildeåbning, gem indsigt og reload efter genstart af den lokale backend er også prøvet. Se [HYBRID-VERIFICATION.md](HYBRID-VERIFICATION.md), [VERCEL.md](VERCEL.md), [ENTRA.md](ENTRA.md) og [DATA.md](DATA.md).

Offentlige demobesøgende bruger Demo uden modelkald. Kun en særskilt privat servertildeling til en eksisterende besøgsidentitet kan aktivere den testede Corti-forbindelse. Tildelingen gælder ikke andre personer, der vælger samme visningsprofil; ingen offentlig loginmulighed giver adgang til nøglen eller provideradministration. Se [CORTI-LIVE.md](CORTI-LIVE.md). Demologin har et fælles, atomisk DB-budget på 120 login i timen, og demoanalyser har en fælles grænse på 300 i timen ud over grænsen på 60 pr. besøgende. Privat live har desuden højst 60 forespørgsler pr. UTC-døgn og ét samtidigt svar. En overskridelse giver HTTP 429. Navngivne demoidentiteter får aldrig administratorrettigheder.

### Lokal baggrundsdrift

Tre separate LaunchAgents starter ved brugerlogin og genstarter ved procesfejl:

- `dk.kaia.demo.backend`: Node 24, standalone-build, kun `127.0.0.1:3212`.
- `dk.kaia.demo.postgres`: isoleret PostgreSQL 16 på `127.0.0.1:55433`, SCRAM-password og data i `~/Library/Application Support/KAIA/postgres/`.
- `dk.kaia.demo.tunnel`: den ovenfor beskrevne Quick Tunnel.

Den oprindelige udviklingsdatabase på port 55432 er bevaret. Hybridbackend har sin egen database og private besøgsdata. Begge databaser har nu `KAIA-DEMO-2026.09-v4` med 2020–2032, 1.245.024 posteringer, 1.742 dokumenter og 16.506 benchmarkrækker for seks kommuner. Alle kommunale økonomi-/strukturværdier er syntetiske; kun navne/koder er officielle. Migration, seed, backendmiljø/build og Vercel-frontend er opdateret og [faktisk verificeret](EXPANDED-VERIFICATION.md). Tidligere samtaler fastholder v3; start en ny samtale til v4. Den historiske hybridrapport bevarer evidensen fra den første v3-kørsel.

Miljøfilerne `database.env` og `backend.env` i `~/Library/Application Support/KAIA/hybrid/` har rettighed 0600. De er hverken committed eller uploadet til Vercel. Vercel har kun app-origin, demomode, backend-origin og gatewaynøglen.

Efter en kodeændring kan den lokale runtime opdateres fra repositoryet med `npm run build:clean`, `node scripts/publish-local-backend.mjs` og `node scripts/install-local-backend.mjs` under Node 24. Publiceringsscriptet kopierer det selvstændige build og statiske filer til en ny version i Application Support uden `.env`-filer og skifter `current`-symlink. Ældre runtimeversioner bevares. Det ændrer ikke Postgres eller tunnelprocessen. Frontendændringer kræver også nyt Vercel-deploy.

## Når Entra tilsluttes

Microsoft-login er fortsat et særskilt integrationsforløb med tenantafgrænset OIDC, stabile tenant-/object-ID'er, validerede app-roller og kontrolleret enhedsscope. Når det faktisk er konfigureret og prøvet, skiftes autentifikation til `KAIA_AUTH_MODE=entra`. Loginfladen viser derefter den eksisterende Microsoft-formular. Et gennemført demologin må ikke rapporteres som en bestået Entra-prøve.
