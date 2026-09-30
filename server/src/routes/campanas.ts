import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { campanaEnvios, campanas, obrasSociales, pacientes, usuarios } from "../db/schema.js";
import { requireAuth, requirePermiso, tienePermiso } from "../lib/auth.js";
import { CANALES, datosConsultorio, enviarCampana, pacientesDelSegmento, personalizar, SEGMENTOS, tieneContacto } from "../lib/campanas.js";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { telefonoWhatsapp } from "../lib/telefono.js";

/** Hasta cuántos emails de campañas por día (cuida que los emails no terminen en spam) */
export const MAX_EMAILS_DIA = 1000;

const segmentoSchema = z.object({
  segmento: z.enum(SEGMENTOS, { errorMap: () => ({ message: "Elegí a quién le llega" }) }),
  parametro: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => v || null),
  canal: z.enum(CANALES, { errorMap: () => ({ message: "Elegí por dónde se manda" }) }),
});

const campanaSchema = segmentoSchema.and(
  z.object({
    nombre: z.string().trim().min(3, "Poné un nombre (ej.: Control anual)").max(80),
    asunto: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((v) => v || null),
    mensaje: z.string().trim().min(10, "Escribí el mensaje").max(2000, "Hasta 2000 caracteres"),
  }),
);

const idSchema = z.object({ id: z.string().uuid("Id inválido") });

/** "Hola María!" + el mensaje: así lo recibe por WhatsApp */
const textoWhatsapp = (nombre: string, texto: string) => `Hola ${nombre}!\n${texto}`;

