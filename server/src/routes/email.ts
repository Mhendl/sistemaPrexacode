import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { configEmail, emailsEnviados, empresas, enlacesPublicos, usuarios } from "../db/schema.js";
import { requirePermiso } from "../lib/auth.js";
import { datosWhatsapp, enviarDocumentoPorEmail, resumenDocumento } from "../lib/documentos.js";
import { armarEmail } from "../lib/email/plantilla.js";
import { enviarEmail, obtenerConfigEmail, type ConfigEmail } from "../lib/email/servicio.js";
import { badRequest, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { emailSchema } from "../lib/validation.js";
import { detalleComprobante } from "./comprobantes.js";
import { detallePresupuesto } from "./presupuestos.js";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const configSchema = z
  .object({
    modo: z.enum(["plataforma", "smtp"]),
    host: texto(200),
    puerto: z.coerce.number().int().min(1).max(65535).optional().nullable(),
    seguridad: z.enum(["STARTTLS", "SSL/TLS", "Ninguna"]).optional().nullable(),
    usuario: texto(200),
    /** Si no viene (o viene vacía), se conserva la guardada */
    password: z.string().max(500).optional().nullable(),
    remitenteNombre: texto(100),
    responderA: z
      .union([emailSchema, z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    enviarFacturaAlEmitir: z.boolean().default(false),
    recordarFacturas: z.boolean().default(false),
    version: z.number().int().positive().max(2_000_000_000).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.modo !== "smtp") return;
    if (!c.host) ctx.addIssue({ code: "custom", path: ["host"], message: "Indicá el servidor (ej. smtp.gmail.com)" });
    if (!c.puerto) ctx.addIssue({ code: "custom", path: ["puerto"], message: "Indicá el puerto (587 o 465)" });
    if (!c.usuario) ctx.addIssue({ code: "custom", path: ["usuario"], message: "Indicá el usuario (tu email)" });
  });

/** Lo que ve el administrador: nunca la contraseña */
const configPublica = (c: ConfigEmail, correoPlataforma: boolean) => {
  const { passwordCifrada, empresaId: _e, ...resto } = c;
  return { ...resto, tienePassword: !!passwordCifrada, correoPlataforma };
};

/** Configuración del envío de emails (solo administradores) */
export const emailRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("configuracion"));

  app.get("/config", async (req) => configPublica(await obtenerConfigEmail(app, req.user.empresaId), app.correoPlataforma));

  app.put("/config", async (req) => {
    const d = parse(configSchema, req.body);
    const actual = await obtenerConfigEmail(app, req.user.empresaId);
    if (d.version && d.version !== actual.version) throw edicionConcurrente("la configuración de email");
    if (d.modo === "smtp" && !d.password && !actual.passwordCifrada) throw badRequest("Falta la contraseña", { password: "Obligatoria" });

    const conexion = { modo: d.modo, host: d.host, puerto: d.puerto ?? null, seguridad: d.seguridad ?? "STARTTLS", usuario: d.usuario };
    const cambioConexion =
      conexion.modo !== actual.modo || conexion.host !== actual.host || conexion.puerto !== actual.puerto || conexion.seguridad !== actual.seguridad || conexion.usuario !== actual.usuario || !!d.password;
    const filtros: SQL[] = [eq(configEmail.empresaId, req.user.empresaId)];
    if (d.version) filtros.push(eq(configEmail.version, d.version));
    const [c] = await app.db
      .update(configEmail)
      .set({
        ...conexion,
        ...(d.password ? { passwordCifrada: app.cifrador.cifrar(d.password) } : {}),
        remitenteNombre: d.remitenteNombre,
        responderA: d.responderA,
        enviarFacturaAlEmitir: d.enviarFacturaAlEmitir,
        recordarFacturas: d.recordarFacturas,
        // Si cambió cómo se conecta, hay que volver a probarlo
        ...(cambioConexion ? { verificado: false, ultimoError: null } : {}),
        version: sql`${configEmail.version} + 1`,
      })
      .where(and(...filtros))
      .returning();
    if (!c) throw edicionConcurrente("la configuración de email");
    return configPublica(c, app.correoPlataforma);
  });

  /** Manda un email de prueba (por defecto, a quien lo pide) y deja marcada la configuración como verificada */
  app.post("/probar", async (req) => {
    const { para } = parse(z.object({ para: emailSchema.optional() }), req.body ?? {});
    const [u] = await app.db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const [emp] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia }).from(empresas).where(eq(empresas.id, req.user.empresaId));
    const destino = para ?? u!.email;
    const nombre = emp?.nombreFantasia || emp?.razonSocial || "";
    const { html, texto: plano } = armarEmail({
      empresa: nombre,
      saludo: "¡Hola!",
      parrafos: ["Este es un email de prueba de Prexacode.", "Si lo estás leyendo, el envío de facturas y presupuestos por email está funcionando."],
    });
    const r = await enviarEmail(app, { empresaId: req.user.empresaId, para: destino, asunto: `Prueba de envío · ${nombre}`, html, texto: plano, tipo: "prueba", usuarioId: req.user.sub });
    await app.db
      .update(configEmail)
      .set(r.estado === "Error" ? { verificado: false, ultimoError: r.error } : { verificado: r.estado === "Enviado", ultimoError: null })
      .where(eq(configEmail.empresaId, req.user.empresaId));
    return { ...r, para: destino };
  });

  app.get("/enviados", async (req) => {
    const { refId } = parse(z.object({ refId: z.string().uuid().optional() }), req.query);
    const filtros: SQL[] = [eq(emailsEnviados.empresaId, req.user.empresaId)];
    if (refId) filtros.push(eq(emailsEnviados.refId, refId));
    return app.db.select().from(emailsEnviados).where(and(...filtros)).orderBy(desc(emailsEnviados.createdAt)).limit(100);
  });
};

