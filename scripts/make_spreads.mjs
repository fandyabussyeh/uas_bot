// scripts/make_spreads.mjs — median spread per pasangan dari snapshot mentah -> config/spreads.json (beku saat freeze).
import fs from 'node:fs';
const uni = JSON.parse(fs.readFileSync('config/universe.json', 'utf8')).universe, f = process.argv[2] || 'data/snapshots.jsonl';
const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)), out = {}, rep = {};
for (const p of uni) {
  const v = rows.filter(r => r.pair === p).map(r => r.spread_pct / 100).sort((a, b) => a - b), m = v.length ? v[Math.floor(v.length / 2)] : 0.005;
  out[p] = Number((v.length >= 5 ? Math.max(m, 0.0002) : Math.max(m, 0.003)).toFixed(6)); rep[p] = { n: v.length, median_pct: Number((m * 100).toFixed(4)), dipakai_pct: Number((out[p] * 100).toFixed(4)), catatan: v.length >= 5 ? '' : 'snapshot <5: dipakai minimal 0,30% (konservatif)' };
}
fs.writeFileSync('config/spreads.json', JSON.stringify(out)); fs.writeFileSync('config/spreads_report.json', JSON.stringify(rep, null, 1)); console.table(rep);
