# Fra flyttemønstre til skolekapacitet

K.A.I.A. betyder efter Parthees godkendelse Kommunal AI Analyse. Fremblik og chatten er bevaret; knappen **Prøv demoforløbet** åbner et samlet spørgsmål. Referenceåret fastholdes til datasnapshottets år (2026), også hvis dashboardets filter står på et andet år. Det valgte institutionsscope bevares.

## Seks synlige trin

1. **Opgave** registrerer spørgsmål, periode og tilladte enheder.
2. **Værktøjer** vælger tre registrerede interne kilder: flytninger, skolekapacitet og kapacitetsscenarier.
3. **Adgang** kontrollerer session, rolle, enheder og katalogoperationer. Council-only har ikke adgang til dette detaljerede forløb.
4. **Beregning** genererer og beregner det versionsfaste grundlag på serveren.
5. **Svar** streamer et beregnet demosvar eller bruger den autoriserede aktive model til formuleringen. Modellen får samme beregnede tal, graf, antagelser og kildehenvisninger.
6. **Handling** kan forberede, gennemgå og godkende et internt demoudkast. Ingen ekstern sag, bevilling eller ændring af skoleplaner udføres.

Journalen gemmes med analysen. Tidsstempler registreres ved de faktiske operationer. Den indeholder hverken modelræsonnement eller timerbaseret, opdigtet fremdrift. Ved genåbning af Handling hentes planens aktuelle godkendelse separat. En uændret analysejournal omskrives ikke efterfølgende.

## Data og model

Tilføjelsen har kildeversion `KAIA-MOBILITY-v1`, koblet til `KAIA-DEMO-2026.09-v4` og samme seed. Den indeholder 80 historikrækker: 16 skoler × de fem hele år 2021–2025, samt fem prognosepunkter 2026–2030 pr. baseline/scenarie. Ingen genindlæsning eller omskrivning af de 1.245.024 økonomiposteringer kræves.

Skolernes navne kommer fra eksisterende navne-register. Demoens geografiske områder er fiktive, ikke virkelige skoledistrikter. Elevtal anvender samme institutionsgrundtal og `pupilsForYear` som økonomidemoen. Kilder gemmer de konkrete historikrækker i analysens snapshot.

Flytninger mellem kommuner, udland og interne områder vises separat som familiehændelser. Intern flytning afstemmer til nul for den fulde demoorganisation; et delscope kan have netto ind- eller udflytning. En familie kan flytte flere gange. Modellen antager 0,85 skolebørn pr. nettofamilieflytning og 90 % skoleoptag. Fødsler, dødsfald, aldersovergange og øvrigt skolevalg adskilles ikke personbaseret: øvrig kohortebalance er den afstemte rest mellem årets elevændring og migrationsbidraget, ikke dokumentation for en bestemt årsag.

Prognosen bruger sidste afsluttede elevbestand plus årstrin gange de afrundede gennemsnit af migrationsbidrag og øvrig balance. Den er deterministisk og har intet statistisk konfidensinterval. Slidernes migrationsprocent påvirker kun migrationsbidraget. Den ændrer ikke selve historikken eller den øvrige balance.

Nye klasser giver 24 pladser og 1,1 mio. kr. årlig fast drift pr. klasse fra første prognoseår. De fordeles én gang til største forventede lokale kapacitetspres, deterministisk ved lighed. Baseline har ingen nye klasser. Lokal mangel summeres som `max(0, elever − pladser)` pr. skole; overskud på andre skoler udligner ikke automatisk. Transport, klassetrin, inklusion, distriktsændringer og bygningsegnethed kræver selvstændig vurdering.

Variabel drift er elevtal × antaget udgift pr. elev (standard 18.000 kr./år). Scenariets ændring er variabel drift plus ny fast klassedrift minus baselinevariabel drift. Eksisterende faste udgifter holdes uændrede. Lavere elevtal lukker ingen klasse automatisk. Alle beløb er præcise heltal i øre, konstant prisniveau; anlæg, skat, udligning, momsberegning og inflation er udeladt.

## Scenarier og godkendelse

`POST /api/mobility` accepterer kun et ejet analyse-ID, validerede antagelser og preview/save. Serveren genkontrollerer aktuelle rettigheder og beregner fra de gemte historikrækker. Preview kalder ingen ekstern model. Gem skaber en ny analyse i samme ejede samtale med forklaring fra den deterministiske kapacitetsmodel; et tidligere Corti-svar genbruges ikke som forklaring på ændrede tal. Chatopfølgninger kan igen formuleres af den autoriserede aktive udbyder.

`/api/plan-drafts` kræver ejerskab og nuværende adgang. Økonomikonsulent kan forberede, mens Fagchef, Direktion eller Administrator kan godkende. Serveren udleder mandat; et klientindsendt rollefelt giver ingen rettighed. Et SHA-256-fingeraftryk binder godkendelsen til dataversion, scope, kildeindhold og beregningsforudsætninger. Udkast og godkendelse gemmes i Postgres; gentagen godkendelse opretter ikke en ny godkendelseshændelse. Et nyt scenarie arver ingen godkendelse.

Migration `0007_plan_drafts.sql` opretter den vedvarende tabel. Ingen ny credential eller ekstern integration kræves. MCP/CLI og eksterne fagsystemer har samme tidligere dokumenterede status; dette forløb påstår ikke, at de er tilsluttet.

## Kort præsentation

1. Log ind som Direktion eller Chef, og åbn **Prøv demoforløbet** i Fremblik.
2. Se hovedsvar, elevgraf og lokal pladsmangel; vælg **Se analyseforløb**.
3. Klik gennem Opgave, Værktøjer, Adgang og Beregning. Åbn en beregningskilde.
4. Ændr tilflytning til +25 % og vælg to nye klasser. Se graf og drift blive genberegnet. Nulstil eller gem som ny analyse.
5. Vælg Handling, forbered planudkastet, gennemgå forudsætningerne og godkend det interne demoudkast.
6. Genåbn samtalen efter genindlæsning. Godkendelsen og det oprindelige snapshot bevares.

## Detaljerede visninger og tempo

Den seneste analyse kan gennemgås i et roligt tempo på 4, 6 eller 10 sekunder pr. trin med pause og manuel navigation. Kapacitet, flytninger, skolesammenligning og økonomiske bidrag kan udforskes på skole- og årsniveau. Se [VISUAL-DEPTH.md](VISUAL-DEPTH.md) for beregningskontrakt og afgrænsning.
