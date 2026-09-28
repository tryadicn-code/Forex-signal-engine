export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading signal dashboard"
      className="min-h-screen bg-[#0b0e14] p-4 text-zinc-200"
    >
      <div className="mx-auto max-w-[1900px] animate-pulse space-y-4">
        <div className="h-12 rounded border border-zinc-800 bg-zinc-900/50" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-20 rounded border border-zinc-800 bg-zinc-900/40"
            />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="h-[34rem] rounded border border-zinc-800 bg-zinc-900/30" />
          <div className="h-[34rem] rounded border border-zinc-800 bg-zinc-900/30" />
        </div>
      </div>
    </main>
  );
}
