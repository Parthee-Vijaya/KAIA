# Præsentationsforløb

## Fremblik på to minutter

1. Åbn https://kaia-sand.vercel.app og vælg en normal demoprofil. Vis personlig hilsen, rolle, stilling og tilladt område.
2. Lad chatfeltet stå i centrum. Vis budgetstatus og skolernes afvigelser, hvor begge års beløb gælder samme måneder. Klik på sidste års eller årets beløb for at åbne skolens udgiftsbidrag. Peg derefter på prognosens basis, budget og følsomhed; åbn tabellen eller beregningskilden.
3. Ændr energiprisen med slideren. Vis virkning i resten af 2026, skift til helårsvirkning, og nulstil uden at ændre baseline.
4. Vælg Undersøg scenariet. Gem det navngivet i chatten, genindlæs og åbn det under Scenarier.
5. Gå til Mit overblik, og se peerkommunen. Spørg i chatten: “Sammenlign op mod sidste års data” eller “Hvorfor er den kommune sammenlignelig?”. Forklar mærkningen Simulerede data.

Brug en normal, autoriseret session. Den godkendte hybridpræsentation har tydeligt demologin uden Entra; vælg Parthee til det tværgående forløb, Anne Dandanell til skoleområdet og Udvalgsmedlem til politiske aggregater. En konfigureret Entra-session kan bruges med tilsvarende servertildelt scope. Visningsnavne kan kun være de eksplicit konfigurerede præsentationsprofiler Partheepan Vijayamohan/Parthee og Anne Dandanell eller funktionsnavne. Lokale testidentiteter er fortsat ikke offentlig login. Den fulde gennemgang kræver skole- og facilitetsadgang; adgangsafvisningen vises bagefter i en særskilt, begrænset session.

Fasthold `KAIA_DATASET_SEED=kaia-kalundborg-2026`, `KAIA_DATASET_VERSION=KAIA-DEMO-2026.09-v4` og `KAIA_REFERENCE_DATE=2026-09-30` under hele præsentationen. V4 omfatter 2020–2032, 1.245.024 posteringer, 1.742 dokumenter og 16.506 benchmarkrækker for seks kommuner. September er sidste realiserede måned i 2026. Kontrollér faktisk aktiv version efter migration, seed og deployment; dette manuskript ændrer ingen runtime eller privat miljøfil. Start en ny samtale til v4, da genåbnede samtaler bevarer deres oprindelige version.

Demologin bruger altid Demo uden eksterne modelkald. Ved Entra-login kan administratoren vælge Demo til samme modeluafhængige forløb. “Demologin”, “Simulerede data” og “Demo” beskriver henholdsvis autentifikation, datastatus og svarformulering. Alle kommuners økonomi, befolkning, elevtal og strukturtræk er syntetiske; kun navne og kommunekoder er officielle.

## Et samlet forløb på cirka ti minutter

1. Log ind. Vis personlig hilsen, rolle, adgangsområde og præcis fire fungerende forslag. Forklar kun, at alle kommunale tal og beslutninger er fiktive, mens institutionsnavnene er verificerede.
2. Vælg budgetforslaget. Læs konklusion og nøgletal; åbn [1] og vis demokildens periode og beregningsgrundlag. Den officielle navnekilde dokumenterer kun navnet.
3. Spørg: “Sammenlign Skolen på Herredsåsen, Høng Skole og Svebølle Skole.” Åbn tabellen og sammenhold én værdi med søjlen. Skift år til 2025 eller stil “Vis samme analyse for 2025.”
4. Spørg: “Forklar energiudgifternes ændring med pris, mængde og samspil.” Vis waterfall, matchende måneder og de tre bidrag. Understreg forskellen på observation, beregnet bidrag og dokumentets simulerede forklaring.
5. Spørg: “Hvad sker der, hvis energiprisen stiger 15 procent resten af året?” Flyt energiforudsætningen, vis forskellen mod uændret baseline og skift mellem restår og illustrativ helårsvirkning.
6. Navngiv og gem scenariet i brugerfladen. Ændr en forudsætning, nulstil, og genåbn det gemte scenarie. Gem også svaret som indsigt, genindlæs siden og genåbn både samtalen og indsigten.
7. Find den simulerede strategi og en politisk beslutning. Spørg derefter til demografi, og vis den variable omkostningsandel samt faste udgifter.
8. Afslut med et spørgsmål om individuelle bevillinger. Vis den ærlige databegrænsning og de fungerende alternative spørgsmål. Skift til den begrænsede session og vis, at socialområdet afvises på serveren.

## Udvidelse: historik, flerårsprognose og peerkommuner

