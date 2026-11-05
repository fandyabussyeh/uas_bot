// lib/exec.mjs — eksekusi simulasi (dry run) terhadap order book sungguhan: beli di ask, jual di bid, habiskan level berikutnya.
export function walkBuy(sell, notional) {
  let rem = notional, q = 0, spent = 0;
  for (const [p, v] of sell) { const take = Math.min(rem, p * v); if (take <= 0) break; q += take / p; spent += take; rem -= take; if (rem <= 1e-9) break; }
  return { qty: q, spent, avg: q > 0 ? spent / q : NaN, short: rem > 1e-6 };
}
export function walkSell(buy, qty) {
  let rem = qty, got = 0, sold = 0;
  for (const [p, v] of buy) { const take = Math.min(rem, v); if (take <= 0) break; sold += take; got += take * p; rem -= take; if (rem <= 1e-12) break; }
  return { qty: sold, proceeds: got, avg: sold > 0 ? got / sold : NaN, short: rem > 1e-9 };
}
