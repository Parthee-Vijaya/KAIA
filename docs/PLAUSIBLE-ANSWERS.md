# Plausible svar på åbne kommunale spørgsmål

K.A.I.A. kan besvare åbne spørgsmål med et sammenhængende regneeksempel, en aktivitetsillustration eller et muligt forløb, når spørgsmålet ikke passer til en eksisterende dataserie. Svarene bruger det samme beregnings-, diagram-, kilde- og lagringslag som øvrige analyser. Relevante numeriske antagelser kan ændres i **Vis data**.

Eksisterende budgetter, regnskaber, sammenligninger og prognoser bruger fortsat det versionerede datasæt. Et spørgsmål om en dimension, som datasættet ikke indeholder, må ikke besvares med et bredere budgettal, der foregiver at være netop den efterspurgte delmængde. Eksempelvis er skoleområdets nettoudgift ikke skolepsykologernes lønudgift.

## Forløb

1. Session, ejerskab, område, institutioner, periode og dataversion kontrolleres som hidtil.
2. Den deterministiske Demo-fortolker skelner mellem eksisterende analyser og illustrative spørgsmål. Faste, dokumenterede modeludkast giver samme forudsætninger ved samme input. Entydige tal fra spørgsmålet kan erstatte de forberedte antagelser.
3. Corti kan vælge relevante antagelser i en valideret modelplan. Kendte uunderstøttede dimensioner må heller ikke gennem en modelplan blive til fejlagtige påstande om eksisterende data. Bløde semantiske begrænsninger kan få et tematisk forslag.
4. Serveren beregner alle økonomiske beløb og aktivitetsserier. Modellen kan formulere resultatet, men leverer ingen grafpunkter eller økonomiberegninger.
5. Illustrationens antagelser og beregning får egne kildeobjekter. De fremstilles ikke som posteringer, lokale målinger, dokumenter eller politiske beslutninger.

Demo kræver ingen modelnøgle og laver ingen modelkald. Den eksisterende private Corti-tildeling, kvote, streaming og stopkontrol gælder fortsat for liveformuleringer. Et forbindelsesproblem, ugyldig modelplan eller en adgangsafvisning bliver ikke skjult som et vellykket svar.

## Brugbare eksempler

- En mulig AI-investering: opstart, årlig drift, medarbejdere, minutter, arbejdsuger og timeværdi. Frigjort tid bliver kapacitetsværdi; kontante besparelser kræver en særskilt realiseringsantagelse.
- Et nyt tilbud eller en bestemt medarbejderfunktion: et afgrænset omkostningseksempel med synlige antagelser, uden påstand om faktisk bemanding eller vedtaget budget.
- En aktivitetsændring: startniveau, årlig ændring og tidshorisont med en serverberegnet serie.
- Et kvalitativt spørgsmål om trivsel, samarbejde eller organisering: et tematisk procesdiagram med konkrete forslag uden opdigtede effektmålinger.

De valgte tal er forudsætninger til et regneeksempel. Den fælles datamarkering står fortsat nederst i hjørnet, mens **Vis data** viser de præcise antagelser og deres oprindelse. Gemte svar bevarer deres eget grundlag; opfølgninger bruger kun det ejede tidligere snapshot.

## Afgrænsning og verifikation

Ingen nye kildesystemer, datamigrationer, personoplysninger eller faktiske kommunale økonomital tilføjes. Adgangsregler, dækkede snapshotperioder og de eksisterende begrænsninger for faktiske oplysninger består. Frie spørgsmål er fortsat begrænset af de implementerede fortolkningsregler og modeller.

Lokalt er 986/986 tests i 44 filer bestået med `KAIA_DB_TEST=1`, herunder de eksisterende PostgreSQL-prøver. De nye fixtures dækker tematiske illustrationer, talfortolkning, samme-data-opfølgninger, generiske budgetafvisninger, kildeproveniens og annullering efter en planfejl. Typecheck, lint, formatering og et Node 24-produktionsbuild uden produktionshemmeligheder er bestået.

## Publiceret og integrationsprøvet 21. oktober 2026

Applikationskoden `7819e96a101afdfe47a3663de45d67ede6347a76` er publiceret som Vercel-deployment `dpl_CxqgyFZVuDXQ5ZutY8gsEb5STgmt`, READY og promoveret til [kaia-sand.vercel.app](https://kaia-sand.vercel.app/). Den lokale standalone-backend bruger release `1792613834864`. Snapshot, database, tunnel og private providerindstillinger er bevaret; ingen migration var nødvendig.

- **149/149 offentlige HTTP/API-kontroller** med tre nye, normale Demo-sessioner. De dækker AI-regneeksempel, 20-minutters preview og Demo-forklaring, uændret original, opfølgning, genåbning, JSON/CSV, procesdiagram uden økonomiske måltal, et cost-only eksempel for skolepsykologer, adgang, ejerskab og logout. Ingen betalte modelkald eller private grants blev brugt. Den første probe havde en nøgleordensfølsom test af JSONB-kontekst; den eksterne probe blev rettet til semantisk objektsammenligning, uden ændring i applikationen.
- **Tre faktiske Corti-svar i browseren** gennem den offentlige gateway: åbent spørgsmål om en mulig AI-investering, en 15→20-minutters opfølgning og et kvalitativt trivselsforløb med fire trin uden opdigtede effektmålinger. Provider var `corti-s1-instant`; planlægning og formulering brugte rigtige modelkald.
- **Én faktisk Corti-forklaring efter redigering i Vis data**: 15→20 minutter gav 1.150→1.533,333 timer og 402.500,00→536.666,67 kr. årlig kapacitetsværdi. Kontant effekt var 0 kr. og samlet kontant netto uændret −1.350.000 kr. over fem år. Nulstil genskabte det gemte grundlag. Den senere chatopfølgning blev gemt som et særskilt svar.
- Den tidligere beregningskilde kunne åbnes fra opfølgningen og viste de gamle 15-minutters værdier. En ny indsigt blev gemt og genåbnet efter reload med samme tal, graf, antagelser, kilder og Corti-status. Laptop 1280×720 og iPad-bredde 768×1024 blev gennemgået; ingen vandret sideoverflow, én fast datamarkering og ingen browser-warn/error ved slutkontrollen.
- READ ONLY-kontrol af produktionsdatabasen viser **alle 17 tidligere analyser og 2 indsigter bevaret uændrede**, tre nye svar og én ny indsigt. Fire nye requests var completed, ingen running; en forklaringsrequest gemte ingen ny analyse. Privat liveforbrug gik fra 25 til 29 i samme UTC-døgn.
- Eksakt søgning efter de private credentialværdier i alle 12 ændrede taskfiler og 11 browserchunks gav **0 træffere**. Rå credentials, cookies, ejeridentitet og rå snapshots indgår ikke i rapporterne.

Sanitiseret evidens og scripts ligger i chatmappens `artifacts/kaia-plausible-answers/`: `public-demo-verification.json`, `persistence-readback.json`, `secrets-scan.json` og browserbilleder. Den offentlige probe er en API-prøve; de særskilte browserforløb ovenfor er de credentialsbaserede Corti-prøver. Entra, Corti OAuth og de øvrige modeludbydere er ikke integrationsprøvet i denne udvidelse.
