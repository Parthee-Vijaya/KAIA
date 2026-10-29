'use client';

import { useState } from 'react';
import type { DashboardData } from '@/domain/dashboard';
import type { AnalysisContext, ChartRow, Period, PublicEntity, SourceRef } from '@/domain/types';
import { ArrowUpRight, ChevronDown, Info } from './icon';
import { displayText } from './display-text';
import './dashboard-schools.css';

export interface SchoolVariancesProps {
  data: DashboardData;
  entities: PublicEntity[];
  onAsk: (question: string, context?: AnalysisContext) => void;
  onSource: (source: SourceRef) => void;
  busy: boolean;
}
export interface SchoolVarianceRow {
  entity: PublicEntity;
  varianceOre: number;
  prior:
    | { status: 'missing'; year: number; reason: string }
    | {
        status: 'ready';
        year: number;
        varianceOre: number;
        varianceChangeOre: number;
        varianceMagnitudeChangeOre: number;
      };
}
type SchoolVariancesModel =
  | { status: 'hidden' }
  | { status: 'missing'; reason: string }
  | {
      status: 'ready';
      key: string;
      rows: SchoolVarianceRow[];
      sources: { source: SourceRef; citation: number }[];
    };

const months = [
  'januar',
  'februar',
  'marts',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'december',
];
const kroner = new Intl.NumberFormat('da-DK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const unsignedKroner = new Intl.NumberFormat('da-DK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'never',
});
function periodText(period: Period) {
  const from = months[period.fromMonth - 1],
    to = months[period.toMonth - 1];
  return `${from === to ? from : `${from}–${to}`} ${period.year}`;
}
function amount(ore: number) {
  return `${kroner.format(ore / 100)} kr.`;
}
function direction(ore: number) {
  return ore > 0 ? 'Merforbrug' : ore < 0 ? 'Mindreforbrug' : 'I balance';
}
function directionClass(ore: number) {
  return ore > 0 ? 'over' : ore < 0 ? 'under' : 'balanced';
}
function priorComparison(row: ChartRow, year: number): SchoolVarianceRow['prior'] {
  const priorYear = year - 1;
  if (
    row.priorYear === priorYear &&
    typeof row.priorVariance === 'number' &&
    Number.isSafeInteger(row.priorVariance) &&
    typeof row.varianceChange === 'number' &&
    Number.isSafeInteger(row.varianceChange) &&
    typeof row.varianceMagnitudeChange === 'number' &&
    Number.isSafeInteger(row.varianceMagnitudeChange) &&
    row.priorVarianceReason === null
  )
    return {
      status: 'ready',
      year: priorYear,
      varianceOre: row.priorVariance,
      varianceChangeOre: row.varianceChange,
      varianceMagnitudeChangeOre: row.varianceMagnitudeChange,
    };
  return {
    status: 'missing',
    year: priorYear,
    reason:
      typeof row.priorVarianceReason === 'string' && row.priorVarianceReason.trim()
        ? row.priorVarianceReason
        : 'Sammenligningen mangler et komplet, dokumenteret grundlag for samme måneder sidste år.',
  };
}
function magnitudeText(ore: number) {
  return ore === 0
    ? 'Uændret størrelse'
    : `${unsignedKroner.format(Math.abs(ore) / 100)} kr. ${ore > 0 ? 'større' : 'mindre'}`;
}
function signChange(prior: number, current: number) {
  if (prior > 0 && current < 0) return 'Fra mer- til mindreforbrug.';
  if (prior < 0 && current > 0) return 'Fra mindre- til merforbrug.';
  return undefined;
}
function missing(reason: string): SchoolVariancesModel {
  return { status: 'missing', reason };
}

