// api/tick.js — endpoint bot (dipanggil penjadwal). Wajib header: Authorization: Bearer <CRON_SECRET>
import fs from 'node:fs'; import path from 'node:path';
import { makeApi } from '../lib/indodax.mjs'; import { upstash } from '../lib/store.mjs'; import { runTick } from '../lib/tick.mjs';
const cfg = f => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', f), 'utf8'));
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const universe = cfg('universe.json').universe, spreads = cfg('spreads.json');
  const out = await runTick({ store: upstash(), api: makeApi(), universe, spreads });
  res.status(200).json(out);
}
