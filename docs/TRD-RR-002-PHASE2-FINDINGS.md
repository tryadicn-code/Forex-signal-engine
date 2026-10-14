# TRD-RR-002 Phase 2 Findings — Q1 + Q2

- Date: 2026-10-12
- Phase: 2 (post-experiment investigation)
- Scope: Q1 (zero `RISK_RR_TOO_LOW` di backtest), Q2 (AUDCAD 0% WR)
- Method: read-only source inspection + raw JSON inspection. No code change.
- Baseline: commit d853d71, branch experiment/rr-obstacle-variants
- Predecessor: docs/TRD-RR-002-PHASE1-RESULTS.md

## Q1 — Kenapa backtest zero `RISK_RR_TOO_LOW`?

**Jawaban: instrumentation gap, bukan bug.**

Fakta output:

1. Nama literal di production adalah `RR_TOO_LOW` (`src/core/risk/risk-engine.ts:154,190`, `src/core/execution/veto.ts:157`). String `RISK_RR_TOO_LOW` hanya muncul di tests (`tests/analytics/signal-funnel.test.ts:365`) sebagai label turunan signal-funnel.
2. `HistoricalReplayRunner` memanggil `ScannerApi.runScan()` (`src/replay/historical-replay-runner.ts:173`) — full FSE pipeline (scan, trigger, risk) jalan di backtest.
3. Test experiment (`tests/experiment/rr-obstacle-variants.test.ts`) tidak query `rejectionCode`, `signalFunnel`, atau `RISK_*`. Reject yang dihitung hanya dari `order.status` (execution-level).
4. Raw JSON punya field `funnel`, tapi isinya hanya `orderCount/filledOrders/rejectedOrders/rejectionReasons/closedTrades` — semua execution-stage. Bukan signal-funnel.
5. SUMMARY.md sendiri mencatat: "Funnel live (scan, trigger, risk approved) TIDAK bisa direplikasi di backtest; metrik di atas execution-level."

Inference kuat:

- RR gate memang aktif dan menyaring. Naik minRR 1.50 ke 2.50 memotong order 26 ke 8 (SUMMARY section primary comparison). Dampak gate terserap sebagai "order tidak pernah lahir", tidak tercatat sebagai reject.
- Klaim Phase 1 bagian 4 ("gate protektif di window ini") tetap valid; melonggarkan minRR memperbanyak order dan loss. Magnitudo tidak bisa dikuantifikasi dari data existing.

Revisi Phase 1:

- Bagian 4.4 ("Zero RISK_RR_TOO_LOW") direvisi jadi "unmeasured", bukan "zero". Angka 96.9 persen vs 0 persen bukan kontras, tapi perbandingan live-funnel vs backtest-execution, dua pipeline yang mengukur hal berbeda.

Kesimpulan Q1: Closed. Instrumentation gap (coverage gap) terdokumentasi.

## Q2 — Kenapa AUDCAD 0% WR?

**Jawaban: hipotesis (b) gugur. (a) + spread + regime masih terbuka. N=6 terlalu kecil untuk verdict.**

Fakta output:

1. Conversion rate static: `src/replay/historical-csv-import.ts:216` — `conversionRates[symbol] = last.close` (D1 close terakhir USDCAD). Bukan rolling per-candle.
2. `resolveConversion` (`src/market-data/account-conversion.ts`) resolve AUDCAD ke CAD/USD via inverse USDCAD. Rate selalu > 0 selama USDCAD ada.
3. `calculatePnl` + `calculateR` (`src/paper/calculations.ts:15-44`) — PnL = pips x pipValue x size; R = pnl / riskAmount. Konversi masuk hanya lewat `pipValuePerLotAccountCurrency` yang konstan sepanjang run. Arah win/loss murni dari price movement.
4. bySymbol di raw: AUDCAD sample=6, WR=0, expectancy=-1.13R, netR=-6.78R. Rata-rata loss sekitar 1R + spread, bukan satu loss besar.

Inference:

- Hipotesis (b) gugur sebagai penyebab WR 0%. Konversi static bisa bikin magnitude netR sedikit off, tapi tidak bisa menjelaskan 0% WR.
- N=6 terlalu kecil. Kalau true WR = 40 persen, P(0/6) sekitar 4.7 persen — kecil tapi bukan mustahil.
- Kecurigaan baru (belum terverifikasi): spread 1 pip terlalu optimis untuk AUDCAD (live 1.5-2 pips), dan/atau strategi tidak cocok dengan regime AUDCAD 9 bulan ini.

Not verified:

- Apakah AUDCAD struktural jelek, atau noise N=6.
- Apakah spread assumption 1 pip signifikan untuk WR.

Kesimpulan Q2: Partially closed. Hipotesis (b) eliminated.

## Phase 2 next steps (backlog, not authorized)

Semua butuh code/test change, butuh plan terpisah + approval.

| # | Aksi | Tujuan | Effort |
|---|---|---|---|
| N1 | Extract trade-level AUDCAD dari raw JSON | Lihat pola 6 loss (semua STOP_FIRST? semua SHORT? sesi tertentu?) | kecil (read-only) |
| N2 | Spread assumption per-symbol di test | Test sensitivitas WR ke spread | sedang (test change) |
| N3 | Instrumentasi signal-funnel di backtest | Capture rejectionCode tiap scan, jawab Q1 dengan magnitudo | sedang-besar |
| N4 | Perpanjang window ke 2 tahun (butuh CSV baru) | Naikkan N, kurangi noise | besar (data + runtime) |
| N5 | Dynamic conversion rate (rolling per-candle) | Tuntas Q2(b) walau kemungkinan kecil | sedang |

Rekomendasi urutan: N1 dulu (murah, read-only), lalu N3, lalu evaluasi ulang.

## Caveats

- Semua Q1 findings dari pembacaan kode + raw JSON, bukan dari run baru.
- Q2 belum final. Tidak ada klaim "AUDCAD jelek" di doc ini.
- Timezone sensitivity dari Phase 1 tetap valid (3 offset, hasil identik).
- Doc ini tidak mengubah threshold, tidak mengubah src/**, tidak mengubah test.