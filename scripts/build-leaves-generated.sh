#!/usr/bin/env bash
# Собирает public/leaves-generated.mp4 из двух кадров (по умолчанию leaves-gen-frame-a/b.png):
# плавный zoom + кроссфейд, 720×1280, 12 с, 30 fps. Нужен ffmpeg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/public"
VF='scale=-1:1920,crop=1080:1920:(iw-1080)/2:0,zoompan=z='"'"'if(eq(on,1),1,zoom+0.00055)'"'"':x='"'"'iw/2-(iw/zoom/2)'"'"':y='"'"'ih/2-(ih/zoom/2)'"'"':d=180:s=720x1280:fps=30,format=yuv420p'
ffmpeg -y -loop 1 -i leaves-gen-frame-a.png -vf "$VF" -frames:v 180 -c:v libx264 -crf 19 -pix_fmt yuv420p /tmp/leaves-seg-a.mp4
ffmpeg -y -loop 1 -i leaves-gen-frame-b.png -vf "$VF" -frames:v 180 -c:v libx264 -crf 19 -pix_fmt yuv420p /tmp/leaves-seg-b.mp4
ffmpeg -y -i /tmp/leaves-seg-a.mp4 -i /tmp/leaves-seg-b.mp4 \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.8:offset=5.2,format=yuv420p" \
  -c:v libx264 -crf 19 -pix_fmt yuv420p /tmp/leaves-gen-xf.mp4
ffmpeg -y -i /tmp/leaves-gen-xf.mp4 -vf "tpad=stop_mode=clone:stop_duration=0.8,format=yuv420p" \
  -c:v libx264 -crf 19 -pix_fmt yuv420p -movflags +faststart leaves-generated.mp4
