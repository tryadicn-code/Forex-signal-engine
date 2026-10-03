# apply-batch2.ps1
# Batch 2 fixes: B2-C1 (retcode mapping), B2-H1 (stale LIVE_SUBMITTING),
#                B2-H2 (fake arm + filter), B2-M3 (throw on invalid env),
#                B2-M6 (require TP for live), B2-M4 (priority sort candidates)
$ErrorActionPreference = "Stop"
if (-not (Test-Path "src")) { throw "Run from repo root." }

# --- Backup ---
$backup = "batch2.backup"
if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($f in @(
  "src\broker\execution-service.ts",
  "src\config\broker.ts",
  "scripts\mt5\bridge.py"
)) {
  if (Test-Path $f) {
    $dest = Join-Path $backup $f
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item $f $dest
  }
}
Write-Host "[OK] Backup -> $backup" -ForegroundColor Green

# --- Helper ---
function Replace-Exact {
  param([string]$Path, [string]$Old, [string]$New, [string]$Label)
  if (-not (Test-Path $Path)) { Write-Warning "[SKIP] $Label : file not found $Path"; return }
  $c = Get-Content $Path -Raw
  if (-not $c.Contains($Old)) { Write-Warning "[SKIP] $Label : pattern not found"; return }
  Set-Content -Path $Path -Value $c.Replace($Old, $New) -NoNewline
  Write-Host "[OK] $Label" -ForegroundColor Green
}

# =============================================================
# B2-C1: bridge.py retcode mapping
# =============================================================
$bridge = "scripts\mt5\bridge.py"
$oldPython = @'
    retcode = int(getattr(result, "retcode", -1))
    done = int(getattr(mt5, "TRADE_RETCODE_DONE", 10009))
    partial = int(getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010))
    placed = int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008))

    if retcode == done:
        outcome = "FILLED"
        accepted = True
    elif retcode == partial:
        outcome = "PARTIAL"
        accepted = True
    elif retcode == placed:
        outcome = "PLACED"
        accepted = True
    else:
        outcome = "REJECTED"
        accepted = False
'@
$newPython = @'
    retcode = int(getattr(result, "retcode", -1))
    done = int(getattr(mt5, "TRADE_RETCODE_DONE", 10009))
    partial = int(getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010))
    placed = int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008))
    # Transmission-uncertain retcodes: the request may or may not have reached
    # the broker. Report as UNKNOWN so the caller triggers reconciliation
    # instead of retrying, which could double-order.
    connection_lost = int(getattr(mt5, "TRADE_RETCODE_CONNECTION", 10031))
    timeout = int(getattr(mt5, "TRADE_RETCODE_TIMEOUT", 10012))

    if retcode == done:
        outcome = "FILLED"
        accepted = True
    elif retcode == partial:
        outcome = "PARTIAL"
        accepted = True
    elif retcode == placed:
        outcome = "PLACED"
        accepted = True
    elif retcode in {connection_lost, timeout}:
        outcome = "UNKNOWN"
        accepted = False
    else:
        outcome = "REJECTED"
        accepted = False
'@
Replace-Exact $bridge $oldPython $newPython "B2-C1 bridge retcode mapping"

# =============================================================
# B2-C1 (TS side): execution-service.ts markRecord untuk UNKNOWN
# =============================================================
$svc = "src\broker\execution-service.ts"
$oldTs = @'
        const brokerResult =
          await this.options.provider.placeOrder(intent);
        await this.markRecord(
          intent.idempotencyKey,
          brokerResult.accepted
            ? "LIVE_ACCEPTED"
            : "LIVE_REJECTED",
          brokerResult.message,
          preflight,
          brokerResult
        );
'@
$newTs = @'
        const brokerResult =
          await this.options.provider.placeOrder(intent);
        // B2-C1: an UNKNOWN outcome means the broker may or may not have
        // received the order (MT5 CONNECTION/TIMEOUT). Map it to
        // RECONCILIATION_REQUIRED so the operator resolves it before any
        // retry. Never retry an UNKNOWN automatically.
        const recordStatus: BrokerExecutionRecord["status"] =
          brokerResult.accepted
            ? "LIVE_ACCEPTED"
            : brokerResult.outcome === "UNKNOWN"
              ? "RECONCILIATION_REQUIRED"
              : "LIVE_REJECTED";
        const recordMessage =
          brokerResult.outcome === "UNKNOWN"
            ? "Broker returned an uncertain transmission outcome. Automatic retry is forbidden: " +
              brokerResult.message
            : brokerResult.message;
        await this.markRecord(
          intent.idempotencyKey,
          recordStatus,
          recordMessage,
          preflight,
          brokerResult
        );
