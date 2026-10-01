export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <circle cx="10" cy="9" r="4" fill="white" />
      <circle cx="22" cy="9" r="2.5" fill="white" />
      <circle cx="16" cy="16" r="3.5" fill="white" />
      <circle cx="9" cy="23" r="3" fill="white" />
      <circle cx="23" cy="22" r="4" fill="white" />
      <circle cx="25" cy="15" r="1.5" fill="white" />
    </svg>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

