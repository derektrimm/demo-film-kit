#!/usr/bin/env bash
# Encodes web renditions of a finished trailer: AV1, HEVC (Main tier) and H.264 at 1080p60, H.264 at 720p60,
# and a WebP poster. Offer them in that order in a <video> element's <source> list.
#   scripts/renditions.sh <trailer.mp4> <out-dir> [poster seconds=5]
set -euo pipefail
[[ $# -ge 2 ]] || { echo "usage: scripts/renditions.sh <trailer.mp4> <out-dir> [poster seconds]" >&2; exit 2; }
S="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; mkdir -p "$2"; cd "$2"
name="$(basename "$1" .mp4)"
A="-c:a aac -b:a 160k -ar 48000"
C="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart"
nice -n 19 ffmpeg -loglevel error -y -ss "${3:-5}" -i "$S" -frames:v 1 -c:v libwebp -quality 86 "$name-poster.webp"
# SVT-AV1 logs on its own unless SVT_LOG says otherwise.
SVT_LOG=1 nice -n 19 ffmpeg -loglevel error -y -i "$S" -c:v libsvtav1 -preset 3 -crf 25 -g 120 -pix_fmt yuv420p -svtav1-params tune=0 $A $C "$name-1080-av1.mp4"
# x265 picks High tier once a level is set; Main tier matches the common codec string hvc1.1.6.L123.90.
nice -n 19 ffmpeg -loglevel error -y -i "$S" -c:v libx265 -preset slow -crf 19 -tag:v hvc1 -pix_fmt yuv420p -x265-params log-level=error:keyint=120:level-idc=41:no-high-tier=1 $A $C "$name-1080-hevc.mp4"
nice -n 19 ffmpeg -loglevel error -y -i "$S" -c:v libx264 -preset slow -profile:v high -level 4.2 -crf 19 -maxrate 12M -bufsize 24M -g 120 -pix_fmt yuv420p $A $C "$name-1080-h264.mp4"
nice -n 19 ffmpeg -loglevel error -y -i "$S" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -profile:v high -level 3.2 -crf 21 -maxrate 5M -bufsize 10M -g 120 -pix_fmt yuv420p $A $C "$name-720-h264.mp4"
ls -la "$PWD"
