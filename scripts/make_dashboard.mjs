// scripts/make_dashboard.mjs — membangun dashboard HTML OFFLINE mandiri dari log & hasil hitung_ulang. Semua angka berasal dari out/*.json.
// Pakai: node scripts/make_dashboard.mjs [logs.json] [hasil_forward.json]
import fs from 'node:fs';
const Lf = process.argv[2] || 'out/logs.json', Rf = process.argv[3] || 'out/hasil_forward.json';
const L = JSON.parse(fs.readFileSync(Lf, 'utf8')), F = JSON.parse(fs.readFileSync(Rf, 'utf8')), B = JSON.parse(fs.readFileSync('out/backtest_out.json', 'utf8'));
const slim = { orders: L.orders, trades: L.trades, errors: L.errors, killswitch: L.killswitch, equity: L.equity, calls: L.calls.map(({ ts, status, barT, lateSec, eq, orders, error, note }) => ({ ts, status, barT, lateSec, eq, orders, error, note })) };
const data = JSON.stringify({ L: slim, F, B: { runs: B.runs, equity_daily: B.equity_daily, window: B.window, params: B.params, bh: B.bh, universe: B.universe_main, spreads: B.spreads } });
const html = fs.readFileSync(new URL('./dashboard_template.html', import.meta.url), 'utf8').replace('__DATA__', () => data.replace(/</g, '\\u003c'));
fs.writeFileSync('out/dashboard.html', html); console.log('Tulis out/dashboard.html', (html.length / 1e6).toFixed(2), 'MB');
