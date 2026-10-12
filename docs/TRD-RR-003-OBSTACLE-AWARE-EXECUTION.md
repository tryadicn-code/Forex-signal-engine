# TRD-RR-003 — Obstacle-Aware Execution & Partial Take-Profit

Status: Draft desain teknis
Scope: Strategy -> Risk Engine -> Paper Execution -> UI & Configuration
Baseline: minRR = 2.0
Obstacle policy: Block di bawah 1R; partial take-profit pada obstacle antara 1R dan 2R; full take-profit 2R jika obstacle tidak ada atau berada pada/setelah 2R.
Change control: Implementasi pada branch terpisah. Tidak mengubah master secara langsung.

## 1. Tujuan dan Prinsip Desain

Tujuan perubahan adalah memisahkan tiga tanggung jawab yang sebelumnya tercampur:

- Entry approval: menentukan apakah transaksi layak dibuka berdasarkan seluruh aturan risiko yang berlaku.
- Execution planning: menentukan bagaimana posisi akan dikelola berdasarkan lokasi obstacle struktural.
- Position lifecycle: menjalankan TP parsial, TP akhir, stop loss, pencatatan ledger, dan perhitungan P&L secara konsisten.

Prinsip yang harus dipertahankan:

- Baseline target tetap 2R.
- Obstacle tidak boleh otomatis memperpendek target approval menjadi kurang dari minimum RR.
- Obstacle digunakan untuk menentukan kelayakan ruang pergerakan dan rencana pengambilan profit.
- Seluruh validasi risiko yang sudah ada tetap aktif.
- Risk approval tidak boleh dianggap sebagai jaminan keuntungan atau jaminan bahwa target dapat tercapai.
- Paper execution harus mengikuti ExecutionPlan yang sudah divalidasi, bukan membuat interpretasi strategi sendiri.
- Posisi single-TP yang sudah ada tetap kompatibel selama migrasi.
- Semua keputusan perubahan strategi harus dapat diuji, direproduksi, dan diaudit.

## 2. Definisi Dasar

Misalkan:

- E = entry price.
- S = stop-loss price.
- D = jarak entry ke stop loss.
- O = harga obstacle struktural terdekat yang valid.
- OD = jarak entry ke obstacle.
- R = satu unit risiko harga.

Perhitungan dasar:

- D = abs(E - S)
- OD = abs(O - E)
- obstacleR = OD / D

Semua perbandingan jarak harus menggunakan satuan harga yang konsisten. Konversi pip hanya dilakukan ketika diperlukan oleh konfigurasi atau tampilan.

Untuk posisi BUY, obstacle harus berada di atas entry. Untuk posisi SELL, obstacle harus berada di bawah entry. Obstacle yang berada pada sisi harga yang salah tidak boleh dipakai sebagai target.

Sebelum klasifikasi, sistem wajib memastikan entry, stop loss, arah transaksi, jarak stop, dan ukuran pip valid.

## 3. Layer 1 — Strategy dan Obstacle Classification

### 3.1 Strategy yang tercakup

- TREND_PULLBACK
- BREAKOUT_RETEST
- REVERSAL

Strategi RANGE_MEAN_REVERSION harus mempertahankan model target khusus berbasis rentang, kecuali perubahan terpisah secara eksplisit menyetujui integrasinya dengan kebijakan obstacle ini.

### 3.2 ExecutionPlan

Tambahkan tipe bersama di src/core/strategies/types.ts.

Konsep antarmuka:
type ExecutionPlan =
| { kind: "BLOCK"; reason: "RR_TOO_LOW_OBSTACLE"; obstaclePrice: number; obstacleR: number; }
| { kind: "PARTIAL"; tp1: number; tp1SizePercent: number; tp2: number; tp2SizePercent: number; obstaclePrice: number; obstacleR: number; }
| { kind: "FULL_2R"; tp: number; obstaclePrice?: number; obstacleR?: number; };

Tipe final harus mengikuti pola penamaan, validasi, dan konvensi tipe yang sudah dipakai repo.

### 3.3 Klasifikasi obstacle

| Kondisi | ExecutionPlan | Tindakan |
|---|---|---|
| Tidak ada obstacle valid | FULL_2R | Target penuh pada 2R |
| obstacleR < 1.0 | BLOCK | Tolak kandidat karena ruang struktural terlalu sempit |
| 1.0 <= obstacleR < 2.0 | PARTIAL | TP1 di obstacle; TP2 di 2R |
| obstacleR >= 2.0 | FULL_2R | Target penuh tetap pada 2R |

