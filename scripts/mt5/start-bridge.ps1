$ErrorActionPreference = "Stop"

Write-Host "Starting Forex Signal Engine MT5 bridge..." -ForegroundColor Cyan

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python -ErrorAction SilentlyContinue
}

if (-not $python) {
    throw "Python was not found. Install Python 3 for Windows first."
}

& $python.Source -m pip install -r "scripts/mt5/requirements.txt"
& $python.Source "scripts/mt5/bridge.py"
