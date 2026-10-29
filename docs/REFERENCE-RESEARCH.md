# Verificerede referencer

Referencerne er gennemgået den 20. oktober 2026. Der er læst og forespurgt uden ændringer i DGITA eller på referencewebstederne. K.A.I.A. har sin egen implementering og wordmark, og initialerne udvides ikke.

## DGITA

Repositoryets `main` blev verificeret til commit `edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c`. Følgende filer er læst via GitHubs API:

- [app/globals.css](https://github.com/Parthee-Vijaya/DGITA/blob/edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c/app/globals.css): terrakotta `#bc4d30`, mørk terrakotta `#9b4028`, accent `#c94416`, petrol `#006f71`, slate `#464f5e`, varme/kølige flader `#f8edea`/`#d9e9ea`, canvas `#f6f7f8`, hvid arbejdsflade, tekst `#252525`/`#535e70` og linje `#e4e5e8`. Kontrolradius 8 px, fladeradius 14 px, diskrete skygger og synligt tastaturfokus.
- [app/layout.tsx](https://github.com/Parthee-Vijaya/DGITA/blob/edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c/app/layout.tsx): Geist Sans og Geist Mono samt dansk dokumentlocale.
- [features/ui/SegmentedChoice.tsx](https://github.com/Parthee-Vijaya/DGITA/blob/edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c/features/ui/SegmentedChoice.tsx): fokuseret valgmønster med radiogruppe, piletaster, Home/End og ét tabstop.
- [app/login/LoginClient.module.css](https://github.com/Parthee-Vijaya/DGITA/blob/edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c/app/login/LoginClient.module.css): roligt formularfelt, tydelig focus-within og nedtonet hjælpetekst.
- [features/brand/BrandLockup.tsx](https://github.com/Parthee-Vijaya/DGITA/blob/edf6f1b53277d9ad36ad01f3a6d892e0f5394a5c/features/brand/BrandLockup.tsx): grafisk mærke og typografisk navnestruktur. K.A.I.A. bruger sit eget mærke og overtager ingen forklaring på navnet.

Den konkrete tokenanvendelse i appen er beskrevet i [DESIGN.md](DESIGN.md).

## AI Alliancen

[Den aktuelle forside](https://ai-alliancen.org/) og dens leverede CSS er undersøgt. Siden kombinerer stor typografi, varme lyse flader, fine geometriske detaljer og rolig bevægelse. CSS bruger Geist og Bodoni Moda samt blandt andet Bordeaux `#832d3d`. Siden tilbyder “Læsero”, og enhedens reducerede bevægelse respekteres.

K.A.I.A. fortolker dette som luft, fine forbindelser og bevægelse, der samler datapunkter til overblik. DGITA-paletten og Geist forbliver styrende i analyseproduktet. Motionmotivet er ny kodebaseret grafik og afhænger ikke af en video, kopierede logoer eller referencewebstedets animationer. Produktionsindholdet i den eksterne hjemmeside bruges ikke som kommunalt datagrundlag.

## Offentlig datakontekst og protokoller

- [Danmarks Statistik: API](https://www.dst.dk/da/Statistik/hjaelp-til-statistikbanken/api): POST, `tableinfo` før data, metadata og formatvalg. Den aktuelle klient er prøvet med rigtige offentlige kald.
- [PRIS01](https://www.statistikbanken.dk/PRIS01), [FOLK1A](https://www.statistikbanken.dk/FOLK1A), [BEV107](https://www.statistikbanken.dk/BEV107): tabel-, variabel-, værdi- og geografikoder verificeret i `https://api.statbank.dk/v1/tableinfo`. De konkrete validerede forespørgsler findes i snapshotfilen.
- [Forbrugerprisindeks](https://www.dst.dk/da/Statistik/emner/oekonomi/prisindeks/forbrugerprisindeks): PRIS01’s indeksbase er 2025 = 100. Den undersøgte PRIS111-tabel slutter i 2025 og bruges derfor ikke som den aktuelle 2026-serie.
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) og [MCP Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools): JSON-RPC, init, content types og strukturerede resultater. Den implementerede gateway har en bevidst begrænset læsekontrakt, ikke en universel MCP-klient.

Officielle institutionsnavne og deres verificeringsdato er samlet særskilt i [NAME-SOURCES.md](NAME-SOURCES.md). Disse kilder er navnebelæg. De bruges ikke til at dokumentere de simulerede økonomital eller fiktive beslutninger.