const docSchema = z.object({ tipo: z.enum(["comprobante", "presupuesto"], { errorMap: () => ({ message: "Tipo inválido" }) }), id: z.string().uuid("Id inválido") });

/** Compartir documentos con el cliente: link público, email y WhatsApp */
export const documentosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("facturacion.ver", "presupuestos.ver", "remitos.ver", "cobranzas.ver"));

  app.get("/:tipo/:id/compartir", async (req) => {
    const { tipo, id } = parse(docSchema, req.params);
    const r = await resumenDocumento(app, req.user.empresaId, tipo, id);
    if (!r) throw notFound("El documento no existe o todavía no se puede compartir");
    const enviados = await app.db
      .select()
      .from(emailsEnviados)
      .where(and(eq(emailsEnviados.empresaId, req.user.empresaId), eq(emailsEnviados.refId, id)))
      .orderBy(desc(emailsEnviados.createdAt))
      .limit(10);
    return { titulo: r.titulo, url: r.url, vistas: r.vistas, email: r.cliente.email, whatsapp: datosWhatsapp(r), enviados };
  });

  app.post("/:tipo/:id/enviar", async (req) => {
    const { tipo, id } = parse(docSchema, req.params);
    const { para, mensaje } = parse(z.object({ para: emailSchema, mensaje: texto(2000) }), req.body);
    const r = await enviarDocumentoPorEmail(app, { empresaId: req.user.empresaId, tipo, id, para, mensaje, usuarioId: req.user.sub });
    if (!r) throw notFound("El documento no existe o todavía no se puede compartir");
    return r;
  });

  /** Anula el link actual (por ejemplo, si se mandó a quien no correspondía). La próxima vez se genera otro. */
  app.delete("/:tipo/:id/enlace", async (req, reply) => {
    const { tipo, id } = parse(docSchema, req.params);
    await app.db.delete(enlacesPublicos).where(and(eq(enlacesPublicos.empresaId, req.user.empresaId), eq(enlacesPublicos.tipo, tipo), eq(enlacesPublicos.refId, id)));
    return reply.status(204).send();
  });
};

/** Vista pública de un documento por su link (sin usuario) */
export const publicoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:token", async (req) => {
    const { token } = parse(z.object({ token: z.string().min(20).max(100) }), req.params);
    const [e] = await app.db.select().from(enlacesPublicos).where(eq(enlacesPublicos.token, token));
    if (!e) throw notFound("El link no existe o fue anulado");
    const [emp] = await app.db.select().from(empresas).where(eq(empresas.id, e.empresaId));
    const documento = e.tipo === "comprobante" ? await detalleComprobante(app.db, e.empresaId, e.refId) : await detallePresupuesto(app.db, e.empresaId, e.refId);
    if (!documento) throw notFound("El documento ya no existe");
    await app.db.update(enlacesPublicos).set({ vistas: sql`${enlacesPublicos.vistas} + 1`, ultimaVista: new Date() }).where(eq(enlacesPublicos.token, token));
    const { usuarioId: _u, ...doc } = documento as typeof documento & { usuarioId?: unknown };
    // Solo los datos de la empresa que figuran en el documento impreso
    const empresa = {
      id: emp!.id,
      razonSocial: emp!.razonSocial,
      nombreFantasia: emp!.nombreFantasia,
      cuit: emp!.cuit,
      condicionIva: emp!.condicionIva,
      domicilio: emp!.domicilio,
      localidad: emp!.localidad,
      codigoPostal: emp!.codigoPostal,
      telefono: emp!.telefono,
      email: emp!.email,
      ingresosBrutos: emp!.ingresosBrutos,
      inicioActividades: emp!.inicioActividades,
      logoActualizado: emp!.logoActualizado,
    };
    return { tipo: e.tipo, empresa, documento: doc };
  });
};
