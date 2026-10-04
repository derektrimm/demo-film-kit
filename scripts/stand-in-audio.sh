#!/usr/bin/env bash
# Synthesizes stand-in audio so the whole pipeline runs before the real score and effects exist:
# out/audio/music.mp3 (a 36 s pad with one hit at 22.0 s) and out/audio/sfx/whoosh.mp3, impact.mp3.
# Replace every file with the real thing before anyone sees the trailer.
#   scripts/stand-in-audio.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out/audio/sfx
ffmpeg -loglevel error -y \
  -f lavfi -i "sine=f=110:d=36:sample_rate=48000" -f lavfi -i "sine=f=164.81:d=36:sample_rate=48000" \
  -f lavfi -i "sine=f=220:d=36:sample_rate=48000" -f lavfi -i "sine=f=261.63:d=36:sample_rate=48000" \
  -f lavfi -i "sine=f=55:d=3:sample_rate=48000" -f lavfi -i "anoisesrc=d=0.5:c=brown:r=48000:a=0.8" \
  -f lavfi -i "sine=f=329.63:d=14:sample_rate=48000" -f lavfi -i "sine=f=440:d=14:sample_rate=48000" \
  -filter_complex "\
[0][1][2][3]amix=inputs=4:normalize=0,volume=0.12,tremolo=f=0.25:d=0.35,afade=t=in:d=4,afade=t=out:st=31:d=5[pad];\
[4]afade=t=out:st=0:d=3:curve=exp,volume=0.9[boom];[5]lowpass=f=400,afade=t=out:st=0:d=0.5:curve=exp,volume=0.8[thump];\
[boom][thump]amix=inputs=2:normalize=0,adelay=22000|22000[hit];\
[6][7]amix=inputs=2:normalize=0,volume=0.08,afade=t=in:d=0.05,afade=t=out:st=9:d=5,adelay=22000|22000[lift];\
[pad][hit][lift]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.9,aformat=channel_layouts=stereo" \
  -c:a libmp3lame -b:a 192k out/audio/music.mp3
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=d=1:c=pink:r=48000:a=0.9" \
  -af "highpass=f=300,lowpass=f=6000,afade=t=in:d=0.6:curve=qsin,afade=t=out:st=0.6:d=0.4,aformat=channel_layouts=stereo" \
  -c:a libmp3lame -b:a 192k out/audio/sfx/whoosh.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=f=60:d=1.2:sample_rate=48000" -f lavfi -i "anoisesrc=d=0.2:c=brown:r=48000:a=0.9" \
  -filter_complex "[0]afade=t=out:st=0:d=1.2:curve=exp[a];[1]lowpass=f=900,afade=t=out:st=0:d=0.2[b];[a][b]amix=inputs=2:normalize=0:duration=first,aformat=channel_layouts=stereo" \
  -c:a libmp3lame -b:a 192k out/audio/sfx/impact.mp3
echo "stand-in audio: out/audio/music.mp3, out/audio/sfx/whoosh.mp3, out/audio/sfx/impact.mp3"
