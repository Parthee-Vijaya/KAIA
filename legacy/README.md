# BudgetIndsigt

**AI-drevet budgetrådgiver for kommunale ledere**

BudgetIndsigt er et intelligent dashboard der giver kommunale chefer og politikere et samlet overblik over budget, befolkningsudvikling, lovgivning og økonomi — med AI-drevne anbefalinger og prognoser.

Bygget som proof-of-concept til **Kalundborg Kommune** med realistiske mock-data baseret på kommunens faktiske struktur.

---

## Demo

> **Live demo**: Deployes via [Render.com](https://render.com) — se `render.yaml`

![Dashboard](https://img.shields.io/badge/Pages-5-blue) ![Budget Areas](https://img.shields.io/badge/Budgetomr%C3%A5der-10-green) ![AI Responses](https://img.shields.io/badge/AI%20Svar-13-purple) ![Lovforslag](https://img.shields.io/badge/Lovforslag-10-orange)

---

## Funktioner

### Dashboard
- 4 KPI-kort (budgetudnyttelse, forecast-afvigelse, befolkningsafvigelse, aktive lovforslag)
- 6 aktive advarsler med scrollbar (ældreområde, demografi, specialundervisning, likviditet, OK24)
- 8 AI-indsigter med kategori-badges (Budget, Befolkning, Lovgivning, Personale, Anlæg)
- Søgefelt med eksempelspørgsmål til AI-chat

### Budget & Forecast
- **Overblik**: 10 budgetområder med udvidbare underkategorier (29 poster), budget vs. realisering chart
- **Realisering**: Redigerbart månedsgrid med YoY-sammenligning mod 2023
- **Forecast**: Mekanisk prognose, kumuleret chart, og afvigelsesanalyse
- Samlet driftsbudget: **1.415 mio. kr.** | Anlægsbudget: **208 mio. kr.**

### Befolkningsmonitor
- Aldersfordeling med 7 grupper (0-5, 6-16, 17-25, 26-45, 46-64, 65-79, 80+)
- Befolkningsudvikling over tid med valgbar aldersgruppe (2018-2028)
- Til- og fraflytningsdata med nettomigration pr. aldersgruppe
- AI-analyse med risikoscenarier og anbefalinger

### Lovgivning & Regulering
- 10 aktive lovforslag med status (vedtaget, under behandling, fremsat)
- Budgetpåvirkning pr. forslag med DUT-kompensation
- Søgning og filtrering efter status og fagområde
- Links til Folketingets hjemmeside

### AI-rådgiver (Chat)
- 13 forudskrevne AI-svar med markdown-formatering
- Inline-grafer (bar, linje, cirkel, area) i svarene
- Kildeangivelser med troværdighedsscore
- Opfølgende spørgsmål efter hvert svar
- Emner: budget, likviditet, anlæg, benchmark, velfærdsteknologi, demografi, lovgivning

---

## Tech Stack

| Lag | Teknologi |
|-----|-----------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, Recharts 2, Framer Motion 12 |
| **State** | Zustand 5 |
| **Backend** | Express 5 (Node.js 18+) |
| **Routing** | React Router 7 |
| **Ekstern data** | Danmarks Statistik API, Folketinget ODA API |
| **Deployment** | Render.com (single web service) |

---

## Projektstruktur

```
BudgetIndsigt/
├── package.json              # NPM workspace root
├── render.yaml               # Render.com deployment config
│
├── backend/
│   ├── server.js             # Express server (serverer frontend i prod)
│   └── routes/
│       ├── ai.js             # AI chat mock-responses
│       └── proxy.js          # Proxy til DST + FT API
│
└── frontend/
    └── src/
        ├── components/       # 8 genbrugelige UI-komponenter
        ├── pages/            # 5 sider (Dashboard, Budget, Befolkning, Lovgivning, Chat)
        ├── data/             # Mock-data (budget, befolkning, AI-svar)
        ├── services/         # API-lag (AI, DST, FT)
        ├── store/            # 3 Zustand stores
        └── utils/            # Konstanter og forecast-logik
```

---

## Kom i gang

### Forudsætninger
- Node.js >= 18
- npm >= 9

### Installation og udvikling

```bash
# Klon repo
git clone https://github.com/Parthee-Vijaya/KAIA.git
cd KAIA

# Installer dependencies (workspace)
npm install

# Start frontend + backend
npm run dev
```

Frontend: `http://localhost:5173` | Backend: `http://localhost:3001`

### Production build

```bash
npm run build    # Bygger frontend til frontend/dist/
npm start        # Starter Express som serverer alt på port 3001
```

---

## Deployment (Render.com)

1. Push til GitHub
2. Gå til [Render.com](https://render.com) → **New** → **Web Service**
3. Forbind GitHub-repo — Render detekterer `render.yaml` automatisk
4. Klik **Deploy**

**Konfiguration** (allerede sat i `render.yaml`):
| Indstilling | Værdi |
|-------------|-------|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Environment | `NODE_ENV=production` |
| Plan | Free |

---

## Kalundborg Kommune — Nøgletal

| Metric | Værdi |
|--------|-------|
| Befolkning | 49.600 |
| Driftsbudget 2024 | 1.415 mio. kr. |
| Anlægsbudget 2024 | 208 mio. kr. |
| Kommunalskat | 25,7% |
| Folkeskoler | 13 |
| Plejehjem | 4 (412 pladser) |
| Største arbejdsgiver | Novo Nordisk (4.500 ansatte) |
| Arbejdsløshed | 3,2% (landssnit: 3,8%) |

---

## Data

Alle data er **mock-data** til demonstrationsformål. Applikationen er designet til at integrere med:

- **Danmarks Statistik** (FOLK1A) — befolkningsdata i realtid
- **Folketinget ODA API** — lovforslag og afstemninger
- **OpenAI API** — AI-genererede svar (valgfrit, fallback til mock)
- **Kommunens ESDH/ERP** — budgettal og regnskab (fremtidig integration)

---

## Licens

MIT
