# TRD-RR-002 EXPERIMENT PLAN — Obstacle Clearance Gate

Status: DRAFT (doc-only, belum ada code change)
Owner: (user)
Branch: `audit/rr-obstacle-pipeline`
Date: 2026-10-12
Prerequisite: `docs/TRD-RR-002-AUDIT.md` (commit `8c604eb`)

## 1. Tujuan

Mengukur secara empiris apakah **Design A** (obstacle-as-veto, frozen baseline TRD-008) masih optimal, atau bisa direvisi jadi Design B/C dengan bukti kuantitatif.

Pertanyaan eksplisit yang mau dijawab:

1. Apakah threshold `minRR = 2.0` menyaring terlalu agresif, atau justru tepat?
2. Apakah buffer clearance 2 pips optimal?
3. Berapa banyak trade yang hilang karena `RISK_RR_TOO_LOW` di setiap varian?

### 1.1 Non-Goals

- **Bukan** mengubah logic apa pun di `src/core/**`, `src/broker/**`, `src/paper/**`, `src/config/**`. Semua perubahan production tunduk 7-step TRD-008 sec.8.
- **Bukan** mengevaluasi Design B/C sekarang. Detail design ditunda sampai hasil Tahap 1 keluar.
- **Bukan** multi-pair. Fokus USDJPY pilot; multi-pair setelah pipeline tervalidasi.
- **Bukan** backtest live-parity. Ini eksperimen sensitivitas parameter, bukan production validation.

## 2. Konteks: Obstacle Clearance Gate

Dari audit (commit `8c604eb`):

- 30 hari live: 99.400 scan -> 101 execute (**0.10%** execution rate).
- Funnel: Trigger confirmed 3.270 -> Risk approved 101 (**96.9%** reject).
- Reject dominan: `RISK_RR_TOO_LOW` = **3.157 dari 3.169 (99.6%)**.

Root cause: **obstacle-as-veto**. Nearest structural obstacle (dari confirmed swings) dikirim sebagai `targetLevels[0]`. Kalau obstacle < `minRR * stopDistance`, risk engine reject.

Design ini disengaja, terdokumentasi di `docs/TRD-008-RR-MODEL.md` sebagai frozen baseline. Mengganti = revisi design tertulis, bukan fix bug.

**Per-strategy variance:**

| Strategy | Perilaku |
|---|---|
| TREND_PULLBACK | Clearance gate: obstacle < 2R -> kirim `[obstacle]` |
| BREAKOUT_RETEST | Identik TREND_PULLBACK |
| REVERSAL | Kirim SEMUA obstacle nearest-first, no `minimumTargetDistance` filter |
| RANGE_MEAN_REVERSION | Model berbeda (TP1=midpoint, TP2=opposite boundary) |

## 3. Caveat: minRR Dipakai di 4 Layer

> **WAJIB dibaca sebelum interpretasi hasil.**

`minRR` muncul di 5 lokasi kode (`src/core/config/` 4x, `src/core/risk/risk-engine.ts` 5x, `src/core/strategies/` 2x, `src/core/execution/veto.ts` 3x, `src/scanner/scanner-service.ts` 4x display-only). Mengubah `minRR` = mengubah **4 perilaku sekaligus**:

1. **Risk engine gate** — threshold reject.
2. **Derived TP1** — baseline target berubah.
3. **Clearance gate threshold** — obstacle window berubah.
4. **Execution veto** — RR veto threshold (defense-in-depth, independen dari risk engine).

Konsekuensi: hasil eksperimen ini **tidak** bisa diatribusikan ke satu layer saja. Varian A1 (minRR 1.5) misalnya, tidak hanya melonggarkan gate, tapi juga menggeser TP1 dan memperlebar obstacle window. Interpretasi harus eksplisit menyebut ini.

Layer `scanner-service.ts` hanya display (`computePlannedLevels`), **tidak** gate.

`tp2RR` bersih: 4x config + 1x derived TP2 di risk-engine.

## 4. Gap Teknis: engineConfigOverrides

`BacktestRunConfig` (lihat `src/replay/backtest-run-types.ts`) **tidak punya** `engineConfigOverrides`:

interface BacktestRunConfig {
datasetId, source, sourceUtcOffsetMinutes, assumedSpreadPips,
startAt, endAt, initialBalance, riskPercent,
intrabarConflictPolicy, maxOpenPositions, maxTotalOpenRiskPercent
// TIDAK ADA engineConfigOverrides
}

Padahal `HistoricalReplayRunner` constructor sudah terima `engineConfigOverrides` via duck-typing cast. Dugaan: `runImportedBacktest()` **drop** override sebelum konstruktor. **Status: belum diverifikasi.**

Dua opsi untuk Sesi 3 (Phase 1 Automation):

- **(1) Extend `BacktestRunConfig`** dengan `engineConfigOverrides?: DeepPartial<EngineConfig>`. 1 file change, type-safe. **Disarankan.**
- **(2) Bypass `runImportedBacktest`**, panggil `HistoricalReplayRunner` langsung. Lebih fleksibel tapi harus reimplement CSV import.

Keputusan path ditunda ke Sesi 3.

## 5. Dataset Spec

**Instrument scope:** USDJPY pilot.

**File CSV yang tersedia** (di `C:\mt5csvexport`):

| File | Size |
|---|---|
| USDJPY_D1.csv | 14.034 B |
| USDJPY_H4.csv | 84.041 B |
| USDJPY_H1.csv | 335.406 B |
| USDJPY_M15.csv | 1.341.140 B |

**Format CSV (verified terhadap parser FSE):**