'@
Replace-Exact $svc $oldTs $newTs "B2-C1 TS markRecord UNKNOWN"

# =============================================================
# B2-H1: stale LIVE_SUBMITTING recovery
# =============================================================
$oldNormalize = @'
  private async normalizeExpiredArm(): Promise<BrokerExecutionStoreState> {
'@
$newNormalize = @'
  /**
   * B2-H1: auto-escalate stale LIVE_SUBMITTING records.
   *
   * A process kill between reserveLiveAttempt and markRecord leaves a record
   * stuck at LIVE_SUBMITTING. Without this, the broker may have received the
   * order while FSE never reconciles. Escalating to RECONCILIATION_REQUIRED
   * blocks new live orders and forces operator review.
   */
  private async normalizeStaleLiveSubmitting(
    maxAgeMs: number = 10 * 60_000
  ): Promise<void> {
    const now = Date.now();
    await this.options.store.update((state) => {
      const stale = state.records.filter(
        (record) =>
          record.status === "LIVE_SUBMITTING" &&
          now - record.updatedAt > maxAgeMs
      );
      if (stale.length === 0) return { next: state, result: null };
      const next = structuredClone(state);
      for (const s of stale) {
        const target = next.records.find((r) => r.id === s.id);
        if (target) {
          target.status = "RECONCILIATION_REQUIRED";
          target.message =
            "Stale LIVE_SUBMITTING record auto-escalated after " +
            Math.round(maxAgeMs / 1000) +
            "s without update.";
          target.updatedAt = now;
        }
      }
      return { next, result: null };
    });
  }

  private async normalizeExpiredArm(): Promise<BrokerExecutionStoreState> {
'@
Replace-Exact $svc $oldNormalize $newNormalize "B2-H1 method declaration"

# Call normalizeStaleLiveSubmitting at start of dashboard()
$oldDashboard = @'
  async dashboard(): Promise<BrokerExecutionDashboard> {
    const state = await this.normalizeExpiredArm();
'@
$newDashboard = @'
  async dashboard(): Promise<BrokerExecutionDashboard> {
    await this.normalizeStaleLiveSubmitting();
    const state = await this.normalizeExpiredArm();
'@
Replace-Exact $svc $oldDashboard $newDashboard "B2-H1 call in dashboard"

# Call in processSnapshot()
$oldSnapshot = @'
  async processSnapshot(
    snapshot: ScannerSnapshot,
    release: ReleaseRuntimeState
  ): Promise<void> {
    if (this.options.config.mode === "off") return;
'@
$newSnapshot = @'
  async processSnapshot(
    snapshot: ScannerSnapshot,
    release: ReleaseRuntimeState
  ): Promise<void> {
    if (this.options.config.mode === "off") return;
    await this.normalizeStaleLiveSubmitting();
'@
Replace-Exact $svc $oldSnapshot $newSnapshot "B2-H1 call in processSnapshot"

# =============================================================
# B2-H2: fake arm + remove filter
# =============================================================
$oldFakeArm = @'
      {
        schemaVersion: 1,
        protocol: "phase-10-broker-v1",
        controls: {
          killSwitchEngaged: false,
          killSwitchChangedAt: 0,
          killSwitchChangedBy: "",
          killSwitchReason: "",
          liveArm: {
            approvedBy: "",
            reason: "",
            armedAt: 0,
            expiresAt: Date.now() + 1,
            remainingOrders: 1,
            armId: "",
          },
        },
        records: [],
      },
      brokerStatus,
      positions
    ).filter(
      (message) =>
        message !== "Kill-switch is engaged." &&
        message !== "No live arm approval exists." &&
        message !== "Live arm approval has expired." &&
        message !== "Live arm order quota is exhausted."
    );
'@
$newFakeArm = @'
      {
        schemaVersion: 1,
        protocol: "phase-10-broker-v1",
        // B2-H2: the fake state must present a permanently valid arm and a
        // disengaged kill-switch so dashboardLiveBlockers only reports
        // structural blockers (env, provider, reconciliation). Arm-state
        // checks are the responsibility of reserveLiveAttempt, which runs
        // atomically and is the only authoritative gate.
        controls: {
          killSwitchEngaged: false,
          killSwitchChangedAt: 0,
          killSwitchChangedBy: "",
          killSwitchReason: "",
          liveArm: {
            approvedBy: "",
            reason: "",
            armedAt: 0,
            expiresAt: Number.MAX_SAFE_INTEGER,
            remainingOrders: Number.MAX_SAFE_INTEGER,
            armId: "",
          },
        },
        records: [],
      },
      brokerStatus,
      positions
    );
'@
Replace-Exact $svc $oldFakeArm $newFakeArm "B2-H2 fake arm + remove filter"

# =============================================================
# B2-M3: throw on invalid config env
# =============================================================
$brk = "src\config\broker.ts"
$oldBool = @'
function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
'@
$newBool = @'
function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  // B2-M3: fail fast on an explicit but unrecognized boolean value rather
  // than silently accepting the fallback on a live-execution config.
  throw new Error(`Invalid boolean env value: "${value}"`);
}
'@
Replace-Exact $brk $oldBool $newBool "B2-M3 parseBoolean throws"

$oldPosNum = @'
function parsePositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
'@
$newPosNum = @'
function parsePositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  // B2-M3: fail fast on an explicit but invalid numeric value.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive number env value: "${value}"`);
  }
  return parsed;
}
'@
Replace-Exact $brk $oldPosNum $newPosNum "B2-M3 parsePositiveNumber throws"

# =============================================================
# B2-M6: require take profit for live
# =============================================================
# Add config field
$oldCfg = @'
  armMaxMinutes: number;
  armMaxOrders: number;
'@
$newCfg = @'
  armMaxMinutes: number;
  armMaxOrders: number;
  requireTakeProfitForLive: boolean;
'@
Replace-Exact $brk $oldCfg $newCfg "B2-M6 config field"

$oldCfgDefault = @'
    armMaxOrders: parsePositiveInteger(
      env.FSE_LIVE_ARM_MAX_ORDERS,
      1
    ),
'@
$newCfgDefault = @'
    armMaxOrders: parsePositiveInteger(
      env.FSE_LIVE_ARM_MAX_ORDERS,
      1
    ),
    requireTakeProfitForLive: parseBoolean(
      env.FSE_LIVE_REQUIRE_TAKE_PROFIT,
      true
    ),
'@
Replace-Exact $brk $oldCfgDefault $newCfgDefault "B2-M6 config default"

# Add blocker
$oldBlocker = @'
    if (
      this.options.config.blockSameSymbolPosition &&
      positions.some((position) => position.symbol === intent.symbol)
    ) {
      blockers.push(
        "An open broker position already exists for this symbol."
      );
    }

    return blockers;
'@
$newBlocker = @'
    if (
      this.options.config.blockSameSymbolPosition &&
      positions.some((position) => position.symbol === intent.symbol)
    ) {
      blockers.push(
        "An open broker position already exists for this symbol."
      );
    }
    // B2-M6: require a take profit level for live execution unless explicitly
    // disabled. A live position without a TP can hang indefinitely.
    if (
      this.options.config.requireTakeProfitForLive &&
      intent.takeProfit === null
    ) {
      blockers.push(
        "Live execution requires a take profit level (FSE_LIVE_REQUIRE_TAKE_PROFIT)."
      );
    }

    return blockers;
'@
Replace-Exact $svc $oldBlocker $newBlocker "B2-M6 take profit blocker"

# =============================================================
# B2-M4: priority sort candidates by freshness
# =============================================================
$oldCandidates = @'
    const candidates = snapshot.results
      .filter(isExecutableCandidate)
      .slice(0, this.options.config.maxOrdersPerCycle);
'@
$newCandidates = @'
    // B2-M4: sort executable candidates by freshness ascending (freshest
    // first) before slicing. Without this the "first" candidate depends on
    // arbitrary scanner ordering, which can starve fresh signals.
    const candidates = snapshot.results
      .filter(isExecutableCandidate)
      .sort((a, b) => candidateAge(a) - candidateAge(b))
      .slice(0, this.options.config.maxOrdersPerCycle);
'@
Replace-Exact $svc $oldCandidates $newCandidates "B2-M4 sort candidates"

# Add helper function before isExecutableCandidate
$oldHelperAnchor = @'
function isExecutableCandidate(result: SymbolScanResult): boolean {
'@
$newHelperAnchor = @'
function candidateAge(result: SymbolScanResult): number {
  // Lower is fresher. Unknown age sorts last.
  return typeof result.triggerAgeBars === "number"
    ? result.triggerAgeBars
    : Number.MAX_SAFE_INTEGER;
}

function isExecutableCandidate(result: SymbolScanResult): boolean {
'@
Replace-Exact $svc $oldHelperAnchor $newHelperAnchor "B2-M4 helper"

# =============================================================
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Cyan
Write-Host "Backup: $backup" -ForegroundColor Yellow
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Add 'triggerAgeBars?: number' to SymbolScanResult type (manual)" -ForegroundColor Yellow
Write-Host "  2. npx tsc --noEmit" -ForegroundColor Yellow
Write-Host "  3. npm test -- --run" -ForegroundColor Yellow
Write-Host "  4. python -m py_compile scripts\mt5\bridge.py" -ForegroundColor Yellow