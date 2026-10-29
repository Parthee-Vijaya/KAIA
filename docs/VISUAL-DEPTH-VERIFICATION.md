# Verifikation af tempo og grafiske datadetaljer

25. oktober 2026. Datagrundlag og modelversion er uændrede: `KAIA-DEMO-2026.09-v4` / `KAIA-MOBILITY-v1`.

- **Typecheck, lint, formatering og produktionsbuild:** bestået. Build er udført uden produktionshemmeligheder.
- **Tests:** 1.026 tests i 48 filer bestået med lokal test-Postgres og begrænset samtidighed. 14 nye kontroller dækker detaljerede skole-/årsberegninger, eksakt pris-/elevtalsdekomponering, kildegrundlag samt sandfærdig og kontrollerbar præsentation af serverjournalen.
- **HTTP:** 91 faktiske kontroller bestået både lokalt og gennem den offentlige Vercel-gateway. De omfatter login, streaming, scenarier, persistens, ejerskab, adgang, ugyldige filtre, rolleinjektion, år-/skoleudsnit, fastholdt klassefordeling, ændrede antagelser og opdaterede kildeuddrag.
- **Browser:** automatisk gennemgang efter nyt svar, seks sekunders standardtempo, valg af fire og ti sekunder, pause der fastholder trin, genafspilning, manuel navigation, fokusvisning, skole-/årsfiltre, klik i kapacitetsoversigt, seriefiltrering, alle fire analysefaner og opdatering af detaljer ved sliders er gennemgået. Et nyt offentligt svar blev genafspillet ved ti sekunder og pauset på Opgave. Filtrering til Høng Skole og 2028 viste 510 elever, 504 pladser, 6 manglende pladser og en driftsændring på 162.000 kr. i det valgte scenarie.
- **Responsivitet:** laptop 1280×720, større skærm 1440×1100 og iPad-størrelse 820×1180 gennemgået. Ingen horisontal overflydning i de åbne analysepaneler. Store tabeller har egne rulleområder. Det er ikke en prøve på en fysisk iPad. Reduceret bevægelse dækkes af præsentationstest og CSS; ingen OS-indstilling er ændret.
- **Browserkonsol:** ingen fejl i den publicerede prøve. En udviklingsvisning med bevaret HMR-state fra en ældre detaljekontrakt blev genindlæst; produktionsprøven brugte den samlede nye klient-/serverkontrakt.
- **Bevaring:** 20 private analyser og 3 indsigter er sammenlignet før/efter med SHA-256 og er uændrede. Ingen seed eller databasemigration er kørt. Ingen providerrettigheder eller credentials er ændret. Reelle Corti-kald er ikke genafprøvet i denne ændring.
- **Credential-scan:** ændrede/nye filer og JavaScript i klientbuildet er kontrolleret mod konfigurerede hemmeligheder uden fund.

Kodecommit: `579a67b`. Vercel-deployment `dpl_5GUnFoHxj2sfZHudZrujbqHenUZK` er READY og promoveret til https://kaia-sand.vercel.app/. Den lokale backendrelease er `1792923221996`; eksisterende tunnel og Postgres er bevaret.

Sanerede HTTP-/browserartefakter, billeder og snapshotsikring ligger i opgavens `artifacts/kaia-visual-depth/`. Den underliggende serverberegning forsinkes ikke kunstigt; den rolige afspilning er tydeligt markeret som gennemgang af det allerede registrerede forløb.
