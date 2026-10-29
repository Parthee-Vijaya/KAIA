# Datakatalog, kontekst og integrationsopsætning

K.A.I.A.’s standarddemo er fuldt simuleret. `GET /api/catalog` kræver en valideret session og viser kun det scope og de operationer, brugeren må anvende. `integrationStatus` skelner mellem fixture, manglende opsætning og konfigureret forbindelse. “Konfigureret” betyder, at felterne findes; det er ikke en bestået netværksprøve.

## Datakatalog og planlægning

`SOURCE_CATALOG` beskriver indhold, begreber, enhed, geografi, frekvens, observations-/hentetid, periode, datastatus, roller og værktøjer. Økonomi, dokumenter, kontekst og eksterne værktøjer har egne kilde-ID’er. `planQuery` vælger relevante kilder fra spørgsmålet og den autoriserede analyseafgrænsning. `authorizeSource` afviser ukendte kilder, operationer, forkerte år/måneder og enheder uden for sessionens scope. Kommunalbestyrelsesmedlemmer har aggregeret økonomiadgang; dokumentværktøjerne håndhæver desuden politisk klassifikation for denne rolle.

V4-standardens simulerede katalogdækning er 2020–2032. `demo-municipal-benchmarks` beskriver den separate tabel med 16.506 månedlige rækker for seks kommuner; de 1.245.024 lokale posteringer og 1.742 dokumenter har egne kilder. Benchmarkens kommuneøkonomi, befolkning, elevtal og struktur er fuldt syntetisk. Kun navn/kode er verificeret hos Danmarks Statistik. Det valgfrie offentlige kontekstlag har fortsat sin snævrere, eksplicitte dækning fra snapshottene; v4 forlænger ingen offentlige observationer til 2032.

## Postgres og lake

Kør appens eksplicitte database-migration og seed som beskrevet i [VERCEL.md](VERCEL.md). Migrationen omfatter lake-tabellerne. `ingestSnapshot(input, access, request, lake)` validerer en ikke-tom rækkegruppe, entydige nøgler, enheder, perioder, finite tal og tidsstempler. En importgruppe dækker det år og de måneder, som `request.period` tillader, eller et eksplicit `periodRange: {fromYear, toYear}` inden for katalogets dækning. Større datasæt kan importeres i års-/månedsbatcher med hver sin observationstid og ikkeoverlappende rækkenøgler eller som ét godkendt flerårigt snapshot. Rettelser kræver en ny kildeversion.

Appens seed er en separat betroet indlæsningsvej. V4's fulde rå generatorudtræk bevares som manifest og 125 ordnede tekstdele i `kaia_lake_snapshots` / `kaia_lake_raw_chunks`. `src/integrations/seed-snapshot.ts` kontrollerer delhash, rækketal, rækkefølge og den rekonstruerede indholdshash ved genkørsel. De kuraterede data ligger i appens ledger-, dokument- og kommunetabeller; de store ledgerrækker duplikeres ikke i den generiske `kaia_lake_rows`. Ændret indhold accepteres aldrig under samme versionsnavn; brug en ny dataversion.

En ekstern lake kan understøttes ved at implementere og serverbinde `LakeAdapter.put/get/readRows`. `KAIA_LAKE_MODE` vises i status; feltet vælger ikke automatisk en anden lagringsimplementering. `put` skal atomisk bevare rådata og kuraterede rækker og håndhæve identitets-/overlapreglerne. Postgres-adapteren tager en `SqlExecutor` med parameterbinding og transaktioner:

```ts
interface SqlExecutor {
  query<T extends Record<string, unknown>>(text: string, values: unknown[]): Promise<T[]>;
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
```

Serveren skal skabe adapteren af sin konfigurerede databaseforbindelse; forbindelsesstrenge accepteres aldrig fra chatten. `readCuratedRows` filtrerer på tilladte enheder og periode. `readRawSnapshot` kræver adgang til hele snapshotgruppens scope. Importadapteren skal sikre, at det rå udtræk har samme deklarerede scope som normaliseringen. Et råt CSV- eller dokumentindhold kan ikke sikkert klassificeres ved at gætte scope ud fra tekst.

## Statistikbanken – reelt verificeret

