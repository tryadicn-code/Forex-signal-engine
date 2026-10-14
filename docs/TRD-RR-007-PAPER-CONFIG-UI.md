# TRD-RR-007 - Paper Config Runtime UI

Status: Implementasi (4 sesi)
Scope: UI runtime untuk mengatur PaperTradingConfig tanpa edit kode
Baseline: feat/strategy-toggle
Change control: Branch terpisah, belum merge ke master

## 1. Tujuan

Menyediakan panel dashboard untuk mengubah parameter paper trading
runtime tanpa restart server atau edit src/config/paper.ts.

## 2. Scope

Field yang bisa diatur (8):

| Field | Tipe | Range | Default |
|---|---|---|---|
| maxOpenPositions | number | 1-50 | 10 |
| maxTotalOpenRiskPercent | number | 1-100 | 5 |
| maxOpenPositionsPerSymbol | number | 1-20 | 10 |
| maxDirectionalCurrencyExposure | number | 1-10 | 2 |
| stopLossReentryCooldownMs | number (menit) | 0-1440 | 60 |
| intrabarConflictPolicy | enum | STOP_FIRST / TARGET_FIRST / REJECT_AMBIGUOUS | STOP_FIRST |
| allowDelayed | boolean | - | true |
| autoScanEnabled | boolean | - | true |

Out of scope:
- enabled, accountCurrency, initialBalance (berbahaya, butuh reset akun).
- Perubahan pada strategy, risk engine, scanner universe.

## 3. Storage

.data/paper-config.json:
{ "version": 1, "updatedAt": <ms>, "config": { ...8 fields } }

.data/paper-config-audit.json (append-only, max 500):
[{ "timestamp": <ms>, "source": "api", "previous": {...}, "next": {...} }]

Default behavior: file tidak ada -> pakai DEFAULT_PAPER_TRADING_CONFIG.

## 4. Validasi

- Setiap field punya range (lihat tabel).
- intrabarConflictPolicy harus salah satu dari 3 nilai.
- Nilai di luar range ditolak dengan pesan field-specific.
- Duplikat tidak ada (bukan array).

## 5. Integrasi Runtime

paperService() singleton saat ini di src/server/paper-trading-access.ts
menggunakan DEFAULT_PAPER_TRADING_CONFIG hardcode. Perlu:
- Baca .data/paper-config.json saat instantiate.
- Extend identity pattern: kalau config berubah, rebuild service instance.
- Ganti field readonly config saat rebuild.

Risiko: PaperTradingService punya state internal (queue, positions).
Rebuild harus aman: simpan state di store (sudah ada, JSON file), instance
baru baca dari store. Tidak ada state in-memory yang hilang.

## 6. UI

Panel di DashboardWorkspace (paling bawah, di atas StrategySelector).
- 6 number input
- 1 dropdown (intrabarConflictPolicy)
- 2 toggle (allowDelayed, autoScanEnabled)
- Tombol Apply / Reset
- Indikator "pending reload" sampai service rebuild
- Warning kalau nilai ekstrem (misal maxOpenPositions > 20)

## 7. Risiko

R1. User set maxOpenPositions=50 -> over-exposure.
Mitigasi: warning di UI, max range 50, maxTotalOpenRiskPercent tetap gate.

R2. User set maxTotalOpenRiskPercent=100 -> risk sangat besar.
Mitigasi: warning di UI untuk nilai > 20%.

R3. Config korup saat parse.
Mitigasi: fallback ke DEFAULT_PAPER_TRADING_CONFIG, log warning.

R4. Race condition saat rebuild service di tengah scan.
Mitigasi: reuse pola scanner __fseScanInFlight await.

## 8. Test Plan

Unit:
- paper-config: default, validasi per field, range, enum, dedupe.
- paper-config-access: read/write, audit append.

Integration:
- Service rebuild saat config berubah.
- Identity string berubah.
- Nilai invalid ditolak API.

E2E (manual):
- Toggle di UI -> POST sukses -> audit tercatat -> service rebuild.

## 9. File Plan

Baru:
- src/core/config/paper-config.ts
- src/server/paper-config-access.ts
- src/app/api/paper-config/route.ts
- src/components/dashboard/paper-config-panel.tsx
- tests/config/paper-config.test.ts
- tests/server/paper-config-access.test.ts

Modif:
- src/config/storage.ts (+2 path)
- src/server/paper-trading-access.ts (baca config + identity rebuild)
- src/components/dashboard/dashboard-workspace.tsx (render panel)

## 10. Status

Implemented (4/4 step):
- Step 1 (4b26c4b): paper-config type + validation + storage path.
- Step 2 (9a43b7b): paper-config-access + paperService() identity rebuild.
- Step 3 (9b6fa83): /api/paper-config route.
- Step 4 (00b01d4): PaperConfigPanel UI + dashboard render.
- Step 5 (fix): stub PaperConfigPanel in dashboard test.

Test: 802 passed, 1 skipped, 0 failed. Typecheck + lint clean.

Cara pakai:
- Buka dashboard, scroll ke panel "Paper Config".
- Ubah field, klik Apply.
- Config tersimpan di .data/paper-config.json + audit trail.
- Service rebuild pada request berikutnya (identity-based).

Belum merge ke master.