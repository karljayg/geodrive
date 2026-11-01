#!/usr/bin/env bash
# Publishes public/ to https://www.psistorm.com/geodrive/ (static files, no service, no Apache change).
set -euo pipefail

KEY="${GEODRIVE_SSH_KEY:-$HOME/Downloads/karl ptfs aws.pem}"
HOST="ec2-user@psistorm.com"
REMOTE="/var/www/html/psistorm/geodrive"
LOGS="/var/www/html/psistorm/geodrive-logs" # beside the deployed folder, which rsync --delete would empty; apache writes here
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15)

[ -f "$HERE/public/config.json" ] || { echo "public/config.json is missing (copy config.example.json and set the key)"; exit 1; }

"${SSH[@]}" "$HOST" "mkdir -p '$REMOTE' '$LOGS' && chgrp apache '$LOGS' && chmod 2775 '$LOGS' && echo 'Require all denied' > '$LOGS/.htaccess'"
rsync -rlt --delete --exclude '.DS_Store' --exclude 'config.example.json' -e "ssh -i '$KEY' -o BatchMode=yes" "$HERE/public/" "$HOST:$REMOTE/"
# rsync from the Mac can copy restrictive modes, and the apache user has to be able to read everything.
"${SSH[@]}" "$HOST" "find '$REMOTE' -type d -exec chmod 755 {} + ; find '$REMOTE' -type f -exec chmod 644 {} +"
echo "Deployed: https://www.psistorm.com/geodrive/"
