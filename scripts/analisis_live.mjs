// analisis_live.mjs — ringkasan kinerja forward test dari log live (sementara; hitung_ulang resmi pakai versi commit beku). Jalankan: node scripts/analisis_live.mjs
import fs from 'node:fs';
const H4 = 14400;
const L = JSON.parse(fs.readFileSync('out/live.json', 'utf8'));
const proc = L.calls.filter(c => c.status === 'processed').sort((a, b) => a.barT - b.barT);
const first = proc[0].barT, last = L.state.lastBar;
const n = Math.round((last - first) / H4) + 1;
const seen = new Map(proc.map(p => [p.barT, p]));
const ok = [], miss = [], late = [];
for (let t = first; t <= last; t += H4) {
  const p = seen.get(t);
  if (!p) miss.push(new Date(t * 1000).toISOString().slice(0, 13));
  else if (p.lateSec <= H4) ok.push(p);
  else late.push(p);
}
const eq = [1e8, ...proc.map(p => p.eq)];
let peak = 1e8, mdd = 0;
for (const e of eq) { peak = Math.max(peak, e); mdd = Math.min(mdd, e / peak - 1); }
const f = (x, n = 2) => (x * 100).toFixed(n) + '%';
console.log('=== RINGKASAN FORWARD TEST (live) ===');
console.log('Waktu mulai (tick pertama):', proc[0].ts, '| bar', proc[0].barT);
console.log('Panggilan total:', L.calls.length, '| processed:', proc.length, '| duplicate:', L.calls.filter(c => c.status.startsWith('duplicate')).length, '| error:', L.calls.filter(c => c.status === 'error').length);
console.log(`Candle: total=${n} tepat_waktu=${ok.length} hilang=${miss.length} telat_di_ambang=${late.length}`);
console.log(f(ok.length / n, 1), 'UPTIME', miss.length ? '| hilang: ' + miss.join(', ') : '');
console.log('Ekuitas akhir: Rp', Math.round(eq[eq.length - 1]).toLocaleString('en-US'));
console.log('Return total:', f(eq[eq.length - 1] / 1e8 - 1, 3), '| Max DD:', f(mdd, 3));
console.log('Order:', L.orders.length, '(fill', L.orders.filter(o => o.status === 'FILL').length, ', ditolak', L.orders.filter(o => o.status === 'DITOLAK').length, ') | trade tertutup:', L.trades.length);
console.log('Error API:', L.errors.length, '| kill switch:', L.killswitch.length);
console.log('Posisi terbuka:', L.state.pos ? Object.entries(L.state.pos).map(([p, x]) => p + ' qty=' + x.qty).join(' | ') : 'tidak ada');
console.log('Late median/maks (detik):', Math.round(proc.map(p => p.lateSec).sort((a, b) => a - b)[Math.floor(proc.length / 2)]), '/', Math.max(...proc.map(p => p.lateSec)));
console.log('\nEkuitas harian (WIB):');
for (const e of L.equity) console.log(' ', e.wibDay, 'Rp', Math.round(e.eq).toLocaleString('en-US'));
console.log('\n5 tick terakhir:');
for (const p of proc.slice(-5)) console.log(' ', p.ts, 'bar', p.barT, 'late', p.lateSec + 's', 'eq', Math.round(p.eq));
