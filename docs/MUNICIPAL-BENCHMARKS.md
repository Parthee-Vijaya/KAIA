# Kommunesammenligning med simulerede peerdata

K.A.I.A. kan bruge seks virkelige kommunenavne i en **fuldt simuleret sammenligning**. Kommunekoder og stavning er verificeret; økonomi, indbyggertal, elever, aldersfordeling, landlighedsindeks, budgetforhold og prognoser er fiktive. Resultatet er en demonstration af analysemetoden og må ikke fremstilles som en faktisk rangering af kommunernes økonomi eller kvalitet.

Standardversionen `KAIA-DEMO-2026.09-v4` indeholder 1.245.024 lokale økonomiposteringer og 1.742 dokumenter for 2020–2032. De 16.506 benchmarkrækker lagres separat, så de ikke tælles som ekstra institutionsudgifter. Reference er 30. september 2026, seed `kaia-kalundborg-2026`.

## Verificerede navne og koder

Den 21. oktober 2026 er navn/kode kontrolleret på [Danmarks Statistiks aktuelle klassifikation af regioner, landsdele og kommuner](https://www.dst.dk/da/Statistik/dokumentation/Nomenklaturer/NUTS) og ved et faktisk `tableinfo`-kald til Statistikbankens FOLK1A. Kun de seks områdeværdier er anvendt. Der er ikke hentet økonomital, befolkningsobservationer, kontaktoplysninger eller medarbejderprofiler til denne generator.

| Internt ID                | Officielt navn | Kommunekode |
| ------------------------- | -------------- | ----------- |
| `municipality-kalundborg` | Kalundborg     | 326         |
| `municipality-odsherred`  | Odsherred      | 306         |
| `municipality-holbaek`    | Holbæk         | 316         |
| `municipality-slagelse`   | Slagelse       | 330         |
| `municipality-soroe`      | Sorø           | 340         |
| `municipality-ringsted`   | Ringsted       | 329         |

Hver `MunicipalProfile` har navnekildens URL, kodekildens [tabel-URL](https://www.statistikbanken.dk/FOLK1A), verificeringsdato, stabile ID'er og `status: 'simulated'`. Status gælder egenskaberne; kun navn og kode er officielle. `MunicipalBenchmarkMetadata.nameStatus` adskiller denne navnestatus fra dataenes simulerede status. Det faste navnesæt er en overskuelig kandidatgruppe til præsentationen, ikke dokumentation for faktisk sammenlignelighed.

## Datakontrakt og reproduktion

`src/domain/municipalities.ts` eksporterer `MunicipalProfile`, `MunicipalStructure`, `MunicipalBenchmarkRow`, `KalundborgAggregateRow`, `KalundborgAggregateInput` og generatoren:

```ts
generateMunicipalBenchmarks(seed, version, referenceDate, {
  structure: { population, population65Share, schoolchildren, rurality },
  structureYear: 2026,
  rows: kalundborgAggregates,
});
// → { municipalities, municipalBenchmarks, metadata }
```

En Kalundborg-inputrække indeholder kun `year`, `month`, `area`, `kind`, `amountOre`, `population` og `pupils`. Kaldende serverkode beregner disse aggregeringer fra K.A.I.A.’s egne simulerede posteringer og de samme års syntetiske nævnere. Generatoren tildeler ID og dataversion og kopierer beløb/nævnere uændret. Den opfinder ingen yderligere Kalundborgøkonomi eller struktur. Uden dette input returneres kun fem genererede peerprofiler; automatisk peerudvælgelse med Kalundborg som basis forklarer da det manglende grundlag.

Hver benchmarkrække har kommune-ID, dataversion, år, måned, et af de syv demo-fagområder, `kind: 'budget' | 'actual' | 'forecast'`, heltal i øre, samme års indbyggertal/elevtal og simuleret status. Der findes månedlige budgetter og prognoser for **2020–2032**. Realiserede poster findes kun til og med referencedatoens måned. Med `2026-09-30` giver fem peers 13.755 rækker; en fuld tilsvarende Kalundborgimport på 2.751 rækker giver samlet 16.506 benchmarkrækker. Dette er en kompakt separat sammenligningstabel, ikke en ekstra kopi af alle institutionsposteringer.

Samme seed, version, reference, profilstruktur og Kalundborginput giver identiske profiler, rækker og SHA-256. Inputrækkefølge ændrer ikke resultatet. Hashen i `metadata.contentHash` omfatter seed, version, reference, profiler og ordnede benchmarkrækker. Metadata skal bevares med det versionsfaste snapshot. Ændret generator, struktur eller kildeinput kræver en ny dataversion efter appens almindelige immutable seed-regler.

## Økonomisk model og afgrænsning

Sammenligningsniveauet er **hele det modellerede fagområde i demoorganisationen**. Det er ikke kommunernes faktiske kontoplan eller et fuldt kommuneregnskab. Skoleområdets nævner er syntetiske elever i dette område. De øvrige områders nævner er syntetiske indbyggere. En enkelt institution eller en bruger med kun en del af området må ikke sammenlignes direkte med en peers samlede kommuneområde; `applyMunicipalBenchmark` og databaseudtrækket kontrollerer fuldt relevant scope først.

Når der leveres et komplet Kalundborg-helårsbudget med 12 måneder, kalibreres peerens enhedsomkostning til samme demoområdes simulerede niveau: budgetnetto / elever eller indbyggere. Derefter anvendes seedfaste struktur- og omkostningsfaktorer på peerens egen syntetiske nævner. Peerne er dermed **syntetiske afledninger af et fælles demo-omkostningsniveau**, ikke uafhængige eksterne observationer. Et lavere peerresultat er ikke dokumentation for et reelt kommunalt besparelsespotentiale.

Ved manglende kalibreringsår bruges det indsendte strukturårs komplette budget og en eksplicit årlig modelstigning på 2,7 %. Uden nogen komplet Kalundborg-kalibrering bruges fiktive enhedsomkostninger fra generatorens `UNIT_COST_ORE`. Det er modelkonstanter, ikke offentlige budgetdata. Alle beløb er nominelle kroner; der udføres ingen automatisk fastprisomregning.

Årsbeløbene fordeles med sæsonvægte og præcis restfordeling i heltal øre. Skoler har lavere aktivitetsvægt i juli; faciliteter har større vintervægt; miljø/vedligehold har større sommervægt. Det er synlige modelvalg. Seedvariation og et dokumenteret, illustrativt omkostningspres giver mer- eller mindreforbrug. Prognoser for observerede peer-måneder er lig de simulerede realiserede beløb; senere måneder er forventninger. De er ikke statistiske sikkerhedsintervaller eller officielle fremskrivninger.

Brug budget og regnskab/prognose som særskilte serier. En `outlook` vælger præcis én posttype i hver måned: `actual` til referencedatoen, derefter `forecast`. Den må aldrig lægge begge sammen. Afvigelse er forbrug/prognose minus budget; positivt betyder merforbrug. Sammenlign samme år, månedsspænd, fagområde og måleenhed:

- Skole: `sum(amountOre) / samme års pupils / 100` → kr. pr. syntetisk elev.
- Øvrige områder: `sum(amountOre) / samme års population / 100` → kr. pr. syntetisk indbygger.
- Årssammenligning: januar–september i ét år sammenholdes med januar–september i de andre år, medmindre alle serier eksplicit er helårsprognoser.

Der er ingen selvstændig benchmarkindtægtsserie. Kalundborgs indsendte områdenetto følger den oprindelige ledgers fortegn. Peerudgifter er positive modellerede nettoomkostninger. Der må ikke tilføjes institutions- eller bygningsposter til de allerede aggregerede kommunerækker.

## Forklarlig peerudvælgelse

`selectMunicipalPeers(profiles, baselineId, limit)` returnerer som standard de tre nærmeste profiler. Den bruger udelukkende simuleret struktur, ikke økonomi, afvigelser, score for servicekvalitet eller officielle kommunegrupper:

| Strukturtræk           | Vægt | Normaliseret forskel                                    |
| ---------------------- | ---- | ------------------------------------------------------- |
| Indbyggertal           | 30 % | Absolut forskel / største indbyggertal                  |
| Andel 65 år og derover | 25 % | Absolut andelsforskel / 0,25, højst 1                   |
| Skolebørnsandel        | 25 % | Forskel i `schoolchildren / population` / 0,12, højst 1 |
| Landlighedsindeks      | 20 % | Absolut forskel i det fiktive 0–1-indeks                |

Vægtet afstand er summen af vægt × normaliseret forskel. Lighedsscoren er `100 × (1 − afstand)`, afrundet til én decimal. Den ligger mellem 0 og 100 og er symmetrisk. Ved ens afrundet score afgør den stabile officielle kode rækkefølgen. Hvert resultat indeholder både komponenternes rå værdier, normaliserede forskelle, vægtede bidrag og en dansk forklaring, som fremhæver, at udvalget er fiktivt.

Grænserne 0,25 og 0,12 og de fire vægte er eksplicitte illustrationsparametre. Landlighedsindekset er ikke Danmarks Statistiks klassifikation. En score på eksempelvis 90 betyder høj lighed i netop disse simulerede træk; den er ikke en officiel lighedsvurdering, statistisk sandsynlighed eller anbefaling om kommunal styring.

## Kontroller og begrænsninger

`tests/municipalities.test.ts` har 13 tests af navn/kode, manglende Kalundborginput, præcis videreførsel af egne tal, hash og reproducerbarhed, fuld måneds-/områdedækning, realiseringsgrænse, nævnere og ørepræcision, kalibrering, inputvalidering samt forklarlig peerudvælgelse. Tests bruger syntetiske fixtures; de er ikke en prøve af en faktisk kommunes økonomi.

Generatoren afviser ugyldige datoer, år uden for 2020–2032, dublerede Kalundborgnøgler, fremtidige realiserede poster og inkonsistente nævnere i samme år. Sammenligningsmodulet og API-laget har ansvaret for adgang, fuldt områdescope, fælles periode, kildeobjekter og reproducerbar eksport. Dokumentation af en navneregistrering må aldrig anvendes som belæg for et simuleret budget.
