// api/public.js — data log untuk dashboard publik (read-only, tanpa secret). Angka dihitung di sisi klien dari log ini.
import { upstash } from '../lib/store.mjs'; import { readLogs } from '../lib/tick.mjs';
export default async function handler(req, res) { const L = await readLogs(upstash()); delete L.snapshots; res.setHeader('Cache-Control', 's-maxage=60'); res.status(200).json(L); }
