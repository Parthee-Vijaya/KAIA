'use client';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ArrowRight, SlidersHorizontal } from './icon';
import type { Analysis, ScenarioAssumptions } from '@/domain/types';
import { DEFAULT_SCENARIO } from '@/domain/types';
import { money } from '@/domain/format';
import { AnalysisChart } from './chart';
import { api } from './settings';
import { AnalysisActivity, ResultReveal } from './analysis-motion';
import { displayText } from './display-text';

type PreviewBasis = Pick<Analysis, 'datasetVersion' | 'context'>;
type PreviewRequest = PreviewBasis & { analysisId: string; assumptions: ScenarioAssumptions };
type PreviewResult = { key: string; analysis?: Analysis; error?: string };

/** Reject a stale or malformed preview instead of attaching its numbers to current controls. */
export function scenarioPreviewProblem(
  analysis: Analysis | undefined,
  basis: PreviewBasis,
  assumptions: ScenarioAssumptions,
): string | undefined {
  const context = analysis?.context;
  if (
    !analysis ||
    analysis.datasetVersion !== basis.datasetVersion ||
    context?.area !== basis.context.area ||
    !Array.isArray(context?.entityIds) ||
    JSON.stringify([...context.entityIds].sort()) !==
      JSON.stringify([...basis.context.entityIds].sort()) ||
    context.period?.year !== basis.context.period.year ||
    context.period?.fromMonth !== basis.context.period.fromMonth ||
    context.period?.toMonth !== basis.context.period.toMonth
  )
    return 'Scenariesvaret matcher ikke den valgte afgrænsning. Prøv igen.';
  if (analysis.missingData) return;
  const scenario = analysis.scenario;
  if (
    !scenario ||
    ![scenario.baselineOre, scenario.scenarioOre, scenario.deltaOre].every(Number.isSafeInteger) ||
    scenario.scenarioOre - scenario.baselineOre !== scenario.deltaOre
  )
    return 'Serveren returnerede ikke et gyldigt scenariegrundlag. Prøv igen.';
  if (
    !scenario.assumptions ||
    (Object.keys(DEFAULT_SCENARIO) as (keyof ScenarioAssumptions)[]).some(
      (key) => scenario.assumptions[key] !== assumptions[key],
    )
  )
    return 'Scenariesvaret bruger andre forudsætninger. Prøv igen.';
}

