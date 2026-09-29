#!/bin/sh
# Actualiza Prexacode en el servidor con lo último de GitHub.
# Uso (en el servidor):  sh /opt/prexacode/deploy/actualizar.sh
set -e
cd "$(dirname "$0")/.."
echo "Copia de seguridad antes de actualizar…"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/antes-de-actualizar-$(date +%Y%m%d-%H%M).dump"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Esperando que arranque…"
for i in $(seq 1 30); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then echo "Listo: $(git log --oneline -1)"; exit 0; fi
  sleep 5
done
echo "La app no respondió: revisar con  docker compose logs app"; exit 1