Brug en session med adgang til hele skoleområdet; en enkelt institutions scope er utilstrækkeligt til at sammenligne hele kommuners skoleøkonomi.

1. Start en ny samtale: “Vis udviklingen i budget og regnskab fra 2020 til 2026.” Kontrollér, at år, regnskabs-/prognosestatus og sammenlignelige måneder fremgår.
2. Spørg “Giv mig et overblik over budgetstatus på skoleområdet” og derefter “Sammenlign op mod sidste års data.” Vis, at månederne og de samme skoler er fastholdt.
3. Spørg “Vis prognosen frem mod 2030.” Åbn beregningskilden: 2026 har ni realiserede måneder og tre prognosemåneder, senere år kun prognose. Basisbeløbene kommer fra ledgeren.
4. Spørg “Fremskriv skoleområdets udgifter til 2032.” Vis lavt/basis/højt og forklar **±1 % ekstra årlig multiplikativ følsomhed** via faktorerne `0,99^trin` / `1,01^trin`. Der er ingen statistisk sikkerhedsgrænse, og realiserede tal/indtægter ændres ikke.
5. Spørg “Sammenlign skoleområdet med en sammenlignelig kommune” og derefter “Hvorfor er den kommune sammenlignelig?” Vis den vægtede forklaring af syntetisk befolkning, 65+-andel, skolebørnsandel og landlighed. Det er et illustrativt peervalg, ikke en faktisk kommunal rangering.
6. Spørg “Sammenlign udgift pr. elev med Holbæk Kommune.” Vis samme periodes netto pr. elev, nævner og demokilde. Den officielle navnekilde dokumenterer kun Holbæks navn/kode; den dokumenterer ingen udgift eller strukturværdi.
7. Åbn samme forespørgsel i et scope med kun én skole, hvis et sådant testscope er klargjort. Vis den forklarende begrænsning frem for at sammenligne institutionen med en hel peerkommune. Der ændres ingen adgangstildeling under demonstrationen.

## Demonstrationsspørgsmål og forventet kontrol

Tabellen er et manuskript og indeholder ingen håndskrevne økonomital. De konkrete svar beregnes fra den aktive dataversion. Rolle og enhedsscope er afgørende; et legitimt afslag er det korrekte resultat ved manglende adgang.

