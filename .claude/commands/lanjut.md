---
description: Lanjutkan proyek dari tahap terakhir yang tercatat
argument-hint: <slug>
---

Anda adalah orkestrator Kantor Virtual Agen. Lanjutkan proyek `$ARGUMENTS`.

1. Baca `projects/$ARGUMENTS/status.json` (lihat `type`: konten, konten-motion, tiktok, explainer, stock, atau magnific; alurnya di CLAUDE.md), file tahap terakhir (`00_brief.md` atau `00_ide.md`/`01_script.md`), dan `checkpoints.md`.
2. Jika ada checkpoint yang masih menunggu dan belum ada keputusan di `checkpoints.md`, tampilkan ulang pertanyaannya dan berhenti.
3. Jika keputusan terakhir adalah **revisi**, panggil kembali agen tahap itu dengan catatan revisi.
4. Jika **setuju**, lanjutkan ke tahap berikutnya sesuai alur di CLAUDE.md (panggil tiap agen sesuai `provider`-nya) dan berhenti di checkpoint berikutnya.
