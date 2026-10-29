'use client';

import type { ReactNode } from 'react';
import type { Analysis, PublicEntity, SourceRef } from '@/domain/types';
import { AnalysisChart } from './chart';
import { Icon } from './icon';
import { displayText } from './display-text';
import { buildAnalysisBasis, formatBasisValue, type BasisFormula } from './analysis-basis-model';
import './analysis-basis.css';
import { AnalysisFlow } from './analysis-flow';

export interface AnalysisBasisProps {
  analysis: Analysis;
  onSource: (source: SourceRef) => void;
  entities?: PublicEntity[];
  editor?: ReactNode;
  explanation?: ReactNode;
  hideChart?: boolean;
  hideMetrics?: boolean;
}

export function AnalysisBasis({
  analysis,
  onSource,
  entities,
  editor,
  explanation,
  hideChart = false,
  hideMetrics = false,
}: AnalysisBasisProps) {
  const model = buildAnalysisBasis(analysis, entities);
  const illustrative = analysis.basisKind === 'illustration';
  const qualitative = model.family === 'illustration-process';
  const financialSources = model.sources.filter(
    (item) => item.compatible && item.source.type !== 'name',
  );
  const unitNames = model.units.map((unit) => unit.name);
  const namedScope = unitNames.every(Boolean) ? unitNames.join(' · ') : '';
  const scopeSummary =
    namedScope &&
    (model.units.length === 1 || (model.units.length <= 3 && namedScope.length <= 100))
      ? namedScope
      : `${model.units.length} ${model.units.length === 1 ? 'valgt enhed' : 'valgte enheder'}`;
  const assumptions = model.assumptions.map(displayText).filter(Boolean);
  function sourceLinks(formula: BasisFormula) {
    return model.sources
      .filter((item) => formula.sourceIds.includes(item.source.id) && item.compatible)
      .map(({ source, citation }) => (
        <button
          key={source.id}
          type="button"
          className="kaia-basis-citation"
          onClick={() => onSource(source)}
          aria-label={`Åbn beregningskilde ${citation}: ${displayText(source.title)}`}
        >
          [{citation}]
        </button>
      ));
  }
  return (
    <section className="kaia-basis" aria-label="Analysens beregningsgrundlag">
      <header className="kaia-basis-header">
        <span className="kaia-basis-kicker">
          {illustrative ? 'Fra forudsætning til resultat' : 'Fra grundlag til resultat'}
        </span>
        <h3>{displayText(analysis.title)}</h3>
        <p>
          {illustrative
            ? 'Følg de foreslåede antagelser og beregningen bag illustrationen.'
            : 'Følg de valgte data, beregningsregler og kilder bag svaret.'}
        </p>
      </header>

      {editor}

      {analysis.trace ? (
        <AnalysisFlow trace={analysis.trace} sources={analysis.sources} onSource={onSource} />
      ) : (
        <ol className="kaia-basis-path" aria-label="Beregningens fire trin">
          <li>
            <span className="kaia-basis-step-icon">
              <Icon name="sliders-horizontal" size={19} />
            </span>
            <div>
              <small>01 · {illustrative ? 'Forudsætninger' : 'Afgrænsning'}</small>
              <strong>{model.area}</strong>
              <span>{model.selectedPeriod}</span>
            </div>
          </li>
          <li>
            <span className="kaia-basis-step-icon">
              <Icon name="database" size={19} />
            </span>
            <div>
              <small>02 · Grundlag</small>
              <strong>
                {financialSources.length} {financialSources.length === 1 ? 'kilde' : 'kilder'}
              </strong>
              <span>
                {model.sources.filter((item) => item.source.type === 'name').length
                  ? 'Navne dokumenteres særskilt'
                  : illustrative
                    ? 'Antagelser og beregning er adskilt'
                    : 'Versioneret datagrundlag'}
              </span>
            </div>
          </li>
          <li>
            <span className="kaia-basis-step-icon">
              <Icon name="stack" size={19} />
            </span>
            <div>
              <small>03 · Beregning</small>
              <strong>
                {qualitative
                  ? 'Kvalitativt forløb'
                  : model.family === 'documents'
                    ? 'Dokumentudvalg'
                    : model.formulas.length
                      ? 'Faste regneregler'
                      : 'Grundlaget undersøges'}
              </strong>
              <span>
                {qualitative
                  ? 'Rækkefølge uden måltal'
                  : model.family === 'documents'
                    ? 'Ingen økonomital beregnes'
                    : 'Tal og figur bruger samme grundlag'}
              </span>
            </div>
          </li>
          <li>
            <span className="kaia-basis-step-icon">
              <Icon name={model.missing ? 'info' : 'chart-bar'} size={19} />
            </span>
            <div>
              <small>04 · Resultat</small>
              <strong>
                {model.missing
                  ? 'Grundlag mangler'
                  : qualitative
                    ? 'Procesillustration'
                    : illustrative
                      ? 'Serverberegnet resultat'
                      : model.family === 'documents'
                        ? 'Relevante dokumenter'
                        : 'Svar med belæg'}
              </strong>
              <span>
                {model.missing
                  ? 'Manglende tal erstattes ikke med nul'
                  : 'Kilderne kan åbnes nedenfor'}
              </span>
            </div>
          </li>
        </ol>
      )}

      <div className="kaia-basis-scope">
        <div>
          <span>{qualitative ? 'Forløb' : 'Beregningsperiode'}</span>
          <strong>{model.calculationPeriod}</strong>
        </div>
        <div>
          <span>{illustrative ? 'Referenceversion' : 'Dataversion'}</span>
          <code>{model.version}</code>
        </div>
        {model.units.length > 0 && (
          <details>
            <summary>
              {scopeSummary}
              <Icon name="caret-down" size={14} />
            </summary>
            <ul>
              {model.units.map((unit) => (
                <li key={unit.id}>
                  {unit.name || 'Navn ikke medsendt'}
                  {!unit.name && <code>{unit.id}</code>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {model.missing && (
        <div className="kaia-basis-missing" role="note">
          <Icon name="info" size={20} />
          <div>
            <h4>Det mangler for at kunne svare</h4>
            <p>{displayText(model.missing)}</p>
          </div>
        </div>
      )}
      {model.problems.length > 0 && (
        <div className="kaia-basis-problems" role="note">
          <Icon name="info" size={18} />
          <ul>
            {model.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {model.formulas.length > 0 && (
        <section className="kaia-basis-formulas" aria-label="Beregningsregler">
          {model.formulas.map((formula, index) => (
            <article className="kaia-basis-formula" key={`${formula.title}-${index}`}>
              <div className="kaia-basis-formula-heading">
                <h4>{formula.title}</h4>
                <div>{sourceLinks(formula)}</div>
              </div>
              <p className="kaia-basis-expression">{formula.expression}</p>
              {formula.values.length > 0 && (
                <dl className="kaia-basis-inputs">
                  {formula.values.map((value, index) => (
                    <div key={`${value.label}-${index}`}>
                      <dt>{displayText(value.label)}</dt>
                      <dd>{formatBasisValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {formula.result && (
                <div className="kaia-basis-equation-result">
                  <span>{displayText(formula.result.label)}</span>
                  <strong>{formatBasisValue(formula.result)}</strong>
                </div>
              )}
              {formula.note && <p className="kaia-basis-formula-note">{formula.note}</p>}
            </article>
          ))}
        </section>
      )}

      {model.parameters.length > 0 && (
        <section className="kaia-basis-parameters" aria-label="Valgte scenarieforudsætninger">
          <h4>Valgte forudsætninger</h4>
          <dl>
            {model.parameters.map((parameter) => (
              <div key={parameter.label}>
                <dt>{parameter.label}</dt>
                <dd>{formatBasisValue({ value: parameter.value, unit: 'percent' })}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {model.coverage.length > 0 && (
        <section className="kaia-basis-coverage" aria-label="Realiserede og forventede måneder">
          <h4>Regnskab og forventninger</h4>
          {model.coverage.map((row) => (
            <div key={row.label} className="kaia-basis-coverage-row">
              <strong>{displayText(row.label)}</strong>
              <span className="kaia-basis-coverage-bar" aria-hidden="true">
                <i style={{ flex: row.actual }} />
                <i style={{ flex: row.forecast }} />
              </span>
              <span>
                {row.actual} realiserede · {row.forecast} forventede måneder
              </span>
            </div>
          ))}
        </section>
      )}

      {model.chart && !hideChart && (
        <section className="kaia-basis-chart" aria-label="Figur og underliggende tabel">
          <AnalysisChart chart={model.chart} version={analysis.datasetVersion} compact />
        </section>
      )}
      {model.metrics.length > 0 && !hideMetrics && (
        <details className="kaia-basis-metrics">
          <summary>
            Nøgletal i svaret
            <Icon name="caret-down" size={14} />
          </summary>
          <dl>
            {model.metrics.map((metric, index) => (
              <div key={`${metric.label}-${index}`}>
                <dt>{displayText(metric.label)}</dt>
                <dd>{formatBasisValue(metric)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {explanation}
      {model.notes.length > 0 && (
        <ul className="kaia-basis-notes">
          {model.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {assumptions.length > 0 && (
        <details className="kaia-basis-assumptions">
          <summary>
            Forudsætninger og afgrænsning
            <Icon name="caret-down" size={14} />
          </summary>
          <ul>
            {assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </details>
      )}

      <section className="kaia-basis-sources" aria-label="Analysens kilder">
        <div className="kaia-basis-sources-heading">
          <h4>Kilder til grundlaget</h4>
          <span>
            {model.sources.length} {model.sources.length === 1 ? 'henvisning' : 'henvisninger'}
          </span>
        </div>
        {model.sources.length ? (
          <ol>
            {model.sources.map(({ source, citation, compatible, kind }) => (
              <li key={`${source.id}-${citation}`}>
                <button type="button" onClick={() => onSource(source)}>
                  <span className="kaia-basis-source-number">{citation}</span>
                  <span>
                    <strong>{displayText(source.title)}</strong>
                    <small>
                      {kind} · {displayText(source.period)}
                      {!compatible ? ' · anden dataversion' : ''}
                    </small>
                    {source.type === 'name' && (
                      <small>
                        Dokumenterer navn og stavning; indgår ikke som belæg for økonomital.
                      </small>
                    )}
                  </span>
                  <Icon name="arrow-up-right" size={16} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            Svaret indeholder ingen kildehenvisninger. Der vises ingen beregningskilder, som ikke er
            medsendt.
          </p>
        )}
      </section>
    </section>
  );
}