const fields: {
  key: Exclude<keyof ScenarioAssumptions, 'horizon'>;
  label: string;
  help: string;
}[] = [
  {
    key: 'energyPercent',
    label: 'Energipris',
    help: 'Kun energiudgifter i den valgte afgrænsning.',
  },
  {
    key: 'salaryPercent',
    label: 'Lønomkostninger',
    help: 'Løn uden vikarer; virkninger lægges ikke oven i hinanden.',
  },
  { key: 'substitutePercent', label: 'Vikarforbrug', help: 'Kun vikarkontoen.' },
  {
    key: 'pupilsPercent',
    label: 'Elevtal',
    help: 'Kun den variable andel af elevafhængige omkostninger.',
  },
  {
    key: 'budgetPercent',
    label: 'Budgettilpasning',
    help: 'Ændrer sammenligningsbudgettet, ikke forbruget.',
  },
  {
    key: 'maintenancePercent',
    label: 'Vedligehold',
    help: 'Kun planlagte vedligeholdelsesudgifter.',
  },
];
export function ScenarioEditor({
  basis,
  onCalculate,
  busy,
  onExplain,
}: {
  basis: Analysis;
  onCalculate: (s: ScenarioAssumptions) => void;
  busy: boolean;
  onExplain?: (analysis: Analysis) => void;
}) {
  const [values, setValues] = useState(
    basis.scenario?.assumptions ?? { ...DEFAULT_SCENARIO, energyPercent: 15 },
  );
  const [result, setResult] = useState<PreviewResult>();
  const sequence = useRef(0);
  const requestKey = JSON.stringify({
    analysisId: basis.analysisId,
    datasetVersion: basis.datasetVersion,
    context: {
      area: basis.context.area,
      entityIds: [...basis.context.entityIds].sort(),
      period: basis.context.period,
    },
    assumptions: values,
  });
  const current = result?.key === requestKey ? result : undefined;
  const preview = current?.analysis;
  const calculating = !current;
  const error = current?.error;
  const valid = Boolean(preview?.scenario && !preview.missingData && !error);
  useEffect(() => {
    const controller = new AbortController();
    const token = ++sequence.current;
    const requested = JSON.parse(requestKey) as PreviewRequest;
    const timer = setTimeout(() => {
      void api<{ analysis: Analysis }>(
        '/api/scenarios/preview',
        { analysisId: requested.analysisId, assumptions: requested.assumptions },
        controller.signal,
      )
        .then(({ analysis }) => {
          if (controller.signal.aborted || sequence.current !== token) return;
          const problem = scenarioPreviewProblem(analysis, requested, requested.assumptions);
          if (problem) throw new Error(problem);
          setResult({ key: requestKey, analysis });
        })
        .catch((e) => {
          if (!controller.signal.aborted && sequence.current === token)
            setResult({
              key: requestKey,
              error: e instanceof Error ? e.message : 'Scenariet kunne ikke beregnes.',
            });
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);
  return (
    <section className="scenario-editor">
      <div className="scenario-controls">
        <div className="section-kicker">
          <SlidersHorizontal size={16} /> UNDERSØG EN FORUDSÆTNING
        </div>
        <p className="muted">
          Baseline bevares. Figurer og tal opdateres fra serverens beregning, når du ændrer en
          forudsætning.
        </p>
        <label className="field">
          Tidshorisont
          <select
            value={values.horizon}
            disabled={busy}
            onChange={(e) =>
              setValues({ ...values, horizon: e.target.value as ScenarioAssumptions['horizon'] })
            }
          >
            <option value="remaining">Resten af det valgte år</option>
            <option value="annual">Helårsvirkning</option>
          </select>
        </label>
        <div className="scenario-fields">
          {fields.map((f) => (
            <div className="slider-field" key={f.key}>
              <div>
                <label htmlFor={`scenario-${f.key}`}>{f.label}</label>
                <output htmlFor={`scenario-${f.key}`}>
                  {values[f.key] > 0 ? '+' : ''}
                  {values[f.key]} %
                </output>
              </div>
              <input
                id={`scenario-${f.key}`}
                type="range"
                min="-30"
                max="50"
                step="1"
                value={values[f.key]}
                disabled={busy}
                onChange={(e) => setValues({ ...values, [f.key]: Number(e.target.value) })}
              />
              <small>{f.help}</small>
            </div>
          ))}
        </div>
        <div className="panel-actions">
          <button
            className="secondary"
            onClick={() => setValues({ ...DEFAULT_SCENARIO })}
            disabled={busy}
          >
            <RotateCcw size={15} />
            Nulstil
          </button>
          <button
            className="primary"
            disabled={busy || calculating || !valid}
            onClick={() => onCalculate(values)}
          >
            Brug scenarie
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <aside className="scenario-preview" aria-busy={calculating}>
        <div className="section-kicker">BEREGNET VIRKNING · {basis.context.period.year}</div>
        {calculating ? (
          <AnalysisActivity label="Beregner de berørte poster …" kind="simulation" compact />
        ) : error ? (
          <p className="preview-error" role="alert">
            {error}
          </p>
        ) : preview?.missingData ? (
          <p role="status">{displayText(preview.missingData)}</p>
        ) : preview?.scenario ? (
          <ResultReveal key={requestKey}>
            <div className="scenario-preview-metrics">
              <div>
                <span>Baseline</span>
                <strong>{money(preview.scenario.baselineOre, true)}</strong>
              </div>
              <div>
                <span>Scenarie</span>
                <strong>{money(preview.scenario.scenarioOre, true)}</strong>
              </div>
              <div>
                <span>Ændring i forbrug</span>
                <strong>{money(preview.scenario.deltaOre, true)}</strong>
              </div>
            </div>
            <div className="preview-calculating" role="status">
              <span className="scope-dot" />
              Beregnet af de berørte konti · {preview.datasetVersion}
            </div>
            {preview.chart && (
              <AnalysisChart
                chart={preview.chart}
                version={preview.datasetVersion}
                onExplain={onExplain ? () => onExplain(preview) : undefined}
              />
            )}
          </ResultReveal>
        ) : null}
        <p>
          Forbruget og budgetrammen vises hver for sig. Ingen forudsætning ændrer det oprindelige
          datasæt.
        </p>
      </aside>
    </section>
  );
}
