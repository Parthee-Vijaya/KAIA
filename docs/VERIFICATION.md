# Verifikation af K.A.I.A.

Afsluttet **21. oktober 2026**, lokal tid i København. Koden er implementeret på `feat/kaia-platform` i det selvstændige KAIA-repository. Den tidligere prototype er bevaret i `legacy/`. Der er ikke foretaget push eller Vercel-deployment.

## Resultat og afgrænsning

Den lokale demo fungerer fra en eksplicit testidentitet gennem adgangspolitik, Postgres, beregning, svar, kilde, diagram og gemte artefakter. Standarddemoen foretager ingen modelkald. Produktionsversionens normale login er fortsat Microsoft Entra ID; de lokale testidentiteter bliver afvist i produktion, også hvis en gammel testsession genbruges.

Det faste præsentationsgrundlag er `KAIA-DEMO-2026.09-v3`, seed `kaia-kalundborg-2026`, referencedato 30. september 2026. Det indeholder **224.532 økonomiposteringer, 204 dokumenter, 16 skoler, 8 faciliteter, 7 udvalg og 9 øvrige organisationsenheder**. Navne er verificerede; økonomi, aktivitet, demografi, dokumentindhold og beslutninger er simulerede. Ældre udviklingsversioner overskrives ikke.

## Automatiske kontroller

Kørt med Node **24.19.0**, Next.js **16.4.2** og lokal Postgres **16**:

| Kontrol                        | Resultat                                                                |
| ------------------------------ | ----------------------------------------------------------------------- |
| `npm run typecheck`            | Bestået, strict TypeScript                                              |
| `npm run lint`                 | Bestået, inklusive React Hooks-regler                                   |
| `KAIA_DB_TEST=1 npm test`      | **105 tests i 7 filer bestået**                                         |
| Heraf faktiske Postgres-prøver | **9 tests**, øvrige 96 er domæne-, kontrakt- og fixturetests            |
| `npm run build:clean`          | Bestået produktionsbuild; credentials og database-URL eksplicit tømt    |
| `npm audit --json`             | **0 rapporterede sårbarheder**, både runtime og udviklingsafhængigheder |
| `git diff --check`             | Bestået ved aflevering                                                  |

Testene kontrollerer fuld reproducerbarhed, sikre heltal i øre, indtægtsfortegn, ens periodedækning, samme tal i graf og metrics, udgift pr. elev, afstemte afvigelsesbidrag, alle seks diagramtyper, manglende data og fremtidige perioder uden realiserede posteringer. De kontrollerer også, at energi-, løn- og vikarændringer kun rammer relevante poster, at kombinationer ikke dobbelttælles, og at pris + mængde + samspil afstemmes eksakt. Demografimodellen holder variable og faste omkostninger samt flytning, vandring og aldersovergange adskilt.

Sikkerhedsprøver dækker tenant/oid, roller og scope uafhængigt af visningsnavn, aktuelt scope ved hver request, tilbagekaldt adgang til gamle snapshots, Council-aggregater, private samtaler/indsigter/eksporter, dokumentklassifikation, Origin, inputgrænser, kryptering/maskering og endpointkontrol. Modelværktøjer er bundet til det allerede autoriserede beregningsgrundlag.

Providerkontrakterne bruger kontrollerede HTTP-/SSE-fixtures. De afprøver parametre, værktøjskald, streamformat, fejl, rate limits, afbrudte streams og Corti-tokenfornyelse. **De er ikke reelle API-kald til en modelkonto.**

Postgres-prøver bruger den rigtige database til sessions, ejerkontrol, scope, snapshotlagring, filtrerede forespørgsler samt atomisk/idempotent indlæsning med rollback og konfliktkontrol. Migration og seed er kørt; gentagen seed bevarer identiteter og brugerartefakter.

## Faktiske HTTP- og produktionsprøver

De maskinlæsbare protokoller indeholder ingen sessiontokens eller credentials:

- [api-verification.json](api-verification.json): **31 kontroller** af blandt andet 401 uden login, fire forslag, ejer-404, scope-403, kilder, eksport, scenarier og serverpreview.
- [demo-questions-verification.json](demo-questions-verification.json): **24 spørgsmål og kontekst-/versionskontroller** gennem rigtig lokal HTTP og Postgres. Historiske samtaler fastholder deres snapshot; konflikt med en anden dataversion afvises.
- [production-verification.json](production-verification.json): **9 kontroller** mod en separat `next start` på port 3211. Testformularen er skjult, testlogin giver 404, en gyldig udviklingstestsession giver 401 i produktion, og private svar har `no-store`. Council-navigationen indeholder ikke enhedernes syntetiske budget- eller elevattributter.

Den midlertidige produktionsserver er stoppet efter prøven. Udviklingspreviewet på port 3210 og den isolerede lokale database er bevaret til gennemgang. En lokal produktionsserver dokumenterer ikke Vercel-netværk, hosted pooling eller cold starts.

