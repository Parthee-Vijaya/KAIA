import snapshot from './snapshots/statbank-2026-10-20.json';
import type { AccessContext } from '../domain/types';
import { authorizeSource } from './policy';
import { statbankNumber } from './statbank';
import type { ContextSeries, SourceRequest } from './types';
import { getDataset } from '../domain/data';
import type { Dataset } from '../domain/data';

function availableContextSeries(
  access: AccessContext,
  request: SourceRequest,
  datasetVersion: string,
  dataset: Dataset,
): ContextSeries[] {
  authorizeSource(access, { ...request, operation: 'series' });
  const simulatedCommon = {
    status: 'simulated' as const,
    sourceUrl: 'kaia:demo-context',
    geography: 'Kalundborg · simuleret demoorganisation',
    frequency: 'year' as const,
    observedAt: dataset.referenceDate,
    retrievedAt: dataset.referenceDate,
    datasetVersion,
    assumptions: [
      'Syntetisk kontekstserie. Tallene er ikke kommunens faktiske forhold og dokumenterer ingen lokal økonomisk årsag.',
      'Værdier efter referencedatoen er simulerede prognoser, ikke realiserede observationer.',
    ],
  };
  if (request.sourceId === 'energy-price-context' || request.sourceId === 'demography-context') {
    if (dataset.version !== datasetVersion)
      throw new Error('Kontekst og analyse skal bruge samme dataversion.');
    if (request.sourceId === 'energy-price-context') {
      const coverage = dataset.coverage || { fromYear: 2023, toYear: 2028 };
      const annual = Array.from(
        { length: coverage.toYear - coverage.fromYear + 1 },
        (_, index) => coverage.fromYear + index,
      ).map((year) => {
        const rows = dataset.rows.filter(
          (row) =>
            row.category === 'energy' &&
            row.kind === 'forecast' &&
            row.year === year &&
            row.month >= request.period.fromMonth &&
            row.month <= request.period.toMonth &&
            request.unitIds.includes(row.entityId),
        );
        const quantity = rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
        return {
          year,
          averagePrice: quantity ? rows.reduce((sum, row) => sum + row.amountOre, 0) / quantity : 0,
        };
      });
      const basePrice = annual.find((row) => row.year === 2023)?.averagePrice;
      if (!basePrice) throw new Error('Afgrænsningen mangler simulerede energimængder.');
      return [
        {
          ...simulatedCommon,
          id: 'energy-price-context',
          title: 'Simuleret vægtet energiprisindeks',
          unit: 'indeks, 2023 = 100',
          observations: annual
            .filter((row) => row.averagePrice > 0)
            .map((row) => ({
              period: String(row.year),
              value: Math.round((row.averagePrice / basePrice) * 10_000) / 100,
            })),
          assumptions: [
            ...simulatedCommon.assumptions,
            'Beregnet af samme tilladte simulerede fakturaposter som analysen: sum(beløb) / sum(kWh), forecast; vægtet med årets mængder.',
            'Kun år med simulerede fakturaposter i det indlæste snapshot medtages. Manglende år udelades; de vises aldrig som nul.',
          ],
        },
      ];
    }
    return [
      {
        ...simulatedCommon,
        id: 'demography-context',
        title: 'Simuleret befolkning i demoorganisationen',
        unit: 'personer',
        observations: [...new Set((dataset.demography || []).map((row) => row.year))]
          .sort()
          .map((year) => ({
            period: String(year),
            value: (dataset.demography || [])
              .filter((row) => row.year === year)
              .reduce((sum, row) => sum + row.population, 0),
          })),
        assumptions: [
          ...simulatedCommon.assumptions,
          'Afledt af samme syntetiske demografirækker som analysen. Aldersgrupper, nettoflytning, fødsler og dødsfald analyseres særskilt. Ingen proportional besparelse udledes.',
        ],
      },
    ];
  }
  const publicCommon = {
    status: 'verified-public-snapshot' as const,
    datasetVersion: snapshot.datasetVersion,
    retrievedAt: snapshot.retrievedAt,
    assumptions: [
      'Offentligt fastlåst snapshot fra Danmarks Statistik. Kommunens økonomital er fortsat simulerede.',
      'Kontekst forklarer ikke i sig selv en ændring i lokale regnskabsposter.',
    ],
  };
  if (request.sourceId === 'dst-prices')
    return ['0451', '0722'].map((category) => ({
      ...publicCommon,
      id: `dst-PRIS01-${category}`,
      title:
        category === '0451'
          ? 'Danmark · prisindeks for elektricitet'
          : 'Danmark · prisindeks for brændstof og smøremidler',
      sourceUrl: snapshot.extracts.prices.sourceUrl,
      unit: 'indeks, 2025 = 100',
      geography: 'Danmark',
      frequency: 'month' as const,
      observedAt: '2026-09-01',
      observations: snapshot.extracts.prices.rows
        .filter((row) => row.VAREGR === category)
        .map((row) => ({ period: row.TID, value: statbankNumber(row.INDHOLD)! })),
    }));
  if (request.sourceId === 'dst-population')
    return [
      {
        ...publicCommon,
        id: 'dst-FOLK1A-326',
        title: 'Kalundborg · befolkning den 1. i kvartalet',
        sourceUrl: snapshot.extracts.population.sourceUrl,
        unit: 'personer',
        geography: 'Kalundborg Kommune (326)',
        frequency: 'quarter',
        observedAt: '2026-07-01',
        observations: snapshot.extracts.population.rows.map((row) => ({
          period: row.TID,
          value: statbankNumber(row.INDHOLD)!,
        })),
      },
    ];
  throw new Error('Kilden indeholder ikke en registreret kontekstserie.');
}

export function contextSeries(
  access: AccessContext,
  request: SourceRequest,
  datasetVersion: string,
  dataset: Dataset = getDataset(),
): ContextSeries[] {
  const fromYear = request.periodRange?.fromYear ?? request.period.year,
    toYear = request.periodRange?.toYear ?? request.period.year;
  return availableContextSeries(access, request, datasetVersion, dataset)
    .map((series) => ({
      ...series,
      observations: series.observations.filter((observation) => {
        const year = Number(observation.period.slice(0, 4));
        if (year < fromYear || year > toYear) return false;
        if (series.frequency === 'month') {
          const month = Number(observation.period.slice(-2));
          return month >= request.period.fromMonth && month <= request.period.toMonth;
        }
        if (series.frequency === 'quarter') {
          const month = (Number(observation.period.slice(-1)) - 1) * 3 + 1;
          return month >= request.period.fromMonth && month <= request.period.toMonth;
        }
        return true;
      }),
    }))
    .filter((series) => series.observations.length > 0);
}

export const PUBLIC_SNAPSHOT_SUMMARY = {
  datasetVersion: snapshot.datasetVersion,
  retrievedAt: snapshot.retrievedAt,
  contentHash: snapshot.contentHash,
  sourceCount: 3,
  observationCount: 18,
  defaultActive: false,
};
