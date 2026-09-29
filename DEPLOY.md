# Poner Prexacode en línea

Guía para instalar Prexacode en un servidor propio con Docker. Todo corre en un solo servidor:

- **app**: la web y la API en una sola pieza (Node 22).
- **db**: PostgreSQL 17.
- **HTTPS**: si el servidor ya tiene nginx (con otras aplicaciones), nginx publica Prexacode y certbot saca el certificado. Si el servidor está vacío, se puede usar **caddy** (incluido, opcional), que atiende los puertos 80/443 solo.
- **backup**: copia de seguridad de la base todos los días.

## 1. Lo que hace falta

| Qué | Recomendación | Costo aproximado |
|---|---|---|
| Servidor (VPS) | 2 vCPU, 4 GB de RAM, 40 GB de disco, Ubuntu 24.04. Por ejemplo Hetzner CX22, DigitalOcean o Vultr. Alcanza para las primeras decenas de empresas. | USD 5 a 12 por mes |
| Dominio | Uno `.com.ar` en NIC Argentina, o `.com` | ARS por año / USD 10–15 por año |
| Mercado Pago | Cuenta de la empresa que vende Prexacode, con credenciales de producción | Comisión por cobro |
| Correo (opcional) | Un servicio de envío de emails (Brevo, Amazon SES, Resend) para los avisos de la plataforma | Gratis en volumen bajo |

## 2. Preparar el dominio

En el panel donde compraste el dominio, creá un registro **A** que apunte al IP del servidor. Ejemplo: `app.prexacode.com.ar → 203.0.113.10`.

Tiene que estar funcionando antes de sacar el certificado HTTPS.

## 3. Instalar Docker en el servidor

```bash
ssh root@IP-DEL-SERVIDOR
curl -fsSL https://get.docker.com | sh
```

## 4. Subir el sistema y configurarlo

```bash
git clone <URL-DEL-REPOSITORIO> prexacode
cd prexacode
cp .env.example .env
nano .env
```

Completá en `.env`:

- **`APP_URL`**: la dirección pública, con `https://` (ej. `https://sistema.prexacode.com`).
- **`PUERTO_APP`**: puerto local donde escucha la app (por defecto 8010; que no lo use otra aplicación del servidor).
- **`DOMINIO`**: solo si usás Caddy.
- **`POSTGRES_PASSWORD`**: una clave larga.
- **`JWT_SECRET` y `SECRETS_KEY`**: generalas con `openssl rand -hex 32`.
  - `SECRETS_KEY` cifra las contraseñas de email y los certificados de ARCA que guardan los clientes.
  - **Guardala en un lugar seguro y no la cambies nunca.** Si se pierde, esos datos no se pueden leer.
- **`ADMIN_EMAIL`** y **`ADMIN_PASSWORD`**: tu usuario del panel de administración. Se crea solo la primera vez que arranca el servidor (si ya hay administradores, no se toca). Usá una contraseña larga y cambiala desde el panel después de entrar.
- **`MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`**: los de Mercado Pago (ver el paso 6).

Arrancá todo:

```bash
# Servidor con nginx (compartido con otras aplicaciones)
docker compose up -d --build

# Servidor vacío: con Caddy atendiendo 80/443 y HTTPS automático
docker compose --profile caddy up -d --build
```

Con nginx, publicá el sitio y sacá el certificado:

```bash
cp deploy/nginx-sistema.conf /etc/nginx/sites-available/sistema.prexacode.com
ln -s /etc/nginx/sites-available/sistema.prexacode.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d sistema.prexacode.com
```

Si falta algo importante en `.env`, la app **no arranca** y el log dice exactamente qué falta:

```bash
docker compose logs app
```

## 5. Verificar

- Entrá a `https://tu-dominio/api/health`. Tiene que decir `{"ok":true}`.
- Entrá a `https://tu-dominio/admin` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`: es tu panel, separado de las cuentas de las empresas.
- Desde **Administradores** podés cambiar tu contraseña y sumar a otra persona.

## 6. Mercado Pago

1. En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) creá una aplicación del tipo *Pagos online · Checkout Pro*.
2. Copiá el **Access Token de producción** en `MP_ACCESS_TOKEN`.
3. En **Webhooks**:
   - Configurá la URL `https://tu-dominio/api/suscripcion/webhook/mercadopago`.
   - Marcá el evento **Pagos**.
   - Copiá la **clave secreta** en `MP_WEBHOOK_SECRET`.
4. Aplicá los cambios con `docker compose up -d`.
5. Hacé un pago real de prueba de un mes y verificá que la suscripción quede **Activa**. Si hace falta, podés devolver el importe desde Mercado Pago.

## 7. Antes de cobrarle a clientes reales

- [ ] Completar los datos del proveedor en `src/config/legal.ts`: razón social, CUIT, domicilio, email y ciudad de los tribunales.
- [ ] Hacer revisar por un abogado los Términos y la Política de Privacidad (`src/modules/legal/textos.ts`).
- [ ] Al cambiar esos textos, actualizar `TERMINOS_VERSION` en `server/src/lib/legal.ts`. Así, cada administrador tiene que aceptarlos de nuevo y queda registrado.
- [ ] Registrar la base de datos en la Agencia de Acceso a la Información Pública (Ley 25.326), como indique el abogado.
- [ ] Probar la facturación contra la **homologación real de ARCA** con un certificado de prueba.

## 8. Copias de seguridad

Todos los días a la misma hora se guarda una copia en `./backups`, y se conservan las de los últimos 14 días.

**Importante:** las copias quedan en el mismo servidor. Si el servidor se pierde, se pierden con él. Llevalas también a otro lugar. Opciones:

- **Almacenamiento externo:** con [rclone](https://rclone.org/) hacia Google Drive, S3 o Backblaze. Configurado en `cron`, por ejemplo una vez por día.
- **Snapshots del proveedor del VPS:** la mayoría los ofrece por un costo bajo.

### Restaurar una copia

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists -U prexacode -d prexacode < backups/prexacode-AAAAMMDD-HHMM.dump
docker compose start app
```

Probá restaurar una copia de vez en cuando: una copia que nunca se probó no es una copia.

## 9. Actualizar a una versión nueva

```bash
cd prexacode
git pull
docker compose up -d --build
```

Las migraciones de la base se aplican solas al arrancar.

## 10. Monitoreo

- Usá un servicio gratuito como UptimeRobot o Better Stack para vigilar `https://tu-dominio/api/health` cada 5 minutos, con aviso por email.
- Ver los logs con `docker compose logs -f app`.
- Ver el espacio en disco con `df -h`. Revisá la carpeta `backups` y el volumen de la base.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| La app no arranca y el log dice "Configuración incompleta para producción" | Falta algo en `.env`. El mensaje dice qué. |
| El sitio no carga con https | El registro A del dominio todavía no apunta al servidor, o los puertos 80 y 443 están cerrados en el firewall. |
| Los pagos quedan "Pendiente" | El webhook de Mercado Pago no está configurado, o `MP_WEBHOOK_SECRET` no coincide. |
| "Demasiados intentos" al entrar | El límite de intentos de login por IP (10 cada 5 minutos). Se libera solo. |