- Delimiter: comma
- Header: `datetime,open,high,low,close` (5 kolom, tanpa volume)
- Datetime: `YYYY.MM.DD HH:MM:SS`
- **Kompatibel** dengan `src/replay/historical-csv-import.ts`. Volume absen = default 0. Symbol + TF ter-infer dari nama file. Pip size JPY auto-detect (0.01).

**Timezone server MT5: UNVERIFIED.** (warning)

Parser butuh `sourceUtcOffsetMinutes` dan **tidak bisa** menebak dari CSV. Kalau offset salah, semua timestamp shift -> hasil rusak.

**Mitigasi (sensitivity check):**

- Baseline varian A dijalankan di **3 offset**: `UTC (0)`, `GMT+2 (120)`, `GMT+3 (180)`.
- Kalau hasil signifikan beda antar offset -> offset **wajib** diklarifikasi ke broker sebelum interpretasi varian lain.
- Kalau hasil ~sama -> offset kurang kritis untuk strategi ini (tetap dicatat di doc final).

**Common coverage window:** belum diverifikasi. Akan dicek di Sesi 3 dengan baca baris pertama + terakhir setiap CSV. Target 2 tahun; kalau kurang, eksperimen tetap jalan dengan window yang tersedia (dicatat di output).

## 6. Cost Model

Broker riil: **belum dikonfirmasi**. Pakai ASSUMPTION + sensitivity bracket.

| Komponen | Nilai Awal (assumption) | Bracket Sensitivity |
|---|---|---|
| Spread (USDJPY) | 1.0 pip | 0.5 / 1.0 / 1.5 pips |
| Commission | 0 (spread-only) | 0 / $7 per round-turn lot |
| Swap | 0 (diasumsikan tanpa overnight) | — |

Implikasi: hasil Tahap 1 harus dibaca sebagai **relative ranking antar varian**, bukan absolute PnL. Kalau absolute PnL dipakai untuk keputusan produksi, cost model harus diverifikasi ke broker dulu.

## 7. 7 Varian (Config-Only)

Scope Tahap 1: **config-only, no logic change**.

| ID | minRR | buffer (pips) | Tujuan |
|---|---|---|---|
| A  | 2.00 | 2 | Baseline |
| A1 | 1.50 | 2 | Sensitivitas ambang rendah |
| A2 | 1.75 | 2 | Sensitivitas ambang menengah |
| A3 | 2.25 | 2 | Ambang lebih ketat |
| A4 | 2.50 | 2 | Ambang paling ketat |
| A5 | 2.00 | 0 | Sensitivitas buffer |
| A6 | 2.00 | 4 | Buffer lebih lebar |

Semua varian dijalankan pada dataset + cost model yang sama. Perbedaan hanya di override config.

## 8. Metrik

Per varian, capture:

**Execution & Funnel:**

- Scan count
- Trigger confirmed count
- Risk approved count
- Execution rate (`approved / confirmed`)
- Reject breakdown per reason (khususnya `RISK_RR_TOO_LOW`, `RISK_RR_*`)

**Trade-level:**

- N trades closed
- Win rate
- Profit factor
- Expectancy per trade (R)
- RR realised (avg win / avg loss)
- Max drawdown
- Avg holding time

**Distributional:**

- Trade PnL histogram
- PnL by strategy (TREND_PULLBACK / BREAKOUT_RETEST / REVERSAL / RANGE_MEAN_REVERSION)

**Output:** JSON per varian + Markdown summary (1 tabel komparatif).

## 9. Kriteria Evaluasi

> **PROPOSED** — butuh konfirmasi user sebelum Sesi 4. Threshold di bawah adalah usulan awal, bukan kebijakan tetap.

Varian X dianggap **lebih baik** dari A jika **semua** kondisi berikut:

1. Execution rate naik (X > A)
2. Profit factor tidak turun > 10% relatif terhadap A
3. N trades cukup untuk significance (min. 30 closed trades di window evaluasi)
4. Max drawdown tidak memburuk > 20% relatif terhadap A

Varian X dianggap **kalah** jika salah satu dari:

- Profit factor turun > 20% relatif A
- Max drawdown memburuk > 30% relatif A
- N trades < 30 (tidak cukup evidence)

Varian di luar keduanya = **inconclusive**, butuh window tambahan atau parameter lain.

**Keputusan lanjut:** kalau ada varian yang menang signifikan di Tahap 1, Design B/C dipertimbangkan. Detail B/C ditunda.

## 10. Change Control

- Sesi 2 (doc ini): commit di `audit/rr-obstacle-pipeline`, doc-only.
- Sesi 3 (automation): branch baru `experiment/rr-obstacle-variants` dari `master`. **Tidak** merge sampai hasil dievaluasi.
- Sesi 4+: keputusan Design B/C butuh **approval eksplisit user**.
- Semua perubahan production tunduk **7-step TRD-008 sec.8**.

## 11. Open Questions / Blockers

**Blocker untuk interpretasi hasil:**

1. **Timezone server MT5** — UNVERIFIED. Mitigasi: sensitivity check 3 offset (sec.5).
2. **Cost model riil** — belum dikonfirmasi ke broker. Mitigasi: sensitivity bracket (sec.6).
3. **Apakah `runImportedBacktest` drop `engineConfigOverrides`?** — belum diverifikasi (sec.4).

**Belum diputuskan:**

4. Path override: extend `BacktestRunConfig` vs bypass (sec.4).
5. Nama npm script (`experiment:replay` atau lain).
6. Design B/C detail (ditunda sampai hasil Tahap 1).

**Unverified assumptions dari TRD-008 yang mau diuji:**

7. "Setiap obstacle terdekat = blocker bermakna" — belum diuji empiris.
8. "2R = threshold clearance yang tepat" — belum diuji empiris.