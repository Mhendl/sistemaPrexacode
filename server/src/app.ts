import { turnosPublicosRoutes } from "./routes/turnosPublicos.js";
import { presupuestosDentalesRoutes } from "./routes/presupuestosDentales.js";
import { consultorioRoutes } from "./routes/consultorio.js";
import { pacientesRoutes } from "./routes/pacientes.js";
import { prestacionesRoutes } from "./routes/prestaciones.js";
import { productoDe } from "./lib/productos.js";
import "./lib/zod-es.js";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError } from "fastify";
import type { Db } from "./db/client.js";
import { eq, sql } from "drizzle-orm";
import { empresas } from "./db/schema.js";
import type { ConectorArca } from "./lib/arca/cliente.js";
import type { TransporteSoap, UrlsArca } from "./lib/arca/soap.js";
import { crearCifrador, type Cifrador } from "./lib/cifrado.js";
import { servirWeb } from "./lib/web.js";
import { carteroSmtp, type Cartero } from "./lib/email/cartero.js";
import { cotizacionDolar, pagosSimulados, type Cotizacion, type ProveedorPagos } from "./lib/pagos.js";
import { estadoDe, obtenerSuscripcion } from "./lib/suscripcion.js";
import { badRequest, HttpError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { clientesRoutes } from "./routes/clientes.js";
import { empresaRoutes, logoPublicoRoutes } from "./routes/empresa.js";
import { movimientosRoutes } from "./routes/movimientos.js";
import { importarRoutes } from "./routes/importar.js";
import { remitosRoutes } from "./routes/remitos.js";
import { comprobantesRoutes } from "./routes/comprobantes.js";
import { cobranzasRoutes, recibosRoutes } from "./routes/cobranzas.js";
import { inicioRoutes } from "./routes/inicio.js";
import { presupuestosRoutes } from "./routes/presupuestos.js";
import { reportesRoutes } from "./routes/reportes.js";
import { agendaRoutes } from "./routes/agenda.js";
import { oportunidadesRoutes } from "./routes/oportunidades.js";
import { documentosRoutes, emailRoutes, publicoRoutes } from "./routes/email.js";
import { arcaRoutes } from "./routes/arca.js";
import { clienteExtrasRoutes } from "./routes/clienteExtras.js";
import { suscripcionRoutes } from "./routes/suscripcion.js";
import { legalRoutes } from "./routes/legal.js";
import { plataformaRoutes } from "./routes/plataforma.js";
import { tareasAutomaticas } from "./lib/tareas.js";
import { soporteRoutes } from "./routes/soporte.js";
import { empleadosRoutes } from "./routes/empleados.js";
import { adminRoutes, crearAdminInicial } from "./routes/admin.js";
import { notificacionesRoutes } from "./routes/notificaciones.js";
import { productosRoutes } from "./routes/productos.js";
import { rolesRoutes, usuariosRoutes } from "./routes/usuarios.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    /** Solo para pruebas: reemplaza la conexión con ARCA */
    conectorArca?: (empresa: { id: string; cuit: string }) => ConectorArca;
    /** Envío de emails (en pruebas, uno que los guarda en memoria) */
    cartero: Cartero;
    cifrador: Cifrador;
    /** URL pública de la web, para los links que reciben los clientes */
    appUrl: string;
    emailRemitente: string;
    /** Dirección web de cada producto (links de los emails, pagos y documentos) */
    urlDe(producto: string | null | undefined): string;
    /** Hay servidor de correo de la plataforma (si no, esos envíos se simulan) */
    correoPlataforma: boolean;
    /** Para pruebas: ARCA falso (URLs o transporte HTTP) */
    /** Cobro de suscripciones: Mercado Pago o simulador */
    pagos: ProveedorPagos;
    cotizacion: Cotizacion;
    mpWebhookSecret?: string;
    /** URL pública de la API (para el aviso de Mercado Pago) */
    urlApi: string;
    /** Servidor de pruebas automáticas: habilita rutas para mover fechas */
    modoPruebas: boolean;
    arcaPruebas: { urls?: Partial<Record<"homologacion" | "produccion", UrlsArca>>; transporte?: TransporteSoap };
  }
}

