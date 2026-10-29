# AI-forbindelser

K.A.I.A. bruger fire direkte REST-adaptere til den dokumenterede OpenAI-kompatible Chat Completions-kontrakt. Der installeres ikke et provider-SDK, som derefter antages at have bestemte API'er. `fetch` i Node sender begrænsede, skemavaliderede værktøjer og læser SSE-streamens `delta.content`. Reasoning-felter sendes aldrig til brugergrænsefladen. Demo bruger samme database, analyseobjekt, beregningslag og kilder uden eksterne AI-kald.

| Forbindelse  | Base-URL                                                         | Model og autentifikation                                      |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| OpenAI       | `https://api.openai.com/v1`                                      | Konfigureret chatmodel; Bearer API-nøgle                      |
| Mistral      | `https://api.mistral.ai/v1`                                      | Konfigureret tilgængelig model; Bearer API-nøgle              |
| Azure OpenAI | `https://<resource>.openai.azure.com/openai/v1`                  | Deploymentnavnet som `model`; `api-key` header                |
| Corti Models | `https://ai.<region>.corti.app/v1`, region `eu`, `us` eller `fr` | Konfigureret model; API-nøgle eller serverbaseret OAuth-token |

Azure-adapteren bruger v1-ruten, hvor `api-version` ikke er et forespørgselsparameter. Det ældre deployment/API-version-format er ikke valgt. Officielle `*.services.ai.azure.com/openai/v1`-hosts accepteres også. Corti Models er adskilt fra `api.<region>.corti.app` og Cortis øvrige produkter.

### Corti S1 og den offentlige demo

Cortis Models-dokumentation er genkontrolleret 21. oktober 2026: `corti-s1` og S1-varianterne understøtter chat, streaming og værktøjskald. Den konkrete kontos adgang skal fortsat bekræftes med en rigtig forbindelsesprøve. Adapteren accepterer et konfigureret S1-modelnavn.

