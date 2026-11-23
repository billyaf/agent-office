---
description: Buka proyek baru (konten Instagram lantai 1, video TikTok lantai 2, episode Explainer3D lantai 3, campaign Adobe Stock atau Magnific di lantai dasar), lalu jalankan alurnya sampai checkpoint pertama
argument-hint: konten|konten-motion|tiktok|explainer|stock|magnific <nama proyek> [brief]
---

Anda adalah orkestrator Kantor Virtual Agen. Pemilik studio membuka proyek baru: `$ARGUMENTS`

1. Jenis: **konten** (lantai 1, klien `klien-demo`) atau **tiktok** (lantai 2, klien `kanaldemo`, satu video). Jika perintah menyebut `Slug:`, pakai slug itu: proyek sudah dibuka oleh web (`status.json` ada). Jika tidak, buat slug pendek (huruf kecil, tanda hubung) dan jalankan `node scripts/status.mjs <slug> init <jenis> "<nama>" meeting-1` **sebelum** memanggil agen mana pun.
   Untuk **konten-motion** (reels motion Lantai 1, kolaborasi): sama dengan konten sampai **[CP fakta]** (project-manager dulu); tahap berikutnya ikuti "Alur `konten-motion`" dan "Kolaborasi antarlantai" di CLAUDE.md.
   Untuk **explainer**, **stock**, **magnific**: ikuti alurnya di CLAUDE.md. Agen pertama: explainer-researcher (berhenti di **[CP pilih konsep]**), stock-researcher atau magnific-researcher (berhenti di **[CP rencana]**). Langkah 3–4 di bawah khusus jenis konten.
   Untuk **tiktok**: ikuti "Alur `tiktok`" di CLAUDE.md. Panggil **tiktok-strategist** (bukan project-manager), lalu berhenti di **[CP pilih ide]** dengan ringkasan pilihan ide. Langkah 3–4 di bawah khusus jenis konten.
2. Untuk setiap agen yang dipanggil, cek `provider` di `.claude/agents/<id>.md` dan jalankan sesuai bagian "Model per agen" di CLAUDE.md. Beri tahu setiap agen slug proyek, klien, dan file yang harus dibaca (`studio/clients/<klien>/README.md`, `gaya.md`, `log-revisi.md`).
3. Panggil **project-manager** (latar depan, tunggu hasilnya) untuk menulis brief, mengecek fakta, riset, dan menyiapkan folder kerja.
4. Di **[CP fakta]**: jalankan `node scripts/status.mjs <slug> checkpoint "<pertanyaan>"`, ringkas brief + pertanyaan untuk tim (link ke file), lalu **berhenti**. Jika pemilik sudah meminta "langsung desain", catat asumsinya dan tetap tunjukkan daftar asumsi di checkpoint hasil.
5. Setelah setiap agen selesai, periksa bahwa file yang dijanjikan benar-benar ada sebelum lanjut.
