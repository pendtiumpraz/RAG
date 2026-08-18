# Dataroom — Visualisasi Data (Backlog & Assessment)

Ringkasan visual untuk dua tab Dataroom agar penilaian & sisa pekerjaan
terbaca sekilas, bukan sebagai tabel/teks panjang. Semua SVG/CSS murni —
tanpa pustaka chart baru — dan memakai token warna brand yang sudah ada
(`src/app/nalar-ds.css`): Royal Blue = `--signal`, Amber = `--source`,
Merah = `--danger`, Hijau = `--good-mark`.

**Tidak ada data yang diubah.** Sumbernya tetap `assessment.ts` (statis) dan
API backlog (`/api/admin/backlog`). Yang berubah hanya cara menampilkannya.

## Assessment (`page.tsx` → `AssessmentView`, `Gauge`)

- **Cincin skor (radial gauge) SVG** untuk KESELURUHAN + tiap dimensi.
  Busur terisi sepanjang `skor/10`; warnanya mengikuti pita kesiapan:
  ≥8 baik (biru) · 6–7,9 waspada (amber) · <6 bahaya (merah).
- **Kartu KESELURUHAN** memakai varian `dark` (latar navy): cincin besar +
  angka besar + delta vs `PREV` (`↑ dari 8,7`) + ringkas jumlah dimensi/area.
- **Tiap kartu dimensi** menampilkan cincin skor, label, lalu meta
  **`N area · rata-rata X,X`** (rata-rata dihitung dari `areas[].score`).
- **Baris area** tetap ada tapi batangnya kini **diwarnai pita kesiapan**
  (bukan selalu biru), dan seluruh baris punya `title="Celah: …"` sebagai
  tooltip di samping teks celah yang tetap tampil.

`Gauge` murni SVG (`viewBox`), jadi tajam di segala ukuran dan aman dicetak
(tab Assessment tetap tercetak sebagai laporan potret).

## Backlog (`Kanban.tsx` → panel `.kb-stats` di atas papan)

Menggantikan batang tunggal lama dengan tiga sudut pandang, semuanya
dihitung dari **track aktif** (`byTrack`) dan **ikut hidup** saat kartu
dipindah karena bersumber dari state papan yang sama:

1. **Kemajuan** — batang bertumpuk status (Selesai / Berjalan / Belum) +
   legenda berangka. Celah 2px antar segmen (ring permukaan).
2. **Prioritas** — sebaran P0–P3 sebagai mini-bar, tiap prioritas berwarna
   sendiri (P0 merah, P1 amber, P2 biru, P3 abu).
3. **Dimensi** — sebaran UI/UX · Agentic · Feature · Launching sebagai
   mini-bar. **Barisnya sekaligus tombol saring** (klik = filter papan,
   klik lagi = lepas) — menyatu dengan saringan dimensi yang sudah ada,
   jadi tak ada kendali ganda.

Fungsi kanban tidak disentuh: seret-lepas, tombol ←/→, nomor antrean, dan
sinkronisasi status ke server tetap seperti semula.

## Alur uji

Dataroom (khusus superadmin):

- Tab **Assessment** → cincin skor per dimensi + KESELURUHAN prominen; baris
  area berwarna pita kesiapan dengan tooltip celah.
- Tab **Backlog** → panel statistik di atas kanban (kemajuan/prioritas/
  dimensi); klik baris dimensi untuk menyaring papan.

## Verifikasi

- `npx tsc --noEmit` — bersih.
- `npm run build` — sukses.
- `npm test` — 988 lulus, 1 gagal **pra-ada** (`tests/a11y-interaksi.test.ts`
  menandai `<label>` polos di `src/app/plugin/page.tsx`, di luar tugas ini;
  gagal juga pada pohon bersih sebelum perubahan).
