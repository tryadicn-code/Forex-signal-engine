# Forex Signal Engine — Handoff Document

**Terakhir diupdate:** 2026-10-04
**Repo:** `C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)`
**GitHub:** https://github.com/tryadicn-code/Forex-signal-engine
**Branch aktif:** `master` (sinkron dengan `origin/master`)
**Status:** Audit 8 batch selesai (87 fix, 652 test hijau). Siap pengembangan lanjutan.

---

## 1. Apa Aplikasi Ini

**Forex Signal Engine (FSE)** — sistem otomatis untuk:

1. **Scanning** pair FX (universe configurable, default EURUSD, GBPUSD, USDJPY, dll).
2. **Menghasilkan sinyal trading** yang *explainable* (setiap keputusan disertai evidence + conflicts).
3. **Memvalidasi strategi** melalui backtest historis + forward paper trading.
4. **Mengeksekusi order** ke broker MT5 (opsional, hanya dengan 3-lapis safety gate).
5. **Mengirim alert** ke Telegram / WhatsApp untuk lifecycle signal.
6. **Melacak performa** melalui journal + release gate untuk promosi strategi.

**Target user:** trader retail atau quant developer yang ingin sistem discretionary-turned-systematic dengan audit trail lengkap.

---

## 2. Pipeline Utama

```
Market Data
    ↓
Market Structure   (swing highs/lows, BOS, CHOCH)
    ↓
Market Regime      (trending / ranging / breakout / high-vol / low-vol)
    ↓
Bias Engine        (directional score: struktur 35, trend 25, regime 20, momentum 20)
    ↓
Setup Engine       (zone detection, arming)
    ↓
Trigger Engine     (entry confirmation dengan candle quality + momentum)
    ↓
Risk Engine        (position sizing, RR gate, stop placement)
    ↓
Execution Engine   (decision gate: EXECUTE / WAIT / BLOCKED / INVALIDATED)
    ↓
Signal Lifecycle   (DISCOVERED → WATCH → SETUP → ARMED → TRIGGERED → RISK_APPROVED → EXECUTE)
    ↓
Paper / Broker / Alerts
```

Setiap stage mengembalikan `EngineResult<T>` dengan **status, score, evidence[], conflicts[], data, timestamp**.

**Prinsip penting:** Execution Engine **tidak pernah** mengirim order. Ini gate murni. Order hanya dikirim oleh broker layer setelah semua gate lolos.

---

## 3. Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 16.3.6 (App Router) |
| Bahasa | TypeScript 5 (strict) |
| UI | React 19.2.8, Tailwind CSS 4 |
| Test | Vitest 3.2.7, Testing Library |
| Lint | ESLint 9 flat config |
| Broker bridge | Python 3.14 + MetaTrader5 5.0.6231 |
| Provider data | MT5 bridge (lokal), OANDA v20, mock |
| Shared state (opsional) | PostgreSQL + PostgREST (Supabase-compatible) |
| Durable state (default) | JSON file + SHA-256 checksum + `.bak` recovery |

---

## 4. Struktur Direktori Kunci

