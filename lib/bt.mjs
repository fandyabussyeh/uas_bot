// lib/bt.mjs — mesin backtest. MEMAKAI decide() yang SAMA dengan bot (lib/core.mjs).
import fs from 'node:fs';
import { PARAMS, decide, daily, atr } from './core.mjs';
export { PARAMS };
export const DIR = process.env.DATA_DIR || (fs.existsSync('data/BTCIDR_240.csv') ? 'data' : '.'), H4 = 14400;
const cfg = JSON.parse(fs.readFileSync('config/universe.json', 'utf8'));
export const UNI = cfg.universe;
export const SP = JSON.parse(fs.readFileSync('config/spreads.json', 'utf8'));          // spread beku (median snapshot), sama dengan yang dipakai bot
export const START = Date.parse(process.env.BT_START || '2023-11-04T00:00:00Z') / 1000;
function load(p) {
  const L = fs.readFileSync(`${DIR}/${p}_240.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(',').map(Number));
  return L.slice(0, -1).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));      // buang bar terakhir (mungkin belum tertutup)
}
export const DATA = {}; for (const p of UNI) DATA[p] = load(p);
export const SLIP = 0.0005;
export function run(universe, over = {}, costMult = 1, t0 = START, t1 = Infinity, feeOver, sigOut) {
  const P = { ...PARAMS, ...over }; if (feeOver) P.FEE = feeOver;
  const ts = DATA[universe[0]].map(b => b.t).filter(t => t >= t0 - 650 * H4 && t < t1);
  const idx = {}; for (const p of universe) { idx[p] = new Map(DATA[p].map((b, i) => [b.t, i])); }
  const st = { cash: 1e8, pos: {}, cool: {}, block: {}, dayBase: null, bought: { key: -1, amt: 0 } };
  const eqS = [], trades = [], cost = { fee: 0, spread: 0, slip: 0 }; let turnover = 0; const open = {};
  const orderLog = [];
  for (let k = 0; k < ts.length - 1; k++) {
    const t = ts[k]; if (t < t0) continue; const tn = ts[k + 1];
    const bars = {}, px = {}, spread = {};
    for (const p of universe) {
      const i = idx[p].get(t); if (i == null) continue; bars[p] = DATA[p].slice(Math.max(0, i - 649), i + 1);
      const hs = SP[p] * costMult / 2, c = DATA[p][i].c; px[p] = { bid: c * (1 - hs), ask: c * (1 + hs) }; spread[p] = SP[p] * costMult;
    }
    const now = (t + H4) * 1000 + 7 * 60e3;
    const d = decide({ now, bars, st, px, spread, P });
    if (sigOut) sigOut.push({ barT: t, W: d.W, S: d.S, orders: d.orders.map(o => ({ pair: o.pair, side: o.side })) });
    for (const o of d.orders) {
      const p = o.pair, i = idx[p].get(tn); if (i == null) continue; const b = DATA[p][i]; if (!(b.v > 0)) { orderLog.push({ t, pair: p, ev: 'GAGAL fill: bar eksekusi volume 0' }); continue; }
      const hs = SP[p] * costMult / 2, sl = SLIP * costMult;
      if (o.side === 'BUY') {
        const fill = b.o * (1 + hs + sl), n = Math.min(o.notional, st.cash / (1 + P.FEE)); if (n < P.MIN_ORDER) continue;
        const qty = n / fill, fee = n * P.FEE; st.cash -= n + fee; cost.fee += fee; cost.spread += qty * b.o * hs; cost.slip += qty * b.o * sl; turnover += n; st.bought.amt += n;
        let pos = st.pos[p];
        if (!pos) { const dd = daily(DATA[p].slice(Math.max(0, DATA[p].findIndex(x => x.t === t) - 649), DATA[p].findIndex(x => x.t === t) + 1)); pos = st.pos[p] = { qty: 0, avgPx: 0, entryT: tn, highClose: fill, atrEntry: atr(dd), cost: 0, fees: 0, sp: 0, sold: 0, soldQ: 0, boughtQ: 0, boughtV: 0, maxQ: 0 }; }
        pos.avgPx = (pos.avgPx * pos.qty + fill * qty) / (pos.qty + qty); pos.qty += qty; pos.boughtQ += qty; pos.boughtV += fill * qty; pos.fees += fee; pos.sp += qty * b.o * (hs + sl); pos.maxQ = Math.max(pos.maxQ, pos.qty);
        orderLog.push({ t: tn, pair: p, side: 'BUY', qty, fill, notional: n, fee, bid: b.o * (1 - hs), ask: b.o * (1 + hs), reason: o.reason });
      } else {
        const pos = st.pos[p]; if (!pos) continue; const qty = Math.min(o.qty, pos.qty), fill = b.o * (1 - hs - sl), gross = qty * fill, fee = gross * P.FEE;
        st.cash += gross - fee; cost.fee += fee; cost.spread += qty * b.o * hs; cost.slip += qty * b.o * sl; pos.fees += fee; pos.sp += qty * b.o * (hs + sl); pos.sold += gross; pos.soldQ += qty; pos.qty -= qty; turnover += gross;
        orderLog.push({ t: tn, pair: p, side: 'SELL', qty, fill, notional: gross, fee, reason: o.reason });
        if (pos.qty <= 1e-12) {
          const pnl = pos.sold - pos.boughtV - pos.fees; trades.push({ pair: p, entry: pos.entryT, exit: tn, entryPx: pos.boughtV / pos.boughtQ, exitPx: pos.sold / pos.soldQ, pnl, pct: pnl / (pos.boughtV + 0), fees: pos.fees, spread: pos.sp, why: o.reason });
          delete st.pos[p]; if (o.overlay) { st.cool[p] = (tn + P.COOL_H * 3600) * 1000; st.block[p] = true; }
        }
      }
    }
    // equity: tutup bar eksekusi (tn) dinilai pada bid
    let eq = st.cash, inv = 0; for (const p of universe) { const pos = st.pos[p]; if (!pos) continue; const i = idx[p].get(tn); if (i == null) continue; const v = pos.qty * DATA[p][i].c * (1 - SP[p] * costMult / 2); eq += v; inv += v; }
    eqS.push({ t: tn, eq, inv });
  }
  return { eqS, trades, cost, turnover, orderLog, st, P };
}
export function metrics(r, t0 = START) {
  const e = r.eqS.map(x => x.eq), yrs = (r.eqS[r.eqS.length - 1].t - r.eqS[0].t) / (365.25 * 86400);
  let pk = 1e8, mdd = 0; for (const v of e) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  const w = r.trades.filter(t => t.pnl > 0), l = r.trades.filter(t => t.pnl <= 0), S = a => a.reduce((s, x) => s + x, 0);
  const net = e[e.length - 1] - 1e8, costs = r.cost.fee + r.cost.spread + r.cost.slip, gross = net + costs;
  const byY = {}; let prev = 1e8, py = null; r.eqS.forEach((x, i) => { const y = new Date(x.t * 1000).getUTCFullYear(); if (py !== null && y !== py) { byY[py] = byY[py] || 0; } py = y; byY[y] = x.eq; });
  const ys = Object.keys(byY).sort(); const yret = {}; let pv = 1e8; ys.forEach(y => { yret[y] = byY[y] / pv - 1; pv = byY[y]; });
  return { ret: e[e.length - 1] / 1e8 - 1, cagr: Math.pow(e[e.length - 1] / 1e8, 1 / yrs) - 1, mdd, N: r.trades.length, win: w.length / Math.max(1, r.trades.length), avgW: w.length ? S(w.map(t => t.pct)) / w.length : 0, avgL: l.length ? S(l.map(t => t.pct)) / l.length : 0,
    pf: l.length ? S(w.map(t => t.pnl)) / -S(l.map(t => t.pnl)) : Infinity, costShare: gross > 0 ? costs / gross : NaN, cost: r.cost, expo: S(r.eqS.map(x => x.inv / x.eq)) / r.eqS.length, turnYr: r.turnover / 1e8 / yrs, yret, end: e[e.length - 1], yrs };
}
export function bh(pair = 'BTCIDR', costMult = 1) {
  const ts = DATA[pair].filter(b => b.t >= START), hs = SP[pair] * costMult / 2, b0 = ts[0].o * (1 + hs + SLIP * costMult), q = 1e8 / (1 + PARAMS.FEE) / b0;
  let pk = 0, mdd = 0; for (const b of ts) { const v = q * b.c * (1 - hs); pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  const end = q * ts[ts.length - 1].c * (1 - hs) * (1 - PARAMS.FEE), yrs = (ts[ts.length - 1].t - ts[0].t) / (365.25 * 86400);
  return { ret: end / 1e8 - 1, cagr: Math.pow(end / 1e8, 1 / yrs) - 1, mdd };
}
