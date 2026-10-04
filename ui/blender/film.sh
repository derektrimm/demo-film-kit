#!/usr/bin/env bash
# Films Blender's own interface, frame by frame, for interface shots: a scene script sets up what is
# on screen, and film.py orbits the viewport and saves the whole window each frame.
#
#   ui/blender/film.sh <scene.py> <out dir> <frames> [probe]
#
# Blender runs on its own virtual display (Xvfb, 3840x2160, the UI at 2x: the same 1920x1080 layout at
# 2x that ui/record.mjs captures) with throwaway settings, so the Blender on your desktop and its
# preferences are never touched. `probe` films every 30th frame, to check framing quickly.
# BLENDER names the executable (default: blender on PATH). Linux only: it needs Xvfb.
set -euo pipefail
[[ $# -ge 3 ]] || { echo "usage: ui/blender/film.sh <scene.py> <out dir> <frames> [probe]" >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
blender=${BLENDER:-blender}
command -v "$blender" >/dev/null || [[ -x "$blender" ]] || { echo "no Blender: set BLENDER" >&2; exit 2; }
command -v Xvfb >/dev/null || { echo "Xvfb is required" >&2; exit 2; }
scene=$(cd "$(dirname "$1")" && pwd)/$(basename "$1"); mkdir -p "$2"; out=$(cd "$2" && pwd)
# A display number nothing else is using. Blender opens on Wayland whenever it can reach the desktop
# session, so WAYLAND_DISPLAY is dropped: it must open on this display only.
disp=91
while [ -e /tmp/.X11-unix/X$disp ] || [ -e /tmp/.X$disp-lock ]; do disp=$((disp + 1)); done
scratch=$(mktemp -d "${TMPDIR:-/tmp}/blender-film.XXXXXX")
Xvfb :$disp -screen 0 3840x2160x24 -nolisten tcp >"$scratch/xvfb.log" 2>&1 &
xvfb=$!
cleanup() { kill "$xvfb" 2>/dev/null || true; wait "$xvfb" 2>/dev/null || true; rm -rf "$scratch"; }
trap cleanup EXIT
for _ in $(seq 50); do [ -e /tmp/.X11-unix/X$disp ] && break; sleep 0.1; done
mkdir -p "$scratch/config" "$scratch/scripts"
env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 TMPDIR="$scratch" DISPLAY=:$disp BLENDER_USER_CONFIG="$scratch/config" BLENDER_USER_SCRIPTS="$scratch/scripts" \
  timeout "${BLENDER_FILM_TIMEOUT:-5400}" nice -n 19 "$blender" --factory-startup -p 0 0 3840 2160 --no-window-frame \
  --python "$here/film.py" -- "$scene" "$out" "$3" "${4:-}" 2>&1 | grep -vE '^(Read|Writing|Info: Saved|Fra:)' || true
grep -q . "$out/frames.json" 2>/dev/null && [[ -n "$(ls "$out"/bl-*.png 2>/dev/null)" ]] || { echo "Blender filmed nothing; see the output above" >&2; exit 1; }
