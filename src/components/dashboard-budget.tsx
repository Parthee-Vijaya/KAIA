'use client';

import type { DashboardData, DashboardPanel } from '@/domain/dashboard';
import type {
  Analysis,
  AnalysisContext,
  ChartSpec,
  Metric,
  Period,
  SourceRef,
} from '@/domain/types';
import { metricValue, money } from '@/domain/format';
import { AnalysisChart } from './chart';
import { displayText } from './display-text';
import { ArrowUpRight, Info } from './icon';
import './dashboard-budget.css';

export interface BudgetOverviewProps {
  data: DashboardData;
  onSource: (source: SourceRef) => void;
  onAsk: (question: string, context?: AnalysisContext) => void;
  onExpand: (chart: ChartSpec, analysis: Analysis) => void;
  onExplain?: (analysis: Analysis) => void;
  busy: boolean;
}

type Missing = { status: 'missing'; reason: string };
type Budget =
  | Missing
  | {
      status: 'ready';
      analysis: Analysis;
      budget: Metric;
      outlook: Metric;
      variance: Metric;
    };
type Year =
  | Missing
  | {
      status: 'ready';
      analysis: Analysis;
      prior: Metric;
      current: Metric;
      difference: Metric;
      percent?: Metric;
      percentReason: string;
      chart?: ChartSpec;
      chartReason?: string;
    };

