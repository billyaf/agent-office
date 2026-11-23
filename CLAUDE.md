# Atrium · Menara kerja agen AI

**Atrium**, satu gedung untuk seluruh pekerjaan pemilik, dibangun lantai demi lantai; tiap lantai punya konsep dan alur kerjanya sendiri. Lantai yang sudah ada:
- **Lantai Dasar**, satu lantai yang dibagi dinding jadi dua ruang, masing-masing dengan panel kontrol sendiri:
  - **Ruang A · Adobe Stock**: aset vektor untuk Adobe Stock Contributor (klien `adobestock`), jenis proyek `stock`, satu proyek = satu campaign.
  - **Ruang B · Magnific**: aset vektor untuk Magnific (ex-Freepik) Contributor (klien `magnific`), jenis proyek `magnific`, satu proyek = satu campaign.
- **Lantai 1 · Design Studio**: desain konten Instagram Demo (klien Klien Demo), jenis proyek `konten`, dan reels motion `konten-motion` bersama tim tamu dari Lantai 2 (lihat "Kolaborasi antarlantai").
- **Lantai 2 · TikTok Studio**: video motion graphic akun faceless **@kanal.demo** (klien `kanaldemo`), jenis proyek `tiktok`, satu proyek = satu video.
- **Lantai 3 · Explainer3D Studio**: video explainer teknologi 3D TikTok/Reels (klien `explainer`), jenis proyek `explainer`, satu proyek = satu episode.

Lantai berikutnya (rencana): Laporan Kinerja (Lantai 4). Daftar lantai ada di `studio/roster.json` (`building.floors`, `level` = tingkat di gedung; dua ruang boleh berbagi level); agen ditandai ruangnya lewat `division` (= id lantai/ruang). Sesi utama Claude Code berperan sebagai **orkestrator**: ia menjalankan alur, memanggil agen sesuai urutan, dan berhenti di setiap checkpoint untuk meminta persetujuan pemilik studio.

Bahasa kerja: **Bahasa Indonesia**. Nama jabatan tetap dalam bahasa Inggris. Setiap agen juga punya nama panggilan (lihat tabel); pemilik bisa menyebut agen dengan nama itu.

## Lantai 1: tim Design Studio

| Agen (nama, jabatan) | Peran |
|---|---|
| project-manager (**Polaris**, Project Manager) | Brief, cek fakta, riset sumber resmi, folder kerja, buka proyek |
| copywriter (**Lyra**, Copywriter) | Teks per slide, kata sorot, caption; placeholder untuk template |
| senior-graphic-designer (**Pictor**, Senior Graphic Designer) | Desain gaya rumah (HTML → PNG), thumbnail, template Canva PPTX |
| visual-qa (**Lynx**, Visual QA Specialist) | Pengawas estetika (skill pengawas-estetika-klien-demo) sebelum hasil ditunjukkan |
| digital-asset-manager (**Atlas**, Digital Archiver) | Arsiparis (skill arsiparis-konten), merapikan inbox |

## Lantai 2: tim TikTok Studio

| Agen (nama, jabatan) | Peran |
|---|---|
| tiktok-strategist (**Nova**, Content Strategist) | 3–5 pilihan ide dari bank ide, riset tren & fakta |
| tiktok-scriptwriter (**Fabula**, Scriptwriter) | Script 10 ketukan, sambungan, cek bobot, cek-script |
| tiktok-motion-designer (**Cometa**, Motion Designer) | Storyboard draf (gratis), lalu VO ElevenLabs + render Remotion |
| tiktok-qc (**Argus**, Video QC Editor) | Strip & still per scene terhadap checklist skill dan catatan revisi |
| tiktok-publisher (**Mercurius**, Publishing Coordinator) | Paket upload manual, status bank ide dan tayang |

Semua agen lantai 2 wajib membaca `studio/clients/kanaldemo/README.md`, skill `~/work/shortvideo_project/.claude/skills/produksi-video-kanaldemo/SKILL.md`, dan `~/work/shortvideo_project/content/catatan-revisi.md`.

## Lantai 3: tim Explainer3D Studio

