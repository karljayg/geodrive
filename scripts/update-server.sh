#!/usr/bin/env bash
# Runs on the server, from deploy.sh, after new code arrives. One at a time, as two at once wrecked the packages on 2026-11-02. Packages are only rebuilt when the
# list changes, in a folder of their own, and swapped in only once they load, so a failure leaves the old ones. Compiling takes about a minute.
set -euo pipefail
exec 9>/opt/geodrive/.update.lock
flock 9
cd /opt/geodrive/server

wanted=$(sha256sum package-lock.json | cut -d' ' -f1)
have=$(cat /opt/geodrive/.packages 2>/dev/null || true)
if [ "$wanted" != "$have" ] || [ ! -d node_modules/better-sqlite3 ]; then
  build=$(mktemp -d /opt/geodrive/.build.XXXXXX)
  trap 'rm -rf "$build"' EXIT
  cp package.json package-lock.json "$build/"
  (cd "$build" && npm ci --omit=dev --no-audit --no-fund >/dev/null)
  (cd "$build" && /opt/geodrive/node -e "new (require('better-sqlite3'))(':memory:'); require('ws')")
  rm -rf node_modules.old
  [ ! -e node_modules ] || mv node_modules node_modules.old
  mv "$build/node_modules" node_modules
  rm -rf node_modules.old
  echo "$wanted" > /opt/geodrive/.packages
fi

sudo systemctl restart geodrive
sleep 2
curl -fsS http://127.0.0.1:5175/health >/dev/null || { echo "The world server didn't come back after restarting."; sudo journalctl -u geodrive -n 20 --no-pager; exit 1; }
