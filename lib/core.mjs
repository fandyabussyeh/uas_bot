// core.mjs — FUNGSI SINYAL & KEPUTUSAN. Dipakai identik oleh backtest.mjs dan bot (api/tick.js).
export const PARAMS = {
  J: [7, 14, 30, 60], K: [7, 14, 21], SEL: 0.4, NMIN: 1, NMAX: 3,
  ADX: 20, CHOP: 61.8, ER: 0.25, SW_CUT: 0.5,
  K_ATR: 3.5, M_SIG: 4, TIME_DAYS: 10,
  MIN_HOLD_H: 48, COOL_H: 72, H_IN: 0.06, H_OUT: 0.02,
  HURDLE: 3, BAND_REL: 0.2, BAND_ABS: 0.015, TURN_CAP: 0.15,
  RESET: false, TIMESTOP: false, FASTEXIT: false, Z7: -1.5, REENTRY2: false, BRAKE: false, BR_LO: 0.05, BR_HI: 0.15, BR_MIN: 0.5, MAXPOS: 6, CAP: 0.20, DLL: 0.03, MIN_ORDER: 25000, FEE: 0.005, MAX_SPREAD: 0.02,
  // Konfigurasi hasil ablation (lihat laporan): overlay & sideways DIIMPLEMENTASIKAN tetapi OFF karena menurunkan hasil backtest.
  GATE: true, OVERLAY: false, SIDEWAYS: false, FEEGUARD: true, TIMEGUARD: true,
};
const H4 = 4 * 3600, DAY = 86400;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** bars: [{t(sec, awal bar), o,h,l,c,v}] hanya bar TERTUTUP, urut naik. Mengembalikan hari-hari lengkap (6 bar). */
export function daily(bars) {
  const days = new Map();
  for (const b of bars) { const d = b.t - (b.t % DAY); (days.get(d) || days.set(d, []).get(d)).push(b); }
  return [...days.entries()].sort((a, b) => a[0] - b[0]).filter(([, x]) => x.length === 6)
    .map(([d, x]) => ({ d, o: x[0].o, h: Math.max(...x.map(r => r.h)), l: Math.min(...x.map(r => r.l)), c: x[5].c, v: x.reduce((s, r) => s + r.v, 0) }));
}
const lr = (a, b) => Math.log(a / b);
export function atr(D, n = 14) {            // Wilder ATR harian (harga)
  if (D.length < n + 1) return NaN;
  const tr = D.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - D[i - 1].c), Math.abs(x.l - D[i - 1].c)) : x.h - x.l);
  let a = mean(tr.slice(1, n + 1)); for (let i = n + 1; i < D.length; i++) a = (a * (n - 1) + tr[i]) / n; return a;
}
function adx(D, n = 14) {
  if (D.length < 2 * n + 2) return NaN;
  const tr = [], pd = [], md = [];
  for (let i = 1; i < D.length; i++) {
    const up = D[i].h - D[i - 1].h, dn = D[i - 1].l - D[i].l;
    tr.push(Math.max(D[i].h - D[i].l, Math.abs(D[i].h - D[i - 1].c), Math.abs(D[i].l - D[i - 1].c)));
    pd.push(up > dn && up > 0 ? up : 0); md.push(dn > up && dn > 0 ? dn : 0);
  }
  let t = tr.slice(0, n).reduce((s, x) => s + x), p = pd.slice(0, n).reduce((s, x) => s + x), m = md.slice(0, n).reduce((s, x) => s + x);
  const dx = [];
  for (let i = n; i <= tr.length; i++) {
    if (i > n) { t = t - t / n + tr[i - 1]; p = p - p / n + pd[i - 1]; m = m - m / n + md[i - 1]; }
    const pi = 100 * p / t, mi = 100 * m / t; dx.push(pi + mi === 0 ? 0 : 100 * Math.abs(pi - mi) / (pi + mi));
  }
  let a = mean(dx.slice(0, n)); for (let i = n; i < dx.length; i++) a = (a * (n - 1) + dx[i]) / n; return a;
}
function chop(D, n = 14) {
  if (D.length < n + 1) return NaN; const w = D.slice(-n);
  const trs = w.map((x, i) => { const pc = D[D.length - n + i - 1].c; return Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)); });
  const rng = Math.max(...w.map(x => x.h)) - Math.min(...w.map(x => x.l));
  return rng > 0 ? 100 * Math.log10(trs.reduce((s, x) => s + x, 0) / rng) / Math.log10(n) : NaN;
}
function er(D, n = 30) {
  if (D.length < n + 1) return NaN; const w = D.slice(-(n + 1)); let p = 0;
  for (let i = 1; i < w.length; i++) p += Math.abs(w[i].c - w[i - 1].c); return p > 0 ? Math.abs(w[n].c - w[0].c) / p : NaN;
}
export function sidewaysFlag(D, P) {
  let n = 0; const a = adx(D), c = chop(D), e = er(D);
  if (a < P.ADX) n++; if (c > P.CHOP) n++; if (e < P.ER) n++;
  return { n, sideways: n >= 2, adx: a, chop: c, er: e };
}
/** cohort momentum di hari ke-e (indeks array harian) untuk lookback J. DD = {pair: daily[]}, align via tanggal */
function cohort(DD, e, J, P) {
  const rows = [];
  for (const [p, D] of Object.entries(DD)) {
    const i = D.findIndex(x => x.d === e); if (i < 0 || i - Math.max(J, 30) < 0) continue;
    const rets = []; for (let k = i - J + 1; k <= i; k++) rets.push(lr(D[k].c, D[k - 1].c));
    const s = sd(rets); if (!(s > 0)) continue;
    const r = lr(D[i].c, D[i - J].c); const s30 = sd(D.slice(i - 29, i + 1).map((x, k, a2) => k ? lr(x.c, a2[k - 1].c) : null).slice(1));
    // s30 memakai 29 return dalam jendela 30 hari; cukup konsisten & identik di backtest dan bot
    rows.push({ p, z: r / (s * Math.sqrt(J)), elig: P.GATE ? r > 0 : true, s30 });
  }
  const el = rows.filter(x => x.elig && x.s30 > 0).sort((a, b) => b.z - a.z);
  const n = Math.min(P.NMAX, Math.max(P.NMIN, Math.round(P.SEL * el.length)));
  const top = el.slice(0, el.length ? n : 0); const tw = top.reduce((s, x) => s + 1 / x.s30, 0), out = {};
  top.forEach(x => out[x.p] = 1 / x.s30 / tw); return out;
}
const rawCache = new Map();
/** Bobot ensemble mentah + skor per koin pada hari lengkap terakhir. */
export function rawWeights(DD, P) {
  const pairs = Object.keys(DD).sort(), last = Math.max(...pairs.map(p => DD[p].length ? DD[p][DD[p].length - 1].d : 0));
  const key = last + '|' + pairs.join() + JSON.stringify([P.J, P.K, P.SEL, P.GATE, P.NMAX]); if (rawCache.has(key)) return rawCache.get(key);
  const W = {}, S = {}; pairs.forEach(p => { W[p] = 0; S[p] = 0; });
  const maxK = Math.max(...P.K), cs = {};
  for (const J of P.J) for (let k = 0; k < maxK; k++) cs[J + '|' + k] = cohort(DD, last - k * DAY, J, P);
  let np = 0;
  for (const J of P.J) for (const K of P.K) {
    np++; const pw = {}; for (let k = 0; k < K; k++) for (const [p, w] of Object.entries(cs[J + '|' + k])) pw[p] = (pw[p] || 0) + w / K;
    for (const p of pairs) { W[p] += (pw[p] || 0); if (pw[p] > 0) S[p] += 1; }
  }
  pairs.forEach(p => { W[p] /= np; S[p] /= np; });
  const res = { W, S, last }; if (rawCache.size > 50) rawCache.clear(); rawCache.set(key, res); return res;
}
/**
 * ctx: { now(ms), bars:{pair:[closed 4h]}, st:{cash,pos,cool,dayBase,bought}, px:{pair:{bid,ask}}, spread:{pair:frac}, P }
 * Mengembalikan { orders:[{pair,side,notional|qty,reason}], log:[...] }. Tidak melakukan I/O.
 */
