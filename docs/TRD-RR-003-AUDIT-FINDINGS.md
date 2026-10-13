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

Status: audit selesai untuk scope (A)+(B). Audit (C) dan Fase D pending.