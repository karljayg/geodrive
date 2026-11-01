#!/usr/bin/env bash
# Copies the logs sent with the game's Send log button from the server into logs/.
set -euo pipefail

KEY="${GEODRIVE_SSH_KEY:-$HOME/Downloads/karl ptfs aws.pem}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$HERE/logs"
rsync -rt --include '*.json' --exclude '*' -e "ssh -i '$KEY' -o BatchMode=yes" "ec2-user@psistorm.com:/var/www/html/psistorm/geodrive-logs/" "$HERE/logs/"
ls -lt "$HERE/logs" | head