export interface AppOptions {
  db: Db;
  jwtSecret: string;
  logger?: boolean;
  conectorArca?: (empresa: { id: string; cuit: string }) => ConectorArca;
  cartero?: Cartero;
  appUrl?: string;
  /** Dirección de CoreDental (si no, la misma que appUrl) */
  appUrlDental?: string;
  /** Google Analytics y píxel de Meta para las pantallas públicas (login y registro) */
  medicion?: { ga: string | null; metaPixel: string | null };
  smtpUrl?: string;
  emailRemitente?: string;
  secretsKey?: string;
  arca?: { urls?: Partial<Record<"homologacion" | "produccion", UrlsArca>>; transporte?: TransporteSoap };
  pagos?: ProveedorPagos;
  cotizacion?: Cotizacion;
  mpWebhookSecret?: string;
  urlApi?: string;
  modoPruebas?: boolean;
  /** Primer administrador del panel (si todavía no hay ninguno) */
  adminInicial?: { email: string; password: string };
  /** Límite de intentos por IP en login, registro y formularios públicos (en las pruebas se apaga) */
  limitarIntentos?: boolean;
  /** Producción: CORS solo para APP_URL */
  produccion?: boolean;
  /** Carpeta con la web compilada (dist/): si viene, la API también sirve la web (una sola pieza para desplegar) */
  web?: string;
  /** Detrás de un proxy (nginx, Caddy, la plataforma de hosting): toma la IP real del cliente */
  trustProxy?: boolean;
  /** Correr las tareas automáticas (avisos y recordatorios por email) cada hora. En las pruebas no. */
  tareas?: boolean;
}