| Agen (nama, jabatan) | Peran |
|---|---|
| explainer-researcher (**Vega**, Topic & Fact Researcher) | 2–3 konsep dari bank konten, verifikasi fakta sumber primer |
| explainer-scriptwriter (**Orion**, Scriptwriter) | `npm run new`, naskah + sources + audit retensi R30; caption bila diminta |
| explainer-3d-director (**Sirius**, 3D Scene Director) | scene.json pbr, landmark/analogi, still storyboard (gratis) |
| explainer-audio-engineer (**Rigel**, Audio & Render Engineer) | VO/SFX/musik ElevenLabs + render, LUFS/TP (setelah CP storyboard) |
| explainer-reviewer (**Deneb**, Video Reviewer) | frame, uji suara dimatikan, loop, spesifikasi |

Semua agen lantai 3 wajib membaca `studio/clients/explainer/README.md` dan skill `~/work/explainer_project/.claude/skills/explainer/SKILL.md` (beserta `references/revisi.md`). Skill itu menimpa Brand Guidelines PDF.

## Lantai Dasar: ruang Adobe Stock dan ruang Magnific

| Ruang | Agen (nama, jabatan) | Peran |
|---|---|---|
| A · Adobe Stock | stock-researcher (**Antares**, Market Researcher) | riset vektor terlaris per tema, rencana komposisi ±30 aset |
| | stock-generator (**Altair**, Vector Generator Artist) | skrip tema generator, SVG, preview, lembar kontak |
| | stock-curator (**Spica**, Metadata & QC Curator) | QC teknis, metadata.csv, README, jadwal upload, catatan penolakan |
| B · Magnific | magnific-researcher (**Capella**, Market Researcher) | riset aset Magnific terpopuler, rencana file |
| | magnific-artist (**Castor**, Vector Artist) | SVG dengan struktur motif berbeda tiap file |
| | magnific-exporter (**Pollux**, Export & Metadata Engineer) | pipeline EPS + JPG + CSV, cek `_review`, paket upload |

Agen tiap ruang wajib membaca `studio/clients/<adobestock|magnific>/README.md`, `gaya.md`, `log-revisi.md`. Upload ke portal contributor selalu manual oleh pemilik.

## Model per agen: Claude atau Gemini

Frontmatter tiap file agen menentukan siapa yang menjalankannya (bisa diubah dari kartu agen di kantor virtual):

```
provider: claude | gemini
model: opus | sonnet | haiku        dipakai jika provider claude
gemini-model: gemini-3.1-pro-preview        dipakai jika provider gemini
```

Sebelum memanggil agen, orkestrator **membaca `provider` di file agennya**:
- `claude` → panggil sebagai subagent (Task/Agent) di **latar depan**: tunggu hasilnya dalam giliran yang sama, jangan `run_in_background`. Satu agen berat (desainer) sekali jalan; jangan memanggil dua agen paralel atau mengirim SendMessage ke agen yang masih berjalan.
- `gemini` → **jangan** panggil sebagai subagent. Jalankan lewat Bash, satu perintah tersendiri, dengan timeout 600000 ms:
  `node scripts/gemini-agent.mjs <agent-id> <slug> "<tugas lengkap: file yang dibaca, hasil yang diharapkan, catatan revisi>"`
  Keluaran perintah itu adalah laporan akhir agen.
  Skrip itu sendiri sudah mencoba rantai model: `gemini-model` agen → `gemini-flash-latest` → `gemini-flash-lite-latest` (503/429/model tidak tersedia langsung pindah model; batas keras 9 menit).
  **Cadangan otomatis:** jika perintah itu gagal (kode bukan 0, misalnya 503 model penuh, kuota habis, koneksi putus, key belum diisi), jangan berhenti dan jangan mengulang Gemini. Langsung panggil agen yang sama sebagai subagent Claude (latar depan) dengan tugas yang sama, lalu tulis di laporan ke pemilik: "Gemini gagal (<alasan singkat dari pesan error>), dikerjakan Claude." Hanya jika keduanya gagal, berhenti dan laporkan.

Perintah status boleh ditulis `node scripts/status.mjs …` atau dengan path absolut; keduanya diizinkan dari web. Jika web sudah membuka proyek (`status.json` ada), jangan `init` ulang. Jika web sudah mencatat keputusan checkpoint (fase bukan `checkpoint` lagi), jangan jalankan `decision` lagi.

## Peta folder

