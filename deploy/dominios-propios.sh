#!/bin/sh
# Separa los dominios de los dos productos (se corre una sola vez, en el servidor, como root):
#   - CoreDental en app.coredental.com.ar (ya apuntado a 127.0.0.1:8010; falta recargar nginx)
#   - coredental.prexacode.com redirige a app.coredental.com.ar (los links viejos siguen andando)
#   - Landing nueva de CoreDental en coredental.com.ar (la vieja queda respaldada)
#   - Landing de Prexacode en productos.prexacode.com, con certificado
# NO toca ovk.coredental.com.ar ni ninguna otra aplicación del servidor.
# Uso:  sh /opt/prexacode/deploy/dominios-propios.sh
set -e
cd /opt/prexacode
FECHA=$(date +%Y%m%d-%H%M)
mkdir -p /root/backups

echo "1. Respaldo de la landing vieja de coredental.com.ar y de la config de coredental.prexacode.com"
tar czf /root/backups/landing-coredental-vieja-$FECHA.tar.gz -C /var/www landing
cp "$(readlink -f /etc/nginx/sites-enabled/coredental.prexacode.com)" /root/backups/nginx-coredental.prexacode.com-$FECHA.conf

echo "2. Landings nuevas"
cp landing-coredental/index.html landing-coredental/styles.css landing-coredental/script.js /var/www/landing/
cp landing/index.html /var/www/productos/index.html

echo "3. coredental.prexacode.com redirige a app.coredental.com.ar"
cp deploy/nginx-coredental.conf "$(readlink -f /etc/nginx/sites-enabled/coredental.prexacode.com)"

echo "4. Recargar nginx (activa app.coredental.com.ar y la redirección)"
nginx -t
systemctl reload nginx

echo "5. Certificado de productos.prexacode.com"
certbot --nginx -d productos.prexacode.com --non-interactive --redirect --agree-tos --register-unsafely-without-email || echo "   (certbot falló: revisar que el DNS apunte a este servidor)"

echo "Listo. Verificar:"
for u in https://app.coredental.com.ar/api/health https://coredental.com.ar/ https://productos.prexacode.com/ https://sistema.prexacode.com/api/health https://ovk.coredental.com.ar/; do
  echo "  $u $(curl -s -o /dev/null -w '%{http_code}' $u)"
done
echo "  coredental.prexacode.com -> $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://coredental.prexacode.com/login)"
