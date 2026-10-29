# K.A.I.A.
Dansk brugerflade og dokumentation; engelske kodeidentifikatorer. Parthee har godkendt navnet K.A.I.A. · Kommunal AI Analyse.
Alle kommunale tal og beslutninger er simulerede. Bevar serverbaseret adgangskontrol, ejerkontrol og præcis økonomirepræsentation. Entra bruger tenant/oid-identitet. Parthee har den 21. oktober 2026 eksplicit godkendt KAIA_AUTH_MODE=demo med særskilte besøgsidentiteter og faste profiler uden admin samt Vercel-frontend med lokal backend. Testidentiteter er stadig kun lokale fixtures og afvises på Vercel; de er ikke offentlig demologin. Hybridgateway kræver serverbaseret HMAC, og DB-/modelcredentials skal blive på Mac'en.
Den tidligere BudgetIndsigt-kode er bevaret i legacy/ og indgår ikke i den nye app.
Kør npm run typecheck, npm run lint, npm test og npm run build ved afslutning. Produktionsintegrationer må kun kaldes verificerede efter reelle credentials-baserede prøver.

Aktiv udviklingscheckout: `/Volumes/J.A.R.V.I.S/ks-sources/kaia`. Brug denne selvstændige Git-checkout frem for den oprindelige iCloud-mappe. Læs `docs/WORKSPACE.md` før flytning eller oprydning. De kørende releases, Postgres-data, credentials og LaunchAgents på Mac'en må ikke flyttes som del af udviklingsoprydning.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