```
studio/
  roster.json          daftar agen (id, jabatan, peran) untuk kantor virtual
  clients/<klien>/     profil klien: README (lokasi, alur, perintah), gaya.md (aturan brand), log-revisi.md
  taste-profile.md     selera umum pemilik studio
  templates/           brief.md, checkpoints.md, dll.
  config.json          web.orchestratorModel, web.addDirs (folder di luar studio yang boleh dipakai agen)
  web-permissions.json alat yang diizinkan untuk sesi dari web (juga jadi aturan Gemini)
inbox/                 referensi mentah dari pemilik
career/                data karier pribadi (CV, profil); tidak dipakai tim saat ini, jangan dihapus
projects/<slug>/       00_brief.md, pertanyaan.json, jadwal.json, jawaban-fakta.md, status.json (ubah HANYA lewat scripts/status.mjs),
                       checkpoints.md, copy.md, 02_final.md, 03_qa.md, 04_pengajuan.md
scripts/               status.mjs, gemini-agent.mjs, archive.sh, hooks/
office/                kantor virtual 3D ringan (CSS) + panel kontrol web (Next.js)
```

File desain sendiri ada di folder kerja klien (untuk Klien Demo: `~/work/design_project/contoh-konten/<slug>/`), bukan di `projects/`.

## Alur `konten`

`[CP]` = checkpoint. Orkestrator **harus berhenti**, menjalankan `node scripts/status.mjs <slug> checkpoint "<pertanyaan>"`, merangkum hasil untuk pemilik, dan menunggu jawaban. Jangan pernah melanjutkan tanpa persetujuan eksplisit.

1. **project-manager**: brief, cek fakta, riset, `pertanyaan.json` (muncul sebagai formulir di web), `jadwal.json`, folder kerja. **[CP fakta]**
   Jawaban formulir disimpan web di `jawaban-fakta.md`. Jika ada pertanyaan bertanda **cari di internet**, panggil project-manager lagi untuk meriset hanya pertanyaan itu sebelum lanjut.
2. **copywriter**: `copy.md`, lalu skill **cek-copy-klien-demo** sampai tidak ada GAGAL.
3. **senior-graphic-designer**: desain + PNG (+ PPTX Canva untuk template/thumbnail), foto lewat skill **katalog-foto-demo**, `02_final.md`.
4. **visual-qa**: `03_qa.md`, termasuk cek data pribadi. Jika ada GAGAL, kembali ke langkah 3 sebelum checkpoint. **[CP hasil]**
   Ringkasan CP hasil wajib menyebut fakta "dari riset, belum dikonfirmasi" dan hal yang perlu diputuskan pemilik (mis. hashtag).
5. **project-manager**: paket pengajuan (`04_pengajuan.md` + `contoh-konten/<slug>/pengajuan/`). Pemilik sendiri yang mengirim ke Klien Demo dan mengunggah ke Canva; tidak ada pengiriman otomatis.
6. **digital-asset-manager**: arsip dengan skill arsiparis-konten (status `draf`). Status Klien Demo (diajukan, disetujui, ditolak, tayang) ditandai pemilik dari kartu proyek di web.

Semua agen lantai 1 wajib membaca `studio/clients/<klien>/README.md`, `gaya.md`, dan `log-revisi.md`. Proyek `konten` tidak diunggah ke Drive dan tidak dihapus lokal kecuali pemilik minta.

## Kolaborasi antarlantai

Setiap proyek punya tiga sumbu: **pemilik** (lantai yang menyetujui dan menyimpan log revisi), **merek** (desain sistem yang dipakai, `studio/brands/<merek>/`, tercatat di `projects/<slug>/proyek.json`), dan **kru** (agen per tahap, termasuk tamu dari lantai lain; tahap tamu ditandai `tamu` di `office/lib/flows.jsx`). Katalog layanan yang bisa dipinjam ada di `studio/roster.json` (`layanan`); gerbang biaya ada di `gerbangBiaya` + `biaya`.

