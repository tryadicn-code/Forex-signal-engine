# TRD-RR-006 - Price Action Scanner Audit (Tahap 1)

Status: Audit & desain awal, belum implementasi
Scope: Evaluasi kelayakan strategy baru PRICE_ACTION
Baseline: feat/strategy-toggle @ b865698
Change control: Audit-only, tidak ada perubahan kode

## 1. Executive Summary

Audit ini mengevaluasi kelayakan menambahkan satu strategy baru `PRICE_ACTION`
yang hanya memakai EMA, Support/Resistance, Supply/Demand, dan Price Action,
tanpa menjadikan RSI/MACD/ADX/indikator lain sebagai syarat entry.

Temuan utama:

1. Sekitar 80 persen komponen yang dibutuhkan sudah tersedia dan bisa dipakai
   ulang: swing detection, BOS/CHOCH, zona S/R, zona S/D, engulfing, rejection
   wick, location validation, risk engine, execution engine.
2. Gap utama: trigger engine existing memakai composite score (structural 45 +
   location 25 + candle 10 + momentum 10 + volume 10), sedangkan desain baru
   membutuhkan hard requirement. Momentum component memakai RSI/MACD yang
   dilarang di desain baru.
3. Gap arsitektur paling krusial: orchestrator saat ini merutekan SATU strategy
   per (symbol, scan). Untuk A/B test paralel dengan strategy lama, arsitektur
   perlu diubah atau strategy baru dijalankan sebagai pipeline terpisah.

Verdict: layak dilanjutkan, tetapi butuh keputusan arsitektur sebelum
implementasi.

## 2. Arsitektur Aktual Scanner dan Trading Engine

Fakta (verified dari kode):

- Pipeline orchestrator: analyzeMarketWithRouting di
  src/core/orchestrator/orchestrator.ts.
- Alur: structure -> regime -> bias -> routing -> setup -> trigger -> risk ->
  execution -> (paper).
- Routing: routeStrategy di src/core/strategies/router.ts memilih SATU
  strategy berdasarkan regime, dari daftar availableStrategyIds.
- Setiap strategy adalah StrategyDefinition dengan method analyze(context)
  yang mengembalikan PipelineResult.
- Registry strategy: src/core/strategies/registry.ts, konstanta
  IMPLEMENTED_STRATEGY_IDS.
- Mapping regime -> strategy: src/core/strategies/system-policy.ts
  (STRATEGY_SYSTEM_POLICY.regimeRouting).
- TRD-RR-005 (baru): runtime strategy selection via .data/strategy-config.json
  dan AnalysisContext.availableStrategyIds. Router menerima daftar strategy
  aktif dari config ini.

Mapping regime saat ini:

| Regime | Strategy |
|---|---|
| STRONG_TREND_UP / TREND_UP | TREND_PULLBACK |
| STRONG_TREND_DOWN / TREND_DOWN | TREND_PULLBACK |
| BREAKOUT | BREAKOUT_RETEST |
| RANGE | RANGE_MEAN_REVERSION |
| LOW_VOLATILITY | WAIT |
| HIGH_VOLATILITY | CONDITIONAL_REVERSAL |

## 3. Peta File dan Fungsi Relevan

Struktur src/core:

- bias/ : analyzeBias (arah directional)
- config/ : engine-config (threshold)
- execution/ : decide + veto
- indicators/ : ema, atr, adx, rsi, macd, dll
- orchestrator/ : analyzeMarketWithRouting
- regime/ : classifyRegime
- risk/ : evaluateRisk, classifyObstacle, deriveStructuralTargetLevels
- setup/ : analyzeSetup (buildZones internal)
- strategies/ : registry, router, system-policy, 4 strategy existing
- structure/ : analyzeStructure (swings, BOS, CHOCH, equalHighs/Lows)
- trigger/ : evaluateTrigger (composite score)

Komponen reusable untuk PRICE_ACTION (fakta):

- analyzeStructure (src/core/structure/market-structure.ts) menyediakan
  swingHighs, swingLows, lastBOS, lastCHOCH, breakEvents, equalHighs,
  equalLows, semua dengan confirmedAtIndex (anti-lookahead).
- analyzeSetup (src/core/setup/setup-engine.ts) membangun zona dari
  swing S/R, EMA dynamic, dan base candle S/D.
- evaluateTrigger (src/core/trigger/trigger-engine.ts) menyediakan
  detectStructural (BOS/CHOCH/reclaim), detectLocation (IN_ZONE/RETEST),
  detectCandle (engulfing/rejection).
- evaluateRisk (src/core/risk/risk-engine.ts) menyediakan sizing, RR gate,
  SL/TP validation.
