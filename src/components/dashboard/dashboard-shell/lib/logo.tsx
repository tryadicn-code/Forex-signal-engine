export function SignalEngineLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="5" y1="20" x2="5" y2="16" />
      <line x1="10" y1="20" x2="10" y2="12" />
      <line x1="15" y1="20" x2="15" y2="8" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}