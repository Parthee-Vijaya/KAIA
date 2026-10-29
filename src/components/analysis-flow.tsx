'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { AnalysisTrace, TraceState } from '@/domain/trace';
import type { SourceRef } from '@/domain/types';
import './analysis-flow.css';
const stepDescriptions = [
  'Spørgsmålet opdeles i en konkret opgave med periode og enheder.',
  'Godkendte kilder og værktøjer vælges til netop denne analyse.',
  'Identitet, rolle, enhedsscope og tilladte operationer kontrolleres.',
  'Tal og scenarier beregnes deterministisk. Graf og svar deler samme grundlag.',
  'Resultaterne samles til et svar med kilder og tydelige forudsætninger.',
  'En eventuel handling kræver et særskilt mandat og en gennemgået godkendelse.',
];
const states: Record<TraceState, string> = {
  pending: 'Afventer',
  running: 'Kører',
  completed: 'Gennemført',
  available: 'Klar til næste skridt',
  blocked: 'Afventer',
  error: 'Fejl',
};
export function AnalysisFlow({
  trace,
  sources = [],
  onSource,
  action,
  autoPlay = false,
  reduced = false,
}: {
  trace: AnalysisTrace;
  sources?: SourceRef[];
  onSource?: (source: SourceRef) => void;
  action?: ReactNode;
  autoPlay?: boolean;
  reduced?: boolean;
}) {
  const [selected, setSelected] = useState<number>(0);
  const [playing, setPlaying] = useState(
    autoPlay &&
      !reduced &&
      !(
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ),
  );
  const [seconds, setSeconds] = useState(6);
  const [pinned, setPinned] = useState(false);
  const live = trace.steps.some((step) => step.state === 'running');
  const failed = trace.steps.some((step) => step.state === 'error');
  const finished = !live && trace.steps.slice(0, 5).every((step) => step.state === 'completed');
  useEffect(() => {
    if (!playing || !finished || reduced) return;
    const timer = setTimeout(() => {
      if (selected >= trace.steps.length - 1) {
        setPlaying(false);
        return;
      }
      setSelected((n) => n + 1);
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [playing, selected, seconds, trace.steps.length, finished, reduced]);
  const current =
    live && !pinned
      ? (trace.steps.find((step) => step.state === 'running')?.index ?? selected)
      : selected;
  const step = trace.steps[current] || trace.steps[0];
  if (!step) return null;
  return (
    <section className="kaia-flow" aria-label="Analysens seks trin">
      <header>
        <div>
          <span className="section-kicker">FRA SPØRGSMÅL TIL KONTROLLERET HANDLING</span>
          <h3>Se analyseforløbet</h3>
        </div>
        <small>
          {live
            ? 'Live · registreret på serveren'
            : failed
              ? 'Forløbet blev afbrudt'
              : finished
                ? 'Visuel gennemgang · beregningen er afsluttet'
                : 'Registreret serverstatus'}
        </small>
      </header>
      {!live && (
        <div className="kaia-flow-playback" aria-label="Styr analyseforløbet">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (current === 5) setSelected(0);
                setPlaying(true);
              }
            }}
            disabled={reduced || !finished}
          >
            {playing ? 'Pause gennemgang' : current === 5 ? 'Gentag forløbet' : 'Afspil forløbet'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={current === 0}
            onClick={() => {
              setPlaying(false);
              setSelected((n) => Math.max(0, n - 1));
            }}
          >
            Forrige trin
          </button>
          <button
            type="button"
            className="text-button"
            disabled={current === 5}
            onClick={() => {
              setPlaying(false);
              setSelected((n) => Math.min(5, n + 1));
            }}
          >
            Næste trin
          </button>
          <label>
            Tempo
            <select
              aria-label="Tempo for gennemgang"
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            >
              <option value={4}>4 sek. pr. trin</option>
              <option value={6}>6 sek. pr. trin</option>
              <option value={10}>10 sek. pr. trin</option>
            </select>
          </label>
          <span role="status">
            {playing ? 'Afspiller roligt' : `Trin ${current + 1} af 6 · vælg selv tempo`}
          </span>
        </div>
      )}
      <nav className="kaia-flow-steps" aria-label="Vælg trin i analyseforløbet">
        {trace.steps.map((item) => (
          <button
            type="button"
            key={item.index}
            aria-pressed={item.index === current}
            data-state={item.state}
            onClick={() => {
              setPlaying(false);
              setPinned(true);
              setSelected(item.index);
            }}
          >
            <span>{String(item.index + 1).padStart(2, '0')}</span>
            <strong>{item.label}</strong>
            <small>{states[item.state]}</small>
          </button>
        ))}
      </nav>
      <div className="kaia-flow-detail" aria-live="polite">
        <div className="kaia-flow-focus">
          <span aria-hidden="true">{String(current + 1).padStart(2, '0')}</span>
          <div>
            <p>{stepDescriptions[current]}</p>
            <h4>{step.summary}</h4>
          </div>
        </div>
        <dl>
          {step.details.map((detail, i) => (
            <div key={i}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
        {step.startedAt && (
          <p className="kaia-flow-time">
            Start {new Date(step.startedAt).toLocaleTimeString('da-DK')}
            {step.finishedAt
              ? ` · afsluttet ${new Date(step.finishedAt).toLocaleTimeString('da-DK')}`
              : ''}
          </p>
        )}
        {onSource && (
          <div className="kaia-flow-sources">
            {sources
              .filter((source) => step.sourceIds?.includes(source.id))
              .map((source) => (
                <button type="button" key={source.id} onClick={() => onSource(source)}>
                  {source.title}
                </button>
              ))}
          </div>
        )}
        {current === 5 && action}
      </div>
      <details className="kaia-flow-journal">
        <summary>Kørselsjournal</summary>
        <code>{trace.runId}</code>
        <ol>
          {trace.steps.map((item) => (
            <li key={item.index}>
              <strong>
                {item.label} · {states[item.state]}
              </strong>
              <span>{item.summary}</span>
            </li>
          ))}
        </ol>
        <p>
          Journalen viser operationer og deres udfald. Kildeindhold og modellens interne ræsonnement
          vises ikke her.
        </p>
      </details>
    </section>
  );
}