const monthNames = [
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
function periodLabel(period: Period) {
  const from = monthNames[period.fromMonth - 1],
    to = monthNames[period.toMonth - 1];
  return `${from === to ? from : `${from}–${to}`} ${period.year}`;
}
function periodState(period: Period, referenceDate: string) {
  const referenceYear = Number(referenceDate.slice(0, 4)),
    referenceMonth = Number(referenceDate.slice(5, 7));
  if (
    period.year < referenceYear ||
    (period.year === referenceYear && period.toMonth <= referenceMonth)
  )
    return 'Realiseret forbrug i den valgte periode.';
  if (
    period.year > referenceYear ||
    (period.year === referenceYear && period.fromMonth > referenceMonth)
  )
    return 'Prognose for den valgte periode.';
  return 'Regnskab og prognose i den valgte periode.';
}
function sameIds(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/** Presentation guards prevent stale panels or name references from becoming financial evidence. */
function panelAnalysis(panel: DashboardPanel, data: DashboardData): Analysis | Missing {
  if (panel.status !== 'ready') return { status: 'missing', reason: panel.reason };
  const analysis = panel.analysis,
    context = analysis.context,
    selected = data.scope;
  if (analysis.datasetVersion !== data.dataset.version)
    return {
      status: 'missing',
      reason: 'Analysen tilhører en anden dataversion. Hent overblikket igen.',
    };
  if (
    context.area !== selected.area ||
    !sameIds(context.entityIds, selected.entityIds) ||
    context.period.year !== selected.period.year ||
    context.period.fromMonth !== selected.period.fromMonth ||
    context.period.toMonth !== selected.period.toMonth ||
    (context.metric && context.metric !== 'net')
  )
    return {
      status: 'missing',
      reason: 'Analysen matcher ikke de valgte enheder og måneder. Hent overblikket igen.',
    };
  if (analysis.missingData) return { status: 'missing', reason: analysis.missingData };
  return analysis;
}
function financialSource(analysis: Analysis, id: string) {
  return analysis.sources.find(
    (source) =>
      source.id === id &&
      source.type === 'demo' &&
      source.datasetVersion === analysis.datasetVersion &&
      (!source.status || source.status === 'simulated'),
  );
}
function evidenced(analysis: Analysis, ids: string[]) {
  return ids.length > 0 && ids.every((id) => financialSource(analysis, id));
}
function metric(analysis: Analysis, label: string, unit: Metric['unit']) {
  const matches = analysis.metrics.filter((item) => item.label === label && item.unit === unit);
  const item = matches.length === 1 ? matches[0] : undefined;
  return item &&
    Number.isFinite(item.value) &&
    (unit !== 'ore' || Number.isSafeInteger(item.value)) &&
    evidenced(analysis, item.sourceIds)
    ? item
    : undefined;
}
function yearAmount(analysis: Analysis, year: number) {
  const matches = analysis.metrics.filter(
    (item) => item.unit === 'ore' && item.label.startsWith(`${year} · `),
  );
  return matches.length === 1 ? metric(analysis, matches[0].label, 'ore') : undefined;
}
function chartEvidence(analysis: Analysis) {
  const chart = analysis.chart;
  return chart &&
    chart.unit === 'ore' &&
    chart.rows.length > 0 &&
    chart.series.length > 0 &&
    evidenced(analysis, chart.sourceIds) &&
    chart.rows.every((row) => chart.series.every((series) => Number.isSafeInteger(row[series.key])))
    ? chart
    : undefined;
}

/** Selects existing server results; it performs no financial calculation. */
export function budgetOverviewModel(data: DashboardData): { budget: Budget; year: Year } {
  const budgetAnalysis = panelAnalysis(data.panels.budget, data);
  let budget: Budget;
  if ('status' in budgetAnalysis) budget = budgetAnalysis;
  else {
    const budgetMetric = metric(budgetAnalysis, 'Periodiseret budget', 'ore'),
      outlook = metric(budgetAnalysis, 'Forbrug / prognose', 'ore'),
      variance = metric(budgetAnalysis, 'Afvigelse', 'ore');
    budget =
      budgetMetric && outlook && variance
        ? { status: 'ready', analysis: budgetAnalysis, budget: budgetMetric, outlook, variance }
        : {
            status: 'missing',
            reason:
              'Budgetstatus mangler entydige beløb med et simuleret beregningsgrundlag. Officielle navnekilder kan ikke dokumentere økonomital.',
          };
  }
  const yearAnalysis = panelAnalysis(data.panels.year, data);
  let year: Year;
  if ('status' in yearAnalysis) {
    year =
      data.scope.period.year === data.dataset.coverage.fromYear
        ? {
            status: 'missing',
            reason: `Datasættet begynder i ${data.dataset.coverage.fromYear}. Samme måneder i ${data.scope.period.year - 1} findes derfor ikke. ${yearAnalysis.reason}`,
          }
        : yearAnalysis;
  } else if (
    yearAnalysis.context.comparison?.kind !== 'year' ||
    yearAnalysis.context.comparison.year !== data.scope.period.year - 1
  ) {
    year = {
      status: 'missing',
      reason: 'Analysen sammenligner ikke med sidste år i den valgte periode.',
    };
  } else {
    const prior = yearAmount(yearAnalysis, data.scope.period.year - 1),
      current = yearAmount(yearAnalysis, data.scope.period.year),
      difference = metric(yearAnalysis, 'Forskel', 'ore'),
      percent = metric(yearAnalysis, 'Ændring', 'percent'),
      chart = chartEvidence(yearAnalysis);
    year =
      prior && current && difference
        ? {
            status: 'ready',
            analysis: yearAnalysis,
            prior,
            current,
            difference,
            percent,
            chart,
            percentReason:
              yearAnalysis.narrative.find((text) =>
                /procentændring.*nul|nul.*procent/i.test(text),
              ) || 'En procentændring fremgår ikke af beregningsgrundlaget.',
            chartReason: chart
              ? undefined
              : 'Figuren mangler et komplet, simuleret beregningsgrundlag. Nøgletallene ovenfor stammer fra den dokumenterede serveranalyse.',
          }
        : {
            status: 'missing',
            reason:
              'Årssammenligningen mangler entydige beløb med simulerede beregningskilder. Manglende grundlag vises ikke som nul.',
          };
  }
  return { budget, year };
}

function SourceButtons({
  analysis,
  ids,
  onSource,
}: {
  analysis: Analysis;
  ids: string[];
  onSource: BudgetOverviewProps['onSource'];
}) {
  return (
    <span className="kaia-budget-sources">
      {[...new Set(ids)].map((id) => {
        const source = financialSource(analysis, id);
        if (!source) return null;
        return (
          <button
            key={id}
            type="button"
            title={displayText(source.title)}
            aria-label={`Åbn kilde: ${displayText(source.title)}`}
            onClick={() => onSource(source)}
          >
            [{analysis.sources.indexOf(source) + 1}]
          </button>
        );
      })}
    </span>
  );
}
function MetricTile({
  label,
  metric: item,
  analysis,
  onSource,
  direction,
  percent,
  note,
}: {
  label: string;
  metric: Metric;
  analysis: Analysis;
  onSource: BudgetOverviewProps['onSource'];
  direction?: 'budget' | 'year';
  percent?: Metric;
  note?: string;
}) {
  const state = item.value > 0 ? 'up' : item.value < 0 ? 'down' : 'level';
  const signed = direction && item.value > 0 ? '+' : '';
  return (
    <div className={`kaia-budget-metric${direction ? ` kaia-budget-metric-${state}` : ''}`}>
      <div className="kaia-budget-metric-label">
        <span>{label}</span>
        <SourceButtons analysis={analysis} ids={item.sourceIds} onSource={onSource} />
      </div>
      <strong title={money(item.value)}>
        {signed}
        {direction ? money(item.value) : metricValue(item.value, item.unit)}
      </strong>
      {direction && (
        <div className="kaia-budget-metric-detail">
          <span>
            {direction === 'budget'
              ? state === 'up'
                ? 'Merforbrug'
                : state === 'down'
                  ? 'Mindreforbrug'
                  : 'I balance'
              : state === 'up'
                ? 'Højere end sidste år'
                : state === 'down'
                  ? 'Lavere end sidste år'
                  : 'Uændret fra sidste år'}
          </span>
          {percent && (
            <span
              className="kaia-budget-percent"
              title={percent.description ? displayText(percent.description) : undefined}
            >
              {percent.value > 0 ? '+' : ''}
              {metricValue(percent.value, percent.unit)}
              <SourceButtons analysis={analysis} ids={percent.sourceIds} onSource={onSource} />
            </span>
          )}
        </div>
      )}
      {note && <p className="kaia-budget-metric-note">{displayText(note)}</p>}
    </div>
  );
}
function MissingPanel({ reason }: { reason: string }) {
  return (
    <div className="kaia-budget-missing">
      <Info size={17} />
      <p>{displayText(reason)}</p>
    </div>
  );
}

export function BudgetOverview({
  data,
  onSource,
  onAsk,
  onExpand,
  onExplain,
  busy,
}: BudgetOverviewProps) {
  const { budget, year } = budgetOverviewModel(data);
  return (
    <section className="kaia-budget-overview" aria-label="Budgetstatus og samme periode sidste år">
      <header className="kaia-budget-heading">
        <div>
          <h2>Budgetstatus</h2>
          <p>{periodLabel(data.scope.period)} · samme valgte enheder</p>
        </div>
      </header>
      <div className="kaia-budget-strip">
        {budget.status === 'ready' ? (
          <>
            <MetricTile
              label="Periodiseret budget"
              metric={budget.budget}
              analysis={budget.analysis}
              onSource={onSource}
            />
            <MetricTile
              label="Forbrug / prognose"
              metric={budget.outlook}
              analysis={budget.analysis}
              onSource={onSource}
              note={periodState(data.scope.period, data.dataset.referenceDate)}
            />
            <MetricTile
              label="Afvigelse fra budget"
              metric={budget.variance}
              analysis={budget.analysis}
              onSource={onSource}
              direction="budget"
            />
          </>
        ) : (
          <div className="kaia-budget-status-missing">
            <MissingPanel reason={budget.reason} />
          </div>
        )}
        {year.status === 'ready' ? (
          <MetricTile
            label="Ændring fra sidste år"
            metric={year.difference}
            analysis={year.analysis}
            onSource={onSource}
            direction="year"
            percent={year.percent}
            note={year.percent ? undefined : year.percentReason}
          />
        ) : (
          <div className="kaia-budget-year-missing">
            <span>Samme periode sidste år</span>
            <p>{displayText(year.reason)}</p>
          </div>
        )}
      </div>
      <div className="kaia-budget-strip-footer">
        <p>
          Budgetafvigelsen måler mod periodens budget. Årsændringen måler mod samme måneder sidste
          år.
        </p>
        {budget.status === 'ready' && (
          <button
            type="button"
            className="kaia-budget-action"
            disabled={busy}
            onClick={() => onAsk(budget.analysis.question, budget.analysis.context)}
          >
            Undersøg budgetstatus
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <article className="kaia-budget-year-panel" aria-label="Årssammenligning for samme periode">
        <div className="kaia-budget-year-kicker">Samme periode sidste år</div>
        {year.status === 'ready' ? (
          <>
            {year.chart ? (
              <AnalysisChart
                key={year.analysis.analysisId}
                chart={year.chart}
                version={year.analysis.datasetVersion}
                compact
                summary={
                  <div className="kaia-budget-year-amounts">
                    {[year.prior, year.current].map((item) => (
                      <div key={item.label}>
                        <span>{item.label}</span>
                        <strong>{metricValue(item.value, item.unit)}</strong>
                      </div>
                    ))}
                  </div>
                }
                onExpand={(chart) => onExpand(chart, year.analysis)}
                onExplain={onExplain ? () => onExplain(year.analysis) : undefined}
              />
            ) : (
              <MissingPanel
                reason={year.chartReason || 'Der findes ingen figur til denne analyse.'}
              />
            )}
            <p className="kaia-budget-year-note">
              Samme enheder, kontokategorier og måneder i begge år. Nominelle beløb uden korrektion
              for inflation. En prognose er en forventning og vises med serverens status i figuren.
            </p>
            <div className="kaia-budget-year-footer">
              <div>
                <span>Beregningsgrundlag</span>
                <SourceButtons
                  analysis={year.analysis}
                  ids={year.chart?.sourceIds || year.difference.sourceIds}
                  onSource={onSource}
                />
              </div>
              <button
                type="button"
                className="kaia-budget-action"
                disabled={busy}
                onClick={() => onAsk(year.analysis.question, year.analysis.context)}
              >
                Undersøg årsændringen
                <ArrowUpRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <MissingPanel reason={year.reason} />
        )}
      </article>
    </section>
  );
}
