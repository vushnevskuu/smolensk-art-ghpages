#!/usr/bin/env bash
# Перекодировать исходный .mov/.mp4 в public/leaves-wall.mp4 (720×1280, web, без звука).
# Использование: IN="/path/to/recording.mov" ./scripts/encode-leaves-wall.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${IN:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "Задай файл: IN=/path/to/video.mov $0" >&2
  exit 1
fi
ffmpeg -y -i "$SRC" -an \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p" \
  -c:v libx264 -preset medium -crf 27 -movflags +faststart \
  "$ROOT/public/leaves-wall.mp4"
