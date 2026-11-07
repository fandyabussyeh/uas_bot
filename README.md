# Bot Dry Run Indodax di Vercel — UAS Algorithmic Trading
Strategi: lihat `STRATEGI.md`. Dry run: semua order disimulasikan terhadap order book publik Indodax; **tidak ada API key, tidak ada uang sungguhan**.

## Struktur
`lib/core.mjs` fungsi sinyal & keputusan (dipakai backtest DAN bot) · `lib/tick.mjs` satu panggilan bot · `api/tick.js` endpoint terlindungi `CRON_SECRET` · `api/export.js` ekspor log · `api/kill.js` kill switch · `api/public.js`+`public/index.html` dashboard Vercel · `scripts/` backtest, hitung_ulang, dashboard offline, snapshot, spread · `tests/test_local.mjs` uji lokal dengan Indodax tiruan · `.github/workflows/tick.yml` penjadwal.

## Langkah (urut)
1. **Persiapan:** Node.js 18+, akun GitHub, Vercel (Hobby), Upstash Redis. `git init`, buat repositori GitHub PUBLIK. Jangan pernah commit `.env`.
2. **Data (laptop):** simpan candle 4H 8 pasangan ke `data/<PAIR>_240.csv` (kolom `time,open,high,low,close,volume`, bar terakhir dibuang bila belum tertutup) dan jalankan `node scripts/snapshot_universe.mjs` terus-menerus (snapshot -> `data/snapshots.jsonl`).
3. `node scripts/make_spreads.mjs` -> `config/spreads.json` (median spread terukur; dibekukan saat freeze). `FEE_TAKER` isi dari /api/pairs & halaman biaya (pakai yang lebih mahal), catat di `STRATEGI.md`.
4. `node scripts/run_report.mjs` -> `out/backtest_out.json` (backtest >=3 tahun). `node tests/test_local.mjs` harus **SEMUA UJI LOLOS**.
5. **Upstash:** buat database Redis; salin REST URL & token. **Vercel:** import repositori; Environment Variables: `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `FEE_TAKER`. Deploy.
6. **Uji koneksi dari Vercel (sebelum freeze):** `curl -H "Authorization: Bearer <CRON_SECRET>" https://<proyek>.vercel.app/api/tick` -> harus mengembalikan JSON `status: processed` (atau `duplicate`). Jika Indodax tidak bisa diakses dari Vercel, laporkan ke dosen sebelum freeze.
7. **GitHub Actions:** Settings > Secrets: `CRON_SECRET`, `TICK_URL` (= `https://<proyek>.vercel.app/api/tick`). Workflow memanggil menit ke-7 dan ke-22 tiap candle 4H (panggilan kedua idempotent).
8. **FREEZE:** baseline strategi `466bf39` pada 2026-11-07 07:54 WIB. Smoke test koneksi manual pukul 07:35 WIB (status `processed`) mendahului freeze; hitung forward test 10 hari dari pemanggilan cron terjadwal setelah freeze. **Jangan ubah aturan/parameter/universe, jangan force-push.** Bug fix yang tidak mengubah aturan dicatat.
9. **Forward test:** soal meminta 10 hari; untuk tenggat 14 Nov disepakati 7 hari. Catat sebagai deviasi dan jangan klaim 10 hari. Mulai hitung dari tick cron pertama yang berhasil setelah reset state. Kill switch: `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<proyek>.vercel.app/api/kill?on=1"` (matikan dengan `on=0`); tercatat di log.
10. **Akhir:** `curl -H "Authorization: Bearer <CRON_SECRET>" https://<proyek>.vercel.app/api/export > out/logs.json`; unduh candle 4H sampai akhir jendela ke `data/`; `node scripts/hitung_ulang.mjs out/logs.json` -> `out/hasil_forward.json`; `node scripts/make_dashboard.mjs` -> `out/dashboard.html` (offline). Tulis refleksi di dashboard.

## Yang BELUM diuji
Uji lokal memakai Indodax tiruan (candle asli dari CSV, order book sintetis). Belum diuji nyata: format respons `server_time`, akses Indodax dari Vercel, Upstash, GitHub Actions. Lakukan langkah 6 sebelum freeze.

## Keamanan
Token/secret hanya di environment variable (.env di `.gitignore`); `.env.example` tanpa isi rahasia. Semua endpoint selain `/api/public` butuh `Authorization: Bearer <CRON_SECRET>`.
