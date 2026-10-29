'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Analysis, SourceRef } from '@/domain/types';
import type { MobilityAssumptions } from '@/domain/mobility';
import type { MobilityDetail } from '@/domain/mobility-detail';
import { AnalysisChart } from './chart';
import { Dialog } from './dialog';
import { api } from './settings';
import { money } from '@/domain/format';
import './mobility-explorer.css';
const count = (n: number) => new Intl.NumberFormat('da-DK').format(n);
const views = [
  ['capacity', 'Kapacitet'],
  ['moves', 'Flyttemønstre'],
  ['schools', 'Skoler'],
  ['cost', 'Økonomi'],
] as const;
type View = (typeof views)[number][0];
export function MobilityExplorer({
  analysis,
  assumptions = analysis.mobility!.assumptions,
  onSource,
}: {
  analysis: Analysis;
  assumptions?: MobilityAssumptions;
  onSource: (source: SourceRef) => void;
}) {
  const [entityId, setEntityId] = useState(''),
    [year, setYear] = useState(analysis.mobility!.anchorYear + 4),
    [view, setView] = useState<View>('capacity'),
    [detail, setDetail] = useState<MobilityDetail>(),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const id = useId(),
    sequence = useRef(0);
  const { migrationChangePercent, extraClasses, variableCostOre } = assumptions;
  useEffect(() => {
    const n = ++sequence.current,
      abort = new AbortController();
    setBusy(true);
    setError('');
    const timer = setTimeout(() => {
      void api<{ detail: MobilityDetail }>(
        '/api/mobility/detail',
        {
          analysisId: analysis.analysisId,
          entityId: entityId || undefined,
          year,
          assumptions: { migrationChangePercent, extraClasses, variableCostOre },
        },
        abort.signal,
      )
        .then((result) => {
          if (sequence.current === n) {
            setDetail(result.detail);
            setBusy(false);
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted && sequence.current === n) {
            setError(e instanceof Error ? e.message : 'Tallene kunne ikke hentes.');
            setBusy(false);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    analysis.analysisId,
    entityId,
    year,
    migrationChangePercent,
    extraClasses,
    variableCostOre,
    retry,
  ]);
  const c = analysis.mobility!,
    years = Array.from({ length: 5 }, (_, i) => c.anchorYear + i);
  const content = (
    <section
      className="mobility-explorer"
      aria-label="Detaljeret analyse af flytninger og skolekapacitet"
      aria-busy={busy}
    >
      <header className="mobility-explorer-heading">
        <div>
          <span className="section-kicker">UDVIKLING OG HANDLEMULIGHEDER</span>
          <h3>Gå tættere på tallene</h3>
          {!expanded && (
            <button
              type="button"
              className="mobility-focus-button"
              onClick={() => setExpanded(true)}
            >
              Udvid analyse ↗
            </button>
          )}
          <p>
            {c.schools.length} skoler · {count(c.history.length)} historiske årsregistreringer · fem
            prognoseår
          </p>
        </div>
        <span className="mobility-explorer-version">
          {c.anchorYear - 5}—{c.anchorYear + 4}
          <small>{analysis.datasetVersion}</small>
        </span>
      </header>
      <div className="mobility-explorer-controls">
        <label htmlFor={id + 'school'}>
          Skole
          <select
            aria-label="Skole"
            id={id + 'school'}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            <option value="">Alle valgte skoler</option>
            {c.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id + 'year'}>
          Prognoseår
          <select
            aria-label="Prognoseår"
            id={id + 'year'}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setEntityId('');
          }}
        >
          Vis alle skoler
        </button>
        <span role="status">
          {busy
            ? 'Opdaterer udsnittet …'
            : detail
              ? `${detail.scope} · ${detail.selection.year}`
              : ''}
        </span>
      </div>
      <div className="mobility-explorer-tabs" role="group" aria-label="Vælg analysevisning">
        {views.map(([key, label]) => (
          <button type="button" aria-pressed={view === key} key={key} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>
            Prøv igen
          </button>
        </p>
      )}
      {!detail ? (
        <div className="mobility-explorer-empty" role="status">
          Henter det detaljerede beregningsgrundlag …
        </div>
      ) : (
        <div className="mobility-explorer-result" data-updating={busy}>
          <div className="mobility-explorer-kpis">
            <div>
              <small>Elever · {detail.selection.year}</small>
              <strong>{count(detail.metrics.pupils)}</strong>
              <span>Forventet elevtal</span>
            </div>
            <div>
              <small>Anvendelige pladser</small>
              <strong>{count(detail.metrics.capacity)}</strong>
              <span>{detail.scope}</span>
            </div>
            <div data-alert={detail.metrics.shortage > 0}>
              <small>Lokal pladsmangel</small>
              <strong>{count(detail.metrics.shortage)}</strong>
              <span>{count(detail.metrics.spare)} ledige · modregnes ikke på tværs</span>
            </div>
            <div>
              <small>Årlig driftsændring</small>
              <strong>{money(detail.metrics.costDeltaOre)}</strong>
              <span>Scenarie mod baseline · {detail.selection.year}</span>
            </div>
          </div>
          {view === 'capacity' && (
            <>
              <AnalysisChart chart={detail.charts.timeline} version={detail.datasetVersion} />
              <div className="mobility-pressure-header">
                <div>
                  <span className="section-kicker">LOKALT KAPACITETSPRES</span>
                  <h4>Hvor opstår pladsmanglen?</h4>
                  <p>
                    Største pladsmangel først. Klik på en skole og et år for at undersøge
                    udviklingen.
                  </p>
                </div>
                <small>Tal = manglende pladser · 0 = ingen lokal mangel</small>
              </div>
              <div className="mobility-pressure-wrap">
                <table className="mobility-pressure">
                  <caption>Pladsmangel pr. skole og prognoseår</caption>
                  <thead>
                    <tr>
                      <th>Skole</th>
                      {years.map((y) => (
                        <th key={y}>{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.schools]
                      .sort(
                        (a, b) =>
                          (detail.schoolYears.find((r) => r.id === b.id && r.year === year)
                            ?.shortage || 0) -
                            (detail.schoolYears.find((r) => r.id === a.id && r.year === year)
                              ?.shortage || 0) || a.name.localeCompare(b.name, 'da'),
                      )
                      .map((s) => (
                        <tr key={s.id} data-selected={entityId === s.id}>
                          <th>
                            <button type="button" onClick={() => setEntityId(s.id)}>
                              {s.name}
                            </button>
                          </th>
                          {years.map((y) => {
                            const r = detail.schoolYears.find(
                              (r) => r.id === s.id && r.year === y,
                            )!;
                            return (
                              <td key={y}>
                                <button
                                  type="button"
                                  data-pressure={
                                    r.shortage > 20 ? 'high' : r.shortage > 0 ? 'some' : 'none'
                                  }
                                  aria-pressed={entityId === s.id && year === y}
                                  aria-label={`${s.name}, ${y}: ${r.shortage} manglende pladser. Undersøg skole og år.`}
                                  title={`${r.pupils} elever · ${r.capacity} pladser · ${r.spare} ledige`}
                                  onClick={() => {
                                    setEntityId(s.id);
                                    setYear(y);
                                  }}
                                >
                                  {r.shortage > 0 ? count(r.shortage) : '0'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {view === 'moves' && (
            <>
              <AnalysisChart chart={detail.charts.movement} version={detail.datasetVersion} />
              <p className="mobility-explorer-note">
                Tilflytning og fraflytning vises hver for sig. Brug signaturen til at isolere
                flytninger mellem kommuner, udland eller demoområder. Familiehændelser er ikke det
                samme som elever.
              </p>
              <div className="mobility-detail-table-wrap">
                <table className="mobility-detail-table">
                  <caption>
                    Historik på skoleniveau · {detail.history.length} årsregistreringer
                  </caption>
                  <thead>
                    <tr>
                      <th>Skole / år</th>
                      <th>Fra kommune</th>
                      <th>Til kommune</th>
                      <th>Fra udland</th>
                      <th>Til udland</th>
                      <th>Internt ind</th>
                      <th>Internt ud</th>
                      <th>Elever</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history.map((r) => (
                      <tr key={r.id}>
                        <th>
                          {detail.schools.find((s) => s.id === r.entityId)!.name} · {r.year}
                        </th>
                        <td>{count(r.domesticIn)}</td>
                        <td>{count(r.domesticOut)}</td>
                        <td>{count(r.internationalIn)}</td>
                        <td>{count(r.internationalOut)}</td>
                        <td>{count(r.internalIn)}</td>
                        <td>{count(r.internalOut)}</td>
                        <td>{count(r.pupils)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {view === 'schools' && (
            <>
              <AnalysisChart
                chart={detail.charts.schoolComparison}
                version={detail.datasetVersion}
              />
              <div className="mobility-detail-table-wrap">
                <table className="mobility-detail-table">
                  <caption>Skolernes kapacitetsgrundlag · {detail.selection.year}</caption>
                  <thead>
                    <tr>
                      <th>Skole</th>
                      <th>Elever</th>
                      <th>Pladser</th>
                      <th>Mangler</th>
                      <th>Ledige</th>
                      <th>Nye klasser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.selectedRows.map((r) => (
                      <tr key={r.id}>
                        <th>
                          <button type="button" onClick={() => setEntityId(r.id)}>
                            {r.name}
                          </button>
                        </th>
                        <td>{count(r.pupils)}</td>
                        <td>{count(r.capacity)}</td>
                        <td>{count(r.shortage)}</td>
                        <td>{count(r.spare)}</td>
                        <td>{r.extraClasses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {view === 'cost' && (
            <>
              <AnalysisChart chart={detail.charts.costBridge} version={detail.datasetVersion} />
              <div className="mobility-cost-breakdown">
                <div>
                  <small>Baseline · modelleret drift</small>
                  <strong>{money(detail.metrics.baselineCostOre)}</strong>
                </div>
                <div>
                  <small>Scenarie · modelleret drift</small>
                  <strong>{money(detail.metrics.scenarioCostOre)}</strong>
                </div>
                <div>
                  <small>Variabel drift i scenariet</small>
                  <strong>{money(detail.metrics.variableCostOre)}</strong>
                </div>
                <div>
                  <small>Ny fast klassedrift</small>
                  <strong>{money(detail.metrics.fixedCostOre)}</strong>
                </div>
                <p>
                  Elevtal og enhedspris opdeles eksakt uden dobbelttælling. Nye klasser koster 1,1
                  mio. kr. pr. klasse/år. Eksisterende faste udgifter bevares; anlæg er udeladt.
                </p>
              </div>
            </>
          )}
          <p className="mobility-explorer-note">{detail.explanation}</p>
          <footer className="mobility-explorer-sources">
            <span>Grundlag</span>
            {detail.sources.map((s, i) => (
              <button type="button" key={s.id} onClick={() => onSource(s)}>
                [{i + 1}] {s.title}
              </button>
            ))}
          </footer>
        </div>
      )}
    </section>
  );
  return expanded ? (
    <Dialog title="Udforsk flytninger og skolekapacitet" onClose={() => setExpanded(false)} wide>
      {content}
    </Dialog>
  ) : (
    content
  );
}
