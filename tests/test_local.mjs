// tests/test_local.mjs — uji lokal dengan Indodax TIRUAN (data candle asli dari CSV, order book sintetis). Bukan pengganti uji nyata di Vercel.
import fs from 'node:fs';
import { makeApi } from '../lib/indodax.mjs'; import { runTick, readLogs, freshState } from '../lib/tick.mjs'; import { memory } from '../lib/store.mjs'; import { compute } from '../scripts/hitung_ulang.mjs';
const H4 = 14400, uni = JSON.parse(fs.readFileSync('config/universe.json', 'utf8')).universe, spreads = JSON.parse(fs.readFileSync('config/spreads.json', 'utf8'));
const CSV = {}; for (const p of uni) CSV[p] = fs.readFileSync(`data/${p}_240.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(',').map(Number)).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
let clock = 0, failNext = 0, depthEmpty = null;
const mock = () => ({ errors: [], async serverTime() { if (failNext > 0) { failNext--; this.errors.push({ url: 'server_time', err: 'timeout (mock)' }); if (failNext >= 0 && failNext < 2) { /* retry berhasil */ } } return clock; },
  async bars(p, tf, to) { const a = CSV[p].filter(b => b.t <= to && b.t >= to - 700 * H4); const run = a[a.length - 1]; return a.map(b => ({ ...b })); },   // termasuk candle yang sedang berjalan sebagai elemen terakhir
  async depth(p) { if (depthEmpty === p) return { buy: [], sell: [] }; const i = CSV[p].findIndex(b => b.t === Math.floor(clock / H4) * H4); const mid = CSV[p][i].o, hs = spreads[p] / 2, big = 5e8 / mid;
    return { buy: [0, 1, 2, 3, 4].map(k => [mid * (1 - hs - k * 0.0005), big]), sell: [0, 1, 2, 3, 4].map(k => [mid * (1 + hs + k * 0.0005), big]) }; } });
const store = memory(), env = { CRON_SECRET: 'x', FEE_TAKER: '0.005' };
const t0 = Math.floor(Date.parse('2024-10-24T12:00:00Z') / 1000 / H4) * H4; let fail = 0; const checks = [];
const ok = (n, c, d = '') => { checks.push([n, c]); console.log((c ? 'LOLOS ' : 'GAGAL ') + n, d); };
for (let k = 0; k < 60; k++) {                                              // 10 hari x 6 candle
  const barClose = t0 + k * H4, late = (k === 20 ? 25 * 60 : 7 * 60); clock = barClose + late;
  if (k === 7) continue;                                                    // penjadwal terlewat: candle ini tidak diproses tepat waktu
  if (k === 12) failNext = 1;                                               // error API sementara (harus di-retry)
  if (k === 30) env.KILL_SWITCH = '1'; if (k === 32) env.KILL_SWITCH = '0';
  depthEmpty = k === 40 ? 'ADAIDR' : null;
  if (k === 45) { const s = JSON.parse(await store.get('state')); s.dayBase = { key: Math.floor((clock * 1000 + 7 * 3600e3) / 864e5), eq: s.cash * 5 + 5e8 }; await store.set('state', JSON.stringify(s)); }
  const api = mock(); const r = await runTick({ store, api, env, now: clock * 1000, universe: uni, spreads });
  if (k === 5) { const r2 = await runTick({ store, api: mock(), env, now: (clock + 60) * 1000, universe: uni, spreads }); ok('idempotency: panggilan kedua untuk candle sama tidak memproses ulang', r2.status === 'duplicate' && r2.orders === 0, r2.status); }
  if (k === 30) ok('kill switch: tidak ada order saat aktif', r.status === 'killed');
}
const L = await readLogs(store);
ok('daily loss limit: tercatat & tidak ada pembelian baru', L.signals.some(s => s.log.some(x => x.ev === 'DAILY_LOSS_LIMIT')) && L.orders.filter(o => o.barT === t0 + 45 * H4 - H4 + 0 && o.side === 'BUY' && o.status === 'FILL').length === 0);
{ let n = 0; const flaky = async () => { n++; if (n < 3) return { ok: false, status: 503, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ server_time: 1730000000000 }) }; };
  const a = makeApi({ fetchImpl: flaky }); const st = await a.serverTime(); ok('retry terbatas: sukses setelah 2 kegagalan HTTP 503', st === 1730000000 && a.errors.length === 2, `percobaan=${n}`);
  let m = 0; const bad = async () => { m++; return { ok: false, status: 500, json: async () => ({}) }; }; const a2 = makeApi({ fetchImpl: bad }); let thrown = false; try { await a2.serverTime(); } catch { thrown = true; } ok('retry dibatasi 3 kali lalu melempar error', thrown && m === 3, `percobaan=${m}`);
  const empty = async () => ({ ok: true, status: 200, json: async () => ([]) }); const a3 = makeApi({ fetchImpl: empty }); let th3 = false; try { await a3.bars('BTCIDR', '240', 1730000000); } catch { th3 = true; } ok('respons kosong ditangani (dicatat, lalu error)', th3 && a3.errors.length === 3); }
ok('semua panggilan tercatat', L.calls.length >= 59, `${L.calls.length} panggilan`);
ok('order tercatat dengan bid/ask & selisih thd harga sinyal', L.orders.filter(o => o.status === 'FILL').every(o => o.bid > 0 && o.ask > 0 && isFinite(o.slip_vs_sig_pct)), `${L.orders.length} order`);
ok('beli di/atas ask, jual di/bawah bid (tidak di mid)', L.orders.filter(o => o.status === 'FILL').every(o => o.side === 'BUY' ? o.fill >= o.ask * 0.999999 : o.fill <= o.bid * 1.000001));
ok('retry API tercatat di log error', L.errors.length >= 1, `${L.errors.length} error`);
ok('kill switch tercatat di log', L.killswitch.length >= 1);
ok('candle berjalan tidak dipakai (barT selalu candle tertutup)', L.calls.filter(c => c.status === 'processed').every(c => c.barT + H4 <= c.serverT));
const R = await compute(L);
console.log('Forward (mock): return', (R.forward.ret * 100).toFixed(2) + '%', '| MDD', (R.forward.mdd * 100).toFixed(2) + '%', '| trade', R.trade.n, '| uptime', (R.ops.uptime * 100).toFixed(1) + '%', `(${R.ops.candle_tepat_waktu}/${R.ops.candle_total})`);
ok('uptime dihitung dari log (1 candle terlewat + 1 telat tetap tepat waktu)', R.ops.candle_total === 60 && R.ops.candle_tepat_waktu >= 57, `${R.ops.candle_tepat_waktu}/${R.ops.candle_total}`);
ok('kecocokan sinyal bot vs replay backtest = 100%', R.replay.kecocokan_sinyal === 1, `${R.replay.bar_cocok}/${R.replay.bar_dibandingkan}`);
console.log('Selisih fill bot vs replay (%):', R.replay.selisih_fill.slice(0, 6).map(x => x.selisih_pct == null ? 'n/a' : x.selisih_pct.toFixed(3)).join(', '));
fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/logs_mock.json', JSON.stringify(L)); fs.writeFileSync('out/hasil_forward_mock.json', JSON.stringify(R, null, 1));
console.log(checks.every(c => c[1]) ? '\nSEMUA UJI LOLOS' : '\nADA UJI GAGAL');
