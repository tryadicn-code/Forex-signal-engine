# TRD-RR-005 - Strategy Toggle (Runtime Selector)

Status: Draft implementasi
Scope: Konfigurasi runtime untuk memilih strategy yang aktif di scanner
Baseline: feat/strategy-toggle dari b5f2ebe
Change control: Branch terpisah, belum merge ke master

## 1. Tujuan

Menyediakan mekanisme runtime untuk memilih strategy mana yang aktif
digunakan scanner, tanpa restart server. Perubahan diambil oleh auto-scan
timer pada cycle berikutnya.

## 2. Motivasi

Saat ini daftar strategy yang tersedia di-hardcode via
IMPLEMENTED_STRATEGY_IDS di src/core/strategies/registry.ts dan di-import
langsung oleh orchestrator. Untuk A/B test, debugging, atau fokus strategi
tertentu, perlu cara mengubah daftar ini tanpa edit kode atau restart.

## 3. Scope

In scope:
- Konfigurasi persist di .data/strategy-config.json.
- API route GET/POST /api/strategy-config.
- UI panel di dashboard (paling bawah).
- Integrasi ke orchestrator sebagai parameter runtime.
- Audit trail di .data/strategy-config-audit.json.
- Hot reload via identity-based scanner swap (mekanisme existing).

Out of scope:
- Perubahan threshold strategy.
- Perubahan governance release (ACTIVE strategy release).
- Perubahan routing regime -> strategy.
- UI untuk mengubah bobot atau parameter strategy.

## 4. Desain

### 4.1 Storage

.data/strategy-config.json:
{
  "version": 1,
  "updatedAt": 1791...,
  "enabledStrategies": ["TREND_PULLBACK", "BREAKOUT_RETEST"]
}

.data/strategy-config-audit.json (append-only):
[
  {
    "timestamp": 1791...,
    "source": "api" | "startup-default",
    "previous": [...],
    "next": [...]
  }
]

Default behavior: jika file tidak ada, semua IMPLEMENTED_STRATEGY_IDS
dianggap aktif (backward compatible).

### 4.2 Validasi

- Minimal 1 strategy harus aktif (POST ditolak jika kosong).
- Setiap strategy ID harus ada di IMPLEMENTED_STRATEGY_IDS.
- Duplikat di-dedupe.

### 4.3 Integrasi Scanner

Mekanisme swap existing di scanner-access.ts:122-154 menggunakan identity
string. Identity diperluas:

  identity = releaseIdentity + "|symbols:" + symbols + "|strategies:" + strategies

Perubahan strategy-config menyebabkan identity berubah, sehingga scanner
di-rebuild pada auto-scan cycle berikutnya. Scan in-flight ditunggu selesai
sebelum swap (existing safety).

### 4.4 Orchestrator

orchestrator.ts:64 saat ini:
  routeStrategy(routingRegime, IMPLEMENTED_STRATEGY_IDS, {...})

Menjadi:
  routeStrategy(routingRegime, context.availableStrategyIds ?? IMPLEMENTED_STRATEGY_IDS, {...})

Field availableStrategyIds ditambahkan ke AnalysisContext (optional).

### 4.5 UI

Panel di bagian paling bawah DashboardWorkspace. Client component dengan
checkbox per strategy, tombol Apply, dan indikator "pending reload" hingga
auto-scan cycle berikutnya selesai.

### 4.6 Audit Trail

Setiap perubahan via API mencatat event ke strategy-config-audit.json.
Retensi: tidak dibatasi (append-only, kecil).

## 5. File Plan

Baru:
- src/core/strategies/strategy-config.ts
- src/server/strategy-config-access.ts
- src/app/api/strategy-config/route.ts
- src/components/dashboard/strategy-selector.tsx
- tests untuk masing-masing.

Modif:
- src/config/storage.ts (path baru)
- src/core/orchestrator/orchestrator.ts (param baru)
- src/core/orchestrator/types.ts (field availableStrategyIds)
- src/scanner/scanner-service.ts (pass config)
- src/server/scanner-access.ts (identity extend + baca config)
- src/components/dashboard/dashboard-workspace.tsx (render panel)

## 6. Test Plan

Unit:
- strategy-config: load default, validasi, dedupe, tolak kosong.
- strategy-config-access: read/write, audit trail append.

Integration:
- Orchestrator terima availableStrategyIds, routing menghormati list.
- Identity string berubah saat config berubah.
- Scanner rebuild saat identity beda.

E2E (manual):
- Toggle di UI -> POST sukses -> audit tercatat -> auto-scan rebuild.
- Toggle semua off -> POST ditolak.

Regression:
- 766 test existing harus tetap lulus.

## 7. Risiko dan Mitigasi

Risiko: race condition mid-scan.
Mitigasi: existing __fseScanInFlight await (scanner-access.ts:132-135).

Risiko: governance conflict.
Mitigasi: audit trail append-only, tetap dapat di-trace.

Risiko: konfigurasi hilang saat file corrupt.
Mitigasi: fallback ke default (semua aktif) jika parse gagal.

## 8. Non-Goals

- Tidak mengubah cara strategy di-register.
- Tidak mengubah governance release.
- Tidak menambah strategy baru.
- Tidak mengubah UI layout utama.

## 9. Status

Implemented across steps 1-5:

- Step 1 (be52c63): branch + TRD.
- Step 2 (85c42b1): strategy-config type + validation + storage path.
- Step 3 (391cc5f): scanner + orchestrator runtime strategy selection.
- Step 4 (71cdd95): API route + dashboard panel.
- Step 5: test stub for dashboard, full test suite green.

Hot reload path: POST /api/strategy-config -> .data/strategy-config.json
+ audit trail -> identity string di scanner-access berubah -> scanner
rebuild pada auto-scan cycle berikutnya. Race condition mid-scan ditangani
oleh __fseScanInFlight await yang sudah ada.

Belum merge ke master. Menunggu evaluasi manual di dev environment.