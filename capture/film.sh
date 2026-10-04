#!/usr/bin/env bash
# Films a plan from the game's own built player into a near-lossless 1080p60 master.
#
#   PLAYER=<built player> capture/film.sh [plan.json] [take name]
#
# Defaults: plan-film.json, take "master". A stills plan (plan-stills.json) writes PNGs to capture/stills/
# instead, for checking framing before filming. Writes capture/<take>.mp4, <take>-manifest.txt (the frame each
# shot starts on), <take>-sounds.txt (sounds the game reported) and <take>.log (the player's log). Raw RGB24
# frames, bottom row first, stream through a FIFO into ffmpeg; the director locks the game's clock, so render
# speed never touches timing. FLAG is the director's switch (default -trailer).
#
# On Linux the player's saves go to scratch folders (XDG_CONFIG_HOME, XDG_DATA_HOME), so filming never touches
# real saves. On macOS and Windows a Unity player saves under the user's Library or AppData: back saves up first.
set -euo pipefail
cd "$(dirname "$0")"
PLAN="${1:-plan-film.json}"; NAME="${2:-master}"
PLAYER="${PLAYER:?set PLAYER to the built player executable}"
[[ -x "$PLAYER" ]] || { echo "not an executable player: $PLAYER" >&2; exit 2; }
FLAG="${FLAG:--trailer}"
[[ -f "$PLAN" ]] || { echo "no plan $PLAN: run python3 capture/plan.py film" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 2; }
LIMIT=(); command -v timeout >/dev/null && LIMIT=(timeout 3600)
rm -f frames.fifo manifest.txt sounds.txt probe.txt
rm -rf data cfg; mkdir -p data cfg
STILLS=0; grep -q '"stillsDir"' "$PLAN" && STILLS=1
if [[ $STILLS -eq 1 ]]; then
  rm -rf stills
  XDG_CONFIG_HOME=$PWD/cfg XDG_DATA_HOME=$PWD/data nice -n 19 ${LIMIT[@]+"${LIMIT[@]}"} "$PLAYER" -screen-fullscreen 0 -screen-width 960 -screen-height 540 \
    -logFile "$PWD/$NAME.log" "$FLAG" "$PWD/$PLAN" >/dev/null 2>&1 || true
  rm -rf data cfg
  grep -o "TRAILER_OK.*" "$NAME.log" && { echo "capture/stills/ ($(ls stills/*.png | wc -l) stills)"; exit 0; }
  grep -o "TRAILER_FAILED.*" "$NAME.log" >&2 || echo "stills failed; see capture/$NAME.log" >&2
  exit 1
fi
mkfifo frames.fifo
nice -n 19 ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s 1920x1080 -framerate 60 -i frames.fifo -vf vflip \
  -c:v libx264 -preset medium -crf 10 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$NAME.mp4" &
FF=$!
status=0
XDG_CONFIG_HOME=$PWD/cfg XDG_DATA_HOME=$PWD/data nice -n 19 ${LIMIT[@]+"${LIMIT[@]}"} "$PLAYER" -screen-fullscreen 0 -screen-width 960 -screen-height 540 \
  -logFile "$PWD/$NAME.log" "$FLAG" "$PWD/$PLAN" >/dev/null 2>&1 || status=$?
# A player that fails, perhaps before it ever opened the FIFO, must not leave ffmpeg waiting for frames.
# ffmpeg rides out a polite stop while it waits on the FIFO, so the failed capture's encoder is killed outright.
grep -q "TRAILER_OK" "$NAME.log" 2>/dev/null || kill -9 $FF 2>/dev/null || true
wait $FF 2>/dev/null || status=$?
rm -rf frames.fifo data cfg
[[ -f manifest.txt ]] && mv manifest.txt "$NAME-manifest.txt"
[[ -f sounds.txt ]] && mv sounds.txt "$NAME-sounds.txt"
if grep -q "TRAILER_OK" "$NAME.log" && [[ $status -eq 0 ]]; then
  grep -o "TRAILER_OK.*" "$NAME.log"
  echo "capture/$NAME.mp4"
else
  grep -o "TRAILER_FAILED.*" "$NAME.log" >&2 || echo "capture failed (exit $status); see capture/$NAME.log" >&2
  exit 1
fi