/** Campañas a pacientes (CoreDental): control, cumpleaños, deudores, por obra social */
export const campanasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  app.addHook("preHandler", requirePermiso("pacientes.editar"));

  /** Los deudores solo los ve quien ve los cobros; la obra social tiene que ser del consultorio */
  async function validarSegmento(req: Parameters<typeof tienePermiso>[0], d: z.infer<typeof segmentoSchema>) {
    if (d.segmento === "deudores" && !tienePermiso(req, "cobranzas.ver")) throw forbidden();
    if (d.segmento === "sin_visita" && !(Number(d.parametro) >= 1 && Number(d.parametro) <= 36)) throw badRequest("Elegí cuántos meses", { parametro: "Entre 1 y 36" });
    if (d.segmento === "cumpleanos" && d.parametro && !(Number(d.parametro) >= 1 && Number(d.parametro) <= 12)) throw badRequest("Mes inválido", { parametro: "Entre 1 y 12" });
    if (d.segmento === "obra_social") {
      if (!d.parametro || !/^[0-9a-f-]{36}$/.test(d.parametro)) throw badRequest("Elegí la obra social", { parametro: "Obligatoria" });
      const [os] = await app.db.select({ id: obrasSociales.id }).from(obrasSociales).where(and(eq(obrasSociales.id, d.parametro), eq(obrasSociales.empresaId, req.user.empresaId)));
      if (!os) throw badRequest("La obra social no existe", { parametro: "Inválida" });
    }
  }

  /** Cuántos le llegan, cuántos no tienen email o celular, y algunos nombres */
  app.post("/previa", async (req) => {
    const d = parse(segmentoSchema, req.body);
    await validarSegmento(req, d);
    const lista = await pacientesDelSegmento(app.db, req.user.empresaId, d.segmento, d.parametro);
    const con = lista.filter((p) => tieneContacto(p, d.canal));
    return { total: lista.length, conContacto: con.length, sinContacto: lista.length - con.length, muestra: con.slice(0, 5).map((p) => `${p.apellido}, ${p.nombre}`) };
  });

  app.get("/", async (req) => {
    const lista = await app.db.select().from(campanas).where(eq(campanas.empresaId, req.user.empresaId)).orderBy(desc(campanas.createdAt)).limit(100);
    if (!lista.length) return [];
    const conteos = await app.db
      .select({ id: campanaEnvios.campanaId, estado: campanaEnvios.estado, n: sql<number>`count(*)::int` })
      .from(campanaEnvios)
      .where(inArray(campanaEnvios.campanaId, lista.map((c) => c.id)))
      .groupBy(campanaEnvios.campanaId, campanaEnvios.estado);
    return lista.map((c) => {
      const de = (e: string) => Number(conteos.find((x) => x.id === c.id && x.estado === e)?.n ?? 0);
      return { ...c, enviados: de("Enviado") + de("Simulado"), pendientes: de("Pendiente"), errores: de("Error") };
    });
  });

  app.post("/", async (req, reply) => {
    const d = parse(campanaSchema, req.body);
    await validarSegmento(req, d);
    if (d.canal === "Email" && !d.asunto) throw badRequest("Poné el asunto del email", { asunto: "Obligatorio" });
    const empresaId = req.user.empresaId;
    const lista = (await pacientesDelSegmento(app.db, empresaId, d.segmento, d.parametro)).filter((p) => tieneContacto(p, d.canal));
    if (!lista.length) throw badRequest(`Nadie de ese grupo tiene ${d.canal === "Email" ? "email" : "celular"} cargado`);
    if (d.canal === "Email") {
      const desde = new Date(Date.now() - 24 * 3600_000);
      const [{ n }] = await app.db
        .select({ n: sql<number>`count(*)::int` })
        .from(campanaEnvios)
        .innerJoin(campanas, eq(campanas.id, campanaEnvios.campanaId))
        .where(and(eq(campanaEnvios.empresaId, empresaId), eq(campanas.canal, "Email"), gte(campanas.createdAt, desde)));
      if (Number(n) + lista.length > MAX_EMAILS_DIA) throw conflict(`Se pueden mandar hasta ${MAX_EMAILS_DIA} emails de campañas por día (para que no terminen en spam). Hoy quedan ${Math.max(0, MAX_EMAILS_DIA - Number(n))}.`);
    }
    const extra = await datosConsultorio(app, empresaId);
    if (/\{link_turnos\}/.test(d.mensaje) && !extra.linkTurnos) throw badRequest("El mensaje usa {link_turnos}, pero los turnos online no están activados (Configuración → Agenda)", { mensaje: "Sin turnos online" });
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const [c] = await app.db
      .insert(campanas)
      .values({ empresaId, nombre: d.nombre, canal: d.canal, segmento: d.segmento, parametro: d.parametro, asunto: d.canal === "Email" ? d.asunto : null, mensaje: d.mensaje, destinatarios: lista.length, creadoPor: u?.nombre ?? "Usuario", usuarioId: req.user.sub })
      .returning();
    await app.db.insert(campanaEnvios).values(
      lista.map((p) => ({ campanaId: c!.id, empresaId, pacienteId: p.id, destino: d.canal === "Email" ? p.email! : p.telefono!, texto: personalizar(d.mensaje, p, extra) })),
    );
    // Los emails salen de a uno, sin frenar la pantalla; los WhatsApp los manda la persona con un toque
    if (d.canal === "Email") void enviarCampana(app, c!.id).catch((e) => app.log.error(e, "Falló el envío de la campaña"));
    return reply.status(201).send(c);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [c] = await app.db.select().from(campanas).where(and(eq(campanas.id, id), eq(campanas.empresaId, req.user.empresaId)));
    if (!c) throw notFound("Campaña no encontrada");
    const envios = await app.db
      .select({ envio: campanaEnvios, nombre: pacientes.nombre, apellido: pacientes.apellido })
      .from(campanaEnvios)
      .innerJoin(pacientes, eq(pacientes.id, campanaEnvios.pacienteId))
      .where(eq(campanaEnvios.campanaId, id))
      .orderBy(pacientes.apellido, pacientes.nombre);
    return {
      ...c,
      envios: envios.map((e) => ({ ...e.envio, paciente: `${e.apellido}, ${e.nombre}` })),
    };
  });

  /** Abre el WhatsApp del paciente con el mensaje listo, y lo deja como enviado */
  app.post("/:id/envios/:envioId/whatsapp", async (req) => {
    const { id, envioId } = parse(z.object({ id: z.string().uuid(), envioId: z.string().uuid() }), req.params);
    const [e] = await app.db
      .select({ envio: campanaEnvios, nombre: pacientes.nombre })
      .from(campanaEnvios)
      .innerJoin(pacientes, eq(pacientes.id, campanaEnvios.pacienteId))
      .where(and(eq(campanaEnvios.id, envioId), eq(campanaEnvios.campanaId, id), eq(campanaEnvios.empresaId, req.user.empresaId)));
    if (!e) throw notFound("No encontrado");
    const telefono = telefonoWhatsapp(e.envio.destino);
    const texto = textoWhatsapp(e.nombre, e.envio.texto);
    await app.db.update(campanaEnvios).set({ estado: "Enviado", enviadoEn: new Date() }).where(eq(campanaEnvios.id, envioId));
    return { telefono, texto, url: `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(texto)}` };
  });
};

/** Baja de las campañas desde el link del email (sin usuario) */
export const bajaCampanasRoutes: FastifyPluginAsync = async (app) => {
  const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,40}$/, "Link inválido") });
  const pacienteDe = async (token: string) => {
    const [p] = await app.db.select({ id: pacientes.id, empresaId: pacientes.empresaId, nombre: pacientes.nombre, recibe: pacientes.recibeCampanas }).from(pacientes).where(eq(pacientes.tokenCampanas, token));
    if (!p) throw notFound("El link no es válido");
    return p;
  };
  app.get("/:token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const p = await pacienteDe(token);
    const { consultorio } = await datosConsultorio(app, p.empresaId);
    return { consultorio, nombre: p.nombre, dadoDeBaja: !p.recibe };
  });
  app.post("/:token", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const p = await pacienteDe(token);
    await app.db.update(pacientes).set({ recibeCampanas: false, updatedAt: new Date() }).where(eq(pacientes.id, p.id));
    return { dadoDeBaja: true };
  });
};