export async function buildApp({ db, jwtSecret, logger = false, conectorArca, cartero, appUrl = "http://localhost:5173", appUrlDental, medicion, smtpUrl, emailRemitente = "notificaciones@prexacode.com.ar", secretsKey, arca = {}, pagos, cotizacion, mpWebhookSecret, urlApi, modoPruebas = false, adminInicial, limitarIntentos = true, produccion = false, web, trustProxy = false, tareas = false }: AppOptions) {
  // Al apagar, cortar también las conexiones keep-alive activas (si no, close() puede esperar indefinidamente)
  const app = Fastify({ logger, forceCloseConnections: true, trustProxy, bodyLimit: 5 * 1024 * 1024 });

  app.decorate("db", db);
  app.decorate("conectorArca", conectorArca);
  app.decorate("cartero", cartero ?? carteroSmtp(smtpUrl));
  app.decorate("cifrador", crearCifrador(secretsKey ?? `${jwtSecret}:secretos`));
  app.decorate("appUrl", appUrl);
  app.decorate("urlDe", (producto: string | null | undefined) => (productoDe(producto) === "dental" ? (appUrlDental ?? appUrl) : appUrl));
  app.decorate("emailRemitente", emailRemitente);
  app.decorate("correoPlataforma", !!smtpUrl || !!cartero);
  app.decorate("arcaPruebas", arca);
  app.decorate("pagos", pagos ?? pagosSimulados(appUrl));
  app.decorate("cotizacion", cotizacion ?? cotizacionDolar());
  app.decorate("mpWebhookSecret", mpWebhookSecret);
  app.decorate("urlApi", urlApi ?? appUrl);
  app.decorate("modoPruebas", modoPruebas);
  // Solo en las rutas que lo piden (login, registro, formularios públicos)
  if (limitarIntentos) {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: `Demasiados intentos. Probá de nuevo en ${Math.max(1, Math.ceil(ctx.ttl / 60000))} minutos.` }),
    });
  }

  /**
   * Suscripción vencida (pasada la gracia): modo solo lectura. Se puede ver y exportar todo,
   * pero no cargar ni modificar. Siempre se permite entrar, pagar y leer avisos.
   */
  // Un carácter nulo (\u0000) en cualquier texto rompe PostgreSQL: se rechaza de entrada, con un mensaje claro
  const tieneNulo = (v: unknown): boolean =>
    typeof v === "string" ? v.includes("\u0000") : Array.isArray(v) ? v.some(tieneNulo) : v !== null && typeof v === "object" ? Object.values(v).some(tieneNulo) : false;
  app.addHook("preHandler", async (req) => {
    if (tieneNulo(req.params) || tieneNulo(req.query) || tieneNulo(req.body)) throw badRequest("Hay caracteres inválidos en los datos enviados");
  });
  const libres = ["/api/soporte", "/api/auth", "/api/suscripcion", "/api/legal", "/api/health", "/api/publico", "/api/notificaciones", "/api/plataforma"];
  app.addHook("preHandler", async (req) => {
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/admin") || req.url.startsWith("/api/plataforma") || req.url.startsWith("/api/auth") || req.url.startsWith("/api/legal") || req.url.startsWith("/api/health") || req.url.startsWith("/api/publico")) return;
    if (!req.headers.authorization) return;
    let empresaId: string | undefined;
    try {
      empresaId = ((await req.jwtVerify()) as { empresaId?: string }).empresaId;
    } catch {
      return; // sesión inválida: lo rechaza la ruta
    }
    if (!empresaId) return;
    // Empresa suspendida por la plataforma: nadie de la empresa puede usar nada
    const [emp] = await app.db.select({ suspendidaEn: empresas.suspendidaEn }).from(empresas).where(eq(empresas.id, empresaId));
    if (emp?.suspendidaEn && !req.url.startsWith("/api/plataforma")) {
      throw new HttpError(403, "La cuenta de esta empresa está suspendida. Escribinos para resolverlo.", undefined, "EMPRESA_SUSPENDIDA");
    }
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
    if (libres.some((l) => req.url.startsWith(l))) return;
    const s = await obtenerSuscripcion(app.db, empresaId);
    if (estadoDe(s).estado === "SoloLectura") {
      throw new HttpError(402, "La suscripción está vencida: podés ver y exportar tus datos, pero para cargar o modificar hay que renovarla en Configuración → Plan.", undefined, "SUSCRIPCION_VENCIDA");
    }
  });
  // En producción la web y la API están en el mismo dominio: CORS solo para ese origen
  await app.register(cors, { origin: produccion ? appUrl : true });
  // Encabezados de seguridad (CSP: solo recursos propios, más las fuentes de Google)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: produccion ? [] : null,
      },
    },
    // Los links públicos de facturas se abren desde WhatsApp/email: no bloquear que se abran desde otros sitios
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    strictTransportSecurity: produccion ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: "12h" } });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.message, details: err.details, code: err.code });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: (err as unknown as { error?: string }).error ?? "Demasiados intentos. Probá de nuevo en unos minutos." });
    }
    // JSON mal formado u otros errores de validación de Fastify
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: "Solicitud inválida" });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "Ocurrió un error inesperado. Probá de nuevo." });
  });

  // Para el monitoreo del hosting: también verifica que la base responda
  app.get("/api/health", async (_req, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false, error: "La base de datos no responde" });
    }
  });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(usuariosRoutes, { prefix: "/api/usuarios" });
  await app.register(rolesRoutes, { prefix: "/api/roles" });
  await app.register(clientesRoutes, { prefix: "/api/clientes" });
  await app.register(empresaRoutes, { prefix: "/api/empresa" });
  await app.register(logoPublicoRoutes, { prefix: "/api/empresas" });
  await app.register(productosRoutes, { prefix: "/api/productos" });
  await app.register(movimientosRoutes, { prefix: "/api/movimientos" });
  await app.register(notificacionesRoutes, { prefix: "/api/notificaciones" });
  await app.register(importarRoutes, { prefix: "/api/importar" });
  await app.register(remitosRoutes, { prefix: "/api/remitos" });
  await app.register(comprobantesRoutes, { prefix: "/api/comprobantes" });
  await app.register(cobranzasRoutes, { prefix: "/api/cobranzas" });
  await app.register(recibosRoutes, { prefix: "/api/recibos" });
  await app.register(inicioRoutes, { prefix: "/api/inicio" });
  await app.register(presupuestosRoutes, { prefix: "/api/presupuestos" });
  await app.register(reportesRoutes, { prefix: "/api/reportes" });
  await app.register(agendaRoutes, { prefix: "/api/agenda" });
  await app.register(oportunidadesRoutes, { prefix: "/api/oportunidades" });
  await app.register(emailRoutes, { prefix: "/api/email" });
  await app.register(documentosRoutes, { prefix: "/api/documentos" });
  await app.register(publicoRoutes, { prefix: "/api/publico" });
  await app.register(arcaRoutes, { prefix: "/api/arca" });
  await app.register(clienteExtrasRoutes, { prefix: "/api/clientes" });
  await app.register(suscripcionRoutes, { prefix: "/api/suscripcion" });
  await app.register(legalRoutes, { prefix: "/api/legal" });
  await app.register(plataformaRoutes, { prefix: "/api/plataforma" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(soporteRoutes, { prefix: "/api/soporte" });
  await app.register(empleadosRoutes, { prefix: "/api/empleados" });
  await app.register(pacientesRoutes, { prefix: "/api/pacientes" });
  await app.register(prestacionesRoutes, { prefix: "/api/prestaciones" });
  await app.register(presupuestosDentalesRoutes, { prefix: "/api/presupuestos-dentales" });
  await app.register(consultorioRoutes, { prefix: "/api/consultorio" });
  await app.register(turnosPublicosRoutes, { prefix: "/api/publico/turnos" });
  app.get("/api/publico/medicion", async () => medicion ?? { ga: null, metaPixel: null });
  if (adminInicial) await crearAdminInicial(db, adminInicial.email, adminInicial.password);

  // La web compilada, en la misma pieza que la API
  if (web) await servirWeb(app, web);

  if (tareas) {
    const correr = () => tareasAutomaticas(app).catch((e) => app.log.error(e, "Falló una tarea automática"));
    const primera = setTimeout(correr, 60_000);
    const cadaHora = setInterval(correr, 60 * 60_000);
    primera.unref();
    cadaHora.unref();
    app.addHook("onClose", async () => {
      clearTimeout(primera);
      clearInterval(cadaHora);
    });
  }

  return app;
}
