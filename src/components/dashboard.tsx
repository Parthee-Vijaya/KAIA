'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { DashboardData, DashboardPanel } from '@/domain/dashboard';
import type {
  Analysis,
  AnalysisContext,
  ChartSpec,
  PublicEntity,
  ScenarioAssumptions,
  SourceRef,
} from '@/domain/types';
import { DEFAULT_SCENARIO } from '@/domain/types';
import { metricValue, money, number } from '@/domain/format';
import { AnalysisChart } from './chart';
import { ArrowRight, ArrowUpRight, Info, RotateCcw, Table2 } from './icon';
import { AnalysisActivity } from './analysis-motion';
import { BudgetOverview } from './dashboard-budget';
import { SchoolVariances } from './dashboard-schools';
import { displayText } from './display-text';
import { api } from './settings';
import './dashboard.css';

export interface DashboardProps {
  data: DashboardData | undefined;
  entities: PublicEntity[];
  loading: boolean;
  error: string;
  onAsk: (question: string, context?: AnalysisContext, scenario?: ScenarioAssumptions) => void;
  onSource: (source: SourceRef) => void;
  onExpand: (chart: ChartSpec, analysis: Analysis) => void;
  onExplain?: (analysis: Analysis) => void;
  onReload: () => void;
  busy: boolean;
}
type Actions = Pick<DashboardProps, 'onAsk' | 'onSource' | 'onExpand' | 'onExplain' | 'busy'>;
const areaLabels = {
  schools: 'Skoleområdet',
  facilities: 'Kultur og idræt',
  social: 'Social og beskæftigelse',
  health: 'Ældre og sundhed',
  environment: 'Teknik, natur og miljø',
  administration: 'Administrationen',
  preparedness: 'Samfundssikkerhed og beredskab',
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
function periodText(period: AnalysisContext['period']) {
  const from = months[period.fromMonth - 1],
    to = months[period.toMonth - 1];
  return `${from === to ? from : `${from}–${to}`} ${period.year}`;
}
function ready(panel: DashboardPanel, version: string): Analysis | undefined {
  return panel.status === 'ready' && panel.analysis.datasetVersion === version
    ? panel.analysis
    : undefined;
}
function reason(panel: DashboardPanel, version: string) {
  if (panel.status !== 'ready') return panel.reason;
  if (panel.analysis.datasetVersion !== version)
    return 'Modulet tilhører en anden dataversion. Hent overblikket igen.';
  return panel.analysis.missingData || 'Der er ingen figur i dette analysegrundlag.';
}
function sourcesFor(analysis: Analysis) {
  const ids = new Set(analysis.chart?.sourceIds ?? []);
  const refs = analysis.sources.filter((source) => source.type !== 'name');
  return (ids.size ? refs.filter((source) => ids.has(source.id)) : refs).slice(0, 2);
}
function SourceLinks({
  analysis,
  onSource,
}: {
  analysis: Analysis;
  onSource: Actions['onSource'];
}) {
  const sources = sourcesFor(analysis);
  if (!sources.length) return null;
  return (
    <div className="kaia-dashboard-sources">
      <span>Kilder</span>
      {sources.map((source, index) => (
        <button
          key={source.id}
          type="button"
          title={displayText(source.title)}
          aria-label={`Åbn kilde: ${displayText(source.title)}`}
          onClick={() => onSource(source)}
        >
          [{index + 1}]
        </button>
      ))}
    </div>
  );
}
function PanelCard({
  panel,
  version,
  kicker,
  question,
  table = false,
  forecast = false,
  ...actions
}: Actions & {
  panel: DashboardPanel;
  version: string;
  kicker: string;
  question?: string;
  table?: boolean;
  forecast?: boolean;
}) {
  const analysis = ready(panel, version);
  return (
    <article className="kaia-dashboard-card">
      <div className="kaia-dashboard-card-kicker">{kicker}</div>
      {analysis?.chart && analysis.chart.rows.length > 0 && !analysis.missingData ? (
        <>
          <AnalysisChart
            chart={analysis.chart}
            version={analysis.datasetVersion}
            compact
            initialTable={table}
            summary={
              forecast ? (
                <div className="kaia-dashboard-forecast-metrics">
                  {analysis.metrics
                    .slice(0, 2)
                    .filter((metric) => metric.unit === 'ore')
                    .map((metric) => (
                      <div key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metricValue(metric.value, metric.unit)}</strong>
                      </div>
                    ))}
                </div>
              ) : undefined
            }
            onExpand={(chart) => actions.onExpand(chart, analysis)}
            onExplain={actions.onExplain ? () => actions.onExplain?.(analysis) : undefined}
          />
          {forecast && <ForecastNote analysis={analysis} />}
          {table && (
            <p className="kaia-dashboard-peer-note">
              {displayText(
                analysis.assumptions.find((text) => /peerudvælgelsen|strukturlighed/i.test(text)) ||
                  'Kommunerne sammenlignes ud fra deres strukturforudsætninger.',
              )}
            </p>
          )}
          <div className="kaia-dashboard-card-bottom">
            <SourceLinks analysis={analysis} onSource={actions.onSource} />
            {question && (
              <button
                type="button"
                className="kaia-dashboard-link"
                disabled={actions.busy}
                onClick={() => actions.onAsk(question, analysis.context)}
              >
                Undersøg nærmere
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="kaia-dashboard-missing">
          <Info size={20} />
          <p>{displayText(reason(panel, version))}</p>
        </div>
      )}
    </article>
  );
}
function ForecastNote({ analysis }: { analysis: Analysis }) {
  const first = analysis.chart?.rows[0];
  const actual = first?.actualMonths,
    expected = first?.forecastMonths;
  return (
    <p className="kaia-dashboard-forecast-note">
      {first && typeof actual === 'number' && typeof expected === 'number'
        ? `${first.label}: ${actual} realiserede måneder og ${expected} prognosemåneder. `
        : ''}
      Figuren viser hele kalenderår. Lavt/højt er et illustrativt følsomhedsspænd.
    </p>
  );
}
type PreviewState = { key: string; analysis?: Analysis; error?: string };
function EnergyScenario({
  data,
  onAsk,
  onSource,
  onExplain,
  busy,
}: Pick<DashboardProps, 'onAsk' | 'onSource' | 'onExplain' | 'busy'> & { data: DashboardData }) {
  const [percent, setPercent] = useState(15),
    [retry, setRetry] = useState(0),
    [horizon, setHorizon] = useState<ScenarioAssumptions['horizon']>('remaining');
  const [result, setResult] = useState<PreviewState>();
  const token = useRef(0),
    sliderId = useId(),
    horizonId = useId(),
    horizonHintId = useId();
  const year = data.scope.period.year,
    referenceYear = Number(data.dataset.referenceDate.slice(0, 4)),
    referenceMonth = Number(data.dataset.referenceDate.slice(5, 7));
  const hasRemaining = year > referenceYear || (year === referenceYear && referenceMonth < 12);
  const needsAnnualChoice = horizon === 'remaining' && !hasRemaining;
  const effectPeriod = periodText({
    year,
    fromMonth: horizon === 'remaining' && year === referenceYear ? referenceMonth + 1 : 1,
    toMonth: 12,
  });
  const assumptions: ScenarioAssumptions = {
    ...DEFAULT_SCENARIO,
    energyPercent: percent,
    horizon,
  };
  const body = JSON.stringify({
    context: data.scope,
    datasetVersion: data.dataset.version,
    assumptions,
  });
  const key = `${body}|${retry}`;
  const current = result?.key === key ? result : undefined;
  const pending = !current && !needsAnnualChoice;
  useEffect(() => {
    if (needsAnnualChoice) return;
    const controller = new AbortController(),
      sequence = ++token.current;
    const timer = setTimeout(() => {
      void api<{ analysis: Analysis }>(
        '/api/dashboard/scenario',
        JSON.parse(body),
        controller.signal,
      )
        .then(({ analysis }) => {
          if (controller.signal.aborted || token.current !== sequence) return;
          const requested = JSON.parse(body) as {
            datasetVersion: string;
            context: DashboardData['scope'];
          };
          if (
            analysis.datasetVersion !== requested.datasetVersion ||
            analysis.context.area !== requested.context.area ||
            JSON.stringify([...analysis.context.entityIds].sort()) !==
              JSON.stringify([...requested.context.entityIds].sort()) ||
            analysis.context.period.year !== requested.context.period.year ||
            analysis.context.period.fromMonth !== requested.context.period.fromMonth ||
            analysis.context.period.toMonth !== requested.context.period.toMonth
          )
            throw new Error('Scenariesvaret matcher ikke den valgte afgrænsning. Prøv igen.');
          if (
            !analysis.missingData &&
            (!analysis.scenario ||
              ![
                analysis.scenario.baselineOre,
                analysis.scenario.scenarioOre,
                analysis.scenario.deltaOre,
              ].every(Number.isSafeInteger))
          )
            throw new Error('Serveren returnerede ikke et gyldigt scenariegrundlag. Prøv igen.');
          setResult({ key, analysis });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && token.current === sequence)
            setResult({
              key,
              error: error instanceof Error ? error.message : 'Scenariet kunne ikke beregnes.',
            });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body, key, needsAnnualChoice]);
  const preview = current?.analysis;
  const scenario = preview?.scenario;
  const valid = Boolean(
    !needsAnnualChoice && preview && scenario && !preview.missingData && !current?.error,
  );
  const area = areaLabels[data.scope.area].toLocaleLowerCase('da-DK');
  return (
    <aside className="kaia-dashboard-energy" aria-busy={pending}>
      <span className="kaia-dashboard-card-kicker">Undersøg en forudsætning</span>
      <h3>Hvad hvis energiprisen ændrer sig?</h3>
      <p className="kaia-dashboard-energy-intro">
        Kun energiudgifter i den valgte afgrænsning påvirkes. Baseline bevares.
      </p>
      <div className="kaia-dashboard-energy-horizon">
        <label htmlFor={horizonId}>Virkning</label>
        <select
          id={horizonId}
          value={horizon}
          disabled={busy}
          aria-describedby={horizonHintId}
          onChange={(event) => setHorizon(event.target.value as ScenarioAssumptions['horizon'])}
        >
          <option value="remaining">Resten af {year}</option>
          <option value="annual">Helårsvirkning · {year}</option>
        </select>
      </div>
      <p id={horizonHintId} className="kaia-dashboard-energy-hint">
        {needsAnnualChoice
          ? `${year} har ingen resterende prognosemåneder. Vælg helårsvirkning for en illustrativ beregning.`
          : `Valgt udsnit: ${periodText(data.scope.period)}. ${horizon === 'annual' ? 'Illustrativ virkning' : 'Virkning i prognosemånederne'}: ${effectPeriod}. Baseline dækker hele ${year}.`}
      </p>
      <div className="kaia-dashboard-energy-slider">
        <label htmlFor={sliderId}>Ændring i energipris</label>
        <output htmlFor={sliderId}>
          {percent > 0 ? '+' : ''}
          {number(percent)} %
        </output>
      </div>
      <input
        id={sliderId}
        type="range"
        min={-30}
        max={50}
        step={1}
        value={percent}
        disabled={busy}
        onChange={(event) => setPercent(Number(event.target.value))}
      />
      <div className="kaia-dashboard-energy-range" aria-hidden="true">
        <span>−30 %</span>
        <span>+50 %</span>
      </div>
      <div
        key={`${key}:${pending ? 'pending' : 'ready'}`}
        className={`kaia-dashboard-energy-result${!pending ? ' kaia-result-reveal' : ''}`}
        aria-live={pending ? 'off' : 'polite'}
      >
        {needsAnnualChoice ? (
          <p role="status" className="kaia-dashboard-energy-status">
            <Info size={16} />
            Vælg helårsvirkning ovenfor for at beregne scenariet.
          </p>
        ) : pending ? (
          <AnalysisActivity label="Beregner de berørte energiposter …" kind="simulation" compact />
        ) : current?.error ? (
          <div role="alert">
            <p>{current.error}</p>
            <button
              type="button"
              className="kaia-dashboard-energy-retry"
              onClick={() => setRetry((value) => value + 1)}
            >
              Prøv igen
              <RotateCcw size={14} />
            </button>
          </div>
        ) : preview?.missingData ? (
          <p>{displayText(preview.missingData)}</p>
        ) : (
          scenario && (
            <>
              <span>
                {horizon === 'annual' ? `Helårsvirkning · ${year}` : `Effekt · ${effectPeriod}`}
              </span>
              <strong>
                {scenario.deltaOre > 0 ? '+' : ''}
                {money(scenario.deltaOre, true)}
              </strong>
              <dl>
                <div>
                  <dt>Baseline · {year}</dt>
                  <dd>{money(scenario.baselineOre, true)}</dd>
                </div>
                <div>
                  <dt>Med ændring · {year}</dt>
                  <dd>{money(scenario.scenarioOre, true)}</dd>
                </div>
              </dl>
              {preview && <SourceLinks analysis={preview} onSource={onSource} />}
            </>
          )
        )}
      </div>
      <div className="kaia-dashboard-energy-secondary">
        <button
          type="button"
          className="kaia-dashboard-energy-reset"
          disabled={percent === 0 || busy}
          onClick={() => setPercent(0)}
        >
          <RotateCcw size={13} />
          Nulstil forudsætning
        </button>
        {onExplain && (
          <button
            type="button"
            className="kaia-dashboard-energy-data"
            disabled={busy || pending || !valid}
            aria-label="Vis data for energiscenariet"
            onClick={() => {
              if (!busy && !pending && valid && preview) onExplain(preview);
            }}
          >
            Vis data
            <Table2 size={13} />
          </button>
        )}
      </div>
      <button
        type="button"
        className="kaia-dashboard-energy-action"
        disabled={busy || !valid}
        onClick={() => {
          if (preview)
            onAsk(
              `Hvad sker der, hvis energiprisen ${percent < 0 ? 'falder' : 'stiger'} ${number(Math.abs(percent))} procent på ${area} ${horizon === 'annual' ? `i hele året ${year}` : `resten af ${year}`}?`,
              preview.context,
              assumptions,
            );
        }}
      >
        Undersøg scenariet
        <ArrowRight size={17} />
      </button>
      <p className="kaia-dashboard-energy-fine">
        Beregnet på serveren · {data.dataset.version}. Forudsætningen ændrer ingen historiske
        posteringer.
      </p>
    </aside>
  );
}

export function Dashboard({
  data,
  entities,
  loading,
  error,
  onReload,
  ...actions
}: DashboardProps) {
  if (loading)
    return (
      <section
        className="kaia-dashboard kaia-dashboard-loading"
        aria-busy="true"
        aria-label="Henter overblik"
      >
        <div className="kaia-dashboard-heading">
          <h2>Dit område i overblik</h2>
          <AnalysisActivity label="Henter budgettal og sammenligninger …" compact />
        </div>
        <div className="kaia-dashboard-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  if (error || !data)
    return (
      <section className="kaia-dashboard kaia-dashboard-error">
        <h2>Overblikket kunne ikke hentes</h2>
        <p role="alert">{error || 'Der er endnu intet overblik for denne afgrænsning.'}</p>
        <button type="button" className="kaia-dashboard-outline" onClick={onReload}>
          <RotateCcw size={16} />
          Hent overblik igen
        </button>
      </section>
    );
  const version = data.dataset.version;
  const { forecast, perPupil, peer } = data.panels;
  const scopeKey = JSON.stringify([
    version,
    data.scope.area,
    [...data.scope.entityIds].sort(),
    data.scope.period,
  ]);
  const forecastPanel =
    data.capabilities.perPupil && perPupil.status === 'ready' ? perPupil : forecast;
  const forecastQuestion = ready(forecastPanel, version)?.question;
  return (
    <section
      className="kaia-dashboard kaia-dashboard-fremblik"
      aria-label="Fremblik for dit område"
    >
      <BudgetOverview data={data} {...actions} />
      <SchoolVariances data={data} entities={entities} {...actions} />
      <div className="kaia-dashboard-heading">
        <h2>Et blik på de kommende år</h2>
        <span>{periodText(data.scope.period)}</span>
      </div>
      <div className="kaia-dashboard-grid kaia-dashboard-outlook-grid">
        <PanelCard
          panel={forecastPanel}
          version={version}
          kicker="Flerårsprognose"
          question={forecastQuestion}
          forecast
          {...actions}
        />
        <EnergyScenario key={scopeKey} data={data} {...actions} />
      </div>
      <PanelCard
        panel={peer}
        version={version}
        kicker="Sammenligning på samme grundlag"
        question={ready(peer, version)?.question}
        table
        {...actions}
      />
    </section>
  );
}
