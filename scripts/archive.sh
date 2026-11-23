#!/usr/bin/env bash
# Arsipkan projects/<slug> ke Google Drive lewat rclone.
#
#   scripts/archive.sh <slug>                 unggah + verifikasi (tidak menghapus apa pun)
#   scripts/archive.sh <slug> --dry-run       tampilkan apa yang akan diunggah
#   scripts/archive.sh <slug> --delete-local  verifikasi ulang, lalu hapus folder lokal
#
# Pengaturan di studio/config.json → archive.{rcloneRemote, drivePath, exclude}.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/studio/config.json"
LIBRARY="$ROOT/studio/library.json"

die() { echo "archive: $*" >&2; exit 1; }
command -v rclone >/dev/null || die "rclone tidak ditemukan"
command -v jq >/dev/null || die "jq tidak ditemukan"

SLUG="${1:-}"; MODE="${2:-upload}"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || die "slug tidak valid: '$SLUG'"
SRC="$ROOT/projects/$SLUG"
[[ -d "$SRC" ]] || die "folder tidak ada: $SRC"

REMOTE="$(jq -r '.archive.rcloneRemote' "$CONFIG")"
DRIVE_PATH="$(jq -r '.archive.drivePath' "$CONFIG")"
rclone listremotes | grep -qx "${REMOTE}:" || die "remote rclone '$REMOTE' belum dikonfigurasi"
DEST="${REMOTE}:${DRIVE_PATH}/${SLUG}"

FILTERS=()
while IFS= read -r pattern; do FILTERS+=(--exclude "$pattern"); done < <(jq -r '.archive.exclude[]' "$CONFIG")

verify() {
  echo "archive: memverifikasi $DEST ..."
  # --one-way: setiap file lokal (yang tidak dikecualikan) harus ada di Drive dengan hash yang sama.
  rclone check "$SRC" "$DEST" --one-way "${FILTERS[@]}"
}

case "$MODE" in
  --dry-run)
    rclone copy "$SRC" "$DEST" "${FILTERS[@]}" --dry-run
    ;;
  upload)
    LOCAL_SIZE="$(du -sh "$SRC" | cut -f1)"
    echo "archive: mengunggah $SRC ($LOCAL_SIZE di disk) → $DEST"
    rclone copy "$SRC" "$DEST" "${FILTERS[@]}" --transfers 4 --checkers 8 --retries 5 --stats-one-line --stats 15s
    verify
    UPLOADED="$(rclone size "$DEST" --json)"
    TMP="$(mktemp)"
    jq --arg slug "$SLUG" --arg dest "$DEST" --arg at "$(date -u +%FT%TZ)" --argjson size "$UPLOADED" --arg localsize "$LOCAL_SIZE" \
      '.archivedProjects = ([.archivedProjects[] | select(.slug != $slug)] + [{slug:$slug, drive:$dest, uploadedAt:$at, files:$size.count, bytes:$size.bytes, localSize:$localsize, localDeleted:false}])' \
      "$LIBRARY" > "$TMP" && mv "$TMP" "$LIBRARY"
    echo "archive: OK — $(echo "$UPLOADED" | jq -r '.count') file terverifikasi di $DEST"
    echo "archive: folder lokal BELUM dihapus. Jalankan dengan --delete-local setelah pemilik menyetujui."
    ;;
  --delete-local)
    jq -e --arg slug "$SLUG" '.archivedProjects[] | select(.slug == $slug)' "$LIBRARY" >/dev/null \
      || die "proyek belum pernah diunggah; jalankan tanpa --delete-local dulu"
    verify || die "verifikasi gagal — folder lokal TIDAK dihapus"
    case "$SRC" in "$ROOT/projects/"?*) ;; *) die "path tidak aman: $SRC" ;; esac
    rm -rf -- "$SRC"
    TMP="$(mktemp)"
    jq --arg slug "$SLUG" --arg at "$(date -u +%FT%TZ)" \
      '(.archivedProjects[] | select(.slug == $slug)) |= (.localDeleted = true | .localDeletedAt = $at)' \
      "$LIBRARY" > "$TMP" && mv "$TMP" "$LIBRARY"
    echo "archive: folder lokal $SRC dihapus; arsip tetap di $DEST"
    ;;
  *) die "mode tidak dikenal: $MODE" ;;
esac
