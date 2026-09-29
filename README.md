# Prexacode · Gestión para empresas

Sistema de gestión enlatado (CRM + ERP liviano) para PyMEs argentinas: clientes, oportunidades, agenda configurable, facturación electrónica ARCA, productos y stock, con integraciones de email y WhatsApp.

## Estado

| Módulo | Estado |
|---|---|
| Cuenta de empresa (registro), login, sesión | ✅ Conectado a la API, con pruebas |
| Usuarios y roles (Configuración → Usuarios) | ✅ Conectado a la API, con pruebas |
| Clientes | ✅ Conectado a la API, con pruebas |
| Productos, stock y movimientos | ✅ Conectado a la API, con pruebas |
| Datos de la empresa y logo | ✅ Conectado a la API, con pruebas |
| Notificaciones (stock bajo / sin stock) configurables por usuario | ✅ Con pruebas |
| Aviso de edición simultánea (clientes y productos) | ✅ Con pruebas |
| Importar y exportar clientes y productos (Excel / CSV) | ✅ Con pruebas |
| Términos y Condiciones y Privacidad completos (falta de pago, limitación de responsabilidad, indemnidad, datos, ARCA); aceptación registrada con IP y nueva aceptación obligatoria al cambiar la versión | ✅ Con pruebas · ⚠️ completar datos del proveedor (`src/config/legal.ts`) y revisar con abogado |
| Botón de baja y Botón de arrepentimiento (públicos, con código de constancia) y baja desde la app | ✅ Con pruebas |
| Panel de administración (`/admin`, con usuario y contraseña propios): resumen con MRR e ingresos por mes, empresas, detalle con actividad, extender, pagos manuales, cambiar plan, suspender, pedidos legales, auditoría, administradores | ✅ Con pruebas |
| Cambios de plan a mitad de período: subir o sumar usuarios cobra lo proporcional; bajar queda para la renovación | ✅ Con pruebas |
| Responsive: celular y tablet (todas las pantallas verificadas) | ✅ Con pruebas |
| Un usuario, una sesión: entrar en otro dispositivo cierra la anterior (y el panel lo marca como posible usuario compartido); suspender o cambiar el rol vale en el momento | ✅ Con pruebas |
| Centro de ayuda: botón ? (o F1) con buscador de "cómo se hace", según la pantalla y el rol | ✅ Con pruebas |
| Soporte: la empresa abre pedidos, se responden desde el panel (aviso en la campanita y por email) | ✅ Con pruebas |
| Roles personalizados: casillas de permisos por sección, roles pre armados editables, varios administradores (siempre queda al menos uno); el menú y los botones siguen los permisos | ✅ Con pruebas |
| Empleados y sueldos (simple): legajo, sueldo con extras y descuentos, adelantos que se descuentan solos, aguinaldo, vacaciones según la LCT, comprobante interno imprimible | ✅ Con pruebas |
| Empresas de demostración: `npm --prefix server run demos` (con el servidor apagado) crea demo1 (ferretería, facturas A/B) y demo2 (servicio técnico monotributista, facturas C) con 5 meses de historia · contraseña Demo12345 | ✅ |
| Emails automáticos: bienvenida, recuperar contraseña (link de un solo uso, 1 hora), avisos de la suscripción a los administradores, recordatorio de facturas por vencer y vencidas a los clientes (opcional); tareas automáticas cada hora en el servidor | ✅ Con pruebas |
| Carga masiva: planillas parciales (solo stock o solo precios), aumento de precios por %, edición masiva de productos y clientes, CSV de Excel en español (Windows-1252) | ✅ Con pruebas |
| Cliente torpe: 3.000+ cargas erróneas (vacíos, letras en números, negativos, gigantes, fechas imposibles, emojis, dobles clics) sin ningún error interno | ✅ Con pruebas (también en PostgreSQL) |
| Producción: una sola pieza (la API sirve la web), encabezados de seguridad, límite de intentos en login, validación de configuración, Docker + PostgreSQL + HTTPS + copias diarias | ✅ Con pruebas (e2e contra el servidor de producción y API contra PostgreSQL 18 real) · ver [DEPLOY.md](DEPLOY.md) |
| Remitos (numeración, descuento y devolución de stock, impresión con logo) | ✅ Con pruebas |
| Facturación A/B/C y notas de crédito (IVA por alícuota, CAE, QR, stock, puntos de venta) | ✅ Con pruebas |
| Conexión real con ARCA: pedido de certificado (CSR) generado en el sistema, carga del certificado, WSAA (ticket cacheado 12 h) y WSFEv1 (CAE), homologación y producción | ✅ Con pruebas contra un ARCA falso que responde como el real (firma verificada con OpenSSL) · ⏳ falta probarlo contra la homologación real con un certificado de la empresa |
| Cobranzas: recibos, medios de pago, pagos parciales y a cuenta, cuenta corriente, antigüedad de deuda, aviso de vencidas | ✅ Con pruebas |
| Inicio: indicadores reales, ventas de 12 meses, vencidas, stock a reponer y "Primeros pasos" | ✅ Con pruebas |
| Presupuestos (pasan a factura con un clic) | ✅ Con pruebas |
| Reportes: ventas, Libro IVA Ventas, Excel | ✅ Con pruebas |
| Agenda configurable por rubro, con avisos y control de superposición | ✅ Con pruebas |
| Oportunidades: embudo con arrastrar y soltar, prospectos, motivo de pérdida, vínculo con presupuesto (se gana sola al facturar) | ✅ Con pruebas |
| Enviar facturas y presupuestos: link público (el cliente lo ve y guarda en PDF sin usuario), email por SMTP propio (contraseña cifrada) y WhatsApp (abre el chat con el mensaje listo); envío automático de la factura al emitir | ✅ Con pruebas (incluye envío real contra un servidor SMTP de prueba) |
| WhatsApp automático (API oficial de Meta) | ⏳ Próximamente |
| Suscripciones: prueba gratis de 14 días, planes con límite de usuarios y puntos de venta, usuarios adicionales, pago mensual o anual con Mercado Pago (en pesos al dólar oficial), 7 días de gracia y luego modo solo lectura | ✅ Con pruebas (contra un Mercado Pago falso; sin credenciales funciona un pago simulado) |