Der er foretaget rigtige POST-kald til Danmarks Statistiks offentlige `tableinfo` og `data` den 20. oktober 2026. Snapshotfilen `src/integrations/snapshots/statbank-2026-10-20.json` indeholder metadata, præcise API-valg, rå CSV, normaliserede observationer, hentetid og SHA-256. Kontaktpersonfelter er fjernet. Resultaterne er fastlåst; standarddemoen læser dem kun ved eksplicit valg af offentlig kontekst.

| Tabel    | Verificerede valg                                                                                        | Periode og enhed                                             | Snapshot         |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- |
| `PRIS01` | `VAREGR=0451` elektricitet, `0722` brændstof/smøremidler; `ENHED=100`                                    | September 2025 og 2026; nationalt indeks, 2025 = 100         | 4 observationer  |
| `FOLK1A` | `OMRÅDE=326` Kalundborg; `KØN=TOT`, `ALDER=IALT`, `CIVILSTAND=TOT`                                       | 3. kvartal 2025 og 2026; antal personer den 1. i kvartalet   | 2 observationer  |
| `BEV107` | `OMRÅDE=326`; `B02/B03` fødte/døde, `B05/B06` til-/fraflytning, `B08AA/B09BA` ind-/udvandring; `KØN=M,K` | 2025; antal personer, de to køn beholdes som separate rækker | 12 observationer |

