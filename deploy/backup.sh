#!/bin/sh
# Copia de seguridad diaria de la base (formato comprimido de pg_dump).
# Restaurar: ver DEPLOY.md, sección "Restaurar una copia".
set -eu
echo "Copias de seguridad: una por día en /backups, se guardan ${DIAS_A_GUARDAR} días"
while true; do
  archivo="/backups/prexacode-$(date +%Y%m%d-%H%M).dump"
  if pg_dump -Fc -f "$archivo.tmp"; then
    mv "$archivo.tmp" "$archivo"
    echo "$(date) OK $archivo ($(du -h "$archivo" | cut -f1))"
  else
    rm -f "$archivo.tmp"
    echo "$(date) ERROR: no se pudo hacer la copia" >&2
  fi
  find /backups -name 'prexacode-*.dump' -mtime +"${DIAS_A_GUARDAR}" -delete
  sleep 86400
done
