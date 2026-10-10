export function FormIssuesBanner({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+4rem)] z-30 mx-auto w-full max-w-[1600px] px-3 sm:px-4 md:bottom-[4rem]">
      <div className="rounded-md border border-amber-800/60 bg-amber-950/80 px-3 py-2 backdrop-blur">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="font-mono text-[11px] font-semibold text-amber-400">
            ⚠
          </span>
          <ul className="space-y-0.5 text-[11px] leading-snug text-amber-200">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}