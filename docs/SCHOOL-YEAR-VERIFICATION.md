# Skolernes afvigelser mod sidste år · 21. oktober 2026

Fremblik viser hver skoles afvigelse for det valgte år og året før i samme række. Begge beløb er klikbare og åbner skolens udgiftsbidrag for de samme måneder i det respektive år. Den aktuelle top-fem-rangering og mulighed for at vise alle tilladte skoler bevares.

Serverens dashboardberegning leverer sidste års nettoafvigelse og to forskelle i præcise heltalsøre: den fortegnede ændring og ændringen i afvigelsens absolutte størrelse. Brugerfladen viser større, mindre eller uændret størrelse og markerer et skift mellem mer- og mindreforbrug. En større negativ afvigelse beskrives ikke automatisk som en forværring. Beløbene er skolens samlede nettoafvigelser, ikke udgifter pr. elev.

Sammenligningen bruger samme skole, dataversion, kontokategorier og måneder. Der vælges regnskab frem til referencedatoen og prognose efter den. Manglende eller ufuldstændigt sidsteårsgrundlag giver en forklaring for den berørte skole; årets beløb bevares. Nul er et reelt beregningsresultat. Kilden beskriver begge perioder, de præcise beløb, beregningsdefinitionerne og et afgrænset udsnit af de anvendte datarækker.

Der ændres ingen database, seed eller adgangspolitik. Det nye beregningsresultat kræver opdatering af den lokale backend før den nye Vercel-brugerflade. Den eksisterende tunnel, database, besøgsidentiteter og gemte analyser bevares.

## Verifikation

- Node 24.19.0: fuld typecheck, lint, formateringskontrol og credentialfrit produktionsbuild bestået.
- `KAIA_DB_TEST=1 npm test`: **430/430 tests i 20 filer**, inklusive rigtig Postgres. De 40 nye prøver består af 18 domæneprøver og 22 komponent-/kontraktprøver; komponentprøverne bruger fixtures.
- Domæneprøverne afstemmer begge års budget/outlook/afvigelser, fortegnet ændring og ændring i absolut størrelse. Historik, YTD, blandet regnskab/prognose, fremtid, nul, negative beløb, fortegnsskift, manglende delgrundlag, elevnormalisering, safe-integer-grænser, Council og scope er dækket. Kildens repræsentative rowIds er begrænset til højst 12; de fulde posteringstal står i uddraget.
- Lokal browser med normal demoprofil: begge år og større/mindre vises; Enter på Herredsåsens 2025-beløb giver samme skole og januar–september 2025 med korrekt waterfall. Klik på Høngs 2025-beløb giver tilsvarende korrekt skole/periode.
- År 2020 bevarer årets skoleafvigelser og forklarer manglende 2019-historik. Et lokalt kald til denne afgrænsning tog 36,1 sekunder under udvikling. Den afsluttende offentlige kontrol tog 1,94 sekunder; langsomheden blev ikke reproduceret, og årsagen er ikke fastslået.
- Laptop 1440×1100, tablet 834×1112 og mobil 390×844 er gennemgået. Ingen vandret dokument- eller rækkeoverløb. Det er viewportkontroller, ikke en fysisk iPad-prøve. Den lokale browserfane viste ingen konsoladvarsler eller fejl.
- Genforsøg og genafsendelse af et stoppet spørgsmål bevarer nu det fulde request med år, enheder, dataversion og scenarie. Et eksplicit filterskift ophæver genbrug ved inputafsendelse. Dette er kodegennemgået; en manuel stopprøve nåede ikke at afbryde det hurtige demosvar og rapporteres ikke som en bestået stoptest.
- Reel Entra-tenant og credentialbaserede AI-kald indgår ikke i dette forløb. Corti S1's dokumenterede kapabiliteter og de nuværende begrænsninger ved offentlig demologin og fritekstfortolkning står i `PROVIDERS.md`. Ingen nøgle er indlæst eller aktiveret.

## Offentlig publicering

- Kodecommit: `21263eaa6b75370d47eb06223aa9c6214d587d28`.
- Lokal standalone-backend: `1792603284814`, Node 24.19.0 på port 3212. Kun backendtjenesten er genstartet. Den eksisterende Postgres og tunnel er bevaret; ingen migration eller seed er kørt.
- Vercel: `dpl_FEUPQb1ANFTxHdnbxDaxfY8Qc2W4`, READY med vellykket fjernbuild. `https://kaia-sand.vercel.app/` er verificeret til denne deployment efter promotion.
- Den beskyttede deployments session-endpoint er kontrolleret gennem Vercel-forbindelsen: database og setup er klar; `private, no-store`. Det anonyme dashboardkald mødte Vercels deploymentbeskyttelse og tælles ikke som en test af applikationens egen autorisation.
- **25/25 kontroller over 21 faktiske offentlige HTTP-kald** med RAM-baserede midlertidige normaldemoprofiler: Executive og Council, scope, manglende session, ugyldigt input, adminforfalskning, ukendt/privat ressource og uændrede tomme analyselister før/efter. Ingen analyser, indsigter eller scenarier blev gemt af denne HTTP-prøve. Det er ikke en ny test med to vedvarende samtaleejere; denne grænse dækkes af den lokale suite.
- Alle 16 skoleårsresultater afstemmer: `varianceChange = variance - priorVariance`; `varianceMagnitudeChange = abs(variance) - abs(priorVariance)`. Kilderne bruger januar–september og samme v4-snapshot i begge år. Alle 2019-felter er `null` med forklaring ved valg af 2020. Dashboard 2026 tog 2,10 sekunder; 2020 tog 1,94 sekunder.
- Normal browser på det offentlige alias: 32 klikbare årsbeløb ved “Vis alle 16 skoler”. Enter på Herredsåsens 2025-beløb gav samme skole, januar–september 2025 og en kategori-waterfall på 1.032.768 kr. Kildepanelet viste præcis `103276812` øre og de tilsvarende seks bidrag. Klik på 2026-beløbet gav samme skole og januar–september 2026 med en kategori-waterfall på 948.594 kr. Herredsåsens præcise 2026-beløb er 948.593,70 kr.; afvigelsens størrelse er dermed 84.174,42 kr. mindre. Ingen browseradvarsler eller -fejl. Browserforløbet opretter normale demoanalyser gennem produktets analyse-API.
- Visuel dokumentation: `artifacts/kaia-school-years/fremblik-school-years-live.jpg` i chatmappen `/Users/parthee/Documents/ChatGPT/Kalundborg`. Laptop 1440×1100 viser begge år, ændring, kilde, logo og den efterfølgende Fremblik-flade.
- Vercels fejl-/fatal-log for denne deployment havde ingen poster ved afsluttende kontrol. Det er en afgrænset driftskontrol, ikke en langvarig oppetidstest.
