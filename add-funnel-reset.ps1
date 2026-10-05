# add-funnel-reset.ps1
# Tambah tombol reset di Signal Funnel panel.

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)"
$repoRoot = $PWD.Path
Write-Host "[info] Repo root: $repoRoot" -ForegroundColor Cyan

function Join-RepoPath {
  param([string]$Rel)
  return [System.IO.Path]::Combine($repoRoot, $Rel)
}

function Backup-File {
  param([string]$Path)
  $bak = "$Path.before-reset-feature"
  Copy-Item -LiteralPath $Path $bak -Force
  Write-Host "[backup] $(Split-Path $Path -Leaf) -> $(Split-Path $bak -Leaf)" -ForegroundColor DarkGray
}

# =========================================================================
# 1. analytics/store.ts — tambah clear() ke interface + JsonFile impl
# =========================================================================
$f = Join-RepoPath "src\analytics\store.ts"
Backup-File $f
$c = [System.IO.File]::ReadAllText($f)

# 1a. Interface
$oldInterface = @'
export interface SignalFunnelStore {
  read(): Promise<SignalFunnelStoreState>;
  appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState>;
}
'@

$newInterface = @'
export interface SignalFunnelStore {
  read(): Promise<SignalFunnelStoreState>;
  appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState>;
  /**
   * Wipe every stored observation. Used by the manual reset control on the
   * Signal Funnel dashboard. Idempotent: calling it on an empty store is safe.
   */
  clear(): Promise<SignalFunnelStoreState>;
}
'@

if ($c.Contains($newInterface)) {
  Write-Host "[ok] interface sudah diupdate" -ForegroundColor DarkGreen
} elseif ($c.Contains($oldInterface)) {
  $c = $c.Replace($oldInterface, $newInterface)
  Write-Host "[OK] interface SignalFunnelStore diupdate" -ForegroundColor Green
} else {
  Write-Host "[WARN] interface pattern tidak match" -ForegroundColor Yellow
}

# 1b. JsonFileSignalFunnelStore.clear()
$oldJson = @'
  async appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState> {
    return this.serialize(async () => {
      const state = await this.read();
      const next = mergeSignalFunnelObservations(
        state,
        observations,
        referenceAt
      );
      await writeDurableJson(this.path, next);
      return next;
    });
  }
'@

$newJson = @'
  async appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState> {
    return this.serialize(async () => {
      const state = await this.read();
      const next = mergeSignalFunnelObservations(
        state,
        observations,
        referenceAt
      );
      await writeDurableJson(this.path, next);
      return next;
    });
  }

  async clear(): Promise<SignalFunnelStoreState> {
    return this.serialize(async () => {
      const empty = emptySignalFunnelStoreState();
      await writeDurableJson(this.path, empty);
      return empty;
    });
  }
'@

if ($c.Contains($newJson)) {
  Write-Host "[ok] JsonFileSignalFunnelStore.clear sudah ada" -ForegroundColor DarkGreen
} elseif ($c.Contains($oldJson)) {
  $c = $c.Replace($oldJson, $newJson)
  Write-Host "[OK] JsonFileSignalFunnelStore.clear ditambahkan" -ForegroundColor Green
} else {
  Write-Host "[WARN] JsonFile appendMany pattern tidak match" -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))

# =========================================================================
# 2. transactional/domain-stores.ts — tambah clear() ke TransactionalSignalFunnelStore
# =========================================================================
$f = Join-RepoPath "src\transactional\domain-stores.ts"
Backup-File $f
$c = [System.IO.File]::ReadAllText($f)

$oldTx = @'
  async appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState> {
    return this.repo.update((current) => {
      const next = mergeSignalFunnelObservations(
        current ?? emptySignalFunnelStoreState(),
        observations,
        referenceAt
      );
      return { next, result: next };
    });
  }
}
'@