Batas 1R dan 2R bersifat eksplisit untuk menghindari ketidakjelasan pada nilai tepat di batas.

### 3.4 Aturan TP dan ukuran posisi

Untuk PARTIAL:

- TP1 = obstacle struktural.
- Ukuran TP1 = partialTP1SizePercent, default 50%.
- TP2 = target baseline 2R.
- Ukuran TP2 = sisa posisi, default 50%.

Untuk FULL_2R:

- TP utama = target baseline 2R.
- Posisi ditutup penuh saat TP tercapai.

Untuk BLOCK:

- Tidak ada order yang boleh dibuat.
- Kandidat menyimpan alasan penolakan untuk observabilitas.

### 3.5 Validasi rencana

Sebelum rencana diteruskan:

- BUY dan SELL harus memiliki orientasi TP dan SL yang benar.
- TP1 pada rencana parsial harus berada di antara entry dan TP2.
- TP2 harus sesuai dengan target baseline 2R.
- Persentase ukuran posisi harus valid dan jumlah alokasinya 100%.
- Jika obstacle tidak valid, jangan diam-diam menggunakannya.
- Target eksplisit dari caller harus mengikuti semantik yang sudah berlaku, kecuali perubahan tersendiri menyetujui migrasinya.

## 4. Layer 2 — Risk Engine

### 4.1 Pemisahan approval dan execution plan

Risk engine memiliki dua tanggung jawab berbeda:

A. Risk approval — Memvalidasi kelayakan transaksi menggunakan target approval baseline dan seluruh aturan risiko yang berlaku.

B. ExecutionPlan propagation — Meneruskan rencana yang sudah divalidasi ke objek hasil risk assessment agar dapat digunakan oleh paper execution service.

### 4.2 Approval RR

Baseline tetap:

- approvalTargetDistance = stopDistance x minRR
- approvalRR = approvalTargetDistance / stopDistance

Rumus tersebut hanya berlaku jika stopDistance > 0 dan seluruh harga valid.

Perhitungan di atas tidak menggantikan validasi risiko lainnya. Risk engine tetap wajib mempertahankan position sizing, batas eksposur, batas kerugian, dan veto yang sudah ada.

### 4.3 Kontrak output

Objek hasil risk assessment perlu membawa informasi yang dibutuhkan oleh tahap eksekusi, termasuk:

- Status approval.
- Alasan penolakan jika ditolak.
- Entry, SL, dan target approval.
- ExecutionPlan tervalidasi.
- Informasi ukuran posisi dan parameter risiko yang relevan.

Rencana parsial tidak boleh mengubah atau menghapus hasil validasi risiko.

Jika ExecutionPlan.kind === "BLOCK", transaksi tidak boleh diteruskan ke jalur pembukaan posisi. Alasan penolakan harus dapat ditelusuri pada log atau telemetry.

### 4.4 Batas tanggung jawab

Risk engine tidak bertugas menjalankan partial close, menghitung ledger, atau memonitor harga setelah posisi dibuka.

Paper execution service juga tidak boleh mengabaikan status approval hanya karena sebuah ExecutionPlan tersedia.

## 5. Layer 3 — Paper Execution Service

### 5.1 Model posisi

Perluasan PaperPosition harus mempertahankan kompatibilitas dengan posisi single-TP yang sudah ada.

Model konseptual:
interface PaperPosition {
entryPrice: number;
stopLoss: number;
takeProfit: number; // legacy / display compatibility
tp1: number | null;
tp1SizePercent: number;
tp1HitAt: number | null;
tp2: number | null;
tp2SizePercent: number;
tp2HitAt: number | null;
positionSize: number;
remainingSize: number;
realizedPnL: number;
// Existing identity, timestamps, status,
// execution metadata and audit fields remain.
}

Definisi final harus disesuaikan dengan tipe aktual repo, penyimpanan posisi, dan konvensi timestamp yang sudah digunakan.

Untuk posisi parsial, remainingSize harus berkurang setiap kali terjadi partial close. Untuk posisi legacy, nilai yang hilang harus ditangani melalui mekanisme kompatibilitas atau migrasi yang teruji.

### 5.2 Partial close handler

Ketika TP1 tercapai:

