# TRD-RR-003 - Audit Findings (Runtime & Bottleneck)

Status: Temuan audit, pra-Fase D
Tanggal audit: 2026-10-13 s/d 2026-10-14
Auditor: sesi lanjutan TRD-RR-003
Scope: Runtime paper, signal funnel, bottleneck, structural gate timeline
Data source: .data/paper-trading.json, .data/signal-funnel.json (125.594 observasi, 2026-10-05 03:50 s/d 2026-10-13 15:34)

## 1. Ringkasan Eksekutif

Audit ini mengoreksi beberapa klaim di HANDOVER.txt dan memetakan bottleneck
sebenarnya. Tiga temuan utama:

1. Bottleneck dominan BUKAN trigger engine, melainkan regime gate (LOW_VOLATILITY)
   dan - selama periode 10-07 s/d 10-12 - gate RR_TOO_LOW.
2. Gate structural clearance dihapus dan digantikan obstacle classifier pada
   commit ffb0dc6. Perubahan ini disengaja dan terdokumentasi di commit message.
3. A/B test obstaclePolicyEnabled=false tidak membandingkan terhadap baseline
   asli (1682296). Baseline asli memiliki structural clearance aktif; versi
   current dengan policy off justru melonggarkan gate RR.

## 2. Metodologi

- Sumber: signal-funnel.json (observasi runtime scanner), paper-trading.json
  (state paper account).
- Window: 203.7 jam (8.5 hari), 125.594 observasi.
- Field yang tersedia: symbol, observedAt, strategyId, regime, rejectionCode,
  rejectionStage, executionDecision. (Tidak tersedia: riskDetail, RR aktual,
  nilai obstacle.)
- Verifikasi kode: git history trend-pullback.ts, risk-engine.ts,
  obstacle-classifier.ts, engine-config.ts.

## 3. Koreksi HANDOVER.txt

| Klaim HANDOVER | Fakta runtime/kode |
|---|---|
| Paper store fresh (0 orders, 0 trades) | 2 open positions, 2 orders FILLED, 3 ledger events |
| Working tree bersih | Ada 14 rename docs -> archive yang staged |
| TRIGGER_NO_STRUCTURE ~80% | 8.3% dari total (10.377/125.594) |
| LOW_VOLATILITY_WAIT ~15% | 62.8% dari total (78.843) |
| tp1 selalu = 2R baseline | tp1 = null; yang 2R adalah takeProfit (single TP) |
| RR_TOO_LOW tidak fire karena tp1 = 2R | RR gate berubah fungsi: structural clearance dihapus, diganti plan.kind === BLOCK |
| Funnel buntu, tidak ada sinyal lolos | 139 EXECUTE, 2 order FILLED |

## 4. Bottleneck Sebenarnya

Distribusi rejectionCode (125.594 observasi, 9 hari):

| Code | Count | % |
|---|---|---|
| LOW_VOLATILITY_WAIT | 78.843 | 62.8% |
| SETUP_APPROACHING_ZONE | 20.674 | 16.5% |
| TRIGGER_NO_STRUCTURE | 10.377 | 8.3% |
| RISK_RR_TOO_LOW | 3.518 | 2.8% |
| BIAS_THRESHOLD_NOT_MET | 2.681 | 2.1% |
| RISK_RR_TOO_LOW_OBSTACLE | 353 | 0.3% |
| lainnya | ~9.000 | ~7.2% |

Catatan: LOW_VOLATILITY_WAIT terjadi di stage BIAS_DIRECTIONAL - sebelum
strategy dipilih. Ini regime gate, bukan trigger gate.

## 5. Timeline Gate RR dan Structural Clearance

| Commit | Tanggal | Perubahan |
|---|---|---|
| 1682296 | 2026-10-03 | Structural clearance aktif: obstacle < minRR dikirim sebagai targetLevels, RR engine reject sebagai RR_TOO_LOW |
| fdc28a5 | 2026-10-12 | Structural clearance dimatikan (owner directive, branch experiment/rr-obstacle-variants) |
| 1b9da6a | 2026-10-13 | Types + config + obstacle classifier (belum diintegrasikan) |
| ffb0dc6 | 2026-10-13 00:09 | Integrasi: classifier menggantikan structural gate. Obstacle < 1R -> BLOCK (RR_TOO_LOW_OBSTACLE); obstacle 1R-2R -> FULL_2R (partial belum aktif) |
| 7f67322 | 2026-10-13 | Four-tier: BLOCK/FULL_OBSTACLE/PARTIAL/FULL_2R |
| fdf546a | 2026-10-13 18:52 | Override obstaclePolicyEnabled=false: classifier early-return FULL_2R |
| e3caf2f | 2026-10-13 | Partial TP routing aktif (paper multi-TP) |

