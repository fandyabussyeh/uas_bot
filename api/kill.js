// api/kill.js — kill switch tanpa deploy ulang: GET ?on=1 / ?on=0 (dilindungi CRON_SECRET); tercatat di log.
import { upstash } from '../lib/store.mjs';
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const on = String(req.query?.on) === '1', s = upstash(); await s.set('kill', on ? '1' : '0');
  await s.rpush('log:killswitch', JSON.stringify({ ts: new Date().toISOString(), note: on ? 'kill switch DINYALAKAN manual' : 'kill switch DIMATIKAN manual' }));
  res.status(200).json({ kill: on });
}
