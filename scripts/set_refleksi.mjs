// scripts/set_refleksi.mjs — menyisipkan isi refleksi (scripts/refleksi.html) ke template dashboard.
// Dipakai agar teks refleksi bisa diperbarui tanpa menyunting HTML besar secara manual.
// Perbaikan OPERASIONAL pasca-freeze: hanya isi laporan, tidak mengubah logika bot.
import fs from 'node:fs';
const tplPath = process.argv[2] || 'scripts/dashboard_template.html';
const refPath = process.argv[3] || 'scripts/refleksi.html';
let tpl = fs.readFileSync(tplPath, 'utf8');
const ref = fs.readFileSync(refPath, 'utf8').trim();
const start = tpl.indexOf('[ISI refleksi');
if (start < 0) { console.log('Placeholder [ISI refleksi] tidak ditemukan — tidak diubah.'); process.exit(0); }
const end = tpl.indexOf('</div>', start);
if (end < 0) { console.log('Penutup </div> tidak ditemukan.'); process.exit(1); }
tpl = tpl.slice(0, start) + ref + tpl.slice(end);
fs.writeFileSync(tplPath, tpl);
console.log('Refleksi disisipkan ke', tplPath, '| panjang total', tpl.length);
