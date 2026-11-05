// lib/indodax.mjs — klien API publik Indodax (tanpa API key). Retry terbatas + timeout.
const BASE = 'https://indodax.com';
export function makeApi({ errors = [], fetchImpl = globalThis.fetch } = {}) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getJson(url, { tries = 3, timeout = 10000 } = {}) {
    let last;
    for (let i = 0; i < tries; i++) {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), timeout);
      try {
        const r = await fetchImpl(url, { signal: ac.signal }); clearTimeout(tm);
        if (r.status === 429 || r.status >= 500) { last = new Error('HTTP ' + r.status); errors.push({ url, err: String(last), attempt: i + 1 }); await sleep(1000 * 2 ** i); continue; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json(); if (j == null || (Array.isArray(j) && j.length === 0)) { last = new Error('respons kosong'); errors.push({ url, err: 'respons kosong', attempt: i + 1 }); await sleep(500 * 2 ** i); continue; }
        return j;
      } catch (e) { clearTimeout(tm); last = e; errors.push({ url, err: String(e), attempt: i + 1 }); await sleep(1000 * 2 ** i); }
    }
    throw last;
  }
  return {
    errors,
    async serverTime() { const j = await getJson(BASE + '/api/server_time'); const t = Number(j.server_time); return t > 1e12 ? Math.floor(t / 1000) : t; },
    async bars(sym, tf, toSec) {
      const j = await getJson(`${BASE}/tradingview/history_v2?symbol=${sym}&tf=${tf}&from=${toSec - 700 * 14400}&to=${toSec}`);
      return j.map(r => ({ t: Number(r.Time) > 1e12 ? Math.floor(Number(r.Time) / 1000) : Number(r.Time), o: +r.Open, h: +r.High, l: +r.Low, c: +r.Close, v: +r.Volume })).sort((a, b) => a.t - b.t);
    },
    async depth(sym) { const d = await getJson(`${BASE}/api/depth/${sym.toLowerCase()}`); return { buy: (d.buy || []).map(x => [+x[0], +x[1]]), sell: (d.sell || []).map(x => [+x[0], +x[1]]) }; },
  };
}
