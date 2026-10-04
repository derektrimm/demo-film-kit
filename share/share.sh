#!/usr/bin/env bash
# Shares a finished film with a private, unguessable public link, served from this computer.
#
#   share/share.sh <video.mp4> <slug> "<Title>" "<one-line description>" [poster-seconds] [fine print]
#   share/share.sh --off <slug>        take the link down and stop its server
#   share/share.sh --list              show every shared film and its link
#
# Needs Tailscale with Funnel enabled, and a Linux user systemd. Each film gets
# ~/.local/share/film-share/<slug>/ (video, poster, fonts, page, a random token and its own port), a
# user service film-share-<slug> that survives reboots, and a Funnel PATH mount /<token> on :8443,
# so it never replaces a route something else already serves there. The link works while this
# computer is on. SHARE_BRAND puts a name above the title on the page.
set -euo pipefail

ROOT="$HOME/.local/share/film-share"
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
FUNNEL_PORT=8443
host() { tailscale status --self --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0));process.stdout.write(j.Self.DNSName.replace(/\.$/,""))'; }

if [[ "${1:-}" == "--list" ]]; then
  for d in "$ROOT"/*/; do
    [[ -f "$d/.token" ]] || continue
    s=$(basename "$d"); echo "$s  $(cat "$d/.origin")/$(cat "$d/.token")/  ($(systemctl --user is-active "film-share-$s" 2>/dev/null || true))"
  done
  exit 0
fi

if [[ "${1:-}" == "--off" ]]; then
  slug="${2:?usage: share.sh --off <slug>}"; d="$ROOT/$slug"
  [[ -f "$d/.token" ]] || { echo "no shared film named $slug" >&2; exit 1; }
  tailscale funnel --https=$FUNNEL_PORT --set-path="/$(cat "$d/.token")" off || true
  systemctl --user disable --now "film-share-$slug.service" || true
  rm -f "$HOME/.config/systemd/user/film-share-$slug.service"; systemctl --user daemon-reload
  echo "link for $slug is down (files kept in $d; delete the folder to remove them)"
  exit 0
fi

video="${1:?usage: share.sh <video.mp4> <slug> <title> <description> [poster-seconds] [fine]}"
slug="${2:?slug}"; title="${3:?title}"; desc="${4:?description}"; posterAt="${5:-}"; fine="${6:-}"
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "slug must be lowercase letters, digits and dashes" >&2; exit 1; }
[[ -f "$video" ]] || { echo "no such video: $video" >&2; exit 1; }

d="$ROOT/$slug"; mkdir -p "$d"
cp "$video" "$d/$slug.mp4"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$d/$slug.mp4")
[[ -n "$posterAt" ]] || posterAt=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d*0.2}')
ffmpeg -loglevel error -y -ss "$posterAt" -i "$d/$slug.mp4" -frames:v 1 -q:v 3 "$d/poster.jpg"
cp "$KIT/../public/fonts/sora-variable.woff2" "$KIT/../public/fonts/inter-variable.woff2" "$d/"
cp "$KIT/serve.mjs" "$d/serve.mjs"
[[ -s "$d/.token" ]] || { head -c 18 /dev/urandom | base64 | tr '+/' 'xy' | tr -d '=\n' > "$d/.token"; chmod 600 "$d/.token"; }
token=$(cat "$d/.token")
echo "https://$(host):$FUNNEL_PORT" > "$d/.origin"

# A port no listener and no other shared film holds.
if [[ ! -s "$d/.port" ]]; then
  taken=$(cat "$ROOT"/*/.port 2>/dev/null || true)
  for p in $(seq 8794 8899); do
    ss -ltn | grep -q ":$p " && continue
    grep -qx "$p" <<<"$taken" && continue
    echo "$p" > "$d/.port"; break
  done
fi
port=$(cat "$d/.port")

TITLE="$title" DESC="$desc" FINE="$fine" BRAND="${SHARE_BRAND:-}" VIDEO="$slug.mp4" node -e '
const fs=require("fs"); const esc=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
let p=fs.readFileSync(process.argv[1],"utf8");
for (const k of ["TITLE","DESC","FINE","BRAND","VIDEO"]) p=p.replaceAll("__"+k+"__", esc(process.env[k]));
fs.writeFileSync(process.argv[2], p);' "$KIT/page.html" "$d/index.html"

mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/film-share-$slug.service" <<EOF
[Unit]
Description=Share link for the film $slug (Tailscale Funnel :$FUNNEL_PORT/<token>)

[Service]
ExecStart=$NODE $d/serve.mjs
Restart=always
RestartSec=3
Nice=10

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable "film-share-$slug.service" >/dev/null 2>&1
systemctl --user restart "film-share-$slug.service"
for i in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.25; done

tailscale funnel --bg --https=$FUNNEL_PORT --set-path="/$token" "http://127.0.0.1:$port" >/dev/null

url="$(cat "$d/.origin")/$token/"
ok=1
code=$(curl -s -o /dev/null -w '%{http_code}' "$url"); [[ "$code" == 200 ]] || { echo "page answered $code" >&2; ok=0; }
code=$(curl -s -o /dev/null -r 0-1023 -w '%{http_code}' "$url$slug.mp4"); [[ "$code" == 206 ]] || { echo "video range answered $code" >&2; ok=0; }
code=$(curl -s -o /dev/null -w '%{http_code}' "${url}poster.jpg"); [[ "$code" == 200 ]] || { echo "poster answered $code" >&2; ok=0; }
[[ $ok == 1 ]] || { echo "share link FAILED its probe; not handing it out" >&2; exit 1; }
echo "$url"