`PRIS111` blev undersøgt, men dens metadata slutter i december 2025. Derfor bruger den aktuelle adapter den aktive `PRIS01`. Tabel- og værdikoder er verificeret i API-metadata, og basisåret er verificeret i [Danmarks Statistiks dokumentation](https://www.dst.dk/da/Statistik/emner/oekonomi/prisindeks/forbrugerprisindeks). Indeksene må ikke sammenblandes på tværs af basisår eller klassifikation uden en dokumenteret kobling.

`StatbankClient` har en fast officiel origin og en allowlist af de tre tabeller. Hvert udtræk henter først metadata, kræver et eksplicit valg for hver variabel, afviser ukendte værdier/jokertegn og begrænser udtrækket til 10.000 celler. Manglende observationsværdier bevares som manglende data. Import er adskilt fra spørgsmål; præsentationen laver ingen automatisk liveopdatering.

`contextSeries` leverer mærkede og periodefiltrerede serier. De simulerede energi- og demografiserier afledes af det samme adgangsfiltrerede DB-datasæt som analysen; manglende år udelades og bliver aldrig til nuller. `enrichAnalysisWithContext` udfører kildeplanens seriekald og gemmer resultatet i `Analysis.contextSeries` sammen med kildeuddrag, observationer og antagelser. `KAIA_CONTEXT_MODE=simulated` er standard. `public-snapshot` gør routeren opmærksom på de offentlige snapshots. De dækker de anførte perioder; uden for dækningen forklares manglende ekstern kontekst, mens den gyldige lokale analyse bevares. Økonomital forbliver simulerede. Public snapshot-versionen er selvstændig og fremgår sammen med kommunaldatasættets version i konteksten.

Udviklere kan generere en **ny navngivet fil** med `npx tsx src/integrations/refresh-snapshot.ts`. Scriptet bruger `wx` og overskriver aldrig den eksisterende præsentationsfil. Før et nyt snapshot indlæses, ændres versionsnavn, perioder og målfil eksplicit; derefter kontrolleres metadata, hash og tests. Scriptet køres uden for Vercels spørgsmålsflow.

Kilde og licens: [Statistikbankens API-dokumentation](https://www.dst.dk/da/Statistik/hjaelp-til-statistikbanken/api). Offentlige data tilskrives Danmarks Statistik; API-dokumentationen angiver CC BY 4.0. Kildernes navne og metadata dokumenterer ikke de fiktive økonomital.

## MCP-gateway

`McpGateway` implementerer en begrænset MCP-klient til protokolversion `2025-06-18` over Streamable HTTP. Den udfører `initialize`, `notifications/initialized`, `tools/list` og det eneste godkendte værktøj `catalog_lookup`. Den understøtter JSON eller en afgrænset SSE-respons og genbruger serverens MCP-session-ID. Protokolversion, `tools`-kapabilitet, læseannotation, request-ID og struktureret svar valideres. En annotation alene giver ikke tilladelse; værktøjsnavn, input og output kontrolleres også lokalt.

Konfigurationen kommer fra servermiljøet og skal være fastlagt af drift:

```dotenv
KAIA_MCP_URL=https://integrations.example.org/mcp
KAIA_MCP_ALLOWED_HOST=integrations.example.org
KAIA_MCP_TOKEN=example-server-token
```

Opret `new McpGateway({url, allowedHost, token})` på serveren, når et konkret godkendt endpoint skal bruges. Chatrouteren er ikke automatisk forbundet til gatewayen; miljøfelter alene etablerer ingen ekstern værktøjsbinding. Ingen bruger- eller modeltekst kan vælge endpoint eller credential. Gatewayen har timeout og afviser redirects og interne netværksadresser. Der sendes et pseudonymiseret subject samt det godkendte scope; ingen visningsnavne. Gatewayen afgiver audit-events med operation, kilde, internt bruger-ID, tid, varighed og udfald til en injiceret auditfunktion. Den indeholder ingen token eller kildeindhold; en vedvarende auditmodtager skal tilsluttes sammen med den konkrete integration.

Uden konfiguration kører en tydeligt mærket kontraktfixture. Den svarer med syntetiske katalogmetadata og har ingen ekstern forbindelse. Der hævdes ingen MCP-understøttelse fra et kommunalt kildesystem. Real integration kræver godkendt endpoint, credentials, transport-/scope-/timeoutprøve og driftsgodkendt egress. Se den officielle [transportspecifikation](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) og [værktøjsspecifikation](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## CLI-runner

`CliRunnerGateway` foretager et beskyttet HTTP-kald med `commandId="snapshot_status"` og de validerede argumenter `sourceId` og `datasetVersion`. Kommando-ID, tilladt kilde og resultatets kildeversion kontrolleres. Der accepteres ingen shelltekst, filsti, executable eller miljøvariabel fra modellen. Vercel starter ingen proces.

```dotenv
KAIA_CLI_RUNNER_URL=https://integrations.example.org/v1/jobs
KAIA_CLI_ALLOWED_HOST=integrations.example.org
KAIA_CLI_RUNNER_TOKEN=example-server-token
```

Den eksterne runner skal autentificere token, kontrollere operation/scope, mappe kommando-ID’et til en fast implementering, bruge særskilte credentials, begrænse ressourcer og returnere JSON med job-ID, status og resultat. Gatewayen skal serverbindes eksplicit; den indgår ikke automatisk i chatrouterens værktøjer. Langvarige jobs hører til runneren og kræver særskilt job-/pollingkontrakt; første version implementerer kun den korte læsekontrakt. Uden konfiguration returnerer fixture `rowCount=0` som fixturestatus, aldrig som en påstand om en tilsluttet kilde.

## Teststatus

`tests/integrations.test.ts` har 22 målrettede tests af katalogpolitik, rolle-/enhedsscope, modelplaner, idempotens, versionskonflikt, rå-/kurateret adgang, manglende data, MCP-håndtryk, faste CLI-kommandoer, SSRF-afvisning, DST-metadatavalg, CSV, snapshot-hash, udført kontekstberigelse og manglende offentlig dækning. Disse er automatiske fixture- og kontraktprøver.

`tests/integrations-postgres.test.ts` har desuden tre tests, som er kørt og bestået mod rigtig lokal Postgres den 20. oktober 2026: rå-/kurateret JSONB roundtrip med idempotens og konflikt, SQL-filtreret enhedsscope med afvist råeksport samt rollback af en overlappende snapshotgruppe. Testene aktiveres eksplicit med `KAIA_DB_TEST=1 npx vitest run tests/integrations-postgres.test.ts` og afviser andre værter end den lokale testdatabase på port 55432. De opretter og fjerner kun deres egne versionsafgrænsede testdata. `src/server/lake.ts` håndterer postgres.js’ JSONB-parameterkodning ved grænsen til den generiske SQL-adapter.

Den offentlige Statistikbank-API er også prøvet reelt med de anførte udtræk. Der er ingen credentialbaseret ekstern MCP-/CLI-/lake-udbyderprøve og ingen påstand om driftstest på Vercel. Appens øvrige kontroller fremgår af den samlede verifikationsrapport; et grønt fixture-resultat dokumenterer ikke en ekstern forbindelse.
