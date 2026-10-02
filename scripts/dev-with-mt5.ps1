$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BridgeScript = Join-Path $ProjectRoot "scripts\mt5\start-bridge.ps1"
$BridgePort = 8765
$BridgeHost = "127.0.0.1"

Write-Host ""
Write-Host "============================================" -ForegroundColor DarkGray
Write-Host " Forex Signal Engine - Development Startup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path $BridgeScript)) {
    throw "MT5 bridge script not found: $BridgeScript"
}

$bridgeProcess = $null
$nextProcess = $null

try {
    # Avoid starting a duplicate bridge when one is already listening.
    $existing = Get-NetTCPConnection -LocalAddress $BridgeHost -LocalPort $BridgePort `
        -State Listen -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "[MT5] Bridge already listening on ${BridgeHost}:${BridgePort}" -ForegroundColor Green
    }
    else {
        Write-Host "[MT5] Starting bridge..." -ForegroundColor Cyan

        $bridgeProcess = Start-Process `
            -FilePath "powershell.exe" `
            -ArgumentList @(
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", "`"$BridgeScript`""
            ) `
            -WorkingDirectory $ProjectRoot `
            -PassThru

        $ready = $false

        # Give the bridge enough time for Python startup and dependency loading.
        for ($i = 1; $i -le 60; $i++) {
            Start-Sleep -Seconds 1

            if ($bridgeProcess.HasExited) {
                throw "MT5 bridge exited unexpectedly with code $($bridgeProcess.ExitCode)."
            }

            $listening = Get-NetTCPConnection -LocalAddress $BridgeHost -LocalPort $BridgePort `
                -State Listen -ErrorAction SilentlyContinue

            if ($listening) {
                $ready = $true
                break
            }

            Write-Host "[MT5] Waiting for bridge... ($i/60)" -ForegroundColor DarkGray
        }

        if (-not $ready) {
            throw "MT5 bridge did not start listening on ${BridgeHost}:${BridgePort} within 60 seconds."
        }

        Write-Host "[MT5] Bridge ready on ${BridgeHost}:${BridgePort}" -ForegroundColor Green
    }

    Write-Host "[WEB] Starting Next.js..." -ForegroundColor Cyan
    Write-Host ""

    # Run the existing Next.js development command.
    $nextProcess = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList @("/c", "npm run dev:web") `
        -WorkingDirectory $ProjectRoot `
        -NoNewWindow `
        -PassThru

    $nextProcess.WaitForExit()

    if ($nextProcess.ExitCode -ne 0) {
        Write-Host "[WEB] Next.js exited with code $($nextProcess.ExitCode)." -ForegroundColor Yellow
    }
}
finally {
    Write-Host ""
    Write-Host "[DEV] Shutting down..." -ForegroundColor DarkGray

    if ($nextProcess -and -not $nextProcess.HasExited) {
        try {
            & taskkill.exe /PID $nextProcess.Id /T /F 2>$null | Out-Null
        } catch {}
    }

    if ($bridgeProcess -and -not $bridgeProcess.HasExited) {
        try {
            # Kill the PowerShell bridge process and its Python child process.
            & taskkill.exe /PID $bridgeProcess.Id /T /F 2>$null | Out-Null
            Write-Host "[MT5] Bridge stopped." -ForegroundColor DarkGray
        } catch {}
    }

    Write-Host "[DEV] Shutdown complete." -ForegroundColor DarkGray
}