- decide (src/core/execution) menyediakan veto + execution decision.
- resolveEntryPrice (src/core/strategies/entry-price.ts).

## 4. Logic Entry yang Benar-benar Berjalan

Fakta dari kode trend-pullback.ts:

1. Structure dihitung di biasTimeframe (H4).
2. Regime diklasifikasi dari biasTimeframe.
3. Bias dihitung dari biasTimeframe + structure + regime.
4. Macro (D1) sebagai filter directional.
5. Setup dihitung di setupTimeframe (H1) dari setup structure.
6. Trigger dihitung di triggerTimeframe (M15) dengan composite score.
7. Risk hanya dievaluasi jika trigger CONFIRMED.
8. Execution decision dari risk + bias + setup + trigger.

Composite score trigger (src/core/trigger/trigger-engine.ts:72-79):

- Structural (BOS/CHOCH/reclaim): 45 poin.
- Location (IN_ZONE/RETEST): 25 poin.
- Candle (engulfing/rejection): 10 poin.
- Momentum (RSI/MACD aligned): 10 poin.
- Volume (tick-volume expansion): 10 poin.

Score minimal untuk CONFIRMED ditentukan oleh config.trigger.

## 5. Perbandingan Engine Lama dan Rancangan PRICE_ACTION

| Aspek | Engine existing | PRICE_ACTION (rancangan) |
|---|---|---|
| Komponen analisis | EMA + ADX + ATR + Bollinger + RSI + MACD + volume + struktur | EMA + S/R + S/D + Price Action |
| Trigger | Composite score (threshold) | Hard requirement (semua wajib) |
| Klasifikasi setup | Satu zona terdekat, apapun keluarga | Tiga keluarga terpisah |
| Momentum gate | Wajib (10 poin dari RSI/MACD) | Tidak ada |
| Volume gate | Opsional (10 poin) | Tidak ada |
| Regime gate | Hard (LOW_VOL = WAIT) | Netral (struktur + EMA sebagai konteks) |
| Risk engine | Sama | Sama (reuse) |
| Execution | Sama | Sama (reuse) |

## 6. Gap Implementasi

G1. Trigger composite score vs hard requirement.
Lokasi: src/core/trigger/trigger-engine.ts.
Dampak: PRICE_ACTION butuh trigger terpisah atau parameter baru.

G2. Momentum component pakai RSI/MACD.
Lokasi: trigger-engine.ts (momentumReadings, baris 391+).
Dampak: harus di-disable atau tidak dipanggil untuk PRICE_ACTION.

G3. Volume component pakai tick-volume.
Lokasi: trigger-engine.ts (volumeReadings, baris 415+).
Dampak: sama seperti G2.

G4. Belum ada klasifikasi 3 keluarga.
Lokasi: src/core/setup/setup-engine.ts memilih zona terdekat tanpa
mempertimbangkan keluarga.
Dampak: butuh layer classifier baru.

G5. Arsitektur routing hanya pilih satu strategy per (symbol, scan).
Lokasi: orchestrator.ts:62-66.
Dampak: untuk A/B test paralel, perlu modifikasi arsitektur. INI GAP
PALING KRUSIAL.

G6. Config trigger existing sudah menyediakan rejectionWickRatio=2,
engulfMinBodyRatio=0.7, maxTriggerAgeBars=3. Bisa dipakai ulang.

## 7. Risiko Teknis dan Trading

Teknis:

- R1. Duplikasi order jika dua engine (lama + PRICE_ACTION) menghasilkan
  sinyal pada setup yang sama. Risk: double paper position.
- R2. Race condition jika PRICE_ACTION dijalankan paralel dengan strategy
  lama pada scan yang sama.
- R3. Status baru (misal DATA_INVALID, READY_TO_EXECUTE) berpotensi bentrok
  dengan enum yang sudah ada. Perlu mapping hati-hati.
- R4. Config baru di engine-config bisa mempengaruhi validasi existing.

Trading:

- R5. PRICE_ACTION tanpa regime gate berpotensi entry di pasar sepi
  (LOW_VOLATILITY), yang historically ditolak oleh gate existing.
- R6. Hard requirement tanpa composite score berpotensi menambah false
  positive jika threshold per komponen terlalu longgar.
- R7. Reversal tanpa syarat qualification (seperti qualification.ts di
  strategy REVERSAL existing) berpotensi entry melawan tren.

## 8. Spesifikasi Awal Aturan Entry

Konfigurasi awal (rekomendasi, butuh approval):

Timeframe roles (reuse existing):
- D1: konteks makro.
- H4: bias + struktur utama.
- H1: setup.
- M15: trigger.