/** Uses only server-calculated absolute variance; budget/actual may be per-pupil values. */
export function schoolVariancesModel(
  data: DashboardData,
  entities: PublicEntity[],
): SchoolVariancesModel {
  if (data.scope.area !== 'schools') return { status: 'hidden' };
  if (!data.capabilities.detail)
    return missing(
      'Din adgang omfatter aggregerede oplysninger. Afvigelser for de enkelte skoler er ikke tilgængelige.',
    );
  const panel = data.panels.comparison;
  if (panel.status !== 'ready') return missing(panel.reason);
  const analysis = panel.analysis,
    context = analysis.context,
    scope = data.scope;
  if (analysis.datasetVersion !== data.dataset.version)
    return missing('Skoleoversigten tilhører en anden dataversion. Hent overblikket igen.');
  if (
    context.area !== 'schools' ||
    context.period.year !== scope.period.year ||
    context.period.fromMonth !== scope.period.fromMonth ||
    context.period.toMonth !== scope.period.toMonth ||
    !scope.entityIds.length ||
    new Set(scope.entityIds).size !== scope.entityIds.length ||
    JSON.stringify([...context.entityIds].sort()) !== JSON.stringify([...scope.entityIds].sort())
  )
    return missing(
      'Skoleoversigten matcher ikke de valgte enheder og måneder. Hent overblikket igen.',
    );
  if (analysis.missingData) return missing(analysis.missingData);
  const chart = analysis.chart;
  if (!chart || chart.unit !== 'ore' || !chart.rows.length)
    return missing(
      'Der er ingen dokumenterede skoleafvigelser i den valgte periode. Manglende data vises ikke som nul.',
    );
  if (!chart.sourceIds.length)
    return missing('Skoleafvigelserne mangler et simuleret beregningsgrundlag.');
  const sources: { source: SourceRef; citation: number }[] = [];
  for (const id of new Set(chart.sourceIds)) {
    const matches = analysis.sources.filter((source) => source.id === id);
    const source = matches.length === 1 ? matches[0] : undefined;
    if (
      !source ||
      source.type !== 'demo' ||
      source.datasetVersion !== data.dataset.version ||
      (source.status && source.status !== 'simulated')
    )
      return missing(
        'Økonomital kræver simulerede beregningskilder fra samme dataversion. Officielle navnekilder dokumenterer ikke afvigelserne.',
      );
    sources.push({ source, citation: analysis.sources.indexOf(source) + 1 });
  }
  const scopedSchools = entities.filter(
    (entity) =>
      entity.type === 'school' && entity.area === 'schools' && scope.entityIds.includes(entity.id),
  );
  if (
    scopedSchools.length !== scope.entityIds.length ||
    new Set(scopedSchools.map((entity) => entity.id)).size !== scopedSchools.length
  )
    return missing(
      'Skoleoversigten mangler et entydigt, autoriseret skoleregister for den valgte afgrænsning.',
    );
  const rows: SchoolVarianceRow[] = [],
    seen = new Set<string>();
  for (const row of chart.rows) {
    const matches = scopedSchools.filter((entity) => entity.name === row.label);
    const entity = matches.length === 1 ? matches[0] : undefined;
    if (!entity || seen.has(entity.id))
      return missing(
        'Sammenligningens skolenavne kan ikke matches entydigt med de tilladte skoler. Hent overblikket igen.',
      );
    if (typeof row.variance !== 'number' || !Number.isSafeInteger(row.variance))
      return missing(
        'En skole mangler et gyldigt afvigelsesbeløb i øre. Manglende beløb erstattes ikke med nul.',
      );
    rows.push({
      entity,
      varianceOre: row.variance,
      prior: priorComparison(row, scope.period.year),
    });
    seen.add(entity.id);
  }
  if (seen.size !== scopedSchools.length)
    return missing(
      'Der mangler sammenlignelige afvigelser for mindst én af de valgte skoler. En delvis liste vises ikke som et fuldt overblik.',
    );
  rows.sort(
    (left, right) =>
      Math.abs(right.varianceOre) - Math.abs(left.varianceOre) ||
      left.entity.name.localeCompare(right.entity.name, 'da-DK') ||
      left.entity.id.localeCompare(right.entity.id),
  );
  return {
    status: 'ready',
    rows,
    sources,
    key: JSON.stringify([data.dataset.version, scope.period, [...scope.entityIds].sort()]),
  };
}

