// Workflows of the floors added after Lantai 1–2 (Explainer3D, Adobe Stock, Magnific), as data, so the panel
// (pipeline, checkpoint card, empty state, new-project form, quick tasks) needs no per-floor code.
// Konten (Klien Demo) and tiktok (@kanal.demo) keep their own components in Workflow.jsx / Control.jsx.

export const FLOWS = {
  // Lantai 1 · Reels motion Demo: a collaboration. The project belongs to Lantai 1 (brand Demo, Klien Demo
  // approvals and revision log); Cometa and Argus from TikTok Studio work as guests (`tamu`) with the motion kit
  // instagram/motion. Their own skill is used for technique only; the look follows studio/brands/demo.
  "konten-motion": {
    noun: "reels", newLabel: "Reels motion", title: "Reels motion Demo",
    team: "Polaris (brief & fakta) → Lyra (teks layar & naskah) → Cometa, tamu dari TikTok Studio (storyboard, render) → Lynx (QC merek) + Argus, tamu (QC video) → Polaris (paket ajuan) → Atlas (arsip).",
    note: "Tampilan mengikuti merek Demo. VO berbayar baru dibuat setelah CP storyboard, dan akun ElevenLabs-nya masih menunggu keputusan Anda.",
    namePlaceholder: "Reels 5 tips aman pakai AI", briefPlaceholder: "Tempel brief dari tim apa adanya: pesan utama, data dan sumbernya, durasi yang diinginkan, ajakan di akhir.",
    client: "klien-demo", firstAgent: "project-manager",
    read: "studio/clients/klien-demo/README.md, gaya.md, log-revisi.md, merek studio/brands/demo/README.md dan media/reels-motion.md, kit ~/work/design_project/motion/README.md",
    stages: [
      { id: "brief", label: "Brief & fakta", agent: "project-manager", before: 1 },
      { id: "cp1", label: "CP fakta", cp: 1 },
      { id: "naskah", label: "Teks & naskah", agent: "copywriter" },
      { id: "story", label: "Storyboard", agent: "tiktok-motion-designer", tamu: "tiktok", before: 2, file: "02_storyboard.md" },
      { id: "cp2", label: "CP storyboard", cp: 2 },
      { id: "render", label: "Render", agent: "tiktok-motion-designer", tamu: "tiktok", after: 2, file: "02_render.md" },
      { id: "qcm", label: "QC merek", agent: "visual-qa" },
      { id: "qcv", label: "QC video", agent: "tiktok-qc", tamu: "tiktok" },
      { id: "cp3", label: "CP hasil", cp: 3 },
      { id: "paket", label: "Paket ajuan", agent: "project-manager", after: 3, file: "04_pengajuan.md" },
      { id: "arsip", label: "Arsip", agent: "digital-asset-manager" },
    ],
    cps: [
      { name: "CP fakta", file: "00_brief.md", open: "Buka brief" },
      { name: "CP storyboard", file: "02_storyboard.md", open: "Catatan storyboard" },
      { name: "CP hasil", file: "03_qc.md", open: "Laporan QC" },
    ],
    paidAt: 1,
    paidNote: "Menyetujui storyboard berarti Cometa merender MP4 dengan kit Demo. Voice over ElevenLabs (berbayar) hanya dibuat jika akun dan suaranya sudah Anda tentukan; sebelum itu video dibuat tanpa VO.",
    mainFile: (p) => (p.files?.["copy.md"] ? "copy.md" : "00_brief.md"),
    extraFiles: [["02_storyboard.md", "Storyboard"], ["02_render.md", "Laporan render"], ["03_qa.md", "QC merek"], ["03_qc.md", "QC video"], ["04_pengajuan.md", "Paket ajuan"]],
    folderHint: (w) => <>Folder: <code>contoh-konten/{w.folder}/</code> · {w.images.filter((i) => i.name.startsWith("storyboard/")).length} still storyboard · {w.videos.length ? "MP4 ada" : "belum ada MP4"}</>,
    steps: [
      <><b>Polaris</b> menyusun brief, mengecek fakta dan sumbernya → <b>CP fakta</b></>,
      <><b>Lyra</b> menulis teks layar per adegan dan naskah VO, lalu cek-copy-klien-demo</>,
      <><b>Cometa</b> (tamu dari TikTok Studio) menyusun <code>motion.json</code> dan still storyboard dengan kit Demo (gratis) → <b>CP storyboard</b></>,
      <>Setelah disetujui: <b>Cometa</b> merender MP4 (VO hanya bila akunnya sudah diputuskan)</>,
      <><b>Lynx</b> memeriksa merek, <b>Argus</b> memeriksa teknis video → <b>CP hasil</b>; lalu paket ajuan dan arsip</>,
    ],
    actions: [
      ["Storyboard ulang", "minta tiktok-motion-designer (mode tamu) me-render ulang still storyboard dari motion.json terakhir, lalu tunjukkan."],
      ["QC ulang", "jalankan visual-qa (merek Demo) dan tiktok-qc (mode tamu, teknis video) ulang untuk render terakhir."],
    ],
    revise: "Catat di checkpoints.md dan studio/clients/klien-demo/log-revisi.md (bukan di catatan revisi @kanal.demo). Aturan gerak yang berlaku untuk reels berikutnya masuk ke studio/brands/demo/media/reels-motion.md. Kerjakan sebagai versi baru, lalu kembali ke checkpoint yang sesuai.",
    revisePlaceholder: "Revisi, mis. adegan 2 terlalu cepat, angka perlu sumber",
  },

  // Lantai 3 · Explainer3D: one project = one episode (video_project/episodes/epNNN-slug). Skill explainer R23:
  // concept → full script approved → storyboard (stills) approved → voice/music + render → self-review → owner.
  explainer: {
    noun: "episode", newLabel: "Episode baru", title: "Episode Explainer3D baru",
    team: "Vega (konsep & fakta) → Orion (naskah) → Sirius (scene 3D & storyboard) → Rigel (suara & render) → Deneb (review).",
    note: "Suara ElevenLabs dan render (±40 menit) baru dijalankan setelah Anda menyetujui storyboard.",
    namePlaceholder: "ep004 Wifi lemot", briefPlaceholder: "Opsional: topik, nomor ide dari bank konten (mis. A07), atau berita. Kosongkan agar Vega mengajukan 2–3 konsep.",
    client: "explainer", firstAgent: "explainer-researcher",
    read: "studio/clients/explainer/README.md, skill explainer (~/work/explainer_project/.claude/skills/explainer/SKILL.md) dan references/revisi.md",
    stages: [
      { id: "konsep", label: "Konsep", agent: "explainer-researcher", before: 1 },
      { id: "cp1", label: "Pilih konsep", cp: 1 },
      { id: "naskah", label: "Naskah", agent: "explainer-scriptwriter", before: 2 },
      { id: "cp2", label: "CP naskah", cp: 2 },
      { id: "story", label: "Storyboard", agent: "explainer-3d-director", before: 3 },
      { id: "cp3", label: "CP storyboard", cp: 3 },
      { id: "render", label: "Suara & render", agent: "explainer-audio-engineer" },
      { id: "review", label: "Review", agent: "explainer-reviewer" },
      { id: "cp4", label: "CP hasil", cp: 4 },
      { id: "publish", label: "Caption & tayang", agent: "explainer-scriptwriter", after: 4, file: "05_publish.md", done: (p) => !!p.jadwal?.tautan },
    ],
    cps: [
      { name: "Pilih konsep", file: "00_konsep.md", open: "Buka konsep" },
      { name: "CP naskah", file: "01_naskah.md", open: "Buka naskah" },
      { name: "CP storyboard", file: "02_storyboard.md", open: "Catatan storyboard" },
      { name: "CP hasil", file: "04_review.md", open: "Laporan review" },
    ],
    paidAt: 2,
    paidNote: "Menyetujui storyboard berarti Rigel membuat VO, SFX, dan musik ElevenLabs (memakai kredit langganan) lalu merender MP4 (±40 menit, laptop sibuk). Revisi sebelum ini masih gratis.",
    mainFile: (p) => (p.files?.["01_naskah.md"] ? "01_naskah.md" : "00_konsep.md"),
    extraFiles: [["02_storyboard.md", "Storyboard"], ["03_render.md", "Laporan render"], ["05_publish.md", "Caption"]],
    folderHint: (w) => <>Episode: <code>episodes/{w.folder}/</code> · {w.images.length} still · {w.videos.length ? "MP4 ada" : "belum ada MP4"}</>,
    steps: [
      <><b>Vega</b> mengajukan 2–3 konsep dari bank konten (hook, alur 3 langkah, payoff, twist) dan memverifikasi fakta → <b>Anda memilih</b></>,
      <><b>Orion</b> menulis naskah lengkap + sumber + audit retensi → <b>CP naskah</b></>,
      <><b>Sirius</b> membangun scene 3D dan me-render still storyboard (gratis) → <b>CP storyboard</b></>,
      <>Setelah disetujui: <b>Rigel</b> membuat VO, SFX, musik ElevenLabs dan merender MP4 (±40 menit)</>,
      <><b>Deneb</b> mengecek frame, uji "suara dimatikan", LUFS → <b>CP hasil</b>; Anda upload sendiri</>,
    ],
    actions: [
      ["Review ulang", "jalankan explainer-reviewer ulang untuk render terakhir (frame, uji suara dimatikan, LUFS/TP) dan laporkan."],
      ["Still ulang", "render ulang still storyboard saja (npm run stills, tanpa voice/music/render) setelah perubahan scene, lalu tunjukkan."],
      ["Buat caption", "minta explainer-scriptwriter menulis caption + hashtag (06_publish) untuk versi terakhir, lalu ringkas di 05_publish.md."],
    ],
    revise: "Catat dulu di references/revisi.md skill explainer (R berikutnya) dan tarik pelajaran umumnya ke SKILL.md, kerjakan sebagai versi baru (jangan menimpa), lalu kembali ke checkpoint yang sesuai. Jika perlu VO/musik/render ulang, sebutkan dulu dan minta izin.",
    revisePlaceholder: "Revisi, mis. hook kurang relatable, panel fakta detik 18 menutupi",
  },

  // Lantai Dasar A · Adobe Stock: one project = one campaign of ~30 vector assets (stock_project/campaigns/NN-slug).
  stock: {
    noun: "campaign", newLabel: "Campaign baru", title: "Campaign Adobe Stock baru",
    team: "Antares (riset terlaris & rencana) → Altair (generator SVG + preview) → Spica (QC, metadata CSV, jadwal upload).",
    note: "Aset tanpa teks, tanpa orang, tanpa merek. Upload ke Adobe Stock tetap Anda lakukan sendiri.",
    namePlaceholder: "13 Lebaran Ketupat Set", briefPlaceholder: "Tema / momen (mis. Imlek 2028, motif tenun ikat), jumlah aset, atau kosongkan agar Antares mengusulkan dari kalender musiman.",
    client: "adobestock", firstAgent: "stock-researcher",
    read: "studio/clients/adobestock/README.md, gaya.md, log-revisi.md, ~/work/stock_project/analisis-adobe-stock.md dan riset-tema-campaign.md",
    stages: [
      { id: "riset", label: "Riset & rencana", agent: "stock-researcher", before: 1 },
      { id: "cp1", label: "CP rencana", cp: 1 },
      { id: "produksi", label: "Generator", agent: "stock-generator" },
      { id: "qc", label: "QC & metadata", agent: "stock-curator", before: 2 },
      { id: "cp2", label: "CP hasil", cp: 2 },
      { id: "upload", label: "Jadwal upload", agent: "stock-curator", after: 2, file: "04_upload.md", done: (p) => !!p.jadwal?.tautan },
    ],
    cps: [
      { name: "CP rencana", file: "00_rencana.md", open: "Buka rencana" },
      { name: "CP hasil", file: "03_qc.md", open: "Laporan QC" },
    ],
    mainFile: () => "00_rencana.md",
    extraFiles: [["02_produksi.md", "Catatan produksi"], ["04_upload.md", "Jadwal upload"]],
    folderHint: (w) => <>Campaign: <code>campaigns/{w.folder}/</code> · {w.images.filter((i) => !i.preview).length} preview</>,
    steps: [
      <><b>Antares</b> meriset vektor terlaris tema itu (urut Downloads) dan menyusun komposisi ±30 aset → <b>CP rencana</b></>,
      <><b>Altair</b> menulis skrip tema di generator, membuat SVG + preview + lembar kontak</>,
      <><b>Spica</b> mengecek teknis (tanpa teks/orang/merek, ≥ 15 MP), menulis metadata.csv dan README → <b>CP hasil</b></>,
      <>Setelah disetujui: <b>Spica</b> memasukkan ke jadwal upload; Anda upload sendiri dan melaporkan aset yang ditolak</>,
    ],
    actions: [
      ["QC ulang", "jalankan stock-curator ulang untuk campaign ini (cek teknis, kemiripan antar file, metadata) dan laporkan."],
      ["Lembar kontak", "minta stock-generator membuat ulang preview dan lembar kontak campaign ini, lalu tunjukkan."],
      ["Catat penolakan", "pemilik akan menempelkan alasan penolakan Adobe Stock; minta stock-curator mencatatnya di log-revisi dan merencanakan perbaikannya. Alasan: "],
    ],
    revise: "Catat di studio/clients/adobestock/log-revisi.md, kerjakan (generator → curator), lalu kembali ke checkpoint hasil.",
    revisePlaceholder: "Revisi, mis. pola 14–19 terlalu mirip, warna kurang kontras",
  },

  // Lantai Dasar B · Magnific (ex-Freepik): same idea, but the delivery is EPS + JPG + CSV through the export pipeline.
  magnific: {
    noun: "campaign", newLabel: "Campaign baru", title: "Campaign Magnific baru",
    team: "Capella (riset & rencana) → Castor (SVG orisinal) → Pollux (ekspor EPS + JPG + CSV, review).",
    note: "Aset AI wajib berlabel _ai_generated. Upload ke contributor.magnific.com tetap Anda lakukan sendiri.",
    namePlaceholder: "A Batik Klasik Nusantara", briefPlaceholder: "Tema dari rencana campaign (A–L di riset-magnific.md), jumlah file, atau kosongkan agar Capella mengusulkan.",
    client: "magnific", firstAgent: "magnific-researcher",
    read: "studio/clients/magnific/README.md, gaya.md, log-revisi.md, ~/work/marketplace_project/README.md dan riset-magnific.md",
    stages: [
      { id: "riset", label: "Riset & rencana", agent: "magnific-researcher", before: 1 },
      { id: "cp1", label: "CP rencana", cp: 1 },
      { id: "produksi", label: "SVG orisinal", agent: "magnific-artist" },
      { id: "ekspor", label: "Ekspor EPS", agent: "magnific-exporter", before: 2 },
      { id: "cp2", label: "CP hasil", cp: 2 },
      { id: "upload", label: "Paket upload", agent: "magnific-exporter", after: 2, file: "04_upload.md", done: (p) => !!p.jadwal?.tautan },
    ],
    cps: [
      { name: "CP rencana", file: "00_rencana.md", open: "Buka rencana" },
      { name: "CP hasil", file: "03_ekspor.md", open: "Laporan ekspor" },
    ],
    mainFile: () => "00_rencana.md",
    extraFiles: [["02_produksi.md", "Catatan produksi"], ["04_upload.md", "Paket upload"]],
    folderHint: (w) => <>Campaign: <code>campaigns/{w.folder}/</code> · {w.images.filter((i) => !i.preview).length} preview</>,
    steps: [
      <><b>Capella</b> meriset aset Magnific terpopuler tema itu dan menyusun rencana file → <b>CP rencana</b></>,
      <><b>Castor</b> membuat SVG dengan struktur motif berbeda tiap file (aturan orisinalitas)</>,
      <><b>Pollux</b> menjalankan pipeline: EPS RGB + JPG ≥ 4 MP + CSV, memeriksa file di <code>_review</code> → <b>CP hasil</b></>,
      <>Setelah disetujui: <b>Pollux</b> menyusun paket upload; Anda upload sendiri</>,
    ],
    actions: [
      ["Ekspor ulang", "jalankan magnific-exporter ulang (pipeline export.mjs) untuk campaign ini dan laporkan ready/review/fail."],
      ["Periksa _review", "minta magnific-exporter membandingkan preview file di _review dengan SVG aslinya dan mengusulkan perbaikan generator."],
    ],
    revise: "Catat di studio/clients/magnific/log-revisi.md, kerjakan (artist → exporter), lalu kembali ke checkpoint hasil.",
    revisePlaceholder: "Revisi, mis. motif 05 terlalu mirip 02, preview kurang tajam",
  },
};

