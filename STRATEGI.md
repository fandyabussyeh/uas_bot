# Strategi: Cohort Momentum Crypto (long-only, dry run Indodax)
Dokumen ini dibekukan saat freeze (isi hash commit & waktu di README). Kode acuan: `lib/core.mjs` (dipakai identik oleh backtest dan bot).

## Identitas & modal
[ISI nama / NIM / kelas]. Modal virtual Rp100.000.000. Long-only, tanpa short/margin/leverage. Timeframe: keputusan cohort dari candle 1D yang dibentuk dari 6 candle 4H (hari UTC); bot dipanggil tiap candle 4H tertutup (menit ke-7).

## Universe (8 pasangan IDR) — `config/universe.json`
BTC, XRP, ETH, DOGE, TRX, BNB, ADA, SOL. Kriteria diukur pada AWAL backtest (4 Nov 2023): (1) median nilai transaksi harian 90 hari sebelumnya tertinggi, (2) data >=95% hari, (3) bukan stablecoin, (4) median spread snapshot <=1% (VELO gugur: 4,5%; SOL peringkat 9 masuk), (5) masih diperdagangkan saat freeze. Survivorship bias: 292 pasangan belum listing pada awal backtest, STIK & ARB gugur karena data <95%, dan pasangan yang sudah delisting tidak tercakup -> hasil cenderung optimis.

## Aturan
1. **Skor momentum** (tiap hari, 00.00 UTC): untuk J in {7,14,30,60} hari: r_J = ln(C_t/C_{t-J}); z_J = r_J/(σ_J·√J), σ_J = stdev return harian J hari terakhir.
2. **Gerbang absolut per koin (pengganti filter pasar):** koin eligible hanya bila r_J > 0. Tidak ada filter indeks.
3. **Cohort:** urutkan eligible menurut z_J; ambil n = clamp(round(0,4 x jumlah_eligible), 1, 3) teratas; bobot ∝ 1/σ_30 (dinormalisasi).
4. **Portofolio (J,K):** rata-rata K cohort harian terakhir, K in {7,14,21}. **Ensemble** = rata-rata 12 portofolio -> bobot mentah W_i dan skor_i = (jumlah portofolio yang memuat koin i)/12.
5. **Target:** w_i = min(CAP=20%, W_i).
6. **Time-guard:** masuk bila w_i >= 6% ekuitas; keluar penuh bila w_i < 2%; minimum hold 48 jam (penyesuaian/penutupan oleh cohort ditahan sebelum itu); cooldown 72 jam setelah keluar karena overlay (overlay OFF).
7. **Fee-guard:** (a) hurdle masuk: skor_i x σ_harian x √14 > 3 x RT, RT = 2 x fee + 2 x spread; (b) band rebalance: |w_target − w_sekarang| > max(20% x w_target, 1,5% ekuitas); (c) pembelian <= 15% ekuitas per hari WIB; (d) minimum order Rp25.000.
8. **Risiko:** maks 6 posisi; cap 20% per posisi; daily loss limit 3% terhadap ekuitas 00.00 WIB (hanya menahan pembelian baru); kill switch (env `KILL_SWITCH`, key Redis `kill`, endpoint `/api/kill`); retry API maks 3x; idempotency per candle (kunci `lastBar` + lock Redis).
9. **Eksekusi:** beli di ask, jual di bid dari order book live, habiskan level berikutnya (rata-rata tertimbang). Posisi dinilai pada best bid. Dilarang fill di mid/close. Backtest: fill di open bar berikutnya ± (setengah spread terukur + slippage 0,05%).

## Parameter beku (tidak dioptimasi; ditetapkan a priori) — lihat `PARAMS` di `lib/core.mjs`
J {7,14,30,60}; K {7,14,21}; SEL 0,4 (1–3 koin); CAP 20%; H_IN 6% / H_OUT 2%; MIN_HOLD 48 jam; COOL 72 jam; HURDLE 3; BAND 20% & 1,5%; TURN_CAP 15%; MAXPOS 6; DLL 3%; MIN_ORDER Rp25.000; FEE = env `FEE_TAKER` (default 0,5%/sisi = asumsi konservatif; isi dari /api/pairs & halaman biaya, pakai yang lebih mahal).

## Modul diuji dan DITOLAK (kode ada, OFF) — bukti: `out/backtest_out.json`, `out/v2_out.json`, `out/mr_out.json`
Overlay chandelier/stop volatilitas (trade 56 -> 260, CAGR 23,9% -> 17,0%); time-stop 10 hari (124 dari 197 trade, rata-rata -2,45%, CAGR ~1%); voting sideways ADX/CHOP/ER (42,8% -> 32,3% pada UTAMA); keluar cepat z7, rem portofolio ekuitas, CAP 15%/NMAX 4 (tidak lolos aturan terima); sleeve mean-reversion sideways (PF 0,48). Total ±45 run backtest dicoba: konfigurasi UTAMA dipilih IN-SAMPLE setelah melihat hasil.

## Perubahan dari versi UTS
Rebalancing bulanan -> cohort harian + evaluasi 4 jam; J,K dalam bulan -> hari; 10% teratas dari 100 saham -> 40% (1–3) dari koin eligible; filter tren pasar 4 saklar (indeks) DIHAPUS -> gerbang absolut per koin; bobot sama -> bobot invers-volatilitas; ditambah time-guard & fee-guard.

## Hasil backtest acuan (4 Nov 2023 – 4 Nov 2026, fee 0,5%/sisi)
Lihat `out/backtest_out.json` dan dashboard. UTAMA: CAGR 42,8%, MDD −25,6%, 69 trade; in-sample (s/d Okt 2025) 79,9%, out-of-sample (Nov 2025–Nov 2026) −9,3% saat BTC −22,8%. 5 trade terbaik = 88% laba. Hasil sangat bergantung pada pasar naik 2024.

## Sumber tarif & minimum order (WAJIB diisi sebelum freeze)
| Item | Nilai | URL | Tanggal akses |
|---|---|---|---|
| trade_fee_percent_taker (/api/pairs), pasangan IDR | 0,2% | https://indodax.com/api/pairs | 2026-11-07 |
| All-in-Fee taker akun (termasuk komponen biaya yang berlaku) | [CEK Profile & Pengaturan akun; berlaku setelah perubahan 1 Okt 2026] | https://help.indodax.com/hc/id/articles/4416646599705-Rincian-Biaya-Transaksi-di-INDODAX | 2026-11-07 |
| Dipakai dalam model saat ini | 0,5% per sisi (default konservatif; belum dapat dipastikan lebih tinggi dari All-in-Fee akun sampai nilai akun diverifikasi) | | 2026-11-07 |
| Minimum order INDODAX Pro | Rp25.000 (Rp10.000 melalui Lite) | https://help.indodax.com/hc/id/articles/4416646599705-Rincian-Biaya-Transaksi-di-INDODAX | 2026-11-07 |
