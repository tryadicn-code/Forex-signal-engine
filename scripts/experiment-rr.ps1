# TRD-RR-002 experiment runner.
# Sets RR_EXPERIMENT=1 so the vitest file is not skipped, then runs only that file.
# Override paths via environment variables:
#   RR_CSV_DIR  - folder with USDJPY_{D1,H4,H1,M15}.csv (default: C:\mt5csvexport)
#   RR_OUT_DIR  - output folder (default: experiments\rr-obstacle-variants)
$ErrorActionPreference = "Stop"
$env:RR_EXPERIMENT = "1"
npx vitest run tests/experiment/rr-obstacle-variants.test.ts