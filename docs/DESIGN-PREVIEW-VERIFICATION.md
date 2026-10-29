# Designstudie 02 · Endelig verifikation

Verificeret 21. oktober 2026. Dette dokument erstatter de foreløbige fund fra designgennemgangen.

## Udgivet resultat

- Offentlig adresse: https://kaia-design-studio.vercel.app/
- Direkte valg: `?design=overblik`, `?design=fremblik`, `?design=analysebord`.
- Projekt: `kaia-design-studio`, team `parthee-vijayas-projects`.
- Deployment: `dpl_F1NdJqk1BA1Mko1fWY2utAosfREd`, READY.
- HTTP 200 uden login. CSP afviser eksterne scripts og netværksforbindelser.
- Live app.js SHA-256: `cdf725e007d6f1c034fc1f02a6a4d81eeb5bf1babce59fd41284ce07a89dc3b2`.
- Hovedprojektets deployment er fortsat `dpl_22ez6ay2DNCA8cie2MgSde2UEG37`; produktionsalias `kaia-sand.vercel.app` er bevaret.

## Data og beregninger

65 uafhængige struktur-/tal-/assetkontroller bestået. HTML kan genskabes deterministisk fra template og JSON (88.478 bytes); indlejret JSON matcher kildesnapshottet.

Genberegning fra den eksisterende v4-generator (1.245.024 posteringer) matcher budget, samme måneder sidste år, prognose, prognose pr. elev og peer-sammenligning. Waterfall-bidrag summerer til 616.344.201 øre. Begge scenariekategorier omfatter 768 påvirkede poster for oktober–december 2026.

1.230.336 enkeltpostkontroller mod en uafhængig rational oracle består uden afrundingsafvigelser. Seks særskilte kontroller dækker positive/negative halve øre og eksponentnotation. Scenariet bruger BigInt-rationaler og afrunding pr. post mod nærmeste øre, med halve værdier mod +uendelig. Procenter uden for −30 til +50 samt kombinerede kategorier afvises tydeligt i prototypen. Dansk decimalprocent er verificeret med det faktiske answer()-svar: `Ved -23,6 %`.

Alle økonomi-, elev- og strukturlighedstal er simulerede. Navnekilder understøtter alene institutionsnavne. Ingen AI- eller backendintegration kaldes af siden.

## Faktisk browserforløb på Vercel

- Alle tre designvalg virker med korrekt URL-parameter.
- Spørgsmål via chatknap og genveje viser beregnede svar.
- Samme-periode-sammenligning: 232.525.154 kr. i 2025 mod 240.265.681 kr. i 2026, +3,3 %.
- Gem indsigt, genindlæs siden, åbn Gemte indsigter og genåbn det lagrede snapshot: bestået. Lageret er browserens localStorage, tydeligt mærket.
- Kildedialog åbner beregnings-ID'er, dataversion, tal og særskilt officiel navnekilde.
- Energislider +50 % viser +3,7 mio. kr. og 325,5 mio. kr. i ny årsprognose. Nulstilling giver 0,0 mio. kr.; baseline/scenarie og begge søjlebredder er identiske.
- Prognosens tabel åbner med syv år. Faktisk downloadet CSV indeholder alle syv år og fire serier, nøjagtigt afstemt til JSON i øre.
- Månedscelle for Herredsåsen januar åbner +122.879 kr., afstemt til data.
- Browseren rapporterer ingen advarsler eller konsolfejl.
- Laptop og præsentation 1440×1000, iPad 834×1112 samt smal skærm 390×844 er visuelt gennemgået. Alle tre forslag har ved 390 px ingen dokumentoverløb, ingen navnløse synlige knapper og en synlig markering af simulerede data.
- Keyboard via Enter, native fokusmarkeringer, tastaturbetjent scenarieslider og dialoger er kontrolleret. Systemets reduceret-bevægelse-præference kan ikke ophæves af en lokal indstilling.

## Projektkontroller

Typecheck, lint, 171 tests og produktionsbuild består på Node 24.19.0. De 22 databasetests er sprunget over: denne kontrol bruger ingen databasecredentials. Lint af den præcise live-JS er også gennemført særskilt.

Kontrollerne blev udført i en isoleret, miljøfri kopi i `/tmp/kaia-design-qualification-20261021` med samme lockfile og en frisk `npm ci`. Direkte kontroller i Desktop-checkoutet ventede på iCloud/FileProvider-materialisering af `dataless` filer; de blev erstattet af kontrollen i den lokale kopi. Ingen appkode blev ændret for at omgå problemet.

Der er ikke gennemført nye credentials-baserede Entra-, database- eller modelintegrationstests i denne designopgave. De er ikke nødvendige for den selvstændige statiske prototype og rapporteres ikke som bestået.

## Fund, som blev rettet

Pastelflader, blandede/dekorative ikoner og tvungne sidehøjder er fjernet. Sammenligningsprocenter er afledt af snapshottet. Ikonknapper i sammenklappet navigation har labels. Scenariets decimale afrunding og dansk procentformat er rettet. Faste datagrænser og lokale lagerfunktioner beskrives åbent i prototypen.