```
src/
├── core/                          # Trading engine (PURE, no I/O)
│   ├── structure/                 # Swing detection, BOS/CHOCH, trend
│   ├── regime/                    # ADX, ATR, Bollinger squeeze
│   ├── bias/                      # Directional scoring (4 komponen)
│   ├── setup/                     # Zone detection, arming
│   ├── trigger/                   # Entry confirmation
│   ├── risk/                      # Position sizing, RR, structural targets
│   ├── execution/                 # Decision gate + veto framework
│   ├── indicators/                # EMA, SMA, RSI, MACD, ATR, ADX, Bollinger
│   ├── config/                    # EngineConfig, assertEngineConfigValid
│   ├── orchestrator/              # Pipeline runner + strategy router
│   └── strategies/                # 4 strategi:
│       ├── trend-pullback.ts
│       ├── breakout-retest/
│       ├── range-mean-reversion/
│       ├── reversal/
│       ├── entry-price.ts         # canonical entry resolver
│       ├── trigger-candles.ts     # safe candle resolution
│       └── router.ts              # regime -> strategy selection
│
├── market-data/                   # Normalisasi, closed-candle filter, validation
├── scanner/                       # ScannerService, signal lifecycle, state machine
├── replay/                        # Backtest simulator, statistics, release gate
│   ├── deflated-sharpe.ts         # DSR (Bailey & Lopez de Prado)
│   ├── pbo.ts                     # PBO via CSCV
│   └── multiple-testing.ts        # t-stat correction
├── broker/                        # MT5 execution safety layer
├── notifications/                 # Telegram + WhatsApp (durable outbox)
├── forward-validation/            # Live paper vs historical comparison
├── analytics/                     # Signal funnel + rejection analytics
├── paper/                         # Paper trading service
├── server/                        # Access layer (dipakai API routes)
│   ├── api-guard.ts               # Shared auth + error sanitization
│   └── broker-execution-access.ts
├── transactional/                 # Lease, fencing, durable jobs
├── persistence/                   # Durable JSON (atomic write + checksum)
├── providers/
│   ├── market-data/               # MT5, OANDA, mock
│   └── economic-calendar/         # Noop provider
├── app/
│   ├── api/                       # Next.js API routes
│   ├── backtest/page.tsx
│   ├── journal/page.tsx
│   ├── system/page.tsx
│   └── page.tsx                   # Dashboard
├── components/                    # React UI (presentational only)
│   └── system/
│       ├── approval-secret-dialog.tsx
│       └── global-overlays.tsx
├── lib/
│   ├── api-client.ts              # Shared fetch + approval secret injection
│   ├── format.ts                  # Formatters
│   ├── signal-meta.ts             # Presentation semantics
│   └── workstation-status.ts      # Status derivation
└── config/                        # Broker, notifications, scanner, dll

scripts/
└── mt5/bridge.py                  # Python HTTP bridge ke MT5

tests/                              # 93 file test, 652 test hijau
infra/postgres/phase-9.sql         # SQL migration untuk shared state
```

---

## 5. Status Audit (Batch 1 – 8E-2)

**8 batch audit, 87 fix, semua sudah merge ke `master`.**

### Critical yang sudah ditutup:

| Endpoint | Sebelum | Sesudah |
|---|---|---|
| `POST /api/system/migration` | tanpa auth | butuh `x-fse-approval-secret` |
| `POST /api/system/recovery` | tanpa auth | butuh secret |
| `PATCH /api/backtest/runs/[id]` | bisa PROMOTE tanpa auth | butuh secret |
| `PATCH /api/backtest/strategy-versions/[version]` | bisa DEPRECATE tanpa auth | butuh secret |
| `POST /api/paper`, `DELETE /api/paper` | tanpa auth | butuh secret |
| `POST /api/scanner` | tanpa auth | butuh secret |
| `POST /api/scanner/symbols` | tanpa auth | butuh secret |
| `POST /api/backtest/run` | tanpa auth | butuh secret |

### Modul baru dari audit:

- **`src/lib/api-client.ts`** — `apiFetch()` yang otomatis inject `x-fse-approval-secret`, timeout, error classification, dispatch event 401.
- **`src/components/system/approval-secret-dialog.tsx`** — global modal, disimpan di `sessionStorage`.
- **`src/components/system/global-overlays.tsx`** — mount dialog di root layout.
- **`src/server/api-guard.ts`** — helper auth, path validation, error sanitization, status classification.
- **`src/replay/deflated-sharpe.ts`** — Deflated Sharpe Ratio (Bailey & Lopez de Prado).
- **`src/replay/pbo.ts`** — Probability of Backtest Overfitting via CSCV.
- **`src/replay/multiple-testing.ts`** — Multiple testing correction.
- **`src/core/strategies/trigger-candles.ts`** — Safe trigger candle resolution.
- **`src/core/strategies/entry-price.ts`** — Canonical entry price resolver.