- Verifikasi bahwa posisi masih terbuka.
- Pastikan TP1 belum pernah dieksekusi.
- Hitung ukuran yang ditutup berdasarkan ukuran posisi awal dan persentase TP1.
- Validasi ukuran terhadap aturan volume.
- Hitung P&L leg TP1.
- Catat event partial close secara atomik.
- Kurangi remainingSize.
- Tambahkan hasil leg ke realizedPnL.
- Simpan timestamp dan status TP1.
- Pertahankan sisa posisi untuk TP2 atau SL.

Jika volume partial tidak valid karena minimum lot atau step size, sistem harus menerapkan kebijakan eksplisit: menolak partial plan sebelum entry atau menggunakan fallback yang telah disetujui. Jangan mengubah ukuran secara diam-diam.

### 5.3 Monitoring TP1, TP2, dan SL

Monitoring harus memperhitungkan:

- TP1 belum tercapai.
- TP1 sudah tercapai dan sisa posisi masih terbuka.
- TP2 tercapai.
- SL tercapai sebelum TP1.
- SL tercapai setelah TP1.
- Posisi sudah selesai.
- Pembaruan harga berulang dan event duplikat.

Jika data harga tidak cukup untuk menentukan urutan TP dan SL yang tersentuh dalam candle yang sama, sistem harus memakai kebijakan konservatif yang terdokumentasi atau data timeframe lebih rendah yang tersedia. Jangan memilih urutan yang memberikan hasil terbaik secara retrospektif.

### 5.4 Ledger event

Tambahkan event partial close mengikuti pola event ledger yang sudah ada, dengan nama TRADE_PARTIALLY_CLOSED jika konsisten dengan enum aktual.

Event minimal mencatat:

- Position/trade ID.
- Leg yang ditutup.
- Harga eksekusi.
- Ukuran yang ditutup.
- P&L leg.
- Sisa ukuran.
- Timestamp.
- Referensi event atau idempotency key.

Pencatatan ledger dan pembaruan ukuran posisi harus konsisten. Event yang sama tidak boleh menghasilkan pengurangan ukuran atau P&L dua kali.

### 5.5 Final close dan P&L

Posisi baru berstatus closed ketika remainingSize mencapai nol atau ketika seluruh sisa posisi ditutup oleh SL atau mekanisme penutupan lain yang sah.

P&L akhir:

- totalRealizedPnL = sum(realizedPnL setiap leg penutupan)

Biaya transaksi harus dialokasikan secara konsisten. Jika biaya dicatat pada tingkat order atau leg, hindari mengurangkannya kembali pada tingkat trade.

Trade record final harus menyediakan hasil agregat, sedangkan ledger mempertahankan detail setiap leg.

## 6. Layer 4 — Configuration dan UI

### 6.1 Konfigurasi

Tambahkan konfigurasi berikut melalui mekanisme default, validation, dan override yang sudah ada:
interface RiskConfig {
minRR: number; // existing baseline: 2.0
minObstacleR: number; // proposed default: 1.0
partialTP1SizePercent: number; // proposed default: 50
}

Ketentuan:

- minObstacleR harus bernilai positif dan <= minRR.
- partialTP1SizePercent harus lebih besar dari 0 dan kurang dari 100 untuk rencana parsial.
- Ukuran TP2 dihitung sebagai sisa alokasi, bukan parameter bebas.
- Default harus konsisten pada runtime, backtest, paper execution, dan test.
- Perubahan konfigurasi harus tervalidasi saat dimuat.

### 6.2 Signal detail

Tampilkan secara terpisah: Entry, Stop loss, Target approval, Execution plan, TP1 dan persentase, TP2 dan persentase, Rasio obstacle dalam R, Alasan block jika ada.

Jangan menampilkan target approval seolah-olah merupakan target penutupan aktual untuk seluruh posisi apabila ExecutionPlan menggunakan partial close.

### 6.3 Open position dan ledger

UI posisi terbuka perlu menunjukkan: Status leg TP1, Status leg TP2, Ukuran awal dan sisa ukuran, P&L terealisasi, P&L belum terealisasi, SL dan target berikutnya, Status lifecycle keseluruhan.

Ledger menampilkan event partial close sebagai aktivitas tersendiri, sementara ringkasan trade menampilkan P&L total tanpa double-count.

## 7. Tahapan Implementasi

### Fase A — Verifikasi baseline

Verifikasi perubahan clearance gate yang sudah dilakukan. Pastikan alasan penolakan lain tetap bekerja. Periksa alur risk assessment hingga paper execution. Catat hasil baseline sebelum implementasi lanjutan.

Deliverable: laporan verifikasi dan daftar jalur veto yang aktif.

### Fase B — Strategy dan Risk Engine