Efek pada funnel:
- Sebelum ffb0dc6: obstacle < minRR menyebabkan 100% reject RR_TOO_LOW pada periode 10-07 s/d 10-12 (ketika market LOW_VOL).
- Setelah fdf546a: classifier bypass -> RR gate lolos dengan baseline 2R -> EXECUTE muncul kembali (38 di 10-13).

## 6. Anomali yang Sudah Diresolve

RISK_RR_TOO_LOW_OBSTACLE (353 event):
- Terdistribusi 10-12 16:00 s/d 10-13 12:00.
- Semua dari TREND_PULLBACK.
- Konsisten dengan window commit ffb0dc6 -> 7f67322 (policy ON) sebelum fdf546a.
- Verdict: timing artifact, bukan bug aktif.

## 7. Anomali yang Belum Diresolve

1. Gap EXECUTE (139) vs FILLED (2): 137 sinyal tidak sampai paper order.
   Diduga ada filter di paper layer (belum diaudit).
2. Regime RANGE dan HIGH_VOLATILITY: 0 observasi sepanjang 9 hari.
   Regime detector belum pernah memilih dua regime ini (jawaban di audit (C), pending).
3. Strategy distribution: TREND_PULLBACK 43.726, BREAKOUT_RETEST 2.918,
   RANGE_MEAN_REVERSION 0, REVERSAL 0.

## 8. Implikasi untuk Fase D

Baseline A/B test obstaclePolicyEnabled TIDAK murni:
- Baseline asli (structural clearance aktif) = commit 1682296.
- Versi current (obstaclePolicyEnabled=false) = classifier bypass -> RR gate
  longgar -> tidak sebanding dengan baseline asli.
- Perbandingan yang valid: 6926f56 (policy off) vs hypothetical commit dengan
  policy on di arsitektur current. Atau: re-run 1682296 vs 6926f56.

Rekomendasi untuk Fase D:
- Definisikan baseline dengan eksplisit: apakah 1682296 (structural clearance)
  atau arsitektur current dengan policy on.
- Sertakan metrik: RR rejection rate, EXECUTE count, win rate per strategi,
  max drawdown, cost-adjusted return.

## 9. Fakta vs Inference vs Not Verified

Fakta (dari output command):
- Distribusi rejectionCode, rejectionStage, executionDecision.
- Timeline commit dan diff.
- Isi config engine-config.ts saat ini dan pada commit 1682296.

Inference (belum diverifikasi langsung):
- Penyebab 100% RR reject 10-07 s/d 10-12 = structural clearance aktif
  (dikuatkan oleh diff ffb0dc6 dan timeline, tapi tidak ada log runtime
  yang menyimpan nilai RR aktual).
- Penyebab RANGE/HIGH_VOL = 0 = regime detector / threshold (belum diaudit).

Not verified:
- Apakah 137 sinyal EXECUTE (bukan FILLED) ditolak di paper layer atau
  hilang di tempat lain.
- Apakah obstaclePolicyEnabled=false di-handle konsisten di semua strategy
  (reversal/breakout-retest/range).
- Nilai ATR aktual vs threshold lowVolatilityAtrPct=0.4 untuk konfirmasi
  LOW_VOL proporsional.

## 10. Rekomendasi Tindak Lanjut

Prioritas tinggi:
1. Audit paper layer untuk gap EXECUTE vs FILLED.
2. Re-definisi baseline Fase D (lihat section 8).
3. Re-enable obstaclePolicyEnabled=true setelah A/B selesai, untuk
   mengaktifkan partial TP pipeline (saat ini idle).

Prioritas menengah:
4. Audit regime detector (kenapa RANGE dan HIGH_VOL tidak pernah muncul).
5. Audit routing ke RANGE_MEAN_REVERSION dan REVERSAL.

Prioritas rendah:
6. Dokumentasi ulang HANDOVER.txt setelah temuan ini.

Status: audit selesai untuk scope (A)+(B)+(C). Fase D pending.

## 11. Audit Routing dan Regime (C)

### 11.1 Pertanyaan

Kenapa RANGE_MEAN_REVERSION dan REVERSAL menghasilkan 0 sinyal, dan kenapa
regime RANGE dan HIGH_VOLATILITY tidak pernah muncul di funnel?

### 11.2 Fakta

Distribusi regime (125.594 observasi, 9 hari):