export const flowOf = (type) => FLOWS[type] ?? null;

export const FLOW_TASKS = {
  "explainer-researcher": ["Ajukan 2–3 konsep episode berikutnya dari bank konten", "Cek ulang fakta dan sumber primer episode terakhir", "Cari Part 2 yang dijanjikan episode sebelumnya"],
  "explainer-scriptwriter": ["Audit retensi naskah terakhir (R30)", "Tulis 3 opsi hook dari pengalaman nyata penonton", "Tulis caption + hashtag episode terakhir"],
  "explainer-3d-director": ["Render ulang still storyboard episode terakhir", "Jalankan uji determinisme gaya pbr"],
  "explainer-audio-engineer": ["Cek LUFS dan true peak render terakhir"],
  "explainer-reviewer": ["Review ulang render terakhir dengan uji suara dimatikan"],
  "stock-researcher": ["Usulkan campaign berikutnya dari kalender musiman", "Riset vektor terlaris untuk tema: "],
  "stock-generator": ["Buat ulang lembar kontak campaign terakhir"],
  "stock-curator": ["Rekap jadwal upload minggu ini", "Cek kemiripan antar file di campaign terakhir", "Catat aset yang ditolak Adobe Stock: "],
  "magnific-researcher": ["Riset aset Magnific terpopuler untuk tema: ", "Perbarui kalender produksi Magnific"],
  "magnific-artist": ["Buat variasi motif orisinal untuk campaign terakhir"],
  "magnific-exporter": ["Ekspor ulang campaign terakhir dan laporkan file di _review", "Siapkan tes kualifikasi Level 1 (150–200 file)"],
};
