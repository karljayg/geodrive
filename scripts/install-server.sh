#!/usr/bin/env bash
# First-time install of the world server on the shared machine, run once by hand: its user, folders, key, service and Apache file. Safe to run again. It never
# touches Agecraft, and it checks Apache's configuration before the one graceful reload, taking its own file back out if the check fails.
# After this, `npm run deploy` keeps the server's code up to date.
set -euo pipefail

KEY="${GEODRIVE_SSH_KEY:-$HOME/Downloads/karl ptfs aws.pem}"
HOST="ec2-user@psistorm.com"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15)
RSYNC=(rsync -rlt -e "ssh -i '$KEY' -o BatchMode=yes")

"${SSH[@]}" "$HOST" 'set -euo pipefail
  id geodrive >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /sbin/nologin geodrive
  sudo mkdir -p /opt/geodrive/server /opt/geodrive/public/js /etc/geodrive /var/lib/geodrive/worlds
  sudo chown -R ec2-user:ec2-user /opt/geodrive
  sudo chown -R geodrive:geodrive /var/lib/geodrive
  sudo chmod 700 /var/lib/geodrive
  [ -x /opt/geodrive/node ] || cp "$(readlink -f "$(command -v node)")" /opt/geodrive/node
  if ! sudo test -f /etc/geodrive/config.json; then
    key=$(head -c 32 /dev/urandom | base64 -w0)
    printf "{\n  \"port\": 5175,\n  \"worlds\": \"/var/lib/geodrive/worlds\",\n  \"origins\": [\"https://www.psistorm.com\", \"https://psistorm.com\"],\n  \"saveKey\": \"%s\"\n}\n" "$key" | sudo tee /etc/geodrive/config.json >/dev/null
  fi
  sudo chown root:geodrive /etc/geodrive/config.json
  sudo chmod 640 /etc/geodrive/config.json
'

"${RSYNC[@]}" --exclude node_modules "$HERE/server/" "$HOST:/opt/geodrive/server/"
"${RSYNC[@]}" "$HERE/public/js/protocol.js" "$HERE/public/js/gameConfig.js" "$HERE/public/js/worldOps.js" "$HERE/public/js/worldCars.js" "$HERE/public/js/road.js" "$HERE/public/js/carDamage.js" "$HERE/public/js/physics.js" "$HERE/public/js/testTools.js" "$HERE/public/js/cars.js" "$HERE/public/js/itemArt.js" "$HOST:/opt/geodrive/public/js/"
"${RSYNC[@]}" "$HERE/scripts/geodrive.service" "$HERE/scripts/geodrive-proxy.conf" "$HOST:/tmp/"

"${SSH[@]}" "$HOST" 'set -euo pipefail
  [ -d /opt/geodrive/server/node_modules/better-sqlite3 ] || (cd /opt/geodrive/server && npm ci --omit=dev --no-audit --no-fund)
  sudo install -m 644 -o root -g root /tmp/geodrive.service /etc/systemd/system/geodrive.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now geodrive
  sleep 2
  systemctl is-active geodrive
  curl -fsS http://127.0.0.1:5175/health && echo " (the service answers)"
  sudo install -m 644 -o root -g root /tmp/geodrive-proxy.conf /etc/httpd/conf.d/geodrive-proxy.conf
  if ! sudo apachectl configtest; then
    sudo rm -f /etc/httpd/conf.d/geodrive-proxy.conf
    echo "Apache did not accept the file, so it was taken out and nothing was reloaded."
    exit 1
  fi
  sudo systemctl reload httpd
  rm -f /tmp/geodrive.service /tmp/geodrive-proxy.conf
'
echo "Installed. The world server is at wss://www.psistorm.com/geodrive/ws"
