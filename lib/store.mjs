// lib/store.mjs — penyimpanan persisten: Upstash Redis (REST) di produksi, memori untuk uji lokal.
export function upstash(url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN) {
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL/TOKEN belum diisi');
  const cmd = async (...a) => { const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(a) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.result; };
  return { get: k => cmd('GET', k), set: (k, v) => cmd('SET', k, v), rpush: (k, v) => cmd('RPUSH', k, v), lrange: (k, a, b) => cmd('LRANGE', k, a, b), setnx: (k, v, ex) => cmd('SET', k, v, 'NX', 'EX', ex).then(x => x === 'OK') };
}
export function memory() {
  const m = new Map(), l = new Map();
  return { get: async k => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); return 'OK'; }, rpush: async (k, v) => { (l.get(k) || l.set(k, []).get(k)).push(v); return 1; },
    lrange: async (k, a, b) => (l.get(k) || []).slice(a, b === -1 ? undefined : b + 1), setnx: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; }, _m: m, _l: l };
}