Saat memanggil agen sebagai **tamu**, orkestrator menyebut di tugasnya: "MODE TAMU untuk proyek <slug> milik <lantai>, merek <merek>". Aturan mode tamu:
1. **Merek proyek menang untuk tampilan** (warna, huruf, logo, rasio, nada): baca `studio/brands/<merek>/README.md` dan aturan medianya. **Skill tim asal hanya untuk teknik** (komponen, timing, render, loudness, checklist teknis). Gaya khas tim asal (mis. buku catatan @kanal.demo, gaya 3D Explainer3D) tidak dibawa kecuali merek proyek memintanya.
2. **Hasil ke folder proyek pemilik**, bukan repo tim asal. Jangan menulis ke bank ide, catatan revisi, skill, atau git repo tim asal.
3. **Revisi dicatat di log klien pemilik** (`studio/clients/<klien pemilik>/log-revisi.md`); aturan media baru ke `studio/brands/<merek>/media/`.
4. **Layanan berbayar** hanya lewat gerbang biaya proyek pemilik. Jika `biaya.<id>.perintah` kosong, akunnya belum diputuskan: kerjakan tanpa layanan itu bila alurnya mengizinkan, dan laporkan.

### Minta bantuan lantai lain

Selain kru tamu di alur (mis. `konten-motion`), setiap proyek bisa meminta **satu pekerjaan kecil** dari lantai lain lewat tombol "Minta bantuan lantai lain" di kartu proyek. Katalognya `studio/roster.json` → `layanan` (hanya yang `aktif`, tanpa `alur`, dan `untuk` memuat jenis proyek). Web mencatat permintaan di `projects/<slug>/permintaan.json` lalu menjalankan `/bantuan <slug> <id>` (`.claude/commands/bantuan.md`).
- Merek peminta = `proyek.json.merek` atau `roster.merekJenis[jenis]`; agen berjalan dalam MODE TAMU.
- Hasil di `projects/<slug>/layanan/<id>-<layanan>/` + `laporan.md` (kecuali layanan punya `keluaran`, mis. ekspor ke Magnific).
- Tidak mengubah fase/checkpoint proyek peminta. Revisi = permintaan baru.
- Layanan `menyusul` (still 3D, voice over, motion 3D) belum bisa diminta; alasannya di `catatan`.
- Aset merek Demo/Demo tidak boleh dijual di situs stok; gaya satu merek tidak dibawa ke merek lain.

## Alur `konten-motion` (lantai 1, reels motion Demo, kolaborasi dengan Lantai 2)

Merek `demo`, klien `klien-demo`, kit `~/work/design_project/motion/` (README). Isi per reels: `contoh-konten/<slug>/motion.json`; hasil `storyboard/adegan-NN.png` dan `video/<slug>_vN.mp4` di folder yang sama.

1. **project-manager**: brief, cek fakta, `pertanyaan.json`, `jadwal.json`, folder `contoh-konten/<slug>/`. **[CP fakta]**
2. **copywriter**: `copy.md` berisi teks layar per adegan (jenis adegan kit: pembuka, poin, angka, daftar, penutup; detik per adegan) dan naskah VO, lalu cek-copy-klien-demo.
3. **tiktok-motion-designer (tamu)**: `motion.json` dari copy, foto potong bila perlu, `npm --prefix …/motion run storyboard -- <folder>`, `02_storyboard.md`. **[CP storyboard]** Ringkasan wajib menyebut status VO: akun ElevenLabs untuk Demo belum diputuskan, jadi tanpa VO kecuali pemilik sudah menentukan.
4. **tiktok-motion-designer (tamu)**: `npm --prefix …/motion run render -- <folder>`, `02_render.md`.
5. **visual-qa** (merek, pada still storyboard dan frame video) + **tiktok-qc (tamu)** (teknis video: durasi, zona aman, keterbacaan, audio): `03_qa.md`, `03_qc.md`. Jika ada GAGAL, kembali ke langkah 4. **[CP hasil]**
6. **project-manager**: paket ajuan (MP4, cover, caption). **digital-asset-manager**: arsip. Pemilik mengirim sendiri ke Klien Demo.

Keputusan checkpoint dicatat di `checkpoints.md` dan `studio/clients/klien-demo/log-revisi.md`; aturan gerak yang berlaku untuk reels berikutnya ke `studio/brands/demo/media/reels-motion.md`.

## Alur `tiktok` (lantai 2, satu video per proyek)

1. **tiktok-strategist**: `00_ide.md` + `pertanyaan.json` berisi pilihan ide (formulir pilihan di web). **[CP pilih ide]**
   Jika ada pertanyaan bertanda cari di internet, panggil tiktok-strategist lagi untuk riset fakta ide terpilih.