### Perubahan perilaku dari audit:

1. **Trigger candle slicing** — sekarang pakai closed candle terbaru (bukan N-1). Backtest lama perlu re-run.
2. **ATR warmup** — Wilder seed konsisten. Nilai di bar 0–period berbeda.
3. **Bias label boundary** — score `-20` sekarang `SHORT` (sebelumnya `NEUTRAL`).
4. **Purge default ON** — validasi statistik lebih ketat. Strategi yang lolos sebelumnya mungkin gagal.
5. **Auth di UI** — semua POST butuh approval secret. UI sudah punya dialog.
6. **Deterministic mode** — `engineTimestamp()` tanpa `marketAsOf` throw saat replay.

---

## 6. Konfigurasi

### `.env.local` (WAJIB minimal)

```
FSE_LIVE_APPROVAL_SECRET=<random-string-minimal-32-char>
```

Tanpa ini, semua POST endpoint return 401, dan UI akan popup dialog approval secret.

### `.env.local` (umum dipakai)

```
MARKET_DATA_PROVIDER=mock          # atau mt5, oanda
FSE_BROKER_MODE=off                # atau shadow, live
FSE_LIVE_EXECUTION_ENABLED=false
FSE_LIVE_EMERGENCY_STOP=true
FSE_ALERTS_ENABLED=false
FSE_TX_STORE_MODE=local            # atau remote (Supabase/PostgREST)
FSE_DATA_DIR=./.data               # opsional, default <project>/.data
```

### MT5 bridge (kalau pakai data live)

```
MT5_BRIDGE_HOST=127.0.0.1          # jangan diubah kecuali tahu implikasi
MT5_BRIDGE_PORT=8765
MT5_TERMINAL_PATH=                 # opsional
MT5_SYMBOL_PREFIX=                 # untuk broker dengan prefix
MT5_SYMBOL_SUFFIX=                 # untuk broker dengan suffix (mis .m)
```

Lihat `.env.example` untuk referensi lengkap.

---

## 7. Command Development

```powershell
npm install                    # install dependencies
npm run dev                    # start dev server (http://localhost:3000)
npm run build                  # production build
npm run start                  # serve production build
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint
npm test -- --run              # vitest sekali jalan
npm run test:watch             # vitest watch mode
npm run coverage               # test + coverage report
```

**Python bridge (kalau pakai MT5):**

```powershell
python scripts\mt5\bridge.py
```

---

## 8. Prinsip Arsitektur

1. **Pure functions di `src/core/`** — tidak ada I/O, tidak ada `Date.now()` (waktu di-inject via parameter `marketAsOf`). Mudah ditest dan di-replay.

2. **Provider-agnostic** — market data dinormalisasi di `src/market-data/` sebelum engine melihat. Ganti provider = ganti adapter saja.

3. **Fail-closed** — default ke kondisi paling aman:
   - `FSE_BROKER_MODE=off`
   - `FSE_LIVE_EXECUTION_ENABLED=false`
   - `FSE_LIVE_EMERGENCY_STOP=true`
   - Semua alert channel OFF

4. **Explainable** — setiap keputusan engine disertai `evidence[]` + `conflicts[]`. Audit trail lengkap.

5. **Deterministic replay** — backtest bisa di-reproduksi identik. Fingerprint SHA-256 dari config + data + outcomes.

6. **Separated concerns** — trading logic **tidak pernah** di React components. UI hanya render state.

7. **Windows-safe UTF-8** — semua glyph non-ASCII di file source pakai `\uXXXX` escape (menghindari Set-Content cp1252 bug).

---

## 9. Fakta Penting untuk Kontributor Baru

### Signal Identity

Signal ID deterministik dari:
```
symbol | strategy | direction | originTimeframe | originTimestamp | zoneLowPips | zoneHighPips
```

