# Microsoft Entra ID og adgang

K.A.I.A. bruger `openid-client` 6.8.8 med serverbaseret authorization-code-flow, PKCE S256, tilfældig state og nonce. Biblioteket behandler og validerer OIDC-svaret fra den tenantafgrænsede discovery-URL. Applikationen kræver desuden præcist `tid` fra konfigurationen, et stabilt UUID i `oid` og kendte værdier i den validerede `roles`-claim. Rollen kommer aldrig fra navn, e-mail, klienten eller en brugerredigerbar profil.

## Registrér applikationen

1. Opret en single-tenant **Web**-app registration i den ønskede Entra-tenant. Vælg kun konti i denne organisation.
2. Registrér callbacken `https://<præcist-hostnavn>/auth/callback`. Lokalt kan `http://127.0.0.1:3210/auth/callback` registreres separat. Brug et fast preview-hostnavn eller særskilte app registrations til test og produktion; vilkårlige deploy-URL'er er ikke callbacks.
3. Opret et client secret og kopiér dets **value** til `KAIA_ENTRA_CLIENT_SECRET`. Notér udløbsdato og planlæg rotation i driften. Client-ID mappes til `KAIA_ENTRA_CLIENT_ID`; Directory-ID til `KAIA_ENTRA_TENANT_ID`.
4. Opret app-roller under **App registrations → app → App roles**. Vælg tilladte medlemmer **Users/Groups**, enabled, og disse uændrede values:

| Visningsnavn              | Value                 | Tilladt indhold inden for tildelt scope                   |
| ------------------------- | --------------------- | --------------------------------------------------------- |
| Administrator             | `KAIA.Admin`          | Data og applikationsadministration                        |
| Direktion                 | `KAIA.Executive`      | Tværgående økonomi og tilladte dokumenter                 |
| Økonomikonsulent          | `KAIA.Finance`        | Økonomidetaljer og scenarier                              |
| Fagchef                   | `KAIA.DepartmentHead` | Eget områdes økonomi, institutioner og dokumenter         |
| Kommunalbestyrelsesmedlem | `KAIA.Council`        | Aggregerede tal og politisk klassificerede demodokumenter |

5. Under **Enterprise applications → app → Users and groups** tildeles brugere/grupper de relevante roller. Slå _Assignment required_ til. Anvend organisationens MFA/Conditional Access-politik. Applikationen bruger `openid profile` og behøver ikke Graph-læseadgang eller andre medarbejderprofiler.
6. Indstil `KAIA_APP_URL`, `KAIA_SESSION_SECRET` (mindst 32 tilfældige tegn), `KAIA_ENCRYPTION_KEY` (32 tilfældige bytes i base64) og databaseforbindelsen. Brug kun servermiljøvariabler.

## Tildel et scope

Rolle og enhedsscope er to uafhængige krav. Første login opretter identiteten med tokenets app-roller, men giver **ingen** dataadgang. En allerede autoriseret administrator kan redigere scope for eksisterende identiteter i Indstillinger. Administratoren kan kun tildele enheder og fagområder inden for sit eget scope. API'et kan ikke ændre Entra-roller.

Første administrator bootstrapper via en kontrolleret driftskommando **efter eget Entra-login**:

```sh
npx tsx scripts/grant.ts '<tenant-UUID>:<object-UUID>' 'schools,facilities,administration' '*'
```

Stjernen i CLI'et udvides til konkrete enheds-ID'er i de valgte områder. Tilføj de øvrige områder eksplicit, hvis nødvendigt: `social,health,environment,preparedness`. CLI'et tildeler ingen rolle og accepterer kun en eksisterende identitet. Kommunalbestyrelsesmedlemmers udvalgsscope kan tildeles via de registrerede `committee-*`-ID'er; dette åbner områdets aggregerede data, men stadig kun politiske dokumenter.

Dokumenter, som rummer flere enheders tal, kræver adgang til samtlige omtalte enheder. En bruger med adgang til én skole får ikke et områdeomfattende notat med andre skolers økonomi. Serveren kontrollerer også gemte analyser mod det aktuelle scope; tilbagekaldt enhedsadgang gælder straks ved næste forespørgsel.

## Identitet, profil og session

Identitetsnøglen er `tid:oid`. De eneste personlige præsentationsprofiler aktiveres ved eksplicit `KAIA_PARTHEE_IDENTITY` eller `KAIA_ANNE_IDENTITY` med præcis denne nøgle. De viser henholdsvis Partheepan Vijayamohan / AI Program Lead og Anne Dandanell / Chef. Alle andre profiler får funktionsbetegnelser. Profilnavnene giver ingen rettigheder.

Browseren får en tilfældig opaque, httpOnly cookie med SameSite=Lax og Secure i produktion. Kun en SHA-256-hash bundet til sessionshemmeligheden gemmes i Postgres. Sessionen udløber efter 8 timer. Roller stammer fra det seneste validerede Entra-login; Entra-rolletilbagekaldelse slår derfor igennem ved næste login eller senest efter sessionens udløb. Scope indlæses fra databasen ved hver forespørgsel. Log ud sletter den aktuelle DB-session. OIDC-transaktionen gemmes kortvarigt som AES-GCM-krypteret httpOnly cookie; den indeholder ingen rolleautoritet. Appens muterende POST-endpoints bruger præcis Origin-kontrol, og JSON-API'erne kræver JSON. Den isolerede lokale testlogin-form bruger formdata med samme Origin-kontrol. OIDC-callbacken beskyttes af authorization-code-flowets state, nonce og PKCE.

## Lokal verifikation

`KAIA_TEST_MODE=1` giver kun fixtures, når alle disse betingelser er opfyldt: udvikling/test, ingen `VERCEL`-markering og localhost som app-URL. `/api/test-session` er kun en lokal POST-form. `scripts/test-session.ts` kan oprette en tidsbegrænset fixture-session til automatiske HTTP-prøver. Fixture-sessioner markeres i databasen og afvises også, hvis de efterfølgende læses i produktion eller på Vercel. Der er ingen testlogin-genvej i en normal demo eller offentlig deployment.

En demo uden AI-nøgle anvender ellers præcis samme Entra-login og adgangsregler som live-AI. Manglende Entra-konfiguration efterlader appen på opsætningsfladen.

Kilder: [Microsofts app-roller](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps), [Microsoft OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [openid-client 6](https://github.com/panva/openid-client/tree/v6.x).

**Integrationsstatus:** bibliotek, callback, identitetsbinding, session, scope og lokale fixture-prøver er implementeret. Login mod en rigtig Entra-tenant skal afprøves med organisationens registrering og tildelinger, før det betegnes som verificeret.