| Regime | Count | % |
|---|---|---|
| LOW_VOLATILITY | 80.145 | 63.8% |
| TREND_DOWN | 27.201 | 21.7% |
| STRONG_TREND_DOWN | 11.259 | 9.0% |
| TREND_UP | 5.007 | 4.0% |
| BREAKOUT | 2.918 | 2.3% |
| STRONG_TREND_UP | 598 | 0.5% |
| RANGE | 0 | 0% |
| HIGH_VOLATILITY | 0 | 0% |

Distribusi routingMode:
- NO_STRATEGY: 80.145 (semua LOW_VOLATILITY)
- REGIME_MATCH: 46.983 (semua regime lain)

Distribusi strategyId: TREND_PULLBACK 43.726, BREAKOUT_RETEST 2.918,
RANGE_MEAN_REVERSION 0, REVERSAL 0.

Router (src/core/strategies/router.ts) dan policy
(src/core/strategies/system-policy.ts) memetakan:
- TREND_* -> TREND_PULLBACK
- BREAKOUT -> BREAKOUT_RETEST
- RANGE -> RANGE_MEAN_REVERSION
- LOW_VOLATILITY -> WAIT (NO_STRATEGY)
- HIGH_VOLATILITY -> CONDITIONAL_REVERSAL (REVERSAL hanya jika qualified)

Keempat strategy terdaftar sebagai implementedStrategyIds. Tidak ada strategy
yang unavailable.

Config regime (src/core/config/engine-config.ts):
- adxTrendThreshold: 25
- adxStrongTrend: 40
- highVolatilityAtrPct: 1.2
- lowVolatilityAtrPct: 0.4
- breakoutBandWidthRatio: 1.5
- regimeLookback: 60

Urutan cascade klasifikasi regime (regime-engine.ts:130-142):
1. BREAKOUT jika isExpansion dan isTrending dan trendDirection != NEUTRAL
2. STRONG_TREND_* jika trendDirection != NEUTRAL dan ADX >= 40
3. TREND_* jika trendDirection != NEUTRAL dan ADX >= 25
4. HIGH_VOLATILITY jika atrPct >= 1.2
5. LOW_VOLATILITY jika atrPct <= 0.4
6. RANGE (else)

trendDirection = NEUTRAL jika |stackSignal + structureSignal| < 2, yaitu
EMA stack dan structure tidak sepakat.

### 11.3 Inference

RANGE = 0 bukan bug router. RANGE hanya tercapai ketika:
- bukan BREAKOUT,
- trendDirection NEUTRAL atau ADX < 25, dan
- 0.4 < atrPct < 1.2.

Selama window, dua kondisi dominan (LOW_VOLATILITY dengan atrPct <= 0.4, dan
TREND dengan ADX >= 25) menghabiskan seluruh kandidat. Tidak ada sisa yang
masuk ke window RANGE. Dengan demikian, RANGE_MEAN_REVERSION tidak pernah
dirutekan.

HIGH_VOLATILITY = 0 karena atrPct >= 1.2 sangat jarang pada pasangan FX
mayor di timeframe normal tanpa event volatil besar. Selama 9 hari tanpa
event tersebut, tidak ada kandidat yang melewati threshold.

REVERSAL = 0 karena HIGH_VOLATILITY = 0. Bahkan jika HIGH_VOLATILITY muncul,
router hanya memilih REVERSAL jika reversalQualification.qualified true.

### 11.4 Verdict

Bukan bug. Kombinasi threshold regime dan kondisi market 9 hari (kompresi
plus trend bearish) menyebabkan RANGE dan HIGH_VOLATILITY tidak pernah
muncul, sehingga dua strategy yang bergantung padanya idle.

### 11.5 Rekomendasi

1. Jangan ubah threshold berdasarkan 9 hari data. Window terlalu pendek untuk
   kalibrasi regime. Kumpulkan minimal 30 hari sebelum mempertimbangkan
   perubahan threshold.
2. Jika ingin kalibrasi threshold, perlakukan sebagai TRD terpisah (misalnya
   TRD-RR-004 Regime Threshold Calibration) dengan evidence dan 7-step
   process.
3. Verifikasi dulu timeframe yang dipakai regime engine (D1 vs H4 vs H1)
   sebelum menyimpulkan threshold terlalu ketat. ATR 1.2% mungkin wajar di
   D1 tetapi tidak di H1.

## 12. Status Akhir Audit

Scope yang sudah selesai: (A) health check, (A2) executionPlan trace,
(B) bottleneck + structural gate timeline, (R1) docs, (C) routing dan regime.

Scope pending: (D) Fase D historical evaluation, (E) gap EXECUTE 139 vs
FILLED 2, (F) rekonsiliasi klaim HANDOVER lainnya.