## Cómo levantarlo

Requiere Node 20 o superior. No hace falta instalar PostgreSQL: en desarrollo se usa PGlite (Postgres embebido) y los datos quedan en `server/.data/`.

```bash
npm install
npm install --prefix server
npm run dev        # levanta API (puerto 3001) + web (http://localhost:5173)
```

Entrá a http://localhost:5173/registro y creá la cuenta de una empresa.

Para producción, la API usa un PostgreSQL real con la variable `DATABASE_URL=postgres://…` y `JWT_SECRET` obligatoria.

Otras variables de la API:

| Variable | Para qué |
|---|---|
| `APP_URL` | Dirección pública de la web (ej. `https://app.prexacode.com.ar`): se usa en los links que reciben los clientes |
| `SMTP_URL` | Servidor de correo de la plataforma (`smtps://usuario:clave@host:465`). Sin él, los envíos "por Prexacode" quedan simulados; cada empresa igual puede usar su propia casilla |
| `EMAIL_FROM` | Remitente de la plataforma (por defecto `notificaciones@prexacode.com.ar`) |
| `SECRETS_KEY` | Clave para cifrar contraseñas guardadas (SMTP). Si falta se deriva de `JWT_SECRET`: **no cambiarla después**, o las contraseñas guardadas dejan de poder leerse |
| `MP_ACCESS_TOKEN` | Access token de Mercado Pago para cobrar las suscripciones. Sin él, el pago es simulado (solo para pruebas) |
| `MP_WEBHOOK_SECRET` | Clave secreta de las notificaciones de Mercado Pago (verifica la firma de cada aviso) |
| `TIPO_CAMBIO_USD` | Dólar fijo para cobrar. Si falta, se usa el oficial del día (dolarapi.com) |
| `API_PUBLIC_URL` | URL pública de la API si no es la misma que `APP_URL` (Mercado Pago avisa ahí los pagos) |

## Pruebas

| Comando | Qué prueba |
|---|---|
| `npm test` | Tipos + pruebas de API (PGlite) + punta a punta con Playwright contra el servidor armado como en producción (web + API compiladas, en un solo proceso) |
| `npm run test:postgres` | Toda la batería de API contra un PostgreSQL 18 real (embebido, no hace falta instalarlo) |

Dos pruebas integrales:

- **Trazado de una empresa real** (`e2e/empresa-completa.spec.ts`), por la pantalla: registro, equipo, importación, oportunidad → presupuesto → factura, venta de contado, remito, cobro parcial, nota de crédito, aviso de stock bajo y reposición, agenda, envío por link, reportes, Libro IVA, Excel, pago de la suscripción y panel de administración.
- **Seis meses, tres empresas** (`server/test/seis-meses.test.ts`), con el reloj simulado: una empresa por plan, límites de usuarios, compra de usuarios proporcional, subida y bajada de plan, atraso (gracia → solo lectura → pago), pago por transferencia, suspensión; cada mes cruza reportes, cobranzas, aislamiento entre empresas y los números del panel con lo que realmente se cobró. Cruza los números entre todos los módulos.
- **Simulación de un mes** (`server/test/simulacion.test.ts`): 260 operaciones al azar (con semilla fija) de varios usuarios, con ráfagas simultáneas. Al final verifica numeración sin huecos, stock = movimientos, que cada comprobante cierre, cuentas corrientes, cobranzas, reportes, Libro IVA e Inicio. `SIM_SEMILLA=n` simula otro mes.

