#!/usr/bin/env bash
# Publishes public/ to https://www.psistorm.com/geodrive/ (static files, no service, no Apache change).
set -euo pipefail

KEY="${GEODRIVE_SSH_KEY:-$HOME/Downloads/karl ptfs aws.pem}"
HOST="ec2-user@psistorm.com"
REMOTE="/var/www/html/psistorm/geodrive"
LOGS="/var/www/html/psistorm/geodrive-logs" # beside the deployed folder, which rsync --delete would empty; apache writes here
CACHE="/var/www/html/psistorm/geodrive-cache" # the same, for places.php's copies of Overture's data
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15)

[ -f "$HERE/public/config.json" ] || { echo "public/config.json is missing (copy config.example.json and set the key)"; exit 1; }

"${SSH[@]}" "$HOST" "mkdir -p '$REMOTE' '$LOGS' '$CACHE' && chgrp apache '$LOGS' '$CACHE' && chmod 2775 '$LOGS' '$CACHE' && echo 'Require all denied' > '$LOGS/.htaccess' && echo 'Require all denied' > '$CACHE/.htaccess'"
rsync -rlt --delete --exclude '.DS_Store' --exclude 'config.example.json' --exclude '_*.html' -e "ssh -i '$KEY' -o BatchMode=yes" "$HERE/public/" "$HOST:$REMOTE/"
# rsync from the Mac can copy restrictive modes, and the apache user has to be able to read everything.
"${SSH[@]}" "$HOST" "find '$REMOTE' -type d -exec chmod 755 {} + ; find '$REMOTE' -type f -exec chmod 644 {} +"
# The world server, once scripts/install-server.sh has put it there. It only restarts if its code changed, as everyone playing is cut off for a moment and reconnects.
if "${SSH[@]}" "$HOST" "test -d /opt/geodrive/server"; then
  RSYNC=(rsync -rlti --delete --checksum -e "ssh -i '$KEY' -o BatchMode=yes")
  changed=$("${RSYNC[@]}" --exclude node_modules --exclude .DS_Store "$HERE/server/" "$HOST:/opt/geodrive/server/"; "${RSYNC[@]}" "$HERE/public/js/protocol.js" "$HERE/public/js/gameConfig.js" "$HERE/public/js/worldOps.js" "$HERE/public/js/worldCars.js" "$HERE/public/js/road.js" "$HERE/public/js/carDamage.js" "$HERE/public/js/physics.js" "$HERE/public/js/testTools.js" "$HERE/public/js/cars.js" "$HERE/public/js/itemArt.js" "$HOST:/opt/geodrive/public/js/")
  if [ -n "$changed" ]; then
    "${SSH[@]}" "$HOST" "bash -s" < "$HERE/scripts/update-server.sh"
    echo "World server updated and restarted."
  fi
fi
echo "Deployed: https://www.psistorm.com/geodrive/"
