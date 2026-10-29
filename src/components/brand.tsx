export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M6 29 16 9l8 15 10-13M6 29l18-5 10 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="29" r="3" fill="currentColor" />
      <circle cx="16" cy="9" r="3" fill="currentColor" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
      <circle cx="34" cy="11" r="3" fill="currentColor" />
      <circle cx="34" cy="31" r="3" fill="currentColor" />
    </svg>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <Mark />
      <span className="brand-name">
        K.A.I.A.<small>Kommunal AI Analyse</small>
      </span>
    </span>
  );
}
