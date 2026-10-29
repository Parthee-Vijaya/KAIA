import type { CSSProperties, ReactNode } from 'react';
import './analysis-motion.css';
import { Mark } from './brand';
import { AnswerText } from './answer-text';

const points = [
  { x: 8, y: 43, fromX: 4, fromY: -21 },
  { x: 32, y: 29, fromX: -13, fromY: 17 },
  { x: 55, y: 34, fromX: 7, fromY: -25 },
  { x: 78, y: 19, fromX: -9, fromY: 26 },
  { x: 102, y: 23, fromX: 10, fromY: 20 },
  { x: 120, y: 10, fromX: -14, fromY: 19 },
];

/** Decorative activity follows the real request state; it does not estimate progress. */
export function AnalysisActivity({
  label,
  kind = 'analysis',
  compact = false,
}: {
  label: string;
  kind?: 'analysis' | 'simulation';
  compact?: boolean;
}) {
  return (
    <div
      className={`analysis-activity analysis-activity--${kind}${compact ? ' analysis-activity--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <svg
        className="analysis-activity-graphic"
        viewBox="0 0 128 56"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="analysis-activity-connections"
          d="M8 43 32 29 55 34 78 19 102 23 120 10M32 29 78 19M55 34 102 23"
        />
        <path
          className="analysis-activity-curve"
          d="M8 43C20 43 21 29 32 29S44 34 55 34 67 19 78 19 91 23 102 23 110 10 120 10"
          pathLength={1}
        />
        {points.map((point, index) => (
          <circle
            key={point.x}
            className={`analysis-activity-point${index % 2 ? ' analysis-activity-point--petrol' : ''}`}
            cx={point.x}
            cy={point.y}
            r={index === 0 || index === points.length - 1 ? 2.5 : 2}
            style={
              {
                '--point-from-x': `${point.fromX}px`,
                '--point-from-y': `${point.fromY}px`,
                '--point-delay': `${index * -0.13}s`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
      <span>{label}</span>
    </div>
  );
}

/** Use a React key when a new server result should make its first appearance. */
export function ResultReveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`kaia-result-reveal${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** The text is received from the server stream; no client-generated progress or answer. */
export function StreamingAnswer({
  label,
  text,
  kind = 'analysis',
  provider = 'Demo',
}: {
  label: string;
  text: string;
  kind?: 'analysis' | 'simulation';
  provider?: string;
}) {
  return (
    <section className="streaming-answer" aria-label="Svar under udarbejdelse">
      <div className="streaming-answer-identity">
        <Mark size={24} />
        <strong>K.A.I.A.</strong>
        <span>{provider}</span>
      </div>
      <AnalysisActivity label={label} kind={kind} compact={!!text} />
      <div className="streaming-answer-output" aria-busy="true">
        {text ? (
          <p className="streaming-answer-text">
            <AnswerText text={text} />
            <span className="streaming-caret" aria-hidden="true" />
          </p>
        ) : (
          <div className="streaming-answer-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  );
}