EMA:
- EMA20, EMA50, EMA200 di H4.
- Bullish: EMA20 > EMA50 dan EMA50 > EMA200 dan struktur HH/HL.
- Bearish: kebalikannya.
- Mixed: tidak memaksakan trend-following.

Setup (tiga keluarga):

A. TREND_PULLBACK
- Konteks H4 align dengan bias.
- H1 pullback ke EMA20/EMA50, S/R, atau zona S/D.
- Jarak ke resistance/supply lawan minimal 1R sebelum entry.
- Candle konfirmasi M15.

B. BREAKOUT_RETEST
- Resistance/support H1 teridentifikasi sebelum breakout.
- Candle close menembus level (buffer).
- Retest level dengan hold.
- Candle konfirmasi M15.

C. REVERSAL
- Harga mencapai S/R atau zona S/D kuat.
- Rejection atau CHOCH/BOS balik arah.
- Countertrend flag; aturan risiko lebih ketat.

Trigger (hard requirement, tidak pakai skor):
- Wajib: struktur konfirmasi (BOS/CHOCH/reclaim) di M15.
- Wajib: harga di dalam atau retest zona setup.
- Wajib: candle konfirmasi (engulfing atau rejection wick).
- Opsional: none.

SL:
- Di luar swing low (BUY) atau swing high (SELL), plus buffer
  structuralTargetBufferPips (config existing = 2 pips).

TP:
- Dari deriveStructuralTargetLevels (obstacle-aware, existing).
- Minimum RR 2.0 (config existing minRR).

Risk:
- Reuse evaluateRisk dengan config existing.

## 9. Perubahan yang Direncanakan (setelah approval)

Fakta (belum ada perubahan):