export function decide(ctx) {
  const { now, bars, st, px, spread } = ctx, P = ctx.P, log = [], orders = [], pairs = Object.keys(bars).sort();
  const eq = st.cash + pairs.reduce((s, p) => s + (st.pos[p] ? st.pos[p].qty * px[p].bid : 0), 0);
  const key = Math.floor((now + 7 * 3600e3) / 864e5);                           // hari WIB (ganti 00.00 WIB)
  if (!st.dayBase || st.dayBase.key !== key) { st.dayBase = { key, eq }; st.bought = { key, amt: 0 }; }
  st.peak = Math.max(st.peak || eq, eq); const ddn = 1 - eq / st.peak;
  const brakeM = P.BRAKE ? (ddn <= P.BR_LO ? 1 : ddn >= P.BR_HI ? P.BR_MIN : 1 - (1 - P.BR_MIN) * (ddn - P.BR_LO) / (P.BR_HI - P.BR_LO)) : 1;
  const blockBuys = eq < st.dayBase.eq * (1 - P.DLL); if (blockBuys) log.push({ ev: 'DAILY_LOSS_LIMIT', eq, base: st.dayBase.eq });
  const DD = {}, last = {}, info = {};
  for (const p of pairs) {
    const b = bars[p]; DD[p] = daily(b); last[p] = b[b.length - 1];
    let ok = true, why = '';
    if (!b.length || (now / 1000 - (last[p].t + H4)) > 2 * H4) { ok = false; why = 'candle terakhir terlalu tua'; }
    else if (b.slice(-180).some((x, i, a) => i && x.t - a[i - 1].t !== H4)) { ok = false; why = 'candle hilang di jendela'; }
    else if (!(last[p].c > 0) || !(last[p].v > 0)) { ok = false; why = 'harga/volume nol'; }
    else if (!(px[p].bid > 0 && px[p].ask > 0)) { ok = false; why = 'order book kosong'; }
    else if ((px[p].ask - px[p].bid) / ((px[p].ask + px[p].bid) / 2) > P.MAX_SPREAD) { ok = false; why = 'spread > 2%'; }
    info[p] = { ok, why };
  }
  const { W, S } = rawWeights(DD, P);
  let buyBudget = P.FEEGUARD ? P.TURN_CAP * eq - (st.bought.amt || 0) : Infinity, npos = Object.keys(st.pos).length;
  const sells = [], buys = [];
  for (const p of pairs) {
    const D = DD[p], cur = st.pos[p], ls = last[p], sp = spread[p] || 0.003;
    const sw = P.SIDEWAYS && D.length ? sidewaysFlag(D, P) : { n: 0, sideways: false };
    const A = atr(D), curW = cur ? cur.qty * px[p].bid / eq : 0;
    // ---- overlay exit (dievaluasi tiap bar 4H tertutup)
    if (cur && P.OVERLAY) {
      cur.highClose = Math.max(cur.highClose || 0, ls.c);
      const prev = bars[p][bars[p].length - 2], r1 = prev ? Math.log(ls.c / prev.c) : 0;
      const rr = bars[p].slice(-181, -1).map((x, i, a) => i ? Math.log(x.c / a[i - 1].c) : null).slice(1), s4 = sd(rr);
      const ageD = (now / 1000 - cur.entryT) / DAY;
      let why = null;
      if (A > 0 && ls.c < cur.highClose - P.K_ATR * A) why = 'OVERLAY chandelier';
      else if (s4 > 0 && r1 < -P.M_SIG * s4) why = 'OVERLAY stop volatilitas';
      else if (P.TIMESTOP && ageD >= P.TIME_DAYS && ls.c - cur.avgPx < 1 * (cur.atrEntry || A)) why = 'OVERLAY time stop';
      if (why) { sells.push({ pair: p, side: 'SELL', qty: cur.qty, reason: why, overlay: true }); continue; }
    }
    if (cur && P.FASTEXIT && D.length > 8) {
      const i = D.length - 1, rets = []; for (let k = i - 6; k <= i; k++) rets.push(Math.log(D[k].c / D[k - 1].c)); const s7 = sd(rets), z7 = Math.log(D[i].c / D[i - 7].c) / (s7 * Math.sqrt(7));
      if (s7 > 0 && z7 < P.Z7) { sells.push({ pair: p, side: 'SELL', qty: cur.qty, reason: 'FAST EXIT z7=' + z7.toFixed(2), overlay: false }); if (!st.block2) st.block2 = {}; st.block2[p] = true; continue; }
    }
    const raw = W[p] || 0, wt = Math.min(P.CAP, raw * (sw.sideways ? P.SW_CUT : 1) * brakeM);
    const ageH = cur ? (now / 1000 - cur.entryT) / 3600 : 1e9;
    if (cur) {
      const canAdj = !P.TIMEGUARD || ageH >= P.MIN_HOLD_H;
      if (canAdj && wt < (P.TIMEGUARD ? P.H_OUT : 1e-9)) { sells.push({ pair: p, side: 'SELL', qty: cur.qty, reason: 'cohort exit (bobot target < ambang)' }); continue; }
      const band = P.FEEGUARD ? Math.max(P.BAND_REL * wt, P.BAND_ABS) : 0, dw = wt - curW;
      if (canAdj && Math.abs(dw) > band && wt >= (P.TIMEGUARD ? P.H_OUT : 0)) {
        const nt = Math.abs(dw) * eq;
        if (dw < 0 && nt >= P.MIN_ORDER) sells.push({ pair: p, side: 'SELL', qty: Math.min(cur.qty, nt / px[p].bid), reason: 'rebalance turun' });
        else if (dw > 0 && !blockBuys && info[p].ok && nt >= P.MIN_ORDER) buys.push({ pair: p, side: 'BUY', notional: nt, reason: 'rebalance naik' });
      }
      continue;
    }
    // ---- entri baru
    const why = [];
    if (wt < (P.TIMEGUARD ? P.H_IN : 1e-9)) why.push('bobot < ambang masuk');
    if (sw.sideways) why.push('sideways ' + sw.n + '/3');
    if (st.cool[p] && now < st.cool[p]) why.push('cooldown');
    if (P.REENTRY2 && st.block2 && st.block2[p]) { if (wt < P.H_OUT) st.block2[p] = 'low'; if (st.block2[p] !== 'low') why.push('menunggu sinyal segar'); }
    if (P.RESET && st.block && st.block[p]) { if ((S[p] || 0) === 0) st.block[p] = false; else why.push('menunggu reset sinyal (keluar via overlay)'); }
    if (!info[p].ok) why.push('data tidak valid: ' + info[p].why);
    if (blockBuys) why.push('daily loss limit');
    if (npos >= P.MAXPOS) why.push('maks posisi');
    const sig = D.length > 31 ? sd(D.slice(-31).map((x, i, a) => i ? Math.log(x.c / a[i - 1].c) : null).slice(1)) : NaN;
    if (P.FEEGUARD && !((S[p] || 0) * sig * Math.sqrt(14) > P.HURDLE * (2 * P.FEE + 2 * sp))) why.push('hurdle biaya');
    if (wt > 0 || raw > 0) log.push({ ev: 'ENTRY_CHECK', pair: p, raw, wt, score: S[p], sw: sw.n, blocked: why });
    if (!why.length) { if (st.block2) st.block2[p] = false; buys.push({ pair: p, side: 'BUY', notional: wt * eq, reason: 'entri cohort', wt }); npos++; }
  }
  for (const s of sells) orders.push(s);
  buys.sort((a, b) => b.notional - a.notional);
  for (const b of buys) {
    let n = Math.min(b.notional, buyBudget); if (n < P.MIN_ORDER) { log.push({ ev: 'SKIP_MIN_ORDER_OR_TURNOVER', pair: b.pair, notional: b.notional }); continue; }
    buyBudget -= n; orders.push({ ...b, notional: n });
  }
  return { orders, log, eq, W, S };
}
