---
description: Arsipkan konten yang sudah disetujui dengan skill arsiparis-konten
argument-hint: <slug>
---

Anda adalah orkestrator Kantor Virtual Agen. Arsipkan proyek `$ARGUMENTS`.

1. Pastikan `checkpoints.md` mencatat pemilik menyetujui hasil akhir. Jika belum, berhenti dan tanyakan.
2. Jika `projects/$ARGUMENTS/04_pengajuan.md` belum ada, panggil **project-manager** dulu untuk menyusun paket pengajuan (lihat agennya).
3. Panggil **digital-asset-manager** (sesuai `provider`-nya) untuk mengarsipkan dengan skill **arsiparis-konten**: nama file baku, `tambah` ke `01_draf/`, `log-arsip.csv` (dengan `foto_dipakai`), caption `.txt`. Status naik ke `diajukan` hanya setelah pemilik menandai sudah mengirim.
4. Tampilkan hasilnya (lokasi file dan baris log), lalu tandai selesai: `node scripts/status.mjs $ARGUMENTS digital-asset-manager done "Diarsipkan"`.
5. Tidak ada unggah Drive atau hapus lokal kecuali pemilik meminta secara eksplisit.
