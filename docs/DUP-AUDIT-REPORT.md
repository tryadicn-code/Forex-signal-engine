# Duplication Audit Report — FSE

**Tanggal:** 2026-10-11
**Scope:** 320 file `src/**`, 1054 exported symbols
**Method:** 5 blok scan (inventory, export names, helper patterns, UI patterns, formatter file read)
**Status:** temuan read-only. Belum ada aksi. Keputusan owner pending.

---

## Ringkasan

Audit mencari duplikasi di `src/**` (exclude `node_modules`). Empat kategori:
1. Exported symbol names
2. Helper formatter pattern
3. UI komponen (Chip / Badge / Metric / Fact / Panel)
4. className combo

Temuan utama:
- **Formatter duplication** — 5 fungsi overlap persis antara 2 file utama (P1).
- **Metric (8x) & Fact (6x)** — nama sama, didefinisi ulang di banyak file (P2, isi belum diverifikasi).
- Chip / Badge, CSV, Panel — **tidak ada duplikasi nyata**.

---

## P1 — Formatter duplication (HIGH ROI)

### Fakta

Dua file overlap 5 fungsi identik:

| Fungsi | `lib/backtest-format.ts` (48 L, canonical) | `backtest-workspace/lib/formatters.ts` (40 L) | `validation-workbench/lib/formatters.ts` (21 L) | `paper-trading-panel/lib/formatters.ts` (37 L) |
|---|---|---|---|---|
| `formatUtc` | ada | DUP | — | — |
| `formatNumber` | ada | DUP | — | — |
| `formatPercent` | ada | DUP | — | — |
| `formatSigned` | ada | DUP | — | — |
| `signedPercent` | — | DUP | DUP | — |
| `pct` | — | — | — | ~DUP (semantik = formatPercent) |
| `formatOffset` | — | unik | — | — |
| `formatBytes` | — | unik | — | — |
| `formatGeneric` / `formatGenericDelta` | — | — | unik | — |
| `money` / `pnlTone` / `riskReward` | — | — | — | unik (domain paper) |

### Konvensi placeholder berbeda

Dua gaya:
1. `backtest-format.ts` + `backtest-workspace/lib/formatters.ts` + `validation-workbench/lib/formatters.ts` + `paper-trading-panel/lib/formatters.ts`: em-dash **literal** di source.
2. `src/lib/format.ts`: Unicode **escape** (`NOT_AVAILABLE = "\u2014"`) — komentar file eksplisit menyebut ini anti-mojibake.

Standardisasi ke opsi 2 (escape) menghilangkan risiko mojibake saat file diedit via tooling yang salah encoding.

### Rekomendasi

- Kandidat canonical: `src/lib/format.ts`, atau file baru `src/lib/number-format.ts`.
- 4 file formatter di atas jadi re-export / dihapus.
- Effort: 1 sesi. Risk: rendah (pure functions, 735 test sebagai jaring).

---

## P2 — Metric (8x) & Fact (6x)

### Metric — 8x definisi

- `paper-trading-panel/components/metric.tsx` (canonical, co-located)
- `signal-funnel-panel.tsx`
- `signal-funnel-summary.tsx`
- `backtest-metrics.tsx`
- `market-health-panel.tsx`
- `equity-curve.tsx`
- `signal-detail-panel.tsx`
- `signal-executive-summary.tsx`

### Fact — 6x definisi

- `strategy-version-registry-workbench/components/fact.tsx` (canonical, dari split 3C)
- `broker-execution-panel.tsx`
- `forward-validation-panel.tsx`
- `notification-panel.tsx`
- `production-health-panel.tsx`
- `system-workspace.tsx`

### Status

Belum diverifikasi isi. Kandidat: (a) duplikat nyata, (b) beda prop/styling karena konteks, (c) mix. Perlu 1 blok baca 4-7 file sample.

---

## Tidak ada duplikasi (verified)

- **Chip / Badge** — `src/components/common/badges.tsx` canonical (9 badge). Plus 2 spesialis: `StateChip` (scanner), `TradeFilterChip` (paper). Tidak overlap.
- **Panel** — 16 Panel-named component, semua nama unik.
- **CSV** — terpusat di `paper-trading-panel/lib/csv.ts`, dikonsumsi `portfolio-workspace`, `journal-workspace`, `paper-trading-panel.tsx`. Bersih.

---

## Noise (bukan duplikasi)

- `dynamic` (26x) / `runtime` (17x) / `GET` / `POST` / `DELETE` / `PATCH` — Next.js route segment config & handlers, per-file wajib.
- `stat` (14x) — variabel lokal, bukan komponen.
- `pct` di `mini-bar.tsx` & `job-progress-panel.tsx` — variabel lokal, bukan fungsi.

---

## Kandidat design-token (belum diklaim)

123 unique className combo `rounded + border + bg-zinc`. Top duplikat:
- `rounded-md border border-zinc-800 bg-zinc-900/30` (13x)
- `rounded border border-zinc-800 bg-zinc-950/30` (7x)
- `rounded border border-zinc-800 bg-zinc-950/45 p-3` (7x)

Sesi bg-normalization 2026-10-11 (`fcc58af`) sudah konsolidasi varian opacity zinc. Belum cek apakah `docs/DESIGN-TOKENS.md` sudah menetapkan aturan untuk combo ini. Perlu baca dulu sebelum klaim.

---

## Rekomendasi aksi

| # | Aksi | Effort | Risk | Nilai |
|---|---|---|---|---|
| P1 | Konsolidasi formatter (4 file → 1 canonical) | 1 sesi | Rendah | Tinggi |
| P1b | Standardisasi placeholder (em-dash literal → Unicode escape) | 30 menit | Sangat rendah | Sedang |
| P2 | Verify + konsolidasi Metric (8x) & Fact (6x) | 1-2 sesi | Sedang | Sedang-Tinggi |
| P3 | Cek DESIGN-TOKENS.md, mungkin tambah utility class | 30 menit baca | Rendah | Rendah-Sedang |

---

## Catatan

- Laporan hasil audit read-only. Tidak ada file kode yang diubah.
- Metodologi: PowerShell scan (`Get-ChildItem -Recurse` + regex match line-by-line).
- Bug PowerShell ditemukan saat audit: `Get-Content` via pipeline gagal pada path dengan `[id]` / `[version]` karena wildcard interpretation — gunakan `-LiteralPath`.