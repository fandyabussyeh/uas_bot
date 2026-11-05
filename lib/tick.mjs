// lib/tick.mjs — satu panggilan bot. Dipanggil oleh api/tick.js (produksi) dan tests/test_local.mjs (mock).
import { decide, daily, atr, PARAMS } from './core.mjs';
import { walkBuy, walkSell } from './exec.mjs';
const H4 = 14400;
const rd = async (store, k, d) => { const v = await store.get(k); if (!v) return d; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return d; } };
const push = (store, k, o) => store.rpush('log:' + k, JSON.stringify(o));
export function freshState() { return { cash: 1e8, pos: {}, cool: {}, block: {}, block2: {}, dayBase: null, bought: { key: -1, amt: 0 }, peak: 1e8, lastBar: 0, eqDay: -1, startedAt: null }; }

export async function runTick({ store, api, env = process.env, now = Date.now(), universe, spreads, P = PARAMS }) {
  const t0 = Date.now(), rec = { ts: new Date(now).toISOString(), status: 'start', orders: 0 }, FEE = Number(env.FEE_TAKER || P.FEE), PP = { ...P, FEE };
  const flushErrors = async where => { for (const e of api.errors.splice(0)) await push(store, 'errors', { ts: new Date().toISOString(), where, ...e }); };
  try {
    const st = await rd(store, 'state', freshState());
    const killed = env.KILL_SWITCH === '1' || (await store.get('kill')) === '1';
    const serverT = await api.serverTime(); rec.serverT = serverT;
    const bars = {};
    for (const p of universe) { const raw = await api.bars(p, '240', serverT); bars[p] = raw.filter(b => b.t + H4 <= serverT); }   // buang candle yang masih berjalan
    const ref = bars[universe[0]]; const barT = ref[ref.length - 1].t; rec.barT = barT; rec.barClose = barT + H4; rec.lateSec = Math.round(now / 1000 - (barT + H4));
    if (killed) { rec.status = 'killed'; await push(store, 'killswitch', { ts: rec.ts, barT, note: 'kill switch aktif: tidak ada order' }); await push(store, 'calls', rec); await flushErrors('tick'); return rec; }
    if (barT <= st.lastBar) { rec.status = 'duplicate'; rec.note = 'candle sudah diproses; tidak ada order'; await push(store, 'calls', rec); return rec; }      // idempotency
    if (!(await store.setnx('lock:' + barT, String(now), 900))) { rec.status = 'duplicate_lock'; await push(store, 'calls', rec); return rec; }
    const books = {}, px = {};
    for (const p of universe) { try { const d = await api.depth(p); books[p] = d; if (d.buy.length && d.sell.length) px[p] = { bid: d.buy[0][0], ask: d.sell[0][0] }; } catch (e) { api.errors.push({ url: 'depth/' + p, err: String(e) }); } }
    for (const p of universe) if (!px[p]) px[p] = { bid: 0, ask: 0 };                                        // order book kosong -> core menandai tidak valid
    for (const p of universe) if (px[p].bid > 0) await push(store, 'snapshots', { ts: rec.ts, pair: p, bid: px[p].bid, ask: px[p].ask, spread_pct: (px[p].ask - px[p].bid) / ((px[p].ask + px[p].bid) / 2) * 100, buy: books[p].buy.slice(0, 10), sell: books[p].sell.slice(0, 10) });
    const nowMs = now; if (!st.startedAt) st.startedAt = rec.ts;
    const d = decide({ now: nowMs, bars, st, px, spread: spreads, P: PP });
    await push(store, 'signals', { ts: rec.ts, barT, W: d.W, S: d.S, eq: d.eq, log: d.log });
    for (const o of d.orders) {
      const p = o.pair, bk = books[p], sigPx = bars[p][bars[p].length - 1].c, bid = px[p].bid, ask = px[p].ask, mid = (bid + ask) / 2;
      if (!(bid > 0)) { await push(store, 'orders', { ts: rec.ts, barT, pair: p, side: o.side, status: 'DITOLAK', why: 'order book kosong' }); continue; }
      if (o.side === 'BUY') {
        const n = Math.min(o.notional, st.cash / (1 + FEE)); if (n < PP.MIN_ORDER) { await push(store, 'orders', { ts: rec.ts, barT, pair: p, side: 'BUY', status: 'DITOLAK', why: 'di bawah minimum order / kas kurang', notional: n }); continue; }
        const w = walkBuy(bk.sell, n); if (w.qty <= 0) continue; const fee = w.spent * FEE, q = Math.floor(w.qty * 1e8) / 1e8;
        st.cash -= w.spent + fee; st.bought.amt += w.spent;
        const dd = daily(bars[p]), pos = st.pos[p] || (st.pos[p] = { qty: 0, avgPx: 0, entryT: Math.floor(now / 1000), highClose: sigPx, atrEntry: atr(dd), cost: 0, fees: 0, spr: 0, boughtV: 0, boughtQ: 0 });
        pos.avgPx = (pos.avgPx * pos.qty + w.avg * q) / (pos.qty + q); pos.qty += q; pos.boughtQ += q; pos.boughtV += w.spent; pos.fees += fee; pos.spr += q * (ask - mid) + q * (w.avg - ask);
        await push(store, 'orders', { ts: rec.ts, barT, pair: p, side: 'BUY', status: 'FILL', qty: q, bid, ask, fill: w.avg, fee, notional: w.spent, sigPx, slip_vs_sig_pct: (w.avg / sigPx - 1) * 100, spreadCost: q * (ask - mid), slipCost: q * (w.avg - ask), partial: w.short, reason: o.reason });
        rec.orders++;
      } else {
        const pos = st.pos[p]; if (!pos) continue; const w = walkSell(bk.buy, Math.min(o.qty, pos.qty)); if (w.qty <= 0) continue; const fee = w.proceeds * FEE;
        st.cash += w.proceeds - fee; pos.qty -= w.qty; pos.fees += fee; pos.sold = (pos.sold || 0) + w.proceeds; pos.soldQ = (pos.soldQ || 0) + w.qty; pos.spr += w.qty * (mid - bid) + w.qty * (bid - w.avg);
        await push(store, 'orders', { ts: rec.ts, barT, pair: p, side: 'SELL', status: 'FILL', qty: w.qty, bid, ask, fill: w.avg, fee, notional: w.proceeds, sigPx, slip_vs_sig_pct: (w.avg / sigPx - 1) * 100, spreadCost: w.qty * (mid - bid), slipCost: w.qty * (bid - w.avg), partial: w.short, reason: o.reason });
        rec.orders++;
        if (pos.qty <= 1e-10) {
          const pnl = pos.sold - pos.boughtV - pos.fees; await push(store, 'trades', { pair: p, entry: new Date(pos.entryT * 1000).toISOString(), exit: rec.ts, entryPx: pos.boughtV / pos.boughtQ, exitPx: pos.sold / pos.soldQ, pnl, pct: pnl / (pos.boughtV + 0), fees: pos.fees, spread: pos.spr, why: o.reason });
          delete st.pos[p]; if (o.overlay) { st.cool[p] = (now / 1000 + PP.COOL_H * 3600) * 1000; st.block[p] = true; }
        }
      }
    }
    let eq = st.cash; for (const p of universe) if (st.pos[p] && px[p].bid > 0) eq += st.pos[p].qty * px[p].bid; rec.eq = eq; st.peak = Math.max(st.peak || eq, eq);
    const key = Math.floor((now + 7 * 3600e3) / 864e5); if (st.eqDay !== key) { st.eqDay = key; await push(store, 'equity', { ts: rec.ts, wibDay: new Date(key * 864e5).toISOString().slice(0, 10), eq }); }
    st.lastBar = barT; await store.set('state', JSON.stringify(st)); rec.status = 'processed'; rec.ms = Date.now() - t0;
  } catch (e) { rec.status = 'error'; rec.error = String(e); api.errors.push({ url: 'tick', err: String(e) }); }
  await flushErrors('tick'); await push(store, 'calls', rec); return rec;
}
export async function readLogs(store) {
  const out = {}; for (const k of ['calls', 'orders', 'trades', 'signals', 'equity', 'errors', 'killswitch', 'snapshots']) out[k] = (await store.lrange('log:' + k, 0, -1)).map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } }).filter(Boolean);
  out.state = await rd(store, 'state', null); return out;
}