Trade baru di setup yang sama dengan origin time berbeda = **signal baru**.

### Terminal States

- **CLOSED** dan **INVALIDATED** terminal — tidak bisa di-revive.
- Trigger baru di setup lama → dapat `signalId` baru dengan suffix `|trigger:<timestamp>`.

### Broker Idempotency

- `idempotencyKey = version:activationAt:signalId`
- `clientTag = "FSE-" + shortHash(idempotencyKey).slice(0, 20)`
- Broker bridge pakai `clientTag` + `TRADE_MAGIC` untuk reconcile.

### Live Execution Gates

Semua harus true untuk kirim order:
1. `FSE_BROKER_MODE=live`
2. `FSE_LIVE_EXECUTION_ENABLED=true`
3. `FSE_LIVE_EMERGENCY_STOP=false`
4. `FSE_LIVE_APPROVAL_SECRET` diset
5. `FSE_LIVE_ALLOWED_SYMBOLS` non-empty
6. Kill switch disengaged
7. Live arm approved & belum expired
8. Shared transactional mode aktif
9. Provider bukan "shadow"
10. Tidak ada `RECONCILIATION_REQUIRED`
11. Symbol di allowlist
12. Risk, lot, open positions dalam hard limit
13. Broker preflight passed

**Fail-closed by default**: kalau satu gate gagal, order tidak dikirim.

### Durable JSON

- Setiap write = `write temp → fsync → rename → syncDirectory`
- SHA-256 sidecar (`.sha256`)
- Previous-good backup (`.bak` + `.bak.sha256`)
- Auto-recovery saat primary korup

### Shared Transactional State

- Mode `local` (default): single-node, JSON file.
- Mode `remote`: PostgREST/Supabase, multi-instance.
- Fencing token via `nextval('fse_fencing_token_seq')`.
- Lease acquire: `SELECT ... FOR UPDATE` di tabel `fse_leases`.

---

## 10. Utang Teknis (Deferred dari Audit)

### Medium (3)

| ID | Item | Estimasi | Dampak |
|---|---|---|---|
| `M8E2-3` | Zombie job recovery (stale RUNNING di `attempts == max`) | 2 jam | Rendah — queue belum production |
| `M5-4` | Reconcile caching di MT5 bridge | 1 jam | Menengah jika broker lambat |
| `M6-1` | Rate limit untuk POST endpoint | 3 jam | Menengah di production multi-user |

### Low (16)

- Observability: structured logging, Prometheus metrics, request ID tracing.
- Konsistensi: header auth naming, JSDoc di beberapa modul.
- Defensive: worker telemetry hooks, bearer token rotation.
- Kosmetik: `notifications` SUPPRESSED → QUEUED transition, komentar.

---

## 11. Isu Aktif Saat Handoff

**Dialog approval secret tidak muncul saat klik Refresh.**

**Kemungkinan penyebab (belum diverifikasi):**

1. `.env.local` belum punya `FSE_LIVE_APPROVAL_SECRET`.
   - Server return **400** ("not configured"), bukan **401**.
   - `apiFetch` hanya dispatch event saat status === 401.
   - **Fix cepat:** set `FSE_LIVE_APPROVAL_SECRET` di `.env.local`, restart dev server.

2. `statusForError` di `api-guard.ts` tidak mengklasifikasikan "not configured" sebagai 401.
   - **Fix:** tambah pattern `/_SECRET is not configured/` ke kondisi 401.

3. Event listener `fse:request-approval-secret` tidak aktif.
   - **Debug:** di browser console, `window.dispatchEvent(new Event("fse:open-approval-secret-dialog"))` — kalau dialog muncul, listener OK tapi `apiFetch` tidak dispatch.

**Langkah debug yang disarankan:**
1. Cek `.env.local` ada dan berisi `FSE_LIVE_APPROVAL_SECRET`.
2. Buka DevTools Network tab, klik Refresh, lihat status code `POST /api/scanner`.
3. Buka DevTools Console, lihat error JavaScript.

