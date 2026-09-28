"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-6 text-zinc-200">
      <section
        role="alert"
        className="w-full max-w-lg rounded border border-orange-700/50 bg-orange-950/20 p-5"
      >
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-300">
          Dashboard unavailable
        </div>
        <h1 className="mt-2 text-lg font-semibold text-zinc-100">
          The signal workspace could not be rendered.
        </h1>
        <p className="mt-2 break-words text-xs leading-relaxed text-zinc-400">
          {error.message || "An unexpected application error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Retry
        </button>
      </section>
    </main>
  );
}