export function SchoolVariances({ data, entities, onAsk, onSource, busy }: SchoolVariancesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const model = schoolVariancesModel(data, entities);
  if (model.status === 'hidden') return null;
  const all = model.status === 'ready' && expandedKey === model.key;
  const rows = model.status === 'ready' ? (all ? model.rows : model.rows.slice(0, 5)) : [];
  const maximum = model.status === 'ready' ? Math.abs(model.rows[0]?.varianceOre || 0) : 0;
  return (
    <section className="kaia-schools" aria-label="Skolernes budgetafvigelser">
      <header className="kaia-schools-heading">
        <div>
          <h2>Skolernes budgetafvigelser</h2>
          <p>{periodText(data.scope.period)}</p>
        </div>
      </header>
      {model.status === 'ready' ? (
        <>
          <p className="kaia-schools-intro">
            Største absolutte afvigelse først · både mer- og mindreforbrug.
          </p>
          <div className="kaia-schools-columns" aria-hidden="true">
            <span>Skole</span>
            <span>{data.scope.period.year - 1}</span>
            <span>{data.scope.period.year}</span>
            <span>Afvigelsens størrelse</span>
          </div>
          <ol className="kaia-schools-list">
            {rows.map(({ entity, varianceOre, prior }) => (
              <li
                className={`kaia-schools-row kaia-schools-row--${varianceOre > 0 ? 'over' : varianceOre < 0 ? 'under' : 'balanced'}`}
                key={entity.id}
              >
                <span className="kaia-schools-name">{entity.name}</span>
                <div className="kaia-schools-year">
                  <span className="kaia-schools-year-label">{prior.year}</span>
                  {prior.status === 'ready' ? (
                    <button
                      type="button"
                      className={`kaia-schools-amount kaia-schools-amount--prior kaia-schools-amount--${directionClass(prior.varianceOre)}`}
                      disabled={busy}
                      aria-label={`${entity.name}: ${prior.year} · ${amount(prior.varianceOre)}, ${direction(prior.varianceOre)}. Undersøg udgiftstyper i ${periodText({ ...data.scope.period, year: prior.year })}.`}
                      onClick={() =>
                        onAsk(
                          `Hvilke udgiftstyper bidrager til nettoafvigelsen på ${entity.name}?`,
                          {
                            area: 'schools',
                            period: { ...data.scope.period, year: prior.year },
                            entityIds: [entity.id],
                            intent: 'category',
                            metric: 'net',
                          },
                        )
                      }
                    >
                      <span>
                        <strong>{amount(prior.varianceOre)}</strong>
                        <span>{direction(prior.varianceOre)}</span>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ) : (
                    <div className="kaia-schools-prior-missing">
                      <strong>Ikke tilgængeligt</strong>
                      <p>{displayText(prior.reason)}</p>
                    </div>
                  )}
                </div>
                <div className="kaia-schools-year">
                  <span className="kaia-schools-year-label">{data.scope.period.year}</span>
                  <button
                    type="button"
                    className={`kaia-schools-amount kaia-schools-amount--current kaia-schools-amount--${directionClass(varianceOre)}`}
                    disabled={busy}
                    aria-label={`${entity.name}: ${data.scope.period.year} · ${amount(varianceOre)}, ${direction(varianceOre)}. Undersøg udgiftstyper i ${periodText(data.scope.period)}.`}
                    onClick={() =>
                      onAsk(`Hvilke udgiftstyper bidrager til nettoafvigelsen på ${entity.name}?`, {
                        area: 'schools',
                        period: data.scope.period,
                        entityIds: [entity.id],
                        intent: 'category',
                        metric: 'net',
                      })
                    }
                  >
                    <span>
                      <strong>{amount(varianceOre)}</strong>
                      <span>{direction(varianceOre)}</span>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="kaia-schools-change">
                  <span className="kaia-schools-change-label">Afvigelsens størrelse</span>
                  {prior.status === 'ready' ? (
                    <>
                      <strong>{magnitudeText(prior.varianceMagnitudeChangeOre)}</strong>
                      <span>
                        fra {prior.year} til {data.scope.period.year}
                      </span>
                      {signChange(prior.varianceOre, varianceOre) && (
                        <p>{signChange(prior.varianceOre, varianceOre)}</p>
                      )}
                    </>
                  ) : (
                    <span>Kan ikke sammenlignes</span>
                  )}
                </div>
                <span className="kaia-schools-track" aria-hidden="true">
                  <span
                    style={{ width: `${maximum ? (Math.abs(varianceOre) / maximum) * 100 : 0}%` }}
                  />
                </span>
              </li>
            ))}
          </ol>
          <p className="kaia-schools-note">
            Afvigelse = regnskab/prognose minus periodiseret budget for de valgte måneder. Beløbet
            gælder skolen samlet og er ikke pr. elev. Klik på beløbet for at undersøge
            udgiftstyperne i det valgte år. Udviklingen sammenligner afvigelsernes størrelse uden
            fortegn. Større mindreforbrug er ikke automatisk en negativ udvikling.
          </p>
          <footer className="kaia-schools-footer">
            <div className="kaia-schools-sources">
              <span>Beregningsgrundlag</span>
              {model.sources.map(({ source, citation }) => (
                <button
                  type="button"
                  key={source.id}
                  title={displayText(source.title)}
                  aria-label={`Åbn kilde: ${displayText(source.title)}`}
                  onClick={() => onSource(source)}
                >
                  [{citation}]
                </button>
              ))}
            </div>
            {model.rows.length > 5 && (
              <button
                type="button"
                className="kaia-schools-toggle"
                aria-expanded={all}
                onClick={() => setExpandedKey(all ? null : model.key)}
              >
                {all ? 'Vis de fem største' : `Vis alle ${model.rows.length} skoler`}
                <ChevronDown size={14} className={all ? 'kaia-schools-chevron-up' : ''} />
              </button>
            )}
          </footer>
        </>
      ) : (
        <div className="kaia-schools-missing">
          <Info size={18} />
          <p>{displayText(model.reason)}</p>
        </div>
      )}
    </section>
  );
}