File baru yang diperkirakan:
- src/core/strategies/price-action/price-action.ts (orchestrator strategy).
- src/core/strategies/price-action/setup.ts (3-family classifier).
- src/core/strategies/price-action/trigger.ts (hard requirement trigger).
- src/core/strategies/price-action/config.ts.
- src/core/strategies/price-action/index.ts.
- tests/strategies/price-action/*.test.ts.

File modifikasi:
- src/core/strategies/types.ts: tambah "PRICE_ACTION" ke union StrategyId
  dan ImplementedStrategyId.
- src/core/strategies/registry.ts: daftarkan PRICE_ACTION_STRATEGY.
- src/core/strategies/index.ts: ekspor.
- src/core/strategies/system-policy.ts: TIDAK diubah (sesuai keputusan
  user - router mapping lama tetap default).
- src/core/config/engine-config.ts: tambah blok priceAction config.
- src/components/dashboard/strategy-selector.tsx: PRICE_ACTION otomatis
  muncul karena available dibaca dari IMPLEMENTED_STRATEGY_IDS.

Gap arsitektur (butuh keputusan user):
- RouteStrategy saat ini hanya memilih SATU strategy per scan. Untuk
  A/B test paralel, perlu:
  Opsi A: jalankan PRICE_ACTION sebagai observer terpisah (scan kedua).
  Opsi B: modifikasi orchestrator untuk multi-strategy.
  Opsi C: PRICE_ACTION menggantikan strategy lama saat toggle on.

## 10. Unit Test dan Integration Test

Unit test:
- EMA context: bullish, bearish, mixed.
- Swing high/low + pivot confirmation.
- BOS + CHOCH detection.
- Zona S/R (buildZones) fresh, tested, invalidated.
- Zona S/D dari base + displacement.
- Rejection candle + engulfing.
- Trigger hard requirement: pass/fail per kombinasi.
- Trend pullback BUY/SELL.
- Breakout retest BUY/SELL.
- Reversal BUY/SELL.
- RR di bawah, tepat, di atas minimum.
- Entry drift di luar batas.
- Data stale / candle hilang.
- Candle belum close.
- Trigger kedaluwarsa.
- Anti-lookahead (pivot tidak dipakai sebelum confirmedAtIndex).
- Integrasi dengan risk engine.

Integration test:
- Pipeline penuh dari market snapshot sampai execution decision.
- Perbandingan PRICE_ACTION vs TREND_PULLBACK pada data yang sama.

## 11. Rencana Backtest dan Evaluasi A/B

Backtest (setelah implementasi):
- Window: minimal 30 hari data historis.
- Baseline: TREND_PULLBACK.
- PRICE_ACTION: dengan dan tanpa EMA filter.
- Asumsi biaya: spread aktual + slippage.
- SL dan TP tersentuh di candle sama: asumsi konservatif (SL first).

Metrik:
- Jumlah kandidat, conversion rate.
- Win rate, expectancy per trade, profit factor.
- Max drawdown.
- Rata-rata profit/loss dalam R.
- Hasil per pair, per keluarga (trend pullback / breakout / reversal).
- Alasan penolakan terbanyak.

Out-of-sample:
- Split 70/30.
- Final 30 persen tidak boleh di-tune.

Kriteria terima (butuh persetujuan user):
- Conversion rate >= baseline.
- Expectancy per trade >= baseline.
- Max drawdown <= baseline.
- Hasil out-of-sample konsisten dengan in-sample.

## 12. Keputusan yang Masih Membutuhkan Persetujuan

K1. Mode paralel vs eksklusif.
Apakah PRICE_ACTION berjalan bersamaan dengan strategy lama (A/B test
paralel), atau menggantikan strategy lama saat toggle on?

Arsitektur saat ini hanya memilih satu strategy per (symbol, scan). Untuk
paralel, perlu modifikasi orchestrator atau pipeline terpisah.

K2. Toggle semantics untuk PRICE_ACTION.
- Jika toggle on: PRICE_ACTION otomatis dipilih untuk regime apa?
- Atau cuma muncul saat user set manual via API?

K3. Cooldown dan duplikasi.
Bagaimana mencegah PRICE_ACTION dan TREND_PULLBACK membuka order pada
setup yang sama? Perlu idempotency key berbasis (symbol, timeframe,
triggerTimestamp, direction)?

K4. Config default untuk PRICE_ACTION.
Threshold per komponen (rejectionWickRatio, engulfMinBodyRatio, dst).
Apakah reuse engine-config existing atau punya blok terpisah?

K5. Reversal family.
Apakah reversal butuh qualification layer (seperti qualification.ts di
strategy REVERSAL existing), atau aturan berbeda?

K6. Status decision.
Apakah PRICE_ACTION memakai status Decision yang sama dengan strategy
existing, atau butuh status baru?

K7. Backtest window dan sumber data historis.
Apakah data OHLCV yang tersedia cukup untuk backtest 30 hari? Dari mana
sumbernya (MT5 export? mock provider?)?

## Catatan Metodologi

Fakta (verified dari output command):
- Struktur folder src/core/strategies dan src/core/*.
- Mapping regime di system-policy.ts.
- Composite score trigger di trigger-engine.ts.
- Config trigger: rejectionWickRatio=2, engulfMinBodyRatio=0.7,
  maxTriggerAgeBars=3.
- Komponen reusable di analyzeStructure, analyzeSetup, evaluateTrigger.
- TRD-RR-005 sudah menambahkan AnalysisContext.availableStrategyIds dan
  config runtime di .data/strategy-config.json.

Inference (belum diverifikasi langsung):
- Estimasi 80 persen komponen reusable didasarkan pada pembacaan kode
  existing; belum diverifikasi dengan unit test terpisah.
- Gap arsitektur (K1) diidentifikasi dari pembacaan routeStrategy dan
  orchestrator, bukan dari uji runtime.

Belum diverifikasi:
- Apakah PRICE_ACTION benar-benar menghasilkan lebih banyak sinyal
  daripada TREND_PULLBACK pada data historis.
- Apakah hard requirement trigger menghasilkan false positive lebih
  sedikit atau lebih banyak daripada composite score.
- Sumber data historis untuk backtest.

Status: Audit Tahap 1 selesai. Implementasi MVP selesai di branch
feat/strategy-toggle (commit 82b8ecc + commit lanjutan).

Keputusan user (diterapkan di MVP):
- K1: opt-in via toggle, router mapping lama tidak diubah.
- K2: manual only. PRICE_ACTION tidak auto-selected oleh regime.
- K3: tidak ada dedup cross-strategy di MVP (strategy berjalan eksklusif
  saat diaktifkan, bukan paralel dengan strategy lama).
- K4: strategy config terpisah (PriceActionConfig).
- K5: reversal di-skip di MVP (enableReversal=false).
- K6: reuse status existing (SetupState / TriggerState / ExecutionDecision).
- K7: mock data dulu, MT5 historical menyusul.

MVP scope yang selesai:
- src/core/strategies/price-action/ (config, setup, trigger, wrapper, index).
- Dua keluarga: TREND_PULLBACK dan BREAKOUT_RETEST.
- Trigger hard requirement (structural AND location AND candle).
- Router: forceStrategyId override.
- Orchestrator: PRICE_ACTION otomatis force saat enabled via toggle.
- Test: 8 case di tests/strategies/price-action.test.ts.

Yang belum selesai (butuh sesi terpisah):
- A/B test paralel penuh (butuh arsitektur observer terpisah).
- Reversal family.
- Backtest dan out-of-sample validation (Tahap 3-5).
- Idempotency cross-strategy kalau nanti jalan paralel.