# Verificerede navne

Navne er kontrolleret mod Kalundborg Kommunes officielle sider den **20. oktober 2026**. Hvert registerobjekt i `src/domain/data.ts` har stabilt ID, officielt navn, søgealiaser, type, område, navnekilde-URL, verificeringsdato og et særskilt `synthetic`-objekt.

De følgende officielle sider dokumenterer udelukkende navne og eksistens. De dokumenterer ingen af demoens beløb, elevtal, relationer, prognoser eller beslutninger. K.A.I.A. bruger ikke medarbejderprofiler, telefonnumre eller kontaktoplysninger fra siderne.

| Register         | Navne                                                                                                                                                                                                                                                                                                                              | Officiel kilde                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skoler (16)      | Skolen på Herredsåsen; Nyrupskolen; Rynkevangskolen og Inklusionscenter; Hvidebækskolen og Inklusionscenter; Firhøjskolen; Høng Skole; Gørlev Skole og Inklusionscenter; Svebølle Skole; Buerup Skole; International School of Kalundborg; Kirke-Helsinge Skole; Løve Skole; Rørby Skole; Sejerø Skole; Tømmerup Skole; Årby Skole | [Kommunens folkeskoleoversigt](https://www.kalundborg.dk/service-and-selvbetjening/boern-unge-and-familie/skoler-sfo-og-uddannelser/folkeskoler) |
| Faciliteter (8)  | Kalundborg Hallerne; Gørlev Hallen; Hvidebækhallen; Høng Hallen; Firhøjhallen; Rørbyhallen; Spiralen; Svebølle Hallen                                                                                                                                                                                                              | [Idrætshaller og lokaler](https://www.kalundborg.dk/service-and-selvbetjening/kultur-and-fritid/idraetshaller-and-lokaler)                       |
| Udvalg (7)       | Økonomiudvalget; Børn- og Familieudvalget; Kultur- og Fritidsudvalget; Social- og Beskæftigelsesudvalget; Teknik-, Natur- og Miljøudvalget; Ældre- og Sundhedsudvalget; Udvalg for Samfundssikkerhed og Beredskab                                                                                                                  | [Styrelsesvedtægt 2026](https://www.kalundborg.dk/demokrati/kommunalbestyrelsen/styrelsesvedtaegt-for-kalundborg-kommune-2026)                   |
| Organisation (9) | Økonomistaben; Organisationsstaben; Sundhed og Myndighed; Aktivitet og Plejehjem; Vej, Ejendom og Affald; Plan, Byg og Miljø; Jobcenter Kalundborg; Voksenspecialenheden; Kalundborg Kommune                                                                                                                                       | [Organisation](https://www.kalundborg.dk/kommunen/organisation)                                                                                  |

Folkeskoleoversigtens navne prioriteres ved forskellig stavning mellem de officielle sider. Høng Hallen står i facilitetsidens tekst under Kultur- og Bevægelsespark Høng. Styrelsesvedtægtens fulde udvalgsoverskrifter og bøjningsform er anvendt.

Demoorganisationens tilknytning af eksempelvis skoleområdet til Børn- og Familieudvalget og placeringen af et beredskabsbudget på navnet Kalundborg Kommune er eksplicitte modelleringsvalg. De gengiver ikke kommunens faktiske budgethierarki eller kompetencefordeling. Skoleudgifter og facilitetsudgifter bæres af hver deres syntetiske posteringer; ingen intern husleje eller overførsel gentages mellem de to typer.

## Kommuner i v4

Navne og kommunekoder er verificeret hos Danmarks Statistik den **21. oktober 2026** via [den officielle NUTS-oversigt](https://www.dst.dk/da/Statistik/dokumentation/Nomenklaturer/NUTS) og aktuelle `FOLK1A`-metadata. `src/domain/municipalities.ts` gemmer kilde-URL'er og verificeringsdato separat fra de syntetiske strukturtræk.

| Kommune    | Kommunekode |
| ---------- | ----------- |
| Kalundborg | 326         |
| Odsherred  | 306         |
| Holbæk     | 316         |
| Slagelse   | 330         |
| Sorø       | 340         |
| Ringsted   | 329         |

Kun navn og kode er offentligt verificeret. Demoens kommunale indbyggertal, aldersandele, skolebørn, landlighedsindeks, økonomi og peerrangering er simulerede. Der er ikke importeret faktiske kommunale regnskaber eller strukturværdier til benchmarktabellen. Se [MUNICIPAL-BENCHMARKS.md](MUNICIPAL-BENCHMARKS.md) for den fulde metode; offentlige kontekstserier har deres egen særskilte status.

Kun Partheepan Vijayamohan (eventuelt vist som Parthee) og Anne Dandanell må optræde som personnavne i profiler. Generatoren indeholder ingen personnavne og tilskriver ingen personer udtalelser eller beslutninger. Registrerede institutionsnavne er de officielle navne ovenfor.
