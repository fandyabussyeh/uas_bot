// scripts/hitung_ulang.mjs — menghasilkan ulang SEMUA angka forward test dari log mentah.
// Pakai: node scripts/hitung_ulang.mjs out/logs.json   (logs.json = hasil GET /api/export). Butuh data/*_240.csv sampai akhir jendela untuk replay backtest.
import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const H4 = 14400, f6 = x => Number(x.toFixed(6));
const sum = a => a.reduce((s, x) => s + x, 0);
function mdd(e) { let pk = -Infinity, m = 0; for (const v of e) { pk = Math.max(pk, v); m = Math.min(m, v / pk - 1); } return m; }
export async function compute(L, { replay = true, fee = Number(process.env.FEE_TAKER || 0.005) } = {}) {
  const calls = L.calls, proc = calls.filter(c => c.status === 'processed').sort((a, b) => a.barT - b.barT), R = { fee };
  if (!proc.length) return { error: 'tidak ada panggilan terproses' };
  const eq = [1e8, ...proc.map(c => c.eq)]; R.mulai = proc[0].ts; R.akhir = proc[proc.length - 1].ts; R.candle_pertama = proc[0].barT; R.candle_terakhir = proc[proc.length - 1].barT;
  R.forward = { ret: eq[eq.length - 1] / 1e8 - 1, mdd: mdd(eq), eq_akhir: eq[eq.length - 1], n_titik: eq.length };
  const T = L.trades, w = T.filter(t => t.pnl > 0), l = T.filter(t => t.pnl <= 0), fills = L.orders.filter(o => o.status === 'FILL');
  const fees = sum(fills.map(o => o.fee)), sp = sum(fills.map(o => o.spreadCost)), sl = sum(fills.map(o => o.slipCost)), net = eq[eq.length - 1] - 1e8, gross = net + fees + sp + sl;
  R.trade = { n: T.length, win: T.length ? w.length / T.length : null, avgWin: w.length ? sum(w.map(t => t.pct)) / w.length : null, avgLoss: l.length ? sum(l.map(t => t.pct)) / l.length : null, pf: l.length && sum(l.map(t => t.pnl)) < 0 ? sum(w.map(t => t.pnl)) / -sum(l.map(t => t.pnl)) : null, pnl: sum(T.map(t => t.pnl)),
    terbuka: Object.entries(L.state?.pos || {}).map(([p, x]) => ({ pair: p, qty: x.qty, avgPx: x.avgPx })) };
  R.biaya = { fee: fees, spread: sp, slippage: sl, total: fees + sp + sl, laba_kotor: gross, porsi: gross > 0 ? (fees + sp + sl) / gross : null, n_fill: fills.length, n_ditolak: L.orders.filter(o => o.status === 'DITOLAK').length };
  // benchmark buy&hold BTC/IDR: beli di ask snapshot pertama, nilai di bid snapshot terakhir, fee di kedua sisi
  const sn = L.snapshots.filter(s => s.pair === 'BTCIDR');
  if (sn.length > 1) { const a = sn[0].ask * (1 + fee), b = sn[sn.length - 1].bid * (1 - fee); R.benchmark = { ret: b / a - 1, dari: sn[0].ts, sampai: sn[sn.length - 1].ts }; }
  // operasional: uptime = candle terproses sebelum candle berikutnya tutup / jumlah candle
  const nCandle = (R.candle_terakhir - R.candle_pertama) / H4 + 1, ok = new Set(proc.filter(c => c.lateSec <= H4).map(c => c.barT));
  R.ops = { candle_total: nCandle, candle_tepat_waktu: ok.size, uptime: ok.size / nCandle, panggilan_total: calls.length, duplikat: calls.filter(c => c.status.startsWith('duplicate')).length, killed: calls.filter(c => c.status === 'killed').length, error_panggilan: calls.filter(c => c.status === 'error').length,
    error_api: L.errors.length, kill_switch_log: L.killswitch.length, telat_median_detik: [...proc.map(c => c.lateSec)].sort((a, b) => a - b)[Math.floor(proc.length / 2)], telat_maks_detik: Math.max(...proc.map(c => c.lateSec)) };
  R.kurva_forward = [[proc[0].barT, 1e8], ...proc.map(c => [c.barT + H4, c.eq])];
  try { const SP = JSON.parse(fs.readFileSync('config/spreads.json', 'utf8')); R.spread = {}; for (const p of Object.keys(SP)) { const v = L.snapshots.filter(s => s.pair === p).map(s => s.spread_pct / 100).sort((a, b) => a - b); R.spread[p] = { dipakai_backtest: SP[p], median_semua_snapshot: v.length ? v[Math.floor(v.length / 2)] : null, n_snapshot: v.length }; } } catch { }
  R.equity_harian = L.equity.map(e => ({ hari_wib: e.wibDay, eq: e.eq }));
  if (replay) {
    const bt = await import('../lib/bt.mjs'), sig = [];
    const r = bt.run(bt.UNI, {}, 1, R.candle_pertama, R.candle_terakhir + H4 + 1, fee, sig), m = bt.metrics(r), botSig = L.signals;
    let match = 0; const mism = []; const bm = new Map(sig.map(s => [s.barT, s]));
    const botOrd = {}; fills.forEach(o => (botOrd[o.barT] = botOrd[o.barT] || []).push(o.pair + o.side));
    for (const s of botSig) {
      const b = bm.get(s.barT); if (!b) { mism.push({ barT: s.barT, why: 'replay tidak punya bar ini' }); continue; }
      const wOk = Object.keys(s.W).every(p => Math.abs(s.W[p] - b.W[p]) < 1e-9 && Math.abs(s.S[p] - b.S[p]) < 1e-9);
      const bo = (botOrd[s.barT] || []).sort().join(), ro = b.orders.map(o => o.pair + o.side).sort().join(), oOk = bo === ro || true; // order bot bisa ditolak (min order/kas): dibandingkan terpisah
      if (wOk) match++; else mism.push({ barT: s.barT, why: 'bobot/skor berbeda' });
    }
    const ordMatch = []; for (const o of fills) { const rr = r.orderLog.find(x => x.t === o.barT + H4 && x.pair === o.pair && x.side === o.side); ordMatch.push({ pair: o.pair, side: o.side, barT: o.barT, ada_di_replay: !!rr, fill_bot: o.fill, fill_replay: rr?.fill ?? null, selisih_pct: rr ? (o.fill / rr.fill - 1) * 100 : null, slip_vs_sinyal_pct: o.slip_vs_sig_pct }); }
    R.replay = { bar_dibandingkan: botSig.length, bar_cocok: match, kecocokan_sinyal: botSig.length ? match / botSig.length : null, mismatch: mism, order_bot: fills.length, order_ada_di_replay: ordMatch.filter(x => x.ada_di_replay).length, selisih_fill: ordMatch,
      backtest_jendela: { ret: m.ret, mdd: m.mdd, n_trade: m.N }, gap_return: R.forward.ret - m.ret, gap_mdd: R.forward.mdd - m.mdd };
  }
  return R;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const L = JSON.parse(fs.readFileSync(process.argv[2] || 'out/logs.json', 'utf8')); const R = await compute(L);
  fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/hasil_forward.json', JSON.stringify(R, null, 1));
  const p = x => x == null ? 'n/a' : (x * 100).toFixed(2) + '%'; console.log('Forward: return', p(R.forward.ret), 'MDD', p(R.forward.mdd), '| trade', R.trade.n, 'win', p(R.trade.win), 'PF', R.trade.pf?.toFixed(2), '| porsi biaya', p(R.biaya.porsi), '| uptime', p(R.ops.uptime), '| BTC B&H', p(R.benchmark?.ret));
  if (R.replay) console.log('Replay: kecocokan sinyal', p(R.replay.kecocokan_sinyal), `(${R.replay.bar_cocok}/${R.replay.bar_dibandingkan})`, '| backtest jendela', p(R.replay.backtest_jendela.ret), '| gap', p(R.replay.gap_return));
  console.log('Tulis: out/hasil_forward.json');
}
