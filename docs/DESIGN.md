# Designgrundlag

Verificeret 20. oktober 2026 mod DGITA `app/globals.css` (blob `678d5c1c5a536d9b0462be5876df2e014bd206de`) og `app/layout.tsx`. Navigation, kort, formularer og arbejdsflader er læst som reference; K.A.I.A. implementeres selvstændigt. AI Alliancens aktuelle forside er visuelt undersøgt i browseren: stor typografi, generøs luft, tynde bølgende forbindelser og reduceret bevægelse. Ingen eksisterende video eller sæsondekorationer genbruges.

| Token                   | Værdi                                 |
| ----------------------- | ------------------------------------- |
| Primær / mørk / accent  | `#bc4d30` / `#9b4028` / `#c94416`     |
| Petrol / slate          | `#006f71` / `#464f5e`                 |
| Neutrale støtteflader   | `#f3f4f5` / `#eef0f2`                 |
| Baggrund / arbejdsflade | `#f6f7f8` / `#ffffff`                 |
| Tekst / sekundær        | `#252525` / `#535e70`                 |
| Linje                   | `#e4e5e8`                             |
| Radius                  | kontroller 8 px; flader 14 px         |
| Font                    | lokalt pakket Geist Sans / Geist Mono |

Efter designgodkendelsen 21. oktober 2026 bruger den implementerede arbejdsflade **Fremblik**. Pastelflader er erstattet af neutrale støtteflader; terrakotta og petrol bruges til handlinger og data. Logo, K.A.I.A.-wordmark og Geist bevares. Lokalt pakkede Phosphor Regular-ikoner har ens streg og dansk tilgængeligt navn på kontrollerne. Login viser de konfigurerede demoprofiler med ærlig driftsstatus.

Arbejdsfladen har topnavigation, personlig hilsen, serverafledt rolle/stilling og tilladt område. Det store chatfelt er centrum, efterfulgt af præcis fire virkende indsigtsforslag, budgetoversigten, flerårsprognosen, et mørkt energiscenarie og en kommunesammenligning. Et kildepanel og en udvidet figur åbnes efter behov. Navigationen går i to rækker på mindre skærme, og dashboardet bliver én kolonne. De to andre designforslag findes kun som statiske prototyper på designstudiets adresse; der er ingen designvælger i appen. En vedvarende datamærkning holdes adskilt fra udbyderstatus.

Budgetoversigten er en hvid, neutral strip med fire nøgletal: periodiseret budget, forbrug/prognose, budgetafvigelse og ændring fra samme periode sidste år. Årsændringen viser også serverens procent, når grundlaget tillader det. Tekst angiver mer-/mindreforbrug og højere/lavere årsudgift, så farver ikke står alene. Budgetafvigelse og årsændring forklares som forskellige sammenligninger. Den tilhørende kompakte årsfigur bevarer serverens status for regnskab og prognose, samme måneder og enheder, kildehenvisninger, tabel og eksport. Manglende historik, herunder året før datasættets begyndelse, vises som en forklaring. Strippen går fra fire kolonner til to og derefter én på de mindste skærme. Grafer, nøgletal og tabeller bruger de samme serveranalyser.

Motionmotivet er original SVG med lette CSS/Motion-overgange. Ved en igangværende analyse eller scenarieberegning samles spredte datapunkter omkring en kurve; aktiviteten følger den faktiske forespørgselsstatus og ophører, når svaret modtages, stoppes eller fejler. Motivet er dekorativt og viser hverken økonomital eller en fremdriftsprocent. Serverens korte statusbeskeder kan læses ved siden af, og nye resultater kommer frem med en kort, rolig overgang. **Dæmp bevægelse** i indstillinger gemmes lokalt, og operativsystemets `prefers-reduced-motion` respekteres altid. Begge valg fjerner bevægelsen uden at fjerne status eller indhold.

Skoleområdet har en hvid liste over de fem største budgetafvigelser efter absolut beløb, med tydeligt fortegn og tekst for mer-/mindreforbrug. Sidste års og det valgte års afvigelse står ved siden af hinanden, efterfulgt af en neutral markering af ændringen i beløbets størrelse. Begge års beløb er knapper, som åbner den pågældende skoles udgiftsbidrag i chatten for samme måneder i det valgte år. Et fortegnsskift markeres særskilt, så større mindreforbrug ikke fremstilles som automatisk negativt. Manglende sammenligningsgrundlag fjerner ikke årets beløb. Flere tilladte skoler kan foldes ud. Listen følger samme dataversion, afgrænsning og kilder som resten af Fremblik. Politiske profiler med aggregeret adgang får ingen institutionsnavne eller beløb i modulet. Forklaringen skelner mellem observerede kontobidrag og dokumenterede årsager.

Referencer: [DGITA CSS](https://github.com/Parthee-Vijaya/DGITA/blob/main/app/globals.css), [DGITA layout](https://github.com/Parthee-Vijaya/DGITA/blob/main/app/layout.tsx), [AI Alliancen](https://ai-alliancen.org/).
