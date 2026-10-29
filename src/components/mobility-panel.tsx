'use client';
import { useEffect, useRef, useState } from 'react';
import type { Analysis, SourceRef } from '@/domain/types';
import type { MobilityAssumptions } from '@/domain/mobility';
import type { PlanDraft } from '@/server/plan-drafts';
import { MobilityExplorer } from './mobility-explorer';
import { AnalysisFlow } from './analysis-flow';
import { api } from './settings';
import { money } from '@/domain/format';

function PlanDraftPanel({
  analysis,
  onPlan,
}: {
  analysis: Analysis;
  onPlan: (plan: PlanDraft | null) => void;
}) {
  const [plan, setPlan] = useState<PlanDraft | null>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    void api<{ plan: PlanDraft | null }>(
      `/api/plan-drafts?analysisId=${encodeURIComponent(analysis.analysisId)}`,
    )
      .then((data) => {
        if (active) {
          setPlan(data.plan);
          onPlan(data.plan);
        }
      })
      .catch(() => {
        if (active) setError('Udkastet kunne ikke hentes. Prøv igen.');
      });
    return () => {
      active = false;
    };
  }, [analysis.analysisId, onPlan]);
  async function act(mode: 'prepare' | 'approve') {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ plan: PlanDraft }>(
        '/api/plan-drafts',
        mode === 'prepare'
          ? { mode, analysisId: analysis.analysisId }
          : { mode, id: plan!.id, fingerprint: plan!.fingerprint },
      );
      setPlan(result.plan);
      onPlan(result.plan);
      setConfirmed(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Udkastet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mobility-plan" aria-label="Godkendelse af kapacitetsplan">
      <h4>Udkast til skolekapacitetsplan</h4>
      <p>
        Forbered en plan ud fra netop dette gemte scenarie. Godkendelsen gælder kun det viste
        grundlag.
      </p>
      {error && <p role="alert">{error}</p>}
      {!plan ? (
        <button className="secondary" disabled={busy} onClick={() => void act('prepare')}>
          {busy ? 'Forbereder …' : 'Forbered planudkast'}
        </button>
      ) : (
        <>
          <p>
            <strong>
              Status: {plan.state === 'approved' ? 'Godkendt demoudkast' : 'Afventer godkendelse'}
            </strong>
          </p>
          <p>{plan.draft.effect}</p>
          <p>{plan.draft.externalStatus}</p>
          <details>
            <summary>Gennemgå planens grundlag og konsekvens</summary>
            <p>{plan.draft.period}</p>
            <p>{plan.draft.summary}</p>
            <ul>
              {plan.draft.assumptions.map((assumption, i) => (
                <li key={i}>{assumption}</li>
              ))}
            </ul>
            <p>{plan.draft.sourceIds.length} kildehenvisninger følger udkastet.</p>
            <code>Grundlag: {plan.fingerprint}</code>
          </details>
          {plan.state === 'approved' ? (
            <p className="success" role="status">
              Godkendt {new Date(plan.approvedAt!).toLocaleString('da-DK')}. Journalført i K.A.I.A.
              Ingen ekstern handling er udført.
            </p>
          ) : plan.canApprove ? (
            <>
              <label className="mobility-approval">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Jeg har gennemgået grundlag og konsekvens og godkender dette interne demoudkast.
                </span>
              </label>
              <button
                className="primary"
                disabled={!confirmed || busy}
                onClick={() => void act('approve')}
              >
                {busy ? 'Gemmer godkendelse …' : 'Godkend demoudkast'}
              </button>
            </>
          ) : (
            <p>
              Din rolle kan forberede udkastet. Godkendelse kræver Fagchef, Direktion eller
              Administrator med adgang til analysen.
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function MobilityPanel({
  analysis,
  onSource,
  onSaved,
}: {
  analysis: Analysis;
  onSource: (source: SourceRef) => void;
  onSaved: (analysis: Analysis) => void;
}) {
  const [values, setValues] = useState<MobilityAssumptions>(analysis.mobility!.assumptions),
    [preview, setPreview] = useState(analysis),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [actionPlan, setActionPlan] = useState<PlanDraft | null>(null);
  const sequence = useRef(0),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const changed = JSON.stringify(values) !== JSON.stringify(analysis.mobility!.assumptions);
  useEffect(() => {
    const request = ++sequence.current;
    if (!changed) {
      setPreview(analysis);
      setBusy(false);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ analysis: Analysis }>(
        '/api/mobility',
        { mode: 'preview', analysisId: analysis.analysisId, assumptions: values },
        controller.signal,
      )
        .then((result) => {
          if (sequence.current === request) {
            setPreview(result.analysis);
            setBusy(false);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted && sequence.current === request) {
            setError(error instanceof Error ? error.message : 'Scenariet kunne ikke beregnes.');
            setBusy(false);
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, analysis, changed]);
  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await api<{ analysis: Analysis }>('/api/mobility', {
        mode: 'save',
        analysisId: analysis.analysisId,
        assumptions: values,
      });
      if (active.current) onSaved(result.analysis);
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : 'Scenariet kunne ikke gemmes.');
    } finally {
      if (active.current) setSaving(false);
    }
  }
  const c = preview.mobility!,
    last = c.scenario.at(-1)!;
  return (
    <section aria-label="Flyttemønstre og skolekapacitet" className="mobility-panel">
      {preview.trace && (
        <AnalysisFlow
          trace={
            !changed && actionPlan?.state === 'approved'
              ? {
                  ...preview.trace,
                  steps: preview.trace.steps.map((step) =>
                    step.index === 5
                      ? {
                          ...step,
                          state: 'completed',
                          summary: 'Internt demoudkast godkendt og journalført',
                          finishedAt: actionPlan.approvedAt,
                          details: [
                            { label: 'Handling', value: actionPlan.draft.effect },
                            { label: 'Eksternt fagsystem', value: actionPlan.draft.externalStatus },
                          ],
                        }
                      : step,
                  ),
                }
              : preview.trace
          }
          sources={preview.sources}
          onSource={onSource}
          action={
            changed ? (
              <p className="mobility-note">
                Gem scenariet som en ny analyse, før du forbereder et planudkast. En tidligere
                godkendelse overføres ikke.
              </p>
            ) : (
              <PlanDraftPanel
                key={analysis.analysisId}
                analysis={analysis}
                onPlan={setActionPlan}
              />
            )
          }
        />
      )}
      <h3>Afprøv handlemuligheder</h3>
      <p className="mobility-note">
        Historik {c.anchorYear - 5}–{c.anchorYear - 1} · prognose {c.anchorYear}–{last.year}. De
        oprindelige tal bevares som baseline.
      </p>
      <div className="mobility-controls">
        <label>
          Ændring i tilflytning<strong>{values.migrationChangePercent} %</strong>
          <input
            aria-label="Ændring i tilflytning"
            type="range"
            disabled={saving}
            min={-100}
            max={200}
            step={5}
            value={values.migrationChangePercent}
            onChange={(e) =>
              setValues((v) => ({ ...v, migrationChangePercent: Number(e.target.value) }))
            }
          />
          <small>Ændrer kun det historiske migrationsbidrag til elevoptaget.</small>
        </label>
        <label>
          Nye klasser<strong>{values.extraClasses} × 24 pladser</strong>
          <input
            aria-label="Nye klasser"
            type="range"
            disabled={saving}
            min={0}
            max={20}
            step={1}
            value={values.extraClasses}
            onChange={(e) => setValues((v) => ({ ...v, extraClasses: Number(e.target.value) }))}
          />
          <small>
            Fordeles til størst lokalt kapacitetspres. Fast drift 1,1 mio. kr. pr. klasse/år; anlæg
            er udeladt.
          </small>
        </label>
        <label>
          Variabel udgift pr. elev<strong>{money(values.variableCostOre)} / år</strong>
          <input
            aria-label="Variabel udgift pr. elev"
            type="range"
            disabled={saving}
            min={0}
            max={10000000}
            step={100000}
            value={values.variableCostOre}
            onChange={(e) => setValues((v) => ({ ...v, variableCostOre: Number(e.target.value) }))}
          />
          <small>Eksisterende faste udgifter ændres ikke automatisk.</small>
        </label>
      </div>
      <div className="mobility-actions">
        <button
          className="secondary"
          disabled={!changed || saving}
          onClick={() => setValues(analysis.mobility!.assumptions)}
        >
          Nulstil
        </button>
        <button
          className="primary"
          disabled={!changed || busy || saving || !!error}
          onClick={() => void save()}
        >
          {saving ? 'Gemmer …' : 'Gem scenarie som ny analyse'}
        </button>
        <span role="status" className="mobility-note">
          {busy
            ? 'Genberegner på serveren …'
            : changed
              ? 'Forhåndsvisning · det gemte svar bevares'
              : 'Viser det gemte scenarie'}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      <MobilityExplorer analysis={analysis} assumptions={values} onSource={onSource} />
      <details className="mobility-note">
        <summary>Forudsætninger, definitioner og beregning</summary>
        {preview.assumptions.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
        {preview.sources.map((source, i) => (
          <button
            className="text-button"
            type="button"
            key={source.id}
            onClick={() => onSource(source)}
          >
            [{i + 1}] {source.title}
          </button>
        ))}
      </details>
    </section>
  );
}
