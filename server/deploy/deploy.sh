#!/usr/bin/env bash
# Actualiza la API en el servidor. Uso (en el servidor): bash ~/turiexpress/server/deploy/deploy.sh
# Las migraciones nuevas se aplican solas al arrancar el servicio.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p ~/backups
set -a; . ./.env; set +a
pg_dump "$DATABASE_URL" -Fc -f ~/backups/turiexpress-$(date +%F-%H%M).dump
# Conserva solo los últimos 30 respaldos.
ls -1t ~/backups/turiexpress-*.dump | tail -n +31 | xargs -r rm --

# Claves push: se generan una sola vez si faltan.
if ! grep -q '^VAPID_PUBLIC_KEY=.\+' .env; then
  keys=$(npx --yes web-push generate-vapid-keys --json)
  sed -i '/^VAPID_PUBLIC_KEY=/d;/^VAPID_PRIVATE_KEY=/d' .env
  echo "VAPID_PUBLIC_KEY=$(node -pe 'JSON.parse(process.argv[1]).publicKey' "$keys")" >> .env
  echo "VAPID_PRIVATE_KEY=$(node -pe 'JSON.parse(process.argv[1]).privateKey' "$keys")" >> .env
  echo "Claves VAPID generadas."
fi

# Respaldo nocturno automático (sin sudo: crontab del usuario) y carpeta de fotos.
mkdir -p uploads
{ crontab -l 2>/dev/null | grep -v 'deploy/backup.sh' || true; echo "30 2 * * * bash $PWD/deploy/backup.sh >> $HOME/backups/backup.log 2>&1"; } | crontab -
echo "Respaldo nocturno programado (02:30)." 

npm ci --no-audit --no-fund
npm run build
sudo /usr/bin/systemctl restart turiexpress-api
sleep 3
curl -fsS http://127.0.0.1:3000/v1/health && echo " API OK"
