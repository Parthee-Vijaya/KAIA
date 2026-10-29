# K.A.I.A. · Designstudie 02

Tre selvstændige, klikbare dashboardforslag med uændret K.A.I.A.-logo, Geist og produktets terrakotta-/petrolaccenter. Store pastelflader er erstattet af hvide flader, neutrale linjer og et samlet lokalt Phosphor Regular-ikonsæt. Fremblik har et mørkt scenariepanel.

- **Overblik:** venstrenavigation, personlig kontekst, chat og økonomisk status.
- **Fremblik:** topnavigation, flerårsprognose og et interaktivt energiscenarie.
- **Analysebord:** kompakt navigation, afvigelser, forklaringsbidrag og kommunesammenligning.

Forslagene er et separat designstudie. Den fungerende apps startsider, API'er, login og serverbaserede adgangsregler ændres ikke. Der skal vælges en retning, før den indarbejdes i appen.

## Faktisk funktionalitet

Fire spørgsmål under hvert chatfelt giver lokale, beregnede svar. Prognoser har klikbar signatur, danske tooltips, underliggende tabel og CSV-eksport. Energislideren ændrer kun oktober–december 2026, med samme uændrede baseline. Effekter afrundes pr. post i øre med rational aritmetik. Sammenligning med sidste år bruger samme ni måneder i begge år.

Samtaler, kilder, periode, adgang og indstillinger har konkrete lokale visninger. En indsigt kan gemmes og genåbnes i denne browsers localStorage. Den synkroniseres ikke til hovedappen. Prototypen indeholder kun en fast præsentationsprofil og giver ingen adgang til serverdata.

Tallene er et fast JSON-snapshot fra den eksisterende v4-generator og analysefunktionerne, `KAIA-DEMO-2026.09-v4`, reference 30. september 2026. Alle økonomi-, elev- og strukturlighedstal er simulerede. Officielle navnekilder dokumenterer alene navne. Svar er lokale regelsvar, og der foretages ingen AI- eller backendkald. Frie spørgsmål uden for de understøttede eksempler får en tydelig begrænsning.

## Kilder og bygning

- `design/prototypes/data.json`: versionsfast syntetisk analysegrundlag.
- `design/prototypes/template.html`: tre layouts med fælles komponenter.
- `public/design-preview/styles.css` og `app.js`: selvstændig styling og interaktion.
- `public/design-preview/icons/`, `fonts/` og `LICENSES.txt`: lokale, versionslåste assets og licenser.
- `scripts/build-design-preview.py`: deterministisk HTML med samme analysegrundlag til tekst, graf og tabel.

Kør `python3 scripts/build-design-preview.py --stage`. Det opdaterer HTML og samler **kun** de offentlige prototypefiler i `.local/design-deploy/`. Den eksisterende `.vercel`-projektkobling i staging bevares. Applikationskode og miljøfiler kopieres ikke. Lokal visning: `python3 -m http.server 3226 --bind 127.0.0.1 --directory public`, og åbn `/design-preview/index.html`.

## Vercel

Designstudiet udgives som en statisk side på det særskilte Vercel-projekt **kaia-design-studio**, team **parthee-vijayas-projects**. Projekt-ID: `prj_CLYSB65NcU3XBlHGdikGL5Uk7T8t`. Hovedprojektet **kaia** og dets produktionsalias bevares.

Verificér staging-projektet med `vercel project inspect --non-interactive` fra `.local/design-deploy/` før udgivelse. Her må `vercel deploy --prod` kun målrette **kaia-design-studio**. Dets produktionsdomæne er designets visningsadresse; det promoverer ikke hovedappen. Et direkte designvalg bevares med `?design=overblik`, `?design=fremblik` eller `?design=analysebord`.

Ingen database, miljøvariable, backend eller AI-nøgler kræves. Alle fonde/ikoner leveres lokalt. CSP afviser netværksforbindelser og eksterne scripts. Der lægges ikke hemmeligheder eller produktionsdata i siden. Siden kan vises, når den lokale backend er slukket.
