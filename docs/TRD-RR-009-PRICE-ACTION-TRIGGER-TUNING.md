# TRD-RR-009 — PRICE_ACTION Trigger Sensitivity Tuning

Status: Applied (belum dievaluasi)
Tanggal: 2026-10-17 01:25
Author: audit session
Scope: PRICE_ACTION trigger threshold + structural detection logic

## 1. Symptom

- TRIGGER_NO_STRUCTURE = 51% dari total reject (24h window)
- 99.6% dari sinyal PRICE_ACTION (1,679 / 1,685)
- Paper trading idle: tidak ada EXECUTE yang jadi order

## 2. Root Cause

Dari pembacaan kode src/core/strategies/price-action/trigger.ts:

1. detectStructural (line 50-55) hanya cek structure.lastBOS dan
   structure.lastCHOCH. Keduanya adalah **event terakhir di array,
   apapun arahnya**. Jika BOS terakhir berlawanan arah, structural
   tidak fire walaupun ada BOS searah sebelumnya di reakEvents.
2. maxTriggerAgeBars: 3 (engine-config.ts line 196) sangat ketat di
   timeframe M15 (window 45 menit).

Efek kombinasi:
- Market choppy -> BOS alternating -> begitu lastBOS flip arah,
  structural tidak fire sampai BOS baru searah muncul.
- Distribusi reject merata per pair (EURGBP 285, GBPUSD 276, ...) ->
  bukan pair-specific bug.

## 3. Perubahan yang Diterapkan

### 3a. Config (src/core/config/engine-config.ts)
- 	rigger.maxTriggerAgeBars: 3 -> 5
- Window trigger M15: 45 menit -> 75 menit

### 3b. Logic (src/core/strategies/price-action/trigger.ts)
- detectStructural sekarang scan reakEvents backward untuk
  mencari event terbaru dengan direction === wanted (BOS dan CHOCH
  di-scan terpisah, masing-masing ambil yang terbaru).
- Tetap di-cap oleh maxAgeBars.
- RECLAIM behavior tidak berubah.

## 4. Success Criteria (evaluasi 30-60 menit setelah apply)

- TRIGGER_NO_STRUCTURE turun < 40% dari total reject
- Tidak ada peningkatan BLOCKED / VETO_SPREAD_TOO_WIDE
- Conversion rate PRICE_ACTION tidak drop signifikan

## 5. Baseline (sebelum apply)

- TRIGGER_NO_STRUCTURE 24h: 1,685 (51% reject)
- EXECUTE: 33 (24h)
- Conversion PRICE_ACTION: 1.6%

## 6. Hasil (setelah evaluasi)

STATUS: EVALUASI DITUNDA (2026-10-17 02:15 WITA)

Alasan: strategy config diubah ke legacy (4 strategi) pada 2026-10-17
01:16:24 sebelum evaluation window dimulai. PRICE_ACTION off sejak itu.
Semua observasi post-restart (cutoff 1792171734457, 01:28:54) berasal
dari legacy strategy, sehingga perubahan TRD-RR-009 tidak teruji.

Config saat ini: TREND_PULLBACK + BREAKOUT_RETEST + RANGE_MEAN_REVERSION
+ REVERSAL (source: .data/strategy-config.json updatedAt 1792169784080).

Kode TRD-RR-009 sudah di-apply + pushed (commit b75c39c). Untuk evaluasi
lanjut: re-enable PRICE_ACTION, restart dev server, tunggu 30-60 menit,
jalankan query evaluasi di section 4.

[ ] TRIGGER_NO_STRUCTURE post-apply: ___ (n/a — PA off)
[ ] EXECUTE post-apply: ___ (n/a)
[ ] Evaluasi: ___

## 7. Rollback

Jika hasil lebih buruk:

1. Restore src/core/config/engine-config.ts dari
   .audit-backup/engine-config.ts.<ts>.bak
2. Restore src/core/strategies/price-action/trigger.ts dari
   .audit-backup/trigger.ts.<ts>.bak
3. Restart dev server (
pm run dev)
4. Revert commit: git revert <commit-hash>

## 8. Catatan

- Perubahan ini di-approve langsung oleh owner (skip 7-step TRD-008
  formal process, risk ditanggung owner).
- Backup file ada di .audit-backup/ sebelum edit.
- Commit terpisah per langkah untuk rollback granular:
  - Commit 1: docs (file ini)
  - Commit 2: config + logic
