import type { AccessContext, Role } from '../domain/types';
import type { CatalogSource } from './types';
import { entityRegistry, REFERENCE_DATE } from '../domain/data';
import { allowedEntities, canUseDetailedData } from '../domain/policy';

const ROLES: Role[] = [
  'KAIA.Admin',
  'KAIA.Executive',
  'KAIA.Finance',
  'KAIA.DepartmentHead',
  'KAIA.Council',
];
const AREAS: CatalogSource['areas'] = [
  'schools',
  'facilities',
  'social',
  'health',
  'environment',
  'administration',
  'preparedness',
];
const common = {
  areas: AREAS,
  unitIds: [],
  roles: ROLES,
  geography: 'Kalundborg · modelleret demoorganisation',
  period: { fromYear: 2020, toYear: 2032 },
  observedAt: REFERENCE_DATE,
  retrievedAt: '2026-10-20',
  status: 'simulated' as const,
};

export const SOURCE_CATALOG: readonly CatalogSource[] = [
  ...[
    {
      id: 'mobility-history',
      title: 'Børnefamiliers flytninger',
      unit: 'familiehændelser og børn',
      tools: ['mobility_history'],
      concepts: ['flyttemønstre', 'børnefamilier'],
    },
    {
      id: 'school-capacity',
      title: 'Elevtal og skolekapacitet',
      unit: 'elever og anvendelige pladser',
      tools: ['school_capacity'],
      concepts: ['kapacitet', 'skoledistrikter'],
    },
    {
      id: 'capacity-scenarios',
      title: 'Kapacitet og driftsøkonomi',
      unit: 'elever, klasser og øre',
      tools: ['capacity_scenario'],
      concepts: ['fremskrivning', 'handlevalg'],
    },
  ].map((source): CatalogSource => ({
    ...common,
    ...source,
    areas: ['schools'],
    roles: ROLES.filter((role) => role !== 'KAIA.Council'),
    kind: 'context',
    operations: ['series', 'aggregate', 'export'],
    frequency: 'år',
    description:
      'Versionsfast kommunalt demoforløb KAIA-MOBILITY-v1. Fiktive demoområder, kapacitet og flytninger; ingen ekstern forbindelse.',
    integration: 'implemented',
  })),

  {
    ...common,
    id: 'demo-municipal-benchmarks',
    title: 'Simulerede kommunesammenligninger',
    description:
      'Sammenlignelige områdeaggregater og syntetiske nævnere. Kun navne og kommunekoder er officielle.',
    kind: 'ledger',
    operations: ['aggregate', 'export', 'ingest'],
    unit: 'øre, syntetiske elever og indbyggere',
    frequency: 'måned',
    tools: ['compare_municipalities'],
    concepts: ['kommune', 'benchmark', 'sammenligning', 'pr. elev', 'pr. indbygger'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'demo-ledger',
    title: 'Simulerede økonomiposteringer',
    description:
      'Periodiseret budget, regnskab og prognose. Alle beløb er fiktive; summer i heltal øre.',
    kind: 'ledger',
    operations: ['aggregate', 'detail', 'export', 'ingest'],
    unit: 'øre',
    frequency: 'måned',
    tools: ['budget_status', 'compare_units', 'calculate_scenario'],
    concepts: ['budget', 'regnskab', 'prognose', 'skole', 'energi', 'løn', 'afvigelse'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'demo-documents',
    title: 'Simulerede notater og beslutninger',
    description:
      'Fiktive budgetnotater, strategier og politisk materiale. Klassifikation kontrolleres for hvert dokument.',
    kind: 'documents',
    operations: ['document', 'export', 'ingest'],
    unit: 'dokument',
    frequency: 'versionsfast snapshot',
    tools: ['search_documents', 'document_excerpt'],
    concepts: ['beslutning', 'strategi', 'udvalg', 'årsag', 'forklaring'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'energy-price-context',
    title: 'Simuleret energipriskontekst',
    description:
      'Syntetisk indeks til standarddemo. Lokal pris-/mængdeberegning bruger de simulerede fakturalinjer, aldrig dette indeks som kausalt belæg.',
    kind: 'context',
    operations: ['series', 'ingest'],
    unit: 'indeks, 2023 = 100',
    frequency: 'år',
    tools: ['context_series'],
    concepts: ['energi', 'pris', 'brændstof', 'indeks'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'demography-context',
    title: 'Simuleret demografikontekst',
    description:
      'Syntetisk aldersfordeling og adskilte befolkningsbevægelser; giver ikke automatisk en proportional besparelse.',
    kind: 'context',
    operations: ['series', 'ingest'],
    unit: 'personer',
    frequency: 'år',
    tools: ['context_series'],
    concepts: ['befolkning', 'demografi', 'flytning', 'alder', 'elevtal'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'dst-prices',
    title: 'Statistikbanken · verificeret prisudtræk',
    description:
      'Valgfrit fastlåst PRIS01-udtræk, metadata og kategorier verificeret hos Danmarks Statistik. National kontekst.',
    kind: 'context',
    status: 'verified-public-snapshot',
    operations: ['series', 'ingest'],
    unit: 'indeks (2025 = 100)',
    geography: 'Danmark',
    frequency: 'måned',
    period: { fromYear: 2025, toYear: 2026 },
    observedAt: '2026-09-01',
    sourceUrl: 'https://www.statistikbanken.dk/PRIS01',
    tools: ['context_series'],
    concepts: ['offentligt', 'prisindeks', 'elektricitet', 'brændstof'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'dst-population',
    title: 'Statistikbanken · verificeret befolkningsudtræk',
    description:
      'Valgfrit FOLK1A-udtræk for Kalundborg. Metadata og geografi verificeret; kommunale økonomital er stadig simulerede.',
    kind: 'context',
    status: 'verified-public-snapshot',
    operations: ['series', 'ingest'],
    unit: 'personer',
    geography: 'Kalundborg Kommune (326)',
    frequency: 'kvartal',
    period: { fromYear: 2025, toYear: 2026 },
    observedAt: '2026-07-01',
    sourceUrl: 'https://www.statistikbanken.dk/FOLK1A',
    tools: ['context_series'],
    concepts: ['offentligt', 'befolkning', 'demografi'],
    integration: 'implemented',
  },
  {
    ...common,
    id: 'mcp-fixture',
    title: 'MCP-kontraktfixture',
    description:
      'Lokal, syntetisk fixture. Ingen påstand om en kommunal MCP-server. Ekstern forbindelse kræver et godkendt endpoint.',
    kind: 'mcp',
    operations: ['tool'],
    unit: 'struktureret værktøjsresultat',
    frequency: 'ved kald',
    tools: ['catalog_lookup'],
    concepts: ['integration', 'mcp'],
    integration: 'fixture',
  },
  {
    ...common,
    id: 'cli-fixture',
    title: 'CLI-runner-kontraktfixture',
    description:
      'Fixture for en beskyttet ekstern runner. Applikationen starter ingen shell og accepterer kun faste kommando-ID’er.',
    kind: 'cli',
    operations: ['tool'],
    unit: 'struktureret jobresultat',
    frequency: 'ved kald',
    tools: ['snapshot_status'],
    concepts: ['integration', 'cli', 'indlæsning'],
    integration: 'fixture',
  },
];

export function listAllowedCatalog(access: AccessContext): CatalogSource[] {
  if (
    !access.userId ||
    !access.tenantId ||
    !access.objectId ||
    access.roles.length === 0 ||
    access.areas.length === 0 ||
    access.unitIds.length === 0
  )
    return [];
  const unitIds = allowedEntities(access, entityRegistry()).map((entity) => entity.id);
  return SOURCE_CATALOG.filter(
    (source) =>
      source.roles.some((role) => access.roles.includes(role)) &&
      source.areas.some((area) => access.areas.includes(area)),
  )
    .map((source) => ({
      ...source,
      areas: source.areas.filter((area) => access.areas.includes(area)),
      unitIds: source.unitIds.length
        ? source.unitIds.filter((id) => unitIds.includes(id))
        : unitIds,
      operations: source.operations.filter(
        (operation) =>
          (operation !== 'ingest' || access.roles.includes('KAIA.Admin')) &&
          (operation !== 'detail' || canUseDetailedData(access)),
      ),
    }))
    .filter((source) => source.unitIds.length > 0);
}

export function integrationStatus() {
  return {
    lake: {
      mode: process.env.KAIA_LAKE_MODE || 'postgres',
      status: process.env.DATABASE_URL ? 'configured' : 'unconfigured',
      verification: 'En databaseforbindelse er først verificeret efter migration og reel prøve.',
    },
    mcp: {
      status:
        process.env.KAIA_MCP_URL && process.env.KAIA_MCP_TOKEN && process.env.KAIA_MCP_ALLOWED_HOST
          ? 'configured'
          : 'fixture',
      verification: 'Kontraktfixture testet. Intet eksternt kommunalt endpoint verificeret.',
    },
    cli: {
      status:
        process.env.KAIA_CLI_RUNNER_URL &&
        process.env.KAIA_CLI_RUNNER_TOKEN &&
        process.env.KAIA_CLI_ALLOWED_HOST
          ? 'configured'
          : 'fixture',
      verification: 'Kontraktfixture testet. Ingen ekstern runner verificeret.',
    },
    context: {
      mode: process.env.KAIA_CONTEXT_MODE === 'public-snapshot' ? 'public-snapshot' : 'simulated',
      verification:
        'Standarddemo bruger kun simulerede tal. Offentlige snapshots er opt-in og særskilt mærket.',
    },
  };
}
