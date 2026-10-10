export function BacktestStepNav({
  step1Done,
  step2Done,
  step3Done,
}: {
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
}) {
  const steps = [
    { id: "backtest-step-1", num: 1, label: "Files", done: step1Done },
    { id: "backtest-step-2", num: 2, label: "Source", done: step2Done },
    { id: "backtest-step-3", num: 3, label: "Replay", done: step3Done },
  ];
  const scrollTo = (targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  return (
    <div className="sticky top-14 z-20 -mx-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => scrollTo(step.id)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors " +
              (step.done
                ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300")
            }
          >
            <span>{step.num}</span>
            <span>{step.label}</span>
            <span className="text-[8px]">●</span>
          </button>
        ))}
      </div>
    </div>
  );
}