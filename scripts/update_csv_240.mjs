// scripts/update_csv_240.mjs — menambah candle 4H terbaru untuk universe BEKU.
// TIDAK mengunduh ulang data historis (hanya menambah bar baru sejak bar terakhir di CSV),
// sehingga hasil backtest beku (out/backtest_out.json) tidak berubah.
// Dipakai saat pengumpulan agar replay backtest pada jendela forward test punya candle yang sama.
// Perbaikan OPERASIONAL pasca-freeze: tidak mengubah aturan/parameter/universe.
import fs from 'node:fs';
const BASE = 'https://indodax.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cfg = JSON.parse(fs.readFileSync('config/universe.json', 'utf8'));
const uni = cfg.universe;
const sec = t => { t = Number(t); return t > 1e12 ? Math.floor(t / 1000) : t; };
const norm = x => Array.isArray(x) ? x.map(r => ({ t: sec(r.Time), o: Number(r.Open), h: Number(r.High), l: Number(r.Low), c: Number(r.Close), v: Number(r.Volume) })).filter(r => isFinite(r.t) && r.t > 0) : [];
let chain = Promise.resolve();
function get(url, tries = 5) {
  return new Promise(res => {
    chain = chain.then(async () => {
      let out = null;
      for (let i = 0; i < tries; i++) {
        try {
          const r = await fetch(url);
          if (r.status === 429 || r.status >= 500) { console.log('HTTP', r.status, url); await sleep(5000 * (i + 1)); continue; }
          if (!r.ok) { console.log('HTTP', r.status, url); break; }
          out = await r.json(); break;
        } catch (e) { console.log('ERR', String(e)); await sleep(3000 * (i + 1)); }
      }
      await sleep(600);                       // <= 2 request/detik, tidak paralel
      res(out);
    });
  });
}
const iso = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
for (const p of uni) {
  const f = `${p}_240.csv`;
  if (!fs.existsSync(f)) { console.log('LEWAT', p, '- CSV tidak ada'); continue; }
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  const all = new Map();
  for (const l of lines.slice(1)) { const c = l.split(','); const t = Number(c[0]); if (isFinite(t)) all.set(t, { t, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] }); }
  const lastTs = Math.max(...all.keys());
  let to = Math.floor(Date.now() / 1000), stuck = 0, added = 0;
  while (to > lastTs && stuck < 3) {
    const rows = norm(await get(`${BASE}/tradingview/history_v2?symbol=${p}&tf=240&from=${lastTs}&to=${to}`));
    if (!rows.length) { stuck++; continue; }
    const t0 = Math.min(...rows.map(r => r.t));
    for (const r of rows) if (!all.has(r.t)) { all.set(r.t, r); added++; }
    stuck = t0 <= lastTs ? 0 : stuck + 1;
    to = t0 - 1;
  }
  const arr = [...all.values()].sort((a, b) => a.t - b.t);
  fs.writeFileSync(f, 'time,open,high,low,close,volume\n' + arr.map(r => [r.t, r.o, r.h, r.l, r.c, r.v].join(',')).join('\n'));
  console.log('OK', p, '| tambah', added, '| total', arr.length, '| akhir', iso(arr[arr.length - 1].t));
}
console.log('SELESAI');