Tambahkan ExecutionPlan. Implementasikan klasifikasi obstacle. Integrasikan rencana ke output risk assessment. Pertahankan validasi risiko dan kontrak eksekusi yang sudah ada. Belum membangun partial close.

Jika paper service masih single-TP, jangan mengirim PARTIAL ke jalur produksi paper seolah-olah sudah didukung. Gunakan feature flag atau kontrak transisi yang eksplisit agar tidak terjadi ketidaksesuaian antara rencana dan kemampuan eksekusi.

Deliverable: strategi menghasilkan rencana yang tervalidasi; jalur eksekusi belum mengklaim dukungan multi-TP.

### Fase C — Multi-TP Paper Execution

Perluas model posisi. Tambahkan partial close handler. Implementasikan monitoring TP1/TP2/SL. Tambahkan ledger event. Implementasikan agregasi P&L. Pastikan kompatibilitas posisi legacy. Perbarui UI setelah kontrak backend stabil.

Deliverable: partial close berjalan end-to-end pada paper trading dengan hasil dan ledger konsisten.

### Fase D — Historical Evaluation

Jalankan baseline dan varian obstacle menggunakan dataset yang sama. Terapkan spread, komisi, slippage, dan swap yang sesuai. Bandingkan hasil per strategi dan rezim jika tersedia. Evaluasi expectancy bersih, profit factor, drawdown, dan hasil per trade dalam R. Gunakan out-of-sample validation sebelum menetapkan parameter.

Deliverable: laporan evaluasi dan rekomendasi parameter berdasarkan bukti.

## 8. Test Matrix Minimum

### Strategy

- Tidak ada obstacle -> FULL_2R.
- Obstacle di bawah 1R -> BLOCK.
- Obstacle tepat 1R -> PARTIAL.
- Obstacle di antara 1R dan 2R -> PARTIAL.
- Obstacle tepat 2R -> FULL_2R.
- Obstacle di atas 2R -> FULL_2R.
- BUY/SELL, invalid obstacle, stop distance nol, dan target eksplisit.

### Risk Engine

- Approval baseline tetap 2R.
- Semua veto risiko existing tetap aktif.
- Rencana BLOCK tidak dapat membuka posisi.
- Rencana yang tidak valid tidak diteruskan.
- ExecutionPlan diteruskan tanpa perubahan makna.

### Paper Execution

- Full close pada TP2.
- Full close pada SL sebelum TP1.
- TP1 partial lalu TP2.
- TP1 partial lalu SL pada sisa posisi.
- Idempotensi TP1 dan ledger.
- TP1 dan SL tersentuh pada candle yang sama.
- Pembulatan ukuran volume.
- Restart/reconnect.
- Posisi legacy single-TP.
- Agregasi P&L dan biaya tanpa double-count.

### Regression

- Typecheck lulus.
- Unit test terkait lulus.
- Test risk dan execution existing lulus.
- Backtest baseline tidak berubah di luar efek yang memang diharapkan.
- Tidak ada perubahan langsung ke master.

## 9. Kriteria Penerimaan

Implementasi dapat dianggap siap untuk evaluasi ketika:

- Setiap kandidat memiliki status dan alasan keputusan yang dapat ditelusuri.
- Approval risk tidak bercampur dengan target parsial.
- Execution plan yang disetujui benar-benar sesuai dengan perilaku paper execution.
- Partial close tidak menghasilkan duplikasi event atau P&L.
- Posisi hanya dinyatakan selesai setelah seluruh ukuran ditutup.
- Posisi legacy tetap dapat dikelola.
- Semua test kritis lulus.
- Hasil historis dilaporkan setelah biaya dan memiliki pemisahan out-of-sample.
- Perubahan tidak di-merge ke master sebelum hasil dievaluasi dan persetujuan diberikan.

## 10. Keputusan yang Belum Dibekukan

- Apakah kebijakan obstacle yang sama diterapkan pada seluruh strategi atau hanya strategi trend/breakout/reversal.
- Bagaimana posisi dengan ukuran terlalu kecil untuk partial close ditangani.
- Kebijakan urutan TP/SL ketika keduanya tersentuh dalam candle yang sama.
- Semantik target eksplisit dari caller.
- Apakah dan kapan strategi reversal boleh menggunakan target struktural berbeda.
- Metrik dan periode minimum untuk menerima perubahan setelah historical evaluation.

Status akhir: desain target untuk ditinjau. Belum merupakan izin untuk mengubah kode atau mengaktifkan partial execution di lingkungan produksi.