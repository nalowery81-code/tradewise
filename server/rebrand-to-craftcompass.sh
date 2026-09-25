#!/usr/bin/env bash
set -euo pipefail

OLD_HOST="tradewise-server"
NEW_HOST="craftcompass-server"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/craftcompass-rebrand-backup-$STAMP"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "1/5 Backing up server identity files..."
cp -a /etc/hostname "$BACKUP_DIR/hostname" 2>/dev/null || true
cp -a /etc/hosts "$BACKUP_DIR/hosts" 2>/dev/null || true

echo "2/5 Renaming hostname to $NEW_HOST..."
hostnamectl set-hostname "$NEW_HOST"

if grep -qE "(^|[[:space:]])$OLD_HOST([[:space:]]|$)" /etc/hosts; then
  cp -a /etc/hosts "$BACKUP_DIR/hosts-before-rewrite"
  sed -i "s/\b$OLD_HOST\b/$NEW_HOST/g" /etc/hosts
fi

echo "3/5 Updating visible dashboard branding when common dashboard files exist..."
dashboard_candidates=(
  "/var/www/html/dashboard.html"
  "/var/www/html/index.html"
  "/usr/share/nginx/html/dashboard.html"
  "/usr/share/nginx/html/index.html"
)
for file in "${dashboard_candidates[@]}"; do
  if [[ -f "$file" ]]; then
    cp -a "$file" "$BACKUP_DIR/$(basename "$file").bak"
    sed -i       -e 's/Tradewise server/CraftCompass AI server/g'       -e 's/Tradewise Server/CraftCompass AI Server/g'       -e 's/Tradewise/CraftCompass AI/g'       -e 's/tradewise-server/craftcompass-server/g'       "$file"
    echo "Updated $file"
  fi
done

echo "4/5 Moving the legacy backup folder if present..."
if [[ -d /home/nate/tradewise-backups && ! -e /home/nate/craftcompass-backups ]]; then
  mv /home/nate/tradewise-backups /home/nate/craftcompass-backups
  ln -s /home/nate/craftcompass-backups /home/nate/tradewise-backups
  echo "Moved /home/nate/tradewise-backups -> /home/nate/craftcompass-backups and left a compatibility symlink."
fi

echo "5/5 Reloading nginx if installed..."
if systemctl list-unit-files nginx.service >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx
fi

echo
echo "CraftCompass server rebrand complete."
echo "New hostname: $(hostname)"
echo "Backup: $BACKUP_DIR"
echo
echo "NOTE: Existing systemd service names such as tradewise-dashboard.service are intentionally unchanged."
echo "They are internal identifiers and can be renamed later after dependency review."
