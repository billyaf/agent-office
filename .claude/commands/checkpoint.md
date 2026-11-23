---
description: Catat keputusan pemilik di checkpoint dan log revisi klien, lalu lanjutkan
argument-hint: <slug> <setuju|revisi> <catatan>
---

Anda adalah orkestrator Kantor Virtual Agen. Keputusan pemilik: `$ARGUMENTS`

1. Tambahkan entri ke `projects/<slug>/checkpoints.md`. Kutip catatan pemilik apa adanya.
2. Jalankan `node scripts/status.mjs <slug> decision <setuju|revisi> "<ringkasan catatan>"`. Dari web keputusan biasanya sudah tercatat (script akan bilang begitu); itu normal, lanjutkan.
3. Proyek **explainer**: catat di `~/work/explainer_project/.claude/skills/explainer/references/revisi.md` (R berikutnya: tanggal, kutipan, alasan, tempat diterapkan) dan pelajaran umumnya di SKILL.md. Proyek **stock**/**magnific**: entri bertanggal di `studio/clients/<adobestock|magnific>/log-revisi.md`.
   Proyek **konten-motion** (kolaborasi): catat di `studio/clients/klien-demo/log-revisi.md`, **bukan** di catatan revisi @kanal.demo walaupun pengerjanya Cometa; aturan gerak untuk reels berikutnya ke `studio/brands/demo/media/reels-motion.md`.
   Proyek **tiktok**: catat di `~/work/shortvideo_project/content/catatan-revisi.md` (nomor revisi lanjut, masukan, rencana, status) dan perbarui "Status produksi"; aturan untuk video berikutnya masuk skill produksi. Proyek **konten**: tambahkan entri bertanggal ke `studio/clients/<klien>/log-revisi.md`: apa yang ditunjukkan (file, versi), kutipan reaksi pemilik, kesimpulan. Aturan yang berlaku untuk desain berikutnya juga dimasukkan ke bagian yang sesuai di `gaya.md`. Tampilkan ringkasan perubahannya ke pemilik.
4. **Jawaban formulir CP fakta.** Jika `projects/<slug>/jawaban-fakta.md` baru ditulis web, ringkas jawabannya di `checkpoints.md`. Pertanyaan bertanda **cari di internet** → panggil project-manager untuk meriset hanya pertanyaan itu (tulis hasil + URL di `jawaban-fakta.md`, perbarui brief) sebelum copywriter. Keputusan istilah/hashtag → `studio/clients/<klien>/istilah.json`.
5. Jika **revisi**: panggil kembali agen tahap itu (sesuai `provider`-nya) dengan catatan revisi; untuk desain, lanjutkan lagi ke visual-qa; lalu kembali ke checkpoint yang sama.
6. Jika **setuju**: lanjutkan alur (seperti `/lanjut`). Setelah checkpoint hasil disetujui: project-manager menyusun paket pengajuan (`04_pengajuan.md`), lalu `/arsip`.

7. Alur **tiktok**: setelah CP pilih ide → tiktok-scriptwriter lalu tiktok-motion-designer tahap A → CP script. Setelah CP script disetujui → tahap B (VO + render) → tiktok-qc → CP hasil. Setelah CP hasil disetujui → tiktok-publisher.
8. Alur **konten-motion**: CP fakta → copywriter (copy per adegan) → tiktok-motion-designer MODE TAMU tahap A (storyboard) → CP storyboard. Setelah disetujui → tahap B (render; VO hanya jika akunnya sudah diputuskan) → visual-qa + tiktok-qc MODE TAMU → CP hasil. Setelah CP hasil → project-manager (paket ajuan) → digital-asset-manager (arsip).
8b. Alur **explainer**: CP pilih konsep → explainer-scriptwriter → CP naskah → explainer-3d-director → CP storyboard. Setelah CP storyboard disetujui → explainer-audio-engineer (suara + render) → explainer-reviewer → CP hasil. Caption hanya jika diminta.
9. Alur **stock**/**magnific**: CP rencana → generator/artist → curator/exporter → CP hasil → curator/exporter menyusun `04_upload.md`.
