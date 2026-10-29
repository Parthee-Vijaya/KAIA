# Budgetstatus og bevægelse i Fremblik · 21. oktober 2026

## Leverance

Fremblik viser periodiseret budget, forbrug/prognose, budgetafvigelse og ændring fra samme måneder sidste år direkte under chatten og de fire indsigtsforslag. En særskilt årsfigur viser begge års budget og regnskab/prognose med tabel, CSV, SVG, udvidet visning og kildepanel. Budgetafvigelse og årsændring forklares hver for sig. Valgt område, institution, måneder og dataversion bevares.

Der er ingen nye økonomiberegninger i klienten. Komponenterne bruger de eksisterende autoriserede `budget`- og `year`-analyseobjekter fra `GET /api/dashboard`. Manglende sammenligningsår vises som manglende grundlag; nul er et reelt tal. Officielle navnekilder accepteres ikke som økonomisk belæg.

Analyse og simulering bruger et nyt, dekorativt SVG-motiv, hvor datapunkter samles til en kurve. Aktiviteten følger faktiske forespørgsler; der vises ingen opdigtet fremdriftsprocent. Resultater får en kort overgang. Både Dæmp bevægelse og enhedens `prefers-reduced-motion` giver en statisk, læsbar visning. Scenarieeditoren skjuler gamle resultater straks ved ændrede forudsætninger og afviser forældede svar eller svar med forkert scope, version eller forudsætninger.

## Lokalt verificeret

- Node 24.19.0: typecheck, lint og `npm run build:clean` bestået. Build kræver ingen produktionshemmeligheder.
- `KAIA_DB_TEST=1 npm test`: **336/336 tests i 17 filer** bestået, inklusive eksisterende rigtige Postgres-integrationer. Heraf 40 nye komponent-, fixture- og kontraktprøver for budgetvisning, kildegrundlag og scenariepreview. Providerkontrakter bruger fortsat fixtures.
- Normal demoprofil i browser på lokal udviklingsserver, uden testlogin-genvej.
- Skoleområdet, januar–september 2026: fire synlige budgetnøgletal og samme periode 2025. År 2020 viser udtrykkeligt manglende 2019-grundlag.
- År 2025 og Høng Skole: nøgletal, figur, tabel og kilde følger samme udsnit. Undersøg årsændringen åbner en analyse med Høng Skole og januar–september 2024/2025.
- Faktisk CSV-download indeholder samme beløb som tabellen, kroner med danske decimaler og dataversion. Udvidet årsdiagram og økonomikilde er åbnet direkte fra Fremblik.
- Faktisk scenariepreview: helårsvirkning, ændring af energislider og nulstilling. Mens ændringen beregnes, er gamle tal og figur skjult. Nulstilling giver 0 kr. i ændring og samme baseline/scenarie.
- Under en rigtig forespørgsel har SVG-kurven animationen `kaia-activity-curve`. Med Dæmp bevægelse aktiveret er den beregnede CSS-animation `none`, mens statusbeskeden bevares. Indstillingen er sat tilbage efter testen.
- Layout gennemgået ved 1440×1100, iPad 834×1112 og mobil 390×844. Ingen vandret dokumentoverløb på tablet/mobil. Det er viewportkontroller, ikke test af fysisk iPad eller skærmtastatur.

## Publicering

- Offentlig adresse: https://kaia-sand.vercel.app/.
- Vercel-deployment `dpl_7tqtxYYKpruSNo6ZBXmZJYkpCSDK`, READY, fra kodecommit `f2afcfe`. Vercels produktionsbuild er bestået. Først klargjort uden domæneskift, derefter kontrolleret gennem Vercels autentificerede adgang og promoveret. Det normale alias er verificeret mod dette deployment.
- Beskyttet staging: `GET /api/session` gav HTTP 200, database tilgængelig, setup klar, normal demo aktiveret og testlogin deaktiveret. Beskyttelsen blev bevaret.
- Frisk offentlig browserfane med normal demoprofil: budgetnøgletal og årsfigur vises uden chatforespørgsel. Kilden indeholder identiske enheder og januar–september begge år. Den offentlige tabel viser 232.525.153,55 kr. i 2025 og 240.265.680,51 kr. i 2026; årsændringen er 7.740.526,96 kr., afrundet til 7.740.527 kr. i nøgletallet.
- Offentlig Undersøg årsændringen → rigtig analyse med samme tal og perioder. Under serverkaldet vises Henter budgettal med den nye kurveanimation. Den afsluttende analyse bruger samme kilde og v4-snapshot.
- Offentlig energislider: en ændring giver Beregner de berørte energiposter med aktiv CSS-animation; med Dæmp bevægelse er animationen `none`. Indstillingen blev sat tilbage efter testen.
- **16/16 offentlige HTTP-kontroller** gennem Vercel → gateway → lokal backend → rigtig Postgres: normal Executive/Council-demologin og logout, anonym 401, provideradgang 403, private/no-store, budget og én skole/2025, +15 % energi og eksakt nulstilling til 0, afvisning af ukendt enhed, ugyldigt input og klientindsendt Admin-rolle samt Councils aggregerede adgang og afvisning af enhedsdetaljer. Dashboard 2.628 ms, én skole 527 ms, scenarie/reset 398/351 ms. Det er målinger fra kontrolforløbet, ingen SLA.
- Offentlig visuel kontrol: laptop 1440×1250, iPad 834×1112 og mobil 390×844. Budgetfelterne passer i deres felter; ingen vandret dokumentoverløb. Browserens midlertidige viewport er nulstillet.
- Den friske offentlige browserfane viste 0 advarsler og 0 fejl under kontrollen. Vercels fejl-/fatal-logudtræk for dette deployment viste ingen poster i kontrolvinduet.

Skærmbilleder ligger i opgavens `artifacts/kaia-budget-motion/`. Maskinlæsbar status: [budget-motion-verification.json](budget-motion-verification.json). Backendens API, adgangspolitik og database er uændrede; denne leverance kræver ingen migration eller genstart af backend. Den aktive backend er fortsat runtime `1792597368862` på port 3212.

Reel Entra-tenant og credentialbaserede modelkald er ikke prøvet i denne leverance. Den aftalte demotilstand bruger deterministiske analyser. Det eksisterende setup med Vercel-frontend og lokal backend kræver fortsat en online Mac og tunnel.
