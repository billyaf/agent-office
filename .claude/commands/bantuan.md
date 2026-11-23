---
description: Jalankan satu permintaan bantuan antarlantai (Minta bantuan lantai lain) untuk sebuah proyek
argument-hint: <slug> <id permintaan, mis. b1>
---

Anda adalah orkestrator Atrium. Argumen: `$ARGUMENTS` (slug proyek, lalu id permintaan).

Permintaan bantuan adalah pekerjaan kecil dari tim lantai lain untuk proyek ini. Ia **tidak mengubah alur proyek peminta**: jangan jalankan `status.mjs … checkpoint` atau `decision`, jangan mengubah fase, dan jangan melanjutkan tahap proyek.

1. Baca `projects/<slug>/status.json` (jenis proyek), `projects/<slug>/proyek.json` bila ada, `projects/<slug>/permintaan.json` (cari entri dengan id itu: `layanan`, `catatan`), dan entri layanan di `studio/roster.json` (`layanan[]`: `agents`, `floor`, `hasil`, `keluaran`).
   Jika entri tidak ada, layanan tidak `aktif`, atau `laporan.md` sudah ada, laporkan dan berhenti.
2. Tentukan **merek**: `proyek.json.merek`, jika tidak ada `roster.merekJenis[<jenis>]`. Nilai `null` berarti tanpa merek (aset stok): tim tamu mengikuti `studio/clients/<klien>/gaya.md` proyek itu.
3. Folder hasil: `projects/<slug>/layanan/<id>-<layanan>/` (buat dengan `mkdir -p`). Jika layanan punya `keluaran`, file produksi ke sana (ganti `<folder campaign>` dengan folder di `projects/<slug>/work.json`), tetapi `laporan.md` tetap di folder hasil.
4. Untuk setiap agen di `agents` (berurutan): jalankan `node scripts/status.mjs <slug> <agent-id> working "Bantuan <nama layanan>"`, lalu panggil agen sesuai `provider` di file agennya (aturan Claude/Gemini dan cadangan di CLAUDE.md). Tugasnya dimulai dengan:
   "MODE TAMU untuk proyek <slug> milik <lantai pemilik>, merek <merek>. Layanan: <nama> (<hasil>). Permintaan pemilik: <catatan>. Baca brief dan file proyek yang relevan. Tulis hasil ke <folder hasil> dan ringkasan ke <folder hasil>/laporan.md (apa yang dikerjakan, file, sumber, asumsi). Jangan menulis ke repo, bank ide, catatan revisi, atau skill tim asal Anda."
   Setelah selesai: `node scripts/status.mjs <slug> <agent-id> done "Bantuan <nama layanan> selesai"`.
5. Pastikan `laporan.md` ada (tulis sendiri dari laporan agen bila agen tidak menulisnya), lalu ubah `status` entri itu di `permintaan.json` menjadi `"selesai"` dan tambahkan `"selesai": "<ISO waktu>"`.
6. Rangkum untuk pemilik: file hasil, 3–5 poin, asumsi, dan hal yang perlu diputuskan. Revisi diminta sebagai permintaan baru dari kartu proyek. Catat masukan pemilik (bila ada) di `studio/clients/<klien pemilik>/log-revisi.md`.

Aturan khusus layanan:
- **cek-fakta** (Vega): hanya memeriksa, tidak mengubah file proyek. Tabel klaim → benar / perlu koreksi / tidak terverifikasi, tiap baris dengan sumber primer.
- **riset-tren** (Nova): tren, hook, format, dan contoh akun; jangan menulis ke bank ide @kanal.demo.
- **thumbnail** (Pictor): HTML dengan merek peminta (`studio/brands/<merek>/README.md`), render dengan `node scripts/html-png.mjs <folder hasil>/cover.html <folder hasil>/cover.png 1080x1920`, lalu lihat PNG-nya.
- **ekspor-magnific** (Pollux): jalankan pipeline Magnific pada SVG campaign Adobe Stock ini ke `keluaran`; cek `_review` dan duplikasi dengan campaign Magnific yang sudah ada; tidak mengunggah.