De offentlige [Models-regionssider](https://docs.corti.ai/models/regions) dokumenterer EU og USA. Cortis [miljøoversigt](https://docs.corti.ai/authentication/environments_tenants) beskriver desuden FR som et særskilt miljø i Paris med adgang efter aftale; miljø og identitetens tenant er forskellige begreber. For den konkrete FR-forbindelse er DNS/TLS og `GET https://ai.fr.corti.app/v1/models` verificeret 21. oktober 2026, og kataloget indeholdt blandt andet `corti-s1`, `corti-s1-instant` og `corti-s1-mini`. Kataloget svarede også uden nøgle, så HTTP 200 derfra beviser ikke adgang til chat. Dette er en konkret endpointverifikation, ikke et generelt løfte fra de offentlige Models-regionssider om FR-adgang til alle kunder.

En reel streaming-chat med den konfigurerede FR-nøgle og `corti-s1-instant` er også gennemført 21. oktober 2026: `POST /v1/chat/completions` svarede HTTP 200 med 56 tekstframes og 175 tegn på cirka 2,15 sekunder. Prøven brugte en kort dansk forbindelsesprompt uden kommunale data. Den bekræfter den konkrete kombination af nøgle, model og streaming-endpoint; den erstatter ikke applikationens særskilte værktøjs- og forbindelsestest før aktivering.

Vælg den region, projektet er oprettet i. FR bruger `ai.fr.corti.app/v1`; OAuth bruger `auth.fr.corti.app`. Der foretages aldrig automatisk fallback til EU eller USA. Et regionsskift uden et eksplicit endpoint vælger den nye regions standardhost, bevarer credentials og kræver en ny forbindelsestest. Et eksplicit endpoint fra en anden region afvises.

Offentlige `demo:*`-identiteter bruger som udgangspunkt Demo og har ingen provideradministration. En nøgle eller et vist profilnavn aktiverer ikke Corti. En privat serverhandling kan tildele den eksisterende, præcise besøgsidentitet adgang til en testet Corti-forbindelse. Tildelingen er bundet til model og konfigurationsfingerprint; den ændrer hverken roller, enhedsscope eller den globale standardudbyder. En anden besøgende med samme navn arver intet. Nøglen gemmes på backend og returneres aldrig til browseren.

Live-modellen fortolker fritekst gennem ét begrænset `select_analysis_plan`-værktøj. Den vælger enten en eksisterende analyse eller en illustration med eksplicitte antagelser. Serveren validerer scope, dataversion og antagelser og beregner resultat og graf. Et andet modelkald streamer formuleringen fra dette beregningsgrundlag. Demo beholder sin deterministiske fortolker. Se [Corti-liveforløbet](CORTI-LIVE.md).

## Opsætning i brugergrænsefladen

Kun administratoren kan læse/redigere forbindelsesopsætning, hente modeloversigt og teste forbindelser.

1. Vælg udbyder, skriv konkret model eller Azure-deployment og verificér endpoint. Corti kræver den valgte projekts region: EU, USA eller Frankrig (FR). OAuth bruger desuden client-ID, client secret og tenant (standard `base`).
2. Gem forbindelsen uden at aktivere den. Tomme secretfelter bevarer den gemte hemmelighed. Redigering af model, endpoint, parametre eller credentials nulstiller teststatus.
3. Tryk **Test forbindelse**. Testen udfører et rigtigt chatkald, kræver et bestemt værktøjskald, sender værktøjsresultatet tilbage og gennemfører et rigtigt streamingkald med samme model. En model, som ikke bekræfter disse funktioner, kan ikke aktiveres. Fejl betyder ikke en vellykket forbindelse.
4. Aktivér den testede forbindelse som standard. Vælg Demo, hvis der ikke skal sendes modelkald.

Modelnavne antages ikke at være tilgængelige. `/models` kaldes ved OpenAI, Mistral og Corti, hvis adgangen tillader det. Azure-feltet er et deploymentnavn; modeloversigten viser kun det konfigurerede deployment. Manglende listeadgang forhindrer ikke et direkte testet modelvalg. Maksimalt output kan konfigureres mellem 100 og 4.096 tokens. Temperatur og tokenloft kan ryddes eksplicit med et tomt felt; API-kontrakten bruger `null` til rydning og bevarer udeladte felter. Temperatur sendes kun, når administratoren har angivet den; visse modeller afviser parameteren, hvilket den konkrete forbindelsestest fanger. OpenAI/Azure bruger `max_completion_tokens`; Mistral/Corti bruger `max_tokens`.

## Miljø og beskyttelse

`.env.example` viser præcise `KAIA_<PROVIDER>_*`-felter. GUI-konfiguration har forrang over miljøfelter; credentials, der ikke er erstattet i GUI, kan fortsat komme fra miljøet. Ingen variabel har `NEXT_PUBLIC_`-præfiks. API'et returnerer forbindelsens offentlige metadata: konfigureret/ikke konfigureret, aktiv status, model, endpoint, region, autentifikationsform, tenant, modelparametre og teststatus. De oprindelige credentials returneres aldrig, heller ikke til administratoren. En teststatus bindes til en serverberegnet fingerprint af den konkrete model, opsætning og credentials. Ændringer kræver en ny test; en test af en tidligere konfiguration kan ikke godkende nye credentials.

GUI-credentials krypteres som AES-256-GCM med separat tilfældig IV og autentifikationstag. Nøglen kommer fra `KAIA_ENCRYPTION_KEY`; databasen har ikke selv dekrypteringsnøglen. Rotér nøglen gennem en kontrolleret genkryptering, ellers kan eksisterende forbindelser ikke læses. Tag separat backup af nøglen.

Endpointkontrol tillader kun en fast allowlist af offentlige providerhosts, korrekt HTTPS-rute, standardport og ingen URL-credentials, query eller fragment. Corti-værten skal præcist matche valgt `eu`, `us` eller `fr`; andre Corti-produkter og regioner accepteres ikke. IP-litteraler, private DNS-adresser og HTTP-redirects afvises. En administrator kan ikke pege en forbindelse mod et internt netværk. Kald har en tidsgrænse på 55 sekunder; OIDC/OAuth-tokenkald er særskilte. Brugerens stop afbryder streamen, og en afbrudt live-stream gemmes ikke som et færdigt svar. Fejlbeskeder indeholder ingen credentials eller rå providerresponse. Der kan højst startes 60 analyser pr. bruger pr. time. Deterministiske sliderforhåndsvisninger har en separat grænse på 120 pr. minut, kalder ingen model og gemmer ingen analyseartefakter; orkestratoren tillader højst fire værktøjskald og to modelkald i en analyse.

Corti API-nøgler fra projektets **Copy as → Corti Models Service API Key** bruges uændret som Bearer. En eventuel Base64-kodet nøgle behandles som en opak hemmelighed; den skal ikke dekodes eller indgå i en separat Basic-header. API-key-kald til Models sender ingen `Tenant-Name`. Se [Models quickstart](https://docs.corti.ai/models/quickstart).

Corti OAuth bruger `https://auth.<region>.corti.app/realms/<tenant>/protocol/openid-connect/token`, `grant_type=client_credentials`, `scope=openid` og sender tokenet som Bearer samt `Tenant-Name`. Tenant er normalt `base`; `fr` er en region og skal ikke bruges som tenant alene på grund af FR-miljøet. Tokenet genbruges kun indtil kort før udløb og fornyes automatisk. Token-cache er afledt, kortvarig proceshukommelse; varig konfiguration ligger i Postgres. `KAIA_CORTI_REGION` accepterer kun `eu`, `us` og `fr`, med EU som standard, når variablen er tom. Ukendte værdier afvises frem for at blive omdirigeret til EU.

## Beregnings- og værktøjskontrakt

Live-planlæggeren modtager kun tilladte enhedsnavne/-ID'er, katalogets understøttede analyser, snapshotreference og valideret samtalekontekst. Den kan ikke vælge identitet, rolle, dataversion, SQL eller observerede datapunkter. Strikte skemaer og serverpolitik afviser ugyldige perioder, institutioner, metrics, scenarier og detaljer uden adgang. Et udtrykkeligt år eller navn kan ændre standardfiltrene; en kort opfølgning kan bevare forrige kontekst.

Når en ny problemstilling mangler en færdig analyse, kan modellen foreslå en afgrænset investerings- eller aktivitetsmodel. Mængder, enhedspriser, tidshorisont og andre antagelser gemmes som et modeludkast; serveren foretager selve beregningen. Frigivet tid er som udgangspunkt kapacitetsværdi, ikke en kontant besparelse. Kvalitative spørgsmål kan vises som et procesdiagram uden opdigtede måltal. **Vis data** og kildekort adskiller antagelser fra beregninger og eksisterende datakilder. Et opfølgende spørgsmål kan ændre antagelserne, mens det gemte svar bevarer sit oprindelige grundlag. Faktiske kommunale økonomital, personoplysninger og forespørgsler uden adgang bliver ikke til illustrationer.

Efter planvalideringen kontrollerer `planQuery` kilde- og operationspolitikken, og `analyzeResolvedContext` bruger planen direkte uden en ny tekstfortolkning. Den færdige model får kun det autoriserede analyseobjekts fakta, begrænsede diagram-/tabelrækker, antagelser og kildeuddrag. Den skal formulere sig med eksisterende `[1]`-henvisninger; disse åbner samme kildekort i brugerfladen. Dokumenter er data og har ingen instruktionsautoritet. Det eksisterende `scopedTools`-modul bevarer sine kontraktprøver; den nye live-rute bruger den begrænsede planlægger og finalstream frem for et frit værktøjsloop.

Nøgletal, diagram, tabel, gemt snapshot og eksport bruger det samme serverberegnede analyseobjekt. Live-modellens tekst gemmes særskilt som `renderedText`, og `formulation` fastholder den konkrete udbyder og model ved et senere udbyderskift. Hovedkonklusion og nøgletal forbliver reproducerbare serverresultater. En live-models formulering kan stadig kræve faglig vurdering; en kildehenvisning i fri tekst er ikke en ny økonomiberegning.

## Teststatus

Kontraktprøver med fixtures dækker korrekt endpoint, API-key/Bearer-header, modelværdi, SSE, afbrudt stream, 429, OAuth-tokenfornyelse, endpointblokering og maskering. Regionkontrakten dækker EU/USA/FR, FR OAuth-vært og tenant-header, uændret API-nøgle, miljøkonfiguration uden regionsfallback samt regionsskift med ny teststatus. Disse fixtures bekræfter implementeringen; de bekræfter **ikke** en konto, modeladgang eller drift i en region.

Den konkrete `corti-s1-instant`-forbindelse i FR har 21. oktober 2026 bestået den rigtige `testProvider`: værktøjskald, værktøjsresultat, streaming og modeloversigt på 2.535 ms. En rigtig semantisk planprøve valgte Høng og Svebølle, 2025 og udgift pr. elev fra et frit formuleret spørgsmål og gav en serverberegnet sammenligning. FR OAuth og de øvrige modeludbydere er fortsat kun fixturetestet i denne opgave. Det samlede offentlige forløbs teststatus fremgår af [CORTI-LIVE.md](CORTI-LIVE.md).

Dokumentation kontrolleret 20. oktober 2026: [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat), [Mistral API](https://docs.mistral.ai/api), [Azure v1](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle?tabs=key), [Corti quickstart](https://docs.corti.ai/models/quickstart), [Corti Chat](https://docs.corti.ai/api-reference/corti-models/chat/create-chat-completion), [Corti OAuth](https://docs.corti.ai/authentication/overview).
