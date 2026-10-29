# Rolig gennemgang og detaljerede analysevisninger

Den seksdelte serverjournal er bevaret. Når et nyt svar er færdigt, vises en vedvarende, rolig gennemgang direkte i samtalen. Standardtempo er seks sekunder pr. trin; brugeren kan vælge fire eller ti sekunder, pause, gentage, gå frem/tilbage og klikke direkte på et trin. Den automatiske gennemgang starter ikke ved genåbning eller i reduceret bevægelse. Den kaldes eksplicit en visuel gennemgang af den afsluttede beregning. Serverens faktiske tider og tilstande omskrives ikke. Fejl vises ikke som afsluttede beregninger. Under livearbejde kan et trin fastholdes manuelt.

Den seneste kapacitetsanalyse har en fælles grafisk arbejdsflade i samtalen og under Vis data, med fokusvisning via **Udvid analyse**. Tidligere svar beholder en enklere figur, så samtalen ikke bliver en stak store dashboards.

## Fire visninger

- **Kapacitet:** historiske elevtal, baseline, scenarie og skolepladser. Det valgte prognoseår markeres i linjegrafen. En klikbar oversigt viser lokal pladsmangel for hver skole i hvert af fem prognoseår, sorteret efter størst mangel. Klik vælger skole og år.
- **Flyttemønstre:** brutto ind- og udflytning opdelt i andre kommuner, udland og interne demoområder. Positive og negative søjler har særskilt stabling omkring nul. Signaturen kan skjule enkelte serier. Den underliggende tabel viser skole, år og alle seks bevægelsestyper.
- **Skoler:** elever mod anvendelige pladser pr. skole i det valgte år, med tabel over mangel, ledige pladser og nye klasser.
- **Økonomi:** waterfall over elevtalseffekt, enhedspris og ny fast klassedrift, som tilsammen afstemmer præcist til den samlede driftsændring. Baseline og scenariets modellerede drift vises særskilt. Diagrammet viser ændringsbidrag frem for at skjule dem ved siden af store totalbeløb.

Filtre på skole og prognoseår udføres via `POST /api/mobility/detail`. Endpointet validerer session, ejerskab og aktuelle rettigheder gennem samme repository som de andre analyser. Det accepterer kun en gemt kapacitetsanalyse, validerede scenarieantagelser, en tilladt skole og et af de fem prognoseår. Alle økonomiske og faglige tal beregnes på serveren fra det gemte snapshot. Nye klassers fordeling fastholdes ved filtrering; en skole overtager ikke pladser fra andre skoler. Diagrammer, tabeller, nøgletal og opdaterede kildeuddrag stammer fra samme resultatobjekt.

Granulariteten er 16 skoler × fem historiske år = 80 årsregistreringer samt 16 × fem prognoseår = 80 modelpunkter. Det er flere visninger af det eksisterende datagrundlag, ikke en ny observation af kommunen. Der opfindes ikke månedlige flytninger, aldersfordeling eller kvartalstal. Modellen forbliver `KAIA-MOBILITY-v1`, og eksisterende gemte analyser og godkendelser ændres ikke. Ingen seed eller migration kræves.

## Kontroller

De målrettede tests afstemmer hver skoles prognosepunkter til alle fem oprindelige årsaggregater, kontrollerer bruttobevægelser, uændret klassefordeling ved filtre, præcis omkostningsdekomponering, kildehenvisninger samt præsentationens skel mellem livearbejde, afsluttet gennemgang og fejl. HTTP-manuskriptet kontrollerer også anonyme kald, anden ejer, Council, ugyldige skoler/år, rolleinjektion og ændrede antagelser. Browserkontrollen omfatter tempo, pause, filtre, serier, fokusvisning, tabeller og responsive størrelser. Reelle modeladaptere ændres ikke i denne levering.