## Browsergennemgang

Browseren er faktisk betjent med administrator- og skolechef-fixtures. [browser-verification.json](browser-verification.json) registrerer forløbene og størrelserne.

- Velkomst med personlig profil, aktivt område, præcis fire fungerende forslag og adskilte markeringer for datastatus og svarudbyder.
- Budgetanalyse med læsbar konklusion, afstemte nøgletal og graf. Klik på kilde åbner mærket demomateriale med periode, ID, type og uddrag. Underliggende tabel viser præcise kroner.
- Gem indsigt og genåbn efter reload. Opfølgningen »Vis samme analyse for 2025« ændrer år og bevarer månedsspændet. Navngivet skole i spørgsmålet erstatter et gammelt institutionsfilter.
- Energi +15 % resten af året: baseline **321.829.103 kr.**, scenarie **322.936.426 kr.**, forskel **1.107.323 kr.** Tastaturændring til +21 % genberegner automatisk til **323.379.355 kr.**, forskel **1.550.252 kr.** Januar–september er uændret; kun oktober–december påvirkes.
- Scenariet gemmes med navn, genåbnes fra navigationen og nulstilles til 0 kr. i forskel, uden at den gemte original ændres.
- Skolechefen ser Anne Dandanell / Chef, skoleområdet og ingen administratoradgang. Spørgsmål om socialområdet giver en faktisk 403 og en forståelig fejl. Spørgsmål om faktiske kommunale budgettal giver en ærlig besked om manglende datagrundlag.
- Sammenligningsgrafen viser alle 16 skolenavne; lange navne ombrydes i vandrette søjler. Udvidet figur, tabel og kilder bruger samme version.
- Navigation, input, filtre og fire forslag kontrolleret ved **1280×720, 1920×1080, 1024×768, 768×1024 og 390×844**. Ingen vandret dokumentoverflow. Input er 16 px; ny samtale og indstillinger er tilgængelige på smal skærm.
- Tastaturbetjente scenariesliders, synlige fokusmarkeringer og dialogens Escape/fokus kontrolleret. Indstillingen for dæmpet bevægelse bevares efter reload og skjuler velkomstmotionen. `prefers-reduced-motion` er også understøttet i CSS.

Viewportprøverne er browseremulering, ikke en fysisk iPad eller en skærmlæserprøve. En tidligere diagramadvarsel om initial 0-bredde blev håndteret med en eksplicit startdimension; faktisk diagramaflæsning er verificeret visuelt.

## Offentlige kilder og eksterne integrationer

Officielle Kalundborg-sider er brugt til navne og stavning. De er ikke belæg for økonomital. Statistikbankens aktuelle metadata er hentet og kontrolleret før data: **PRIS01, FOLK1A og BEV107**. PRIS111 var afsluttet og blev ikke brugt som en aktuel serie. Det låste offentlige snapshot har kilde, geografi, enhed, observationsperiode, hentetidspunkt og checksum. Det er et eksplicit tilvalg; standardkonteksten er simuleret.

Følgende er **implementeret, men ikke integrationsafprøvet i det eksterne miljø**:

| Område                    | Resterende opsætning og prøve                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entra ID                  | Tenantregistrering, client ID/secret, præcis HTTPS-callback, app-roller, bruger-/gruppetildeling og serverbaseret enhedsscope. Gennemfør rigtigt login, forkert tenant, manglende rolle og sessionudløb.  |
| Fire AI-udbydere          | Egne credentials, konkret model/deployment og endpoint/region. Kør administratorens rigtige værktøjs- og streamingtest for hver ønsket forbindelse. Corti OAuth kræver også den valgte tenants opsætning. |
| Hosted Postgres og Vercel | Opret projekt/database, pooled TLS-forbindelse og servermiljø. Kør eksplicit migration/seed, og prøv reload, cold start og redeployment mod samme database.                                               |
| Ekstern lake, MCP og CLI  | Konkrete godkendte endpoints og særskilte credentials. Lokale kontrakter/fixtures er afprøvet; ingen kommunal ERP-, ESDH- eller MCP-tjeneste er påstået tilsluttet.                                       |
| Drift                     | Backup/restore i det valgte miljø, nøglerotation, monitorering, faktisk iPad og relevant skærmlæser.                                                                                                      |
| CI                        | Workflowet er leveret, men ikke pushed eller kørt på GitHub. Lokale resultater er ikke grøn CI.                                                                                                           |

Se [ENTRA.md](ENTRA.md), [PROVIDERS.md](PROVIDERS.md), [VERCEL.md](VERCEL.md) og [INTEGRATIONS.md](INTEGRATIONS.md) for de konkrete felter og kommandoer. [ACCEPTANCE.md](ACCEPTANCE.md) kobler leverancen til målpromptens kriterier.