$newTx = @'
  async appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState> {
    return this.repo.update((current) => {
      const next = mergeSignalFunnelObservations(
        current ?? emptySignalFunnelStoreState(),
        observations,
        referenceAt
      );
      return { next, result: next };
    });
  }

  async clear(): Promise<SignalFunnelStoreState> {
    const empty = emptySignalFunnelStoreState();
    await this.repo.replace(empty);
    return empty;
  }
}
'@

if ($c.Contains($newTx)) {
  Write-Host "[ok] TransactionalSignalFunnelStore.clear sudah ada" -ForegroundColor DarkGreen
} elseif ($c.Contains($oldTx)) {
  $c = $c.Replace($oldTx, $newTx)
  Write-Host "[OK] TransactionalSignalFunnelStore.clear ditambahkan" -ForegroundColor Green
} else {
  Write-Host "[WARN] Transactional appendMany pattern tidak match" -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))

# =========================================================================
# 3. server/signal-funnel-access.ts — tambah resetSignalFunnelStore()
# =========================================================================
$f = Join-RepoPath "src\server\signal-funnel-access.ts"
Backup-File $f
$c = [System.IO.File]::ReadAllText($f)

$oldAccess = @'
export async function readSignalFunnelDashboard(
  asOf = Date.now()
): Promise<SignalFunnelDashboardView> {
'@

$newAccess = @'
/**
 * Wipe the durable signal funnel store. Used by the manual reset control on
 * the dashboard. Returns the (now empty) store state.
 *
 * The in-memory analytics repository owned by the scanner service is not
 * touched here; it lives only for the process lifetime and does not affect
 * the dashboard view, which always reads from the durable store.
 */
export async function resetSignalFunnelStore(): Promise<void> {
  await store.clear();
  setPersistenceError(null);
}

export async function readSignalFunnelDashboard(
  asOf = Date.now()
): Promise<SignalFunnelDashboardView> {
'@

if ($c.Contains($newAccess)) {
  Write-Host "[ok] resetSignalFunnelStore sudah ada" -ForegroundColor DarkGreen
} elseif ($c.Contains($oldAccess)) {
  $c = $c.Replace($oldAccess, $newAccess)
  Write-Host "[OK] resetSignalFunnelStore ditambahkan" -ForegroundColor Green
} else {
  Write-Host "[WARN] readSignalFunnelDashboard pattern tidak match" -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))

# =========================================================================
# 4. API route baru: src/app/api/analytics/signal-funnel/route.ts
# =========================================================================
$routeDir = Join-RepoPath "src\app\api\analytics\signal-funnel"
if (-not (Test-Path -LiteralPath $routeDir)) {
  New-Item -ItemType Directory -Path $routeDir -Force | Out-Null
}

$routeFile = Join-Path $routeDir "route.ts"
$routeContent = @'
import {
  readSignalFunnelDashboard,
  resetSignalFunnelStore,
} from "@/server/signal-funnel-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
} from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  — current funnel dashboard view (read-only, no secret required).
 * DELETE — wipe every stored observation. Requires the broker approval
 *          secret, mirroring every other mutation endpoint.
 */
export async function GET() {
  try {
    const view = await readSignalFunnelDashboard();
    return okResponse(view);
  } catch (error) {
    return errorResponse(error, "Signal funnel dashboard unavailable.");
  }
}

export async function DELETE(request: Request) {
  try {
    requireBrokerSecret(request);
    await resetSignalFunnelStore();
    return okResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, "Signal funnel reset failed.");
  }
}
'@

[System.IO.File]::WriteAllText($routeFile, $routeContent, (New-Object System.Text.UTF8Encoding $false))
Write-Host "[OK] created src\app\api\analytics\signal-funnel\route.ts" -ForegroundColor Green

Write-Host ""
Write-Host "=== STEP 1-4 DONE ===" -ForegroundColor Cyan
Write-Host "Lanjut ke Step 5 (UI panel) di script berikutnya." -ForegroundColor Yellow