---

## 12. Roadmap Lanjutan

### Batch 9 — Deep Dive Fitur Spesifik (2–4 jam)
- Reversal strategy: qualification, exhaustion sweep, CHOCH freshness.
- Range mean reversion: boundary detection, midpoint derivation.
- Breakout retest: retest confirmation, chase prevention.

### Batch 10 — Production Readiness (1–2 hari)
- Rate limiting infrastructure (in-memory token bucket atau Redis).
- Metrics + Prometheus exporter.
- Alert routing + escalation policy.
- Backup verification untuk `.data`.
- Disaster recovery drill.

### Batch 11 — Performa & Skala (1–2 hari)
- Scanner throughput benchmark 20 → 100 symbol.
- Backtest optimization (multiprocessing replay).
- Cache invalidation untuk registry/release runtime.
- Database index review PostgREST.

### Batch 12 — ML Filter (opsional, 1 minggu)
- Pre-filter setup dengan logistic regression dari evidence features.
- Kalibrasi probabilitas walk-forward.
- A/B test vs rule-based.

### Alternatif: Paper Trading Observasi (2–4 minggu)
- Jalankan dengan MT5 provider + paper mode.
- Amati:
  - Sinyal yang dihasilkan vs ekspektasi.
  - False positive rate (sinyal EXECUTE yang berujung loss).
  - Alert deliverability (Telegram/WhatsApp).
  - Performa drift vs backtest.
- Baru putuskan lanjut ke Batch 10 atau live broker.

---

## 13. Git & Branch

### Branch saat ini

- `master` — aktif, sync dengan `origin/master`.
- `origin/HEAD -> origin/master` — default GitHub.
- 38 branch `audit/*` — sudah dimerge, boleh dihapus.
- Branch `phase-*` — historis, jangan dihapus.

### Strategi merge masa depan

```powershell
# Buat branch fitur
git checkout -b feature/nama-fitur

# Kerjakan, commit berkala
git add -A
git commit -m "feat: deskripsi"

# Test & lint lokal sebelum push
npm run typecheck
npm run lint
npm test -- --run

# Merge ke master
git checkout master
git merge --no-ff feature/nama-fitur -m "merge: fitur X"
git push origin master
```

### Konvensi commit

- `feat:` — fitur baru
- `fix:` — bug fix
- `audit(batchN):` — dari audit
- `docs:` — dokumentasi
- `chore:` — housekeeping
- `refactor:` — refactor tanpa mengubah perilaku
- `test:` — test baru atau update

---

## 14. Key Contacts / Referensi

- **MT5 Python API:** https://www.mql5.com/en/docs/python_metatrader5
- **OANDA v20 API:** https://developer.oanda.com/rest-live-v20/introduction/
- **Bailey & Lopez de Prado (DSR):** "The Deflated Sharpe Ratio" (2014)
- **Bailey et al (PBO):** "The Probability of Backtest Overfitting" (2015)
- **Next.js App Router:** https://nextjs.org/docs/app

---

## 15. Cara Melanjutkan di Chat Baru

Buka chat baru, upload file `HANDOFF.md` ini, lalu kirim pesan:

> Saya upload `HANDOFF.md`. Tolong baca dulu untuk konteks project. 
> Tugas saya sekarang: **[tulis tugas baru di sini]**

Contoh tugas:
- "Debug dialog approval secret yang tidak muncul"
- "Audit Batch 9 — deep dive strategi REVERSAL"
- "Implement rate limiting untuk POST endpoint"
- "Deploy ke production checklist"
- "Fitur baru: [deskripsi]"

Pastikan **chat baru sudah bisa akses ke repo lokal** (`C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)`) supaya bisa langsung kerja.

---

**Dokumen ini adalah single source of truth untuk konteks project. Update setiap kali ada perubahan besar (audit baru, modul baru, arsitektur berubah, fitur besar selesai).**