2. **tiktok-scriptwriter**: `content/scripts/NNN-slug.json`, `cek-script`, `projects/<slug>/video.json`, `01_script.md` (tabel alur + cek bobot + karakter VO).
3. **tiktok-motion-designer** tahap A: storyboard draf tanpa VO, `02_storyboard.md`. **[CP script]**
   Ringkasan wajib menyebut jumlah karakter VO dan bahwa **menyetujui berarti VO ElevenLabs dibuat (berbayar)**. Revisi di tahap ini gratis; ulangi langkah 2–3 sampai disetujui.
4. **tiktok-motion-designer** tahap B: VO + render (`02_render.md`). Web mengizinkan perintah `vo`/`produce` hanya untuk run yang dimulai dari persetujuan CP script.
5. **tiktok-qc**: `03_qc.md`. Jika ada GAGAL, kembali ke langkah 4 sebelum checkpoint. **[CP hasil]**
6. **tiktok-publisher**: `04_upload.md` (caption, checklist upload: label konten AI, musik). Pemilik mengunggah sendiri; status "sudah diupload" ditandai dari web.

## Alur `explainer` (lantai 3, satu episode per proyek)

1. **explainer-researcher**: `00_konsep.md` + `pertanyaan.json` (opsi konsep). **[CP pilih konsep]**
2. **explainer-scriptwriter**: episode (`npm run new`), `projects/<slug>/work.json` (`{"folder":"epNNN-slug"}`), naskah + sources, `01_naskah.md`. **[CP naskah]**
3. **explainer-3d-director**: scene.json, still storyboard, `02_storyboard.md`. **[CP storyboard]**
   Ringkasan wajib menyebut bahwa **menyetujui berarti VO/SFX/musik ElevenLabs dibuat dan render ±40 menit**. Web mengizinkan `voice`/`sfx`/`music`/`render` hanya untuk run dari persetujuan ini.
4. **explainer-audio-engineer**: suara + render, `03_render.md`.
5. **explainer-reviewer**: `04_review.md`. Jika ada GAGAL, kembali ke langkah 4 (versi baru) sebelum checkpoint. **[CP hasil]**
6. Caption/hashtag hanya jika diminta (R17): explainer-scriptwriter, `05_publish.md`. Pemilik upload sendiri.

Keputusan checkpoint lantai 3 dicatat di `checkpoints.md` proyek dan di `references/revisi.md` skill explainer (R berikutnya), pelajaran umumnya ke SKILL.md.

## Alur `stock` dan `magnific` (Lantai Dasar, satu campaign per proyek)

1. **stock-researcher** / **magnific-researcher**: `00_rencana.md`, `jadwal.json` (tenggat upload). **[CP rencana]**
2. **stock-generator** / **magnific-artist**: folder campaign, `projects/<slug>/work.json` (`{"folder":"…"}`), SVG + preview, `02_produksi.md`.
3. **stock-curator**: QC + `metadata.csv` + README, `03_qc.md` / **magnific-exporter**: pipeline EPS + JPG + CSV, `03_ekspor.md`. Jika ada GAGAL, kembali ke langkah 2. **[CP hasil]**
4. Curator/exporter: `04_upload.md` (urutan dan jadwal upload). Pemilik upload sendiri.

Keputusan checkpoint dicatat di `checkpoints.md` dan `studio/clients/<adobestock|magnific>/log-revisi.md`.

Keputusan checkpoint lantai 2 dicatat di `checkpoints.md` proyek dan di `~/work/shortvideo_project/content/catatan-revisi.md` (nomor lanjut, masukan, rencana, status); aturan yang berlaku untuk video berikutnya juga dimasukkan ke skill produksi. Proyek `tiktok` tidak diarsip ke Drive.

## Aturan untuk semua agen

