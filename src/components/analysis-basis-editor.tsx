'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Analysis, PublicEntity, SourceRef } from '@/domain/types';
import type { AnalysisEditorField, AnalysisEditorValues } from '@/domain/analysis-editor';
import { metricValue } from '@/domain/format';
import { AnalysisBasis } from './analysis-basis';
import { AnalysisChart } from './chart';
import { AnswerText } from './answer-text';
import { Icon } from './icon';
import { displayText } from './display-text';
import { BasisPreviewController, type BasisPreviewState } from './analysis-basis-preview';
import './analysis-basis-editor.css';

export interface AnalysisBasisEditorProps {
  analysis: Analysis;
  onSource: (source: SourceRef) => void;
  entities?: PublicEntity[];
}
export function useBasisPreview(analysis: Analysis) {
  const controller = useMemo(() => new BasisPreviewController(analysis), [analysis]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  return { state, controller };
}

/** A smaller range window improves precision; the number field retains the full server-authorized limits. */
export function editorRange(field: AnalysisEditorField, current: number) {
  const min = field.min ?? 0,
    hardMax = field.max ?? current;
  if (min < 0 || field.displayUnit === '%' || field.displayUnit === 'år')
    return { min, max: hardMax };
  return {
    min,
    max: Math.min(
      hardMax,
      Math.max(Number(field.value) * 2, current, (field.step || 1) * 100, field.scale),
    ),
  };
}
export function formatEditorValue(field: AnalysisEditorField, value: number) {
  const digits = Math.min(6, Math.max(0, Math.ceil(-Math.log10((field.step || 1) / field.scale))));
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits: digits }).format(
    value / field.scale,
  );
}
export function BasisEditorField({
  field,
  value,
  onChange,
}: {
  field: AnalysisEditorField;
  value: AnalysisEditorValues[string];
  onChange: (id: string, value: AnalysisEditorValues[string]) => void;
}) {
  const id = `basis-adjustment-${field.id.replaceAll('.', '-')}`;
  const [enteredValue, setEnteredValue] = useState(
    typeof value === 'number' ? String(value / field.scale) : '',
  );
  useEffect(() => {
    if (typeof value === 'number') setEnteredValue(String(value / field.scale));
  }, [value, field.scale]);
  if (field.kind === 'choice')
    return (
      <div className="kaia-basis-control">
        <label htmlFor={id}>{field.label}</label>
        <select
          id={id}
          value={value}
          onChange={(event) => {
            const selected = event.target.value;
            if (selected === 'annual' || selected === 'remaining') onChange(field.id, selected);
          }}
          aria-describedby={`${id}-help`}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <small id={`${id}-help`}>{field.help}</small>
      </div>
    );
  if (typeof value !== 'number') return null;
  const range = editorRange(field, value);
  return (
    <div className="kaia-basis-control">
      <label htmlFor={id}>{field.label}</label>
      <div className="kaia-basis-control-value">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={enteredValue}
          min={field.min === undefined ? undefined : field.min / field.scale}
          max={field.max === undefined ? undefined : field.max / field.scale}
          step={(field.step || 1) / field.scale}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            setEnteredValue(event.target.value);
            const entered = event.target.valueAsNumber;
            if (Number.isFinite(entered))
              onChange(
                field.id,
                field.id.startsWith('scenario.') ? entered : Math.round(entered * field.scale),
              );
          }}
          onBlur={() => setEnteredValue(String(value / field.scale))}
        />
        <span>{field.displayUnit}</span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={field.step || 1}
        value={value}
        aria-label={`${field.label}, skyder`}
        aria-valuetext={`${formatEditorValue(field, value)} ${field.displayUnit}`}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(field.id, Number(event.target.value))}
      />
      <small id={`${id}-help`}>{field.help}</small>
    </div>
  );
}
function previewStatus(state: BasisPreviewState) {
  if (state.phase === 'loading') return 'Henter justerbare forudsætninger …';
  if (state.phase === 'error') return 'Forhåndsvisningen kunne ikke opdateres';
  if (state.phase === 'calculating' || state.phase === 'debouncing')
    return 'Beregner de ændrede forudsætninger …';
  if (!state.changed) return 'Viser det gemte beregningsgrundlag';
  return 'Tal, figur og formler er opdateret';
}
const providerLabels = {
  demo: 'Demo',
  corti: 'Corti Models',
  mistral: 'Mistral',
  azure: 'Azure OpenAI',
  openai: 'OpenAI',
};

