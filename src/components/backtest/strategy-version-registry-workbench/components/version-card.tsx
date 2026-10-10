import type { StrategyVersionEntry } from "@/replay/strategy-version-types";
import { formatUtc } from "@/lib/backtest-format";
import { Fact } from "./fact";
import { VersionCardHeader } from "./version-card-header";
import { VersionLifecycleDetails } from "./version-lifecycle-details";
import { RollbackPanel } from "./rollback-panel";
import { DeprecatePanel } from "./deprecate-panel";

export function VersionCard({
  entry,
  deprecating,
  rollingBack,
  deprecateBy,
  deprecateReason,
  rollbackBy,
  rollbackReason,
  disabled,
  onStartDeprecate,
  onStartRollback,
  onCancelDeprecate,
  onCancelRollback,
  onDeprecateBy,
  onDeprecateReason,
  onRollbackBy,
  onRollbackReason,
  onConfirmDeprecate,
  onConfirmRollback,
}: {
  entry: StrategyVersionEntry;
  deprecating: boolean;
  rollingBack: boolean;
  deprecateBy: string;
  deprecateReason: string;
  rollbackBy: string;
  rollbackReason: string;
  disabled: boolean;
  onStartDeprecate: () => void;
  onStartRollback: () => void;
  onCancelDeprecate: () => void;
  onCancelRollback: () => void;
  onDeprecateBy: (value: string) => void;
  onDeprecateReason: (value: string) => void;
  onRollbackBy: (value: string) => void;
  onRollbackReason: (value: string) => void;
  onConfirmDeprecate: () => Promise<void>;
  onConfirmRollback: () => Promise<void>;
}) {
  const manifest = entry.manifest;

  const exportManifest = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = manifest.version + "-strategy-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/45">
      <VersionCardHeader
        entry={entry}
        disabled={disabled}
        onExport={exportManifest}
        onStartRollback={onStartRollback}
        onStartDeprecate={onStartDeprecate}
      />

      <div className="grid gap-2 px-3 py-2 sm:grid-cols-4">
        <Fact label="Registered" value={formatUtc(manifest.registeredAt)} />
        <Fact label="By" value={manifest.registeredBy} />
        <Fact label="Release reviewer" value={manifest.releaseReviewer} />
        <Fact label="Symbols" value={manifest.symbols.join(", ")} />
      </div>

      <VersionLifecycleDetails entry={entry} />

      {rollingBack && (
        <RollbackPanel
          rollbackBy={rollbackBy}
          rollbackReason={rollbackReason}
          disabled={disabled}
          onRollbackBy={onRollbackBy}
          onRollbackReason={onRollbackReason}
          onCancelRollback={onCancelRollback}
          onConfirmRollback={onConfirmRollback}
        />
      )}

      {deprecating && (
        <DeprecatePanel
          deprecateBy={deprecateBy}
          deprecateReason={deprecateReason}
          disabled={disabled}
          onDeprecateBy={onDeprecateBy}
          onDeprecateReason={onDeprecateReason}
          onCancelDeprecate={onCancelDeprecate}
          onConfirmDeprecate={onConfirmDeprecate}
        />
      )}
    </article>
  );
}