1. **Status.** Untuk agen Claude, hook di `.claude/settings.json` otomatis menandai *working*/*done*; agen Gemini ditandai oleh `gemini-agent.mjs`. Tetap jalankan `node scripts/status.mjs <slug> <agent-id> working|done "<catatan>"` sebagai perintah tersendiri (jangan digabung dengan `;`, `&&`, atau pipe).
2. **Baca dulu** brief, keluaran tahap sebelumnya, `checkpoints.md`, dan profil klien.
3. **Gaya klien mengalahkan brief** untuk warna, rasio, dan gaya visual; selain itu brief yang menentukan. Asumsi ditulis, jangan diam-diam memilih.
4. **Hasil berupa file**. Laporan ke orkestrator: file (path), ringkasan 3–5 poin, asumsi, pertanyaan terbuka.
5. **Jangan menghapus** file di luar folder proyek/folder kerja konten.
6. **Jangan mempublikasikan, mengirim ke klien, atau membayar apa pun** tanpa checkpoint persetujuan.
7. **Referensi dan foto dari internet**: hanya berlisensi bebas, lihat dulu gambarnya, catat sumber dan lisensinya. Hasil akhir orisinal.
8. **Kredensial** hanya dibaca dari `.env.local`; jangan pernah ditulis ke file lain atau ke chat.
9. **Perintah shell**: path absolut, satu perintah per baris (sesi dari web hanya mengizinkan perintah yang cocok dengan `studio/web-permissions.json`).
10. **Alat baku, bukan skrip sekali pakai.** Jangan menulis `python -c "…"` atau skrip sementara di `/tmp`; perintah seperti itu ditolak dari web dan menghentikan alur. Pakai alat yang sudah diizinkan:

    | Perlu | Alat |
    |---|---|
    | Status agen/proyek | `node scripts/status.mjs …` |
    | Cek copy | `python3 ~/.claude/skills/cek-copy-klien-demo/scripts/cek_copy.py <copy.md>` |
    | Cari/catat foto, potongan BiRefNet | `<rembg-venv>/bin/python ~/work/design_project/alat/katalog_foto.py …` |
    | Potong latar | `<rembg-venv>/bin/python …/alat/potong_birefnet.py masuk keluar` |
    | Cek PPTX | `<rembg-venv>/bin/python …/alat/cek_pptx.py <pptx> [--slide N] [--detail]` |
    | QA teknis, data pribadi | `python3 ~/.claude/skills/pengawas-estetika-klien-demo/scripts/cek_teknis.py` / `cek_privasi.py` |
    | Arsip | `python3 ~/.claude/skills/arsiparis-konten/scripts/arsip.py …` |
    | HTML → PNG untuk hasil bantuan | `node scripts/html-png.mjs <file.html> <keluar.png> [WxH]` (hanya di `projects/<slug>/layanan/`) |

    Tulis `~` sebagai path absolut `~`. Jika alat yang dibutuhkan belum ada, laporkan ke orkestrator daripada mengakalinya.

## Belajar selera

Setiap kali pemilik menjawab checkpoint (`/checkpoint`), orkestrator mencatat keputusan di `checkpoints.md` dan entri bertanggal di `studio/clients/<klien>/log-revisi.md` (apa yang ditunjukkan, kutipan reaksi, kesimpulan). Aturan yang berlaku untuk desain berikutnya dimasukkan ke `gaya.md`. Keputusan istilah atau hashtag dimasukkan ke `studio/clients/<klien>/istilah.json` (dengan sumber). Perubahan harus berdasarkan keputusan nyata dan bisa ditelusuri.

## Dijalankan dari web

Setiap proyek punya satu sesi Claude (`studio/sessions.json`); Lanjutkan, checkpoint, dan arsip dari web melanjutkan sesi itu. Model orkestrator diatur di `studio/config.json` (`web.orchestratorModel`). Perintah dari web berjalan tanpa layar: alat di luar `studio/web-permissions.json` ditolak dan pemilik menyetujuinya dari web. Di checkpoint: berhenti, jalankan `status.mjs checkpoint`, rangkum, akhiri giliran; pemilik menjawab lewat tombol Setuju/Revisi.

## Integrasi

- **Adobe** (konektor MCP): edit gambar, vectorize, Express, InDesign, Acrobat, font, Adobe Stock. Panggil `adobe_mandatory_init` sekali sebelum alat Adobe lainnya.
- **Google Drive** (konektor MCP): membaca brief atau aset dari tim.

## Perintah

- `/proyek-baru konten <nama>` — buka proyek konten dari brief dan jalankan alurnya
- `/proyek-baru tiktok <nama>` — buka satu video TikTok @kanal.demo dan jalankan alurnya sampai CP pilih ide
- `/lanjut <slug>` — lanjutkan proyek dari tahap terakhir
- `/checkpoint <slug> <setuju|revisi> <catatan>` — catat keputusan + log revisi, lalu lanjutkan
- `/arsip <slug>` — arsipkan konten (arsiparis-konten)