| #   | Spørgsmål eller handling                                                        | Hvad kontrolleres?                                                                                        |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Giv mig et overblik over budgetstatus på skoleområdet.                          | Samme periodiserede budget og nettoforbrug i tekst, metrics og figur                                      |
| 2   | Hvilke skoler har de største simulerede afvigelser i år?                        | Enheder sorteret efter beregnet afvigelse, kun tilladte skoler                                            |
| 3   | Sammenlign Skolen på Herredsåsen, Høng Skole og Svebølle Skole.                 | Tre navngivne enheder, ens dækning og åbne kilder                                                         |
| 4   | Vis udviklingen i udgift pr. elev fra 2023 til 2026.                            | Ens måneder hvert år, nettoudgift / samme års syntetiske elevtal                                          |
| 5   | Hvordan ser årsprognosen ud i forhold til det vedtagne demobudget?              | Realiserede måneder plus fremtidig prognose én gang; stiplet prognose                                     |
| 6   | Hvilke typer udgifter bidrager mest til afvigelsen?                             | Kategoribidrag afstemmer til nettoafvigelsen                                                              |
| 7   | Sammenlign energiudgifterne på de kommunale bygninger.                          | Tilladte faciliteter og kun energiposter                                                                  |
| 8   | Hvad sker der, hvis energiprisen stiger 15 procent resten af året?              | Kun energiposter i resterende prognosemåneder påvirkes                                                    |
| 9   | Hvad sker der, hvis vikarforbruget falder 10 procent på skoleområdet?           | Kun vikarposter ændres                                                                                    |
| 10  | Vis baseline og scenarie i samme graf.                                          | Tidligere forudsætninger og afgrænsning bevares                                                           |
| 11  | Hvilke simulerede politiske beslutninger er relevante for skoleområdets budget? | Klassificerede fiktive dokumenter med tydelig mærkning                                                    |
| 12  | Find den simulerede strategi, som opfølgningen henviser til.                    | Dokumentrelation og åbent læsbart uddrag                                                                  |
| 13  | Lav en kort opsummering til et udvalg med tal og kildehenvisninger.             | Tilladte aggregerede tal; ingen påstand om faktisk politisk beslutning                                    |
| 14  | Vis samme analyse for 2025.                                                     | Tidligere enheder, metric og intent bevares, periode ændres                                               |
| 15  | Sammenlign de relevante kultur- og idrætsfaciliteter.                           | Områdeskift, ens perioder og filtrerede enheder                                                           |
| 16  | Gem analysen som en indsigt og åbn den igen.                                    | Brug svarets gem-handling og navigationen Gemte indsigter; efter reload er version, tal og kilder bevaret |
| 17  | Gem et scenarie, ændr en forudsætning og nulstil det.                           | Brug scenariepanelets gem-/nulstil-handlinger; gemt snapshot kan genåbnes                                 |
| 18  | Forklar beregningen bag udgift pr. elev.                                        | Tæller, nævner, periode, nettoprincip og kilder                                                           |
| 19  | Hvor mange borgere fik en individuel social bevilling i går?                    | Forklaring af manglende individuelt/dagsaktuelt datagrundlag                                              |
| 20  | Vis budgetstatus på socialområdet.                                              | I skolebegrænset session: adgangsafslag, også ved direkte API-kald                                        |
| 21  | Forklar energiudgifternes ændring med pris, mængde og samspil.                  | Pris + mængde + samspil + rest = sammenlignelig energiændring                                             |
| 22  | Hvordan påvirker ændret demografi de variable skoleudgifter?                    | Aldersgruppe, aktivitetsfølge, eksplicit variabel andel og uændrede faste udgifter                        |
| 23  | Sammenlign op mod sidste års data.                                              | Foregående analyseperiodes måneder, enheder og nævner bevares                                             |
| 24  | Sammenlign skoleområdet med en sammenlignelig kommune.                          | Hele fagområdet, samme periode og forklarligt peervalg på syntetiske strukturtræk                         |
| 25  | Sammenlign udgift pr. elev med Holbæk Kommune.                                  | Netto pr. elev for begge kommuner; syntetisk økonomi adskilt fra officiel navnekilde                      |
| 26  | Hvorfor er den kommune sammenlignelig?                                          | Tidligere peer bevares; vægte og syntetiske strukturkomponenter forklares                                 |
| 27  | Vis prognosen frem mod 2030.                                                    | Helårsbudget, basis, lavt/højt, realiseret/prognose og synlig følsomhedsformel                            |
| 28  | Fremskriv skoleområdets udgifter til 2032.                                      | Sidste datadækkede år, ingen opdigtede realiserede tal og ingen ekstra ekstrapolation                     |
| 29  | Vis prognosen for udgift pr. elev frem til 2030.                                | Samme års syntetiske elevtal som nævner i både tekst og graf                                              |
| 30  | Vis udviklingen i budget og regnskab fra 2020 til 2026.                         | V4-historik, ens månedsspænd og præcis versionsbundet kilde                                               |

Spørgsmål 16–17 beskriver handlinger, som gennemføres med brugerfladens kontroller. De er ikke løfter om, at en fritekstbesked automatisk ændrer eller gemmer noget.

## Live-AI og ekstra kontekst

I en konfigureret Entra-session kan administratoren gemme en rigtig forbindelse og udføre forbindelsesprøven. Først efter en vellykket prøve gentages budget-, dokument- og scenarieforløbet med aktiv provider/model synlig. De samme beregninger, adgangsregler og kilder anvendes. En privat servertildeling kan nu også aktivere testet Corti for én eksisterende demobesøgende; almindelige offentlige demologin forbliver i Demo. Se [CORTI-LIVE.md](CORTI-LIVE.md). En fixtureforbindelse må aldrig præsenteres som live-AI. Stop svaret under streaming og brug Forsøg igen ved en kontrolleret fejlprøve.

Offentlige DST-snapshots er en særskilt valgfri del af demonstrationen. Brug kun deres dokumenterede perioder og vis nationalt prisindeks som kontekst, ikke som forklaring af et lokalt simuleret beløb. Standardforløbet kræver ingen ekstern API-forbindelse. MCP og CLI præsenteres som implementerede kontrakter med fixtures, indtil konkrete eksterne endpoints er afprøvet.

Kør [opsætningsvejledningen](VERCEL.md) eller den godkendte [hybridopsætning](HYBRID-DEMO.md) og kontrollér faktisk version og driftsstatus før en præsentation. Uden gyldig database-/sessionsopsætning er opsætningstilstanden det korrekte resultat. Entra-tilstanden kræver desuden Entra-konfiguration. De historiske verifikationsrapporter for v3 dokumenterer tidligere kørsler; de beviser ikke en ny v4-deployment eller en ekstern modelintegration.

## Samlet forløb: flyttemønstre og skolekapacitet

Brug **Prøv demoforløbet** i Fremblik. Det samler fem års flytninger, elevgrundlag, prognose, økonomiske handlemuligheder og et særskilt godkendt internt planudkast. Se [model, seks trin og manuskript](MOBILITY-FLOW.md).
