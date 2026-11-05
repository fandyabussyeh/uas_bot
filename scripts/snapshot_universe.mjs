// scripts/snapshot_universe.mjs — pengumpul snapshot order book dari laptop (sebelum/selama forward test). Ctrl+C untuk berhenti.
import fs from 'node:fs';
const uni = JSON.parse(fs.readFileSync('config/universe.json', 'utf8')).universe, sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('data', { recursive: true }); console.log('Mencatat snapshot:', uni.join(', '));
while (true) {
  for (const p of uni) {
    try {
      const d = await (await fetch(`https://indodax.com/api/depth/${p.toLowerCase()}`)).json(); if (!d.buy?.length || !d.sell?.length) throw new Error('order book kosong');
      const bid = Number(d.buy[0][0]), ask = Number(d.sell[0][0]);
      fs.appendFileSync('data/snapshots.jsonl', JSON.stringify({ ts: new Date().toISOString(), pair: p, bid, ask, spread_pct: (ask - bid) / ((ask + bid) / 2) * 100, buy: d.buy.slice(0, 20), sell: d.sell.slice(0, 20) }) + '\n');
    } catch (e) { fs.appendFileSync('data/snapshots_errors.log', `${new Date().toISOString()} ${p} ${e}\n`); }
    await sleep(500);
  }
  await sleep(600000);
}
