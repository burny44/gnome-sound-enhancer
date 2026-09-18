#!/usr/bin/env bash
set -euo pipefail

UUID="sound-enhancer@burny"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

glib-compile-schemas "${SRC}/schemas"
mkdir -p "$(dirname "${DEST}")"
ln -sfn "${SRC}" "${DEST}"

echo "Linked ${DEST} -> ${SRC}"
echo "Restart GNOME Shell, then: gnome-extensions enable ${UUID}"