En Windows, si una corrida se corta a mano pueden quedar procesos ocupando el puerto 5175: cerrarlos antes de volver a correr.

## Estructura

```
server/                 # API (Fastify + Drizzle ORM + PostgreSQL/PGlite)
├── src/db/schema.ts    # tablas (todas con empresa_id)
├── src/routes/         # auth, usuarios, clientes
├── drizzle/            # migraciones SQL (npm run db:generate --prefix server)
└── test/               # pruebas de API
e2e/                    # pruebas de punta a punta (Playwright)
src/                    # web (React)
├── api/                # cliente HTTP, tipos y hooks (React Query)
├── context/            # sesión (AuthProvider) y tema
└── modules/            # pantallas por módulo
```

## Pantallas

| Módulo | Ruta | Qué muestra |
|---|---|---|
| Inicio | `/` | Ventas del mes, por cobrar, oportunidades, stock bajo, gráfico de ventas, agenda del día, facturas vencidas |
| Clientes | `/clientes`, `/clientes/:id` | Listado con búsqueda, filtros, orden y paginación; alta y edición con validación de CUIT; ficha con **notas** (bitácora con autor y fecha, fijadas arriba), **productos que usa** (cantidad y frecuencia; "Facturar estos" / "Presupuestar" con un clic), agenda, oportunidades, presupuestos, remitos, comprobantes y cuenta corriente |
| Oportunidades | `/oportunidades` | Embudo por etapa (Nuevo → Contactado → Propuesta → Negociación → Ganada/Perdida); se arrastra o se mueve con el menú; con cliente o prospecto; "Hacer presupuesto" la pasa a Propuesta y al facturarlo queda Ganada; aviso al responsable |
| Agenda | `/agenda` | Calendario día/semana con un color por recurso; se adapta a cualquier rubro (turnos, visitas, órdenes, clases…) con plantillas; clic en un horario libre para agendar; aviso si se pisa con otro del mismo recurso ("agendar igual" para sobreturnos); avisos a la persona asignada; agenda del cliente en su ficha y "Agenda de hoy" en Inicio |
| Facturación | `/facturacion`, `/facturacion/nueva` | Comprobantes con estado ARCA y de cobro; vista previa con CAE y QR; nueva factura con tipo A/B automático, ítems, IVA y vista previa en vivo |
| Productos y stock | `/productos` | Catálogo, precios, IVA, stock contra mínimo con alertas |
| Configuración | `/configuracion?tab=…` | Empresa, usuarios y roles, conexión ARCA (certificado, ambiente, puntos de venta), email (SMTP), WhatsApp (Cloud API de Meta, plantillas), personalización de agenda, plan y suscripción |
| Presupuestos | `/presupuestos`, `/presupuestos/:id` | Alta y edición con los mismos cálculos que la factura, vista previa imprimible con logo, estados (Pendiente, Aceptado, Rechazado, Vencido, Facturado), duplicar y **pasar a factura con un clic** |
| Cobranzas | `/cobranzas` | Saldos por cliente, recibos con varios medios de pago e imputación a facturas |
| Reportes | `/reportes` | Ventas por período (día o mes), por cliente y por producto, con las notas de crédito restando; **Libro IVA Ventas** con IVA por alícuota; exportación a Excel con una hoja por sección |

Lo que ve cada usuario depende de su rol (Administrador, Ventas, Operaciones). El tema claro/oscuro se cambia desde el menú de usuario.

## Modelo comercial

Precio por empresa con usuarios incluidos + cargo por usuario adicional (los precios están en un solo lugar: `server/src/lib/precios.ts`; las pruebas se calculan con ellos). Todos los planes incluyen todos los módulos.

| Plan | USD/mes | Usuarios incluidos | Puntos de venta |
|---|---|---|---|
| Básico | 45 | 2 | 1 |
| Profesional | 89 | 5 | 3 |
| Empresa | 169 | 10 | ilimitados |
| Usuario adicional | 15 | — | — |

Pagando anual se pagan 10 meses (2 gratis). Se cobra en pesos al dólar oficial del Banco Central del día (API del BCRA; si no responde, el oficial de venta de dolarapi.com).

## Próximos pasos

1. Probar la conexión con la homologación real de ARCA (hace falta tramitar el certificado de prueba en WSASS con clave fiscal).
2. WhatsApp automático con la API oficial de Meta (el envío manual ya funciona).
3. Cargar las credenciales de Mercado Pago (cuenta de la empresa que vende Prexacode) y probar un cobro real.
4. Poner en línea siguiendo [DEPLOY.md](DEPLOY.md) (hace falta contratar un servidor y un dominio).
5. Prueba final completa simulando una empresa real.
