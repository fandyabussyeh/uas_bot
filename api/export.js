// api/export.js — ekspor semua log mentah (dilindungi CRON_SECRET) untuk skrip hitung_ulang.
import { upstash } from '../lib/store.mjs'; import { readLogs } from '../lib/tick.mjs';
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  res.status(200).json(await readLogs(upstash()));
}
