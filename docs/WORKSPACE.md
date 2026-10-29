# Arbejdsmapper og sikker arkivering

Udviklingsarbejdet blev flyttet til JARVIS den 29. oktober 2026 efter Parthees anmodning. Appens brugerflade og driftskonfiguration blev ikke ændret.

## Aktiv udvikling

Brug `/Volumes/J.A.R.V.I.S/ks-sources/kaia`. Det er en selvstændig Git-checkout med egen objektdatabase og forbindelsen til `Parthee-Vijaya/KAIA` på GitHub. Den afhænger ikke af iCloud for Git-operationer. JARVIS skal være monteret ved udvikling.

Den tidligere sti `/Users/parthee/Worktrees/kaia-recovered-20261029` er bevaret som et symbolsk link til checkouten på JARVIS. Udviklingsafhængighederne ligger i den aktive checkout. Privat udviklingskonfiguration opbevares på Mac'en under `~/Library/Application Support/KAIA/development/`; miljøfiler må ikke committes.

## Arkiv på JARVIS

`/Volumes/J.A.R.V.I.S/ks-archives/kaia/20261029/` indeholder:

- `kaia-dashboard-20261021/`: den tidligere dashboard-worktree med kildekode, eksisterende artefakter og byggemateriale. Den havde ingen lokale kildeændringer og blev ikke brugt af de kørende processer ved flytningen. Git-worktreens sti blev repareret efter flytningen. Dens oprindelige branch er bevaret; arkivets Git-metadata afhænger fortsat af det oprindelige repository.
- `git-recovery/`: den delvist genskabte originale Git-historik, listen over oprindelige commits, recoveryrapporten og kildekodebackup med 345 filer. Tidligere lokale recovery-stier er bevaret som symbolske links.
- `live-files-baseline.json`: kontrolsummer til lokal kontrol af, at beskyttede driftsfiler er uændrede. Filen indeholder ingen credentials og hører ikke til i Git.

Den gamle worktree-sti under `~/.codex/worktrees/` er et kompatibilitetslink til arkivet. Dens `node_modules` blev flyttet til den aktive udviklingscheckout. Arkiverne skal ikke bruges som aktive udviklingsmapper eller slettes, før behovet for recovery er afklaret.

## Bevarede driftsfiler på Mac'en

Den kørende backend anvender `~/Library/Application Support/KAIA/backend/current/`, og den vedvarende database ligger under `~/Library/Application Support/KAIA/postgres/`. Backendmiljø, modelcredentials og tunnelkonfiguration ligger separat under `~/Library/Application Support/KAIA/hybrid/`. De eksisterende LaunchAgents bliver på Mac'en.

Disse mapper er ikke udviklingscaches. Flyt eller ryd dem ikke som del af worktree-oprydning. Driften skal fortsat kunne køre, når JARVIS ikke er monteret. Eksisterende driftsprocesser blev ikke genstartet under flytningen.

## Den oprindelige iCloud-historik

`/Users/parthee/Desktop/Claude/projekter/aktive/kaia` er bevaret. De oprindelige lokale commits og refs er ikke nulstillet eller overskrevet. Nogle ældre Git-objekter kan fortsat ikke hentes fra iCloud; derfor er denne mappe ikke den aktive udviklingscheckout.

GitHub-branchen `codex/kaia-recovery-backup-20261029` blev først oprettet med et separat sikkerhedscommit med præcis samme filtreæ som originalt commit `59f179f526bb535f91f20b996743e63fe0018fa6`. Den fulde oprindelige lokale commithistorik er ikke dermed leveret til GitHub. GitHubs `main` blev bevaret. Fortsat udvikling og denne vejledning ligger oven på sikkerhedscommittet.

Oprydning må ikke slette iCloud-originalen eller recoveryarkiverne. Et senere push af de oprindelige commits kræver, at alle manglende historiske objekter er tilgængelige, og at de kontrolleres før et almindeligt push uden force.