export function AnalysisBasisEditorView({
  state,
  onChange,
  onReset,
  onRetryPreview,
  onRetryExplanation,
  onSource,
  entities,
}: {
  state: BasisPreviewState;
  onChange: (id: string, value: AnalysisEditorValues[string]) => void;
  onReset: () => void;
  onRetryPreview: () => void;
  onRetryExplanation: () => void;
  onSource: (source: SourceRef) => void;
  entities?: PublicEntity[];
}) {
  const fields = state.editor?.fields || [];
  const editable = fields.length > 0;
  const pending = state.phase === 'debouncing' || state.phase === 'calculating';
  const stale = state.changed && state.phase !== 'ready';
  const fieldsVisible = fields.slice(0, 4),
    fieldsExtra = fields.slice(4);
  const analysis = state.analysis;
  const explanation = state.explanation;
  const field = (item: AnalysisEditorField) => (
    <BasisEditorField
      key={item.id}
      field={item}
      value={state.values[item.id] ?? item.value}
      onChange={onChange}
    />
  );
  const editor = (
    <section className="kaia-basis-editor" aria-label="Undersøg forudsætninger">
      <div className="kaia-basis-editor-heading">
        <div>
          <Icon name="sliders-horizontal" size={17} />
          <strong>Undersøg forudsætninger</strong>
        </div>
        {editable && (
          <button type="button" className="text-button" onClick={onReset} disabled={!state.changed}>
            <Icon name="arrow-counter-clockwise" size={14} />
            Nulstil
          </button>
        )}
      </div>
      <p className="kaia-basis-preview-notice">Forhåndsvisning – det gemte svar bevares</p>
      <p className="kaia-basis-editor-status" role="status" aria-live="polite">
        {previewStatus(state)}
      </p>
      {state.error && (
        <div className="kaia-basis-editor-error" role="alert">
          <p>{state.error}</p>
          <button className="text-button" type="button" onClick={onRetryPreview}>
            Prøv igen
          </button>
        </div>
      )}
      {!editable && state.phase !== 'loading' && !state.error && (
        <p className="kaia-basis-editor-static">
          {state.editor?.kind === 'process'
            ? 'Procesforløbet har ingen numeriske forudsætninger at justere.'
            : 'Dette svar har ingen justerbare forudsætninger.'}
        </p>
      )}
      {editable && (
        <div className="kaia-basis-editor-grid">
          <div className="kaia-basis-editor-controls">
            {fieldsVisible.map(field)}
            {fieldsExtra.length > 0 && (
              <details>
                <summary>
                  Flere forudsætninger ({fieldsExtra.length})<Icon name="caret-down" size={13} />
                </summary>
                <div>{fieldsExtra.map(field)}</div>
              </details>
            )}
          </div>
          <div className="kaia-basis-editor-result">
            <div className="kaia-basis-editor-current" aria-busy={pending}>
              <h4>
                {analysis.scenario && state.changed
                  ? 'Scenarie · helårsbaseline og virkning'
                  : state.changed
                    ? 'Seneste beregnede grundlag'
                    : 'Det gemte svar'}
              </h4>
              {analysis.scenario && state.changed && (
                <p className="kaia-basis-editor-period-note">
                  Scenariet omfatter hele {analysis.context.period.year}. Ændringen gælder{' '}
                  {analysis.scenario.assumptions.horizon === 'remaining'
                    ? 'de resterende prognosemåneder'
                    : 'helårsvirkningen'}
                  . Den oprindeligt valgte periode er fortsat reference; figuren er et scenarie i
                  kroner.
                </p>
              )}
              {stale && (
                <p className="kaia-basis-editor-pending">
                  Viser seneste beregning; de ændrede forudsætninger er endnu ikke bekræftet.
                </p>
              )}
              {analysis.metrics.length > 0 && (
                <div className="kaia-basis-editor-metrics">
                  {analysis.metrics.map((metric, index) => (
                    <div key={`${metric.label}-${index}`}>
                      <span>{displayText(metric.label)}</span>
                      <strong>{metricValue(metric.value, metric.unit, metric.displayUnit)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {analysis.chart && (
                <AnalysisChart chart={analysis.chart} version={analysis.datasetVersion} compact />
              )}
            </div>
            {state.changed && !pending && state.phase === 'ready' && (
              <section
                className="kaia-basis-editor-explanation"
                aria-label="Forklaring til forhåndsvisningen"
                aria-busy={explanation.phase === 'waiting' || explanation.phase === 'streaming'}
              >
                <div className="kaia-basis-editor-explanation-title">
                  <strong>Forklaring til de ændrede forudsætninger</strong>
                  {explanation.formulation && (
                    <span>
                      {providerLabels[explanation.formulation.provider]} ·{' '}
                      {explanation.formulation.model}
                    </span>
                  )}
                </div>
                {explanation.phase === 'waiting' && <p role="status">Forbereder forklaringen …</p>}
                {explanation.text && (
                  <div className="kaia-basis-editor-explanation-text">
                    <AnswerText
                      text={explanation.text}
                      sources={analysis.sources}
                      onSource={onSource}
                    />
                  </div>
                )}
                {explanation.phase === 'streaming' && (
                  <span className="kaia-basis-editor-stream-status" role="status">
                    Forklaringen opdateres …
                  </span>
                )}
                {explanation.phase === 'error' && (
                  <div className="kaia-basis-editor-error" role="alert">
                    <p>{explanation.error}</p>
                    <button className="text-button" type="button" onClick={onRetryExplanation}>
                      Prøv forklaringen igen
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
  return (
    <AnalysisBasis
      analysis={analysis}
      entities={entities}
      onSource={onSource}
      editor={editor}
      hideChart={editable}
      hideMetrics={editable}
    />
  );
}

export function AnalysisBasisEditor({ analysis, entities, onSource }: AnalysisBasisEditorProps) {
  const { state, controller } = useBasisPreview(analysis);
  return (
    <AnalysisBasisEditorView
      state={state}
      entities={entities}
      onSource={onSource}
      onChange={(id, value) => controller.change(id, value)}
      onReset={() => controller.reset()}
      onRetryPreview={() => controller.retryPreview()}
      onRetryExplanation={() => controller.retryExplanation()}
    />
  );
}
