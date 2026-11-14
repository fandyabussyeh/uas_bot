// scripts/gabung_snapshot.mjs — menggabungkan snapshot order bookcollected di laptop (masa persiapan)
// ke dalam log mentah out/logs.json sebagai array `snapshots_laptop`.
// TUJUAN: tabel perbandingan spread memakai SELURUH snapshot (persiapan + forward test),
// dan semua angka tetap bisa dihitung ulang dari satu file log mentah.
// Perbaikan OPERASIONAL pasca-freeze: tidak mengubah aturan/parameter/universe.
import fs from 'node:fs';
const Lf = process.argv[2] || 'out/logs.json', Sf = process.argv[3] || 'data/snapshots.jsonl';
const L = JSON.parse(fs.readFileSync(Lf, 'utf8'));
const raw = fs.readFileSync(Sf, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
const snaps = [];
for (const l of raw) { try { const s = JSON.parse(l); if (s && s.pair && typeof s.spread_pct === 'number') snaps.push(s); } catch { } }
const seen = new Set((L.snapshots || []).map(s => s.ts + '|' + s.pair));
const fresh = snaps.filter(s => !seen.has(s.ts + '|' + s.pair));
L.snapshots_laptop = snaps;
L.snapshot_ringkasan = { bot: (L.snapshots || []).length, laptop: snaps.length, laptop_baru: fresh.length, total: (L.snapshots || []).length + snaps.length };
fs.writeFileSync(Lf, JSON.stringify(L));
console.log('Gabung snapshot -> bot', (L.snapshots || []).length, '| laptop', snaps.length, '| total', L.snapshot_ringkasan.total);
