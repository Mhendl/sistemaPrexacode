import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { empresas, interesados, prospeccionCampanas, prospeccionConfig, prospeccionEnvios, prospectos, usuarios } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { configProspeccion, enviarProspeccion, nuevoToken, PLANTILLAS, topeDelDia } from "../lib/prospeccion.js";
import { ahoraAr } from "../lib/turnos.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
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
    remitenteEmail: z.string().trim().toLowerCase().email("Poné el alias desde el que salen los emails"),
    remitenteNombre: z.string().trim().min(2, "Poné tu nombre (así firma)").max(80),
    usuario: texto(160),
    /** Solo si se cambia: nunca se devuelve */
    password: z.string().max(200).optional().nullable(),
    smtpHost: z.string().trim().min(3).max(120),
    smtpPuerto: z.coerce.number().int().min(1).max(65535),
    imapHost: z.string().trim().min(3).max(120),
    imapPuerto: z.coerce.number().int().min(1).max(65535),
    maxPorDia: z.coerce.number().int().min(5, "Entre 5 y 80 por día").max(80, "Entre 5 y 80 por día: más que eso desde una casilla común termina en spam"),
    horaDesde: z.coerce.number().int().min(6).max(22),
    horaHasta: z.coerce.number().int().min(7).max(23),
  })
  .refine((c) => c.horaHasta > c.horaDesde, { message: "El horario está invertido", path: ["horaHasta"] });

const pasoSchema = z.object({
  dias: z.coerce.number().int().min(0).max(30),
  asunto: z.string().trim().max(150),
  cuerpo: z.string().trim().min(20, "El email es muy corto").max(3000),
});
const campanaSchema = z.object({
  nombre: z.string().trim().min(3, "Poné un nombre (ej.: Consultorios de Córdoba)").max(80),
  producto: z.enum(["dental", "gestion"]),
  pasos: z.array(pasoSchema).min(1, "Al menos un email").max(5, "Hasta 5 emails"),
  activa: z.boolean().default(true),
});
const filaSchema = z.object({
  email: z.string().trim().toLowerCase(),
  nombre: texto(120),
  empresa: texto(160),
  rubro: texto(80),
  ciudad: texto(80),
  web: texto(200),
  telefono: texto(40),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Direcciones genéricas que no son de una persona ni de un negocio (no se les escribe) */
const NO_ESCRIBIR = /^(no-?reply|noreply|mailer-daemon|postmaster|abuse|spam)@/i;

/** Panel de administración: la prospección de Prexacode */
export const prospeccionAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);

  const publica = async () => {
    const c = await configProspeccion(app);
    const { passwordCifrada, ...resto } = c;
    const hoy = ahoraAr().slice(0, 10);
    const [{ n }] = await app.db
      .select({ n: sql<number>`count(*)::int` })
      .from(prospeccionEnvios)
      .where(and(eq(prospeccionEnvios.estado, "Enviado"), gte(prospeccionEnvios.enviadoEn, new Date(`${hoy}T03:00:00Z`))));
    return { ...resto, tienePassword: !!passwordCifrada, enviadosHoy: Number(n), topeHoy: topeDelDia(c.maxPorDia, c.primerEnvioEn) };
  };

  app.get("/config", async () => publica());

  app.post("/config", async (req) => {
    const { password, ...d } = parse(configSchema, req.body);
    await configProspeccion(app);
    await app.db
      .update(prospeccionConfig)
      .set({ ...d, ...(password ? { passwordCifrada: app.cifrador.cifrar(password) } : {}), version: sql`${prospeccionConfig.version} + 1` })
      .where(eq(prospeccionConfig.id, 1));
    return publica();
  });

  /** Prueba la casilla: se manda un email a sí misma y se lee la bandeja */
  app.post("/config/probar", async () => {
    const c = await configProspeccion(app);
    if (!c.passwordCifrada || !c.remitenteEmail) throw badRequest("Primero guardá el alias y la contraseña");
    let smtp = "Bien";
    let imap = "Bien";
    try {
      await enviarProspeccion(app, c, c.remitenteEmail, "Prueba de la casilla de prospección", "Si ves este email, la casilla de prospección de Prexacode está bien configurada.");
    } catch (e) {
      smtp = (e as Error).message || "No se pudo enviar";
    }
    try {
      await app.buzon.leer({ host: c.imapHost, puerto: c.imapPuerto, usuario: c.usuario || c.remitenteEmail, password: app.cifrador.descifrar(c.passwordCifrada) }, new Date(Date.now() - 3600_000));
    } catch (e) {
      imap = (e as Error).message || "No se pudo leer la casilla";
    }
    return { smtp, imap };
  });

  /** Arrancar o pausar el envío */
  app.post("/config/activa", async (req) => {
    const { activa } = parse(z.object({ activa: z.boolean() }), req.body);
    const c = await configProspeccion(app);
    if (activa) {
      if (!c.passwordCifrada || !c.remitenteEmail) throw badRequest("Primero configurá la casilla y probala");
      const [{ n }] = await app.db.select({ n: sql<number>`count(*)::int` }).from(prospectos).where(inArray(prospectos.estado, ["Pendiente", "En curso"]));
      if (!Number(n)) throw badRequest("No hay a quién escribirle: importá una lista primero");
    }
    await app.db.update(prospeccionConfig).set({ activa, ...(activa ? { ultimoError: null } : {}) }).where(eq(prospeccionConfig.id, 1));
    return publica();
  });

  // ---------------------------------------------------------------- campañas

  app.get("/plantillas", async () => PLANTILLAS);

  app.get("/campanas", async () => {
    const lista = await app.db.select().from(prospeccionCampanas).orderBy(desc(prospeccionCampanas.createdAt));
    const conteos = await app.db
      .select({ id: prospectos.campanaId, estado: prospectos.estado, n: sql<number>`count(*)::int` })
      .from(prospectos)
      .groupBy(prospectos.campanaId, prospectos.estado);
    const enviados = await app.db
      .select({ id: prospectos.campanaId, n: sql<number>`count(*)::int` })
      .from(prospeccionEnvios)
      .innerJoin(prospectos, eq(prospectos.id, prospeccionEnvios.prospectoId))
      .where(eq(prospeccionEnvios.estado, "Enviado"))
      .groupBy(prospectos.campanaId);
    return lista.map((c) => {
      const de = (e: string) => Number(conteos.find((x) => x.id === c.id && x.estado === e)?.n ?? 0);
      const total = conteos.filter((x) => x.id === c.id).reduce((a, x) => a + Number(x.n), 0);
      return { ...c, total, pendientes: de("Pendiente") + de("En curso"), respondieron: de("Respondió"), bajas: de("Baja"), rebotes: de("Rebotó"), terminados: de("Terminado"), emailsEnviados: Number(enviados.find((x) => x.id === c.id)?.n ?? 0) };
    });
  });

  app.post("/campanas", async (req, reply) => {
    const d = parse(campanaSchema, req.body);
    const [c] = await app.db.insert(prospeccionCampanas).values(d).returning();
    return reply.status(201).send(c);
  });

  app.put("/campanas/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(campanaSchema, req.body);
    const [c] = await app.db.update(prospeccionCampanas).set(d).where(eq(prospeccionCampanas.id, id)).returning();
    if (!c) throw notFound("Campaña no encontrada");
    return c;
  });

  /**
   * Importar la lista: primero muestra qué va a pasar (confirmar: false), después la guarda.
   * No se le escribe a quien ya es cliente, ya pidió una demo, ya está en otra lista o se dio de baja.
   */
  app.post("/campanas/:id/importar", { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { filas, confirmar } = parse(z.object({ filas: z.array(filaSchema).max(5000, "Hasta 5000 por vez"), confirmar: z.boolean().default(false) }), req.body);
    const [c] = await app.db.select({ id: prospeccionCampanas.id }).from(prospeccionCampanas).where(eq(prospeccionCampanas.id, id));
    if (!c) throw notFound("Campaña no encontrada");
    const invalidos: string[] = [];
    const vistos = new Set<string>();
    const validas = filas.filter((f) => {
      if (!EMAIL.test(f.email) || NO_ESCRIBIR.test(f.email)) {
        invalidos.push(f.email || "(vacío)");
        return false;
      }
      if (vistos.has(f.email)) return false;
      vistos.add(f.email);
      return true;
    });
    const emails = validas.map((f) => f.email);
    const [ya, clientes, empresasEmails, pidieron] = emails.length
      ? await Promise.all([
          app.db.select({ email: prospectos.email }).from(prospectos).where(inArray(prospectos.email, emails)),
          app.db.select({ email: usuarios.email }).from(usuarios).where(inArray(sql`lower(${usuarios.email})`, emails)),
          app.db.select({ email: empresas.email }).from(empresas).where(inArray(sql`lower(${empresas.email})`, emails)),
          app.db.select({ email: interesados.email }).from(interesados).where(inArray(interesados.email, emails)),
        ])
      : [[], [], [], []];
    const repetidos = new Set(ya.map((x) => x.email));
    const excluidos = new Set([...clientes, ...empresasEmails, ...pidieron].map((x) => (x.email ?? "").toLowerCase()));
    const nuevas = validas.filter((f) => !repetidos.has(f.email) && !excluidos.has(f.email));
    if (confirmar && nuevas.length) {
      await app.db
        .insert(prospectos)
        .values(nuevas.map((f) => ({ ...f, campanaId: id, token: nuevoToken() })))
        .onConflictDoNothing();
    }
    return {
      nuevos: nuevas.length,
      repetidos: validas.filter((f) => repetidos.has(f.email)).length + (filas.length - validas.length - invalidos.length),
      excluidos: validas.filter((f) => excluidos.has(f.email) && !repetidos.has(f.email)).length,
      invalidos: invalidos.length,
      ejemplosInvalidos: invalidos.slice(0, 5),
      guardados: confirmar ? nuevas.length : 0,
    };
  });

  // ---------------------------------------------------------------- prospectos

  app.get("/prospectos", async (req) => {
    const q = parse(z.object({ campanaId: z.string().uuid().optional(), estado: z.string().max(20).optional() }), req.query);
    const filtros = [];
    if (q.campanaId) filtros.push(eq(prospectos.campanaId, q.campanaId));
    if (q.estado) filtros.push(eq(prospectos.estado, q.estado));
    return app.db
      .select()
      .from(prospectos)
      .where(filtros.length ? and(...filtros) : undefined)
      .orderBy(desc(prospectos.ultimoEnvio), desc(prospectos.createdAt))
      .limit(1000);
  });

  /** Marcar a mano (ej.: respondió por teléfono, o no quiere más emails) */
  app.put("/prospectos/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(z.object({ estado: z.enum(["Pendiente", "En curso", "Respondió", "Baja", "Rebotó", "Terminado"]), nota: texto(1000) }), req.body);
    const [actual] = await app.db.select().from(prospectos).where(eq(prospectos.id, id));
    if (!actual) throw notFound("No encontrado");
    if (actual.estado === "Baja" && d.estado !== "Baja") throw conflict("Pidió no recibir más emails: no se le puede volver a escribir");
    const [p] = await app.db.update(prospectos).set(d).where(eq(prospectos.id, id)).returning();
    return p;
  });
};

/** Baja desde el link del email de prospección (sin usuario) */
export const prospeccionPublicaRoutes: FastifyPluginAsync = async (app) => {
  const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/, "Link inválido") });
  const de = async (token: string) => {
    const [p] = await app.db.select({ id: prospectos.id, estado: prospectos.estado }).from(prospectos).where(eq(prospectos.token, token));
    if (!p) throw notFound("El link no es válido");
    return p;
  };
  app.get("/:token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const p = await de(parse(tokenSchema, req.params).token);
    return { dadoDeBaja: p.estado === "Baja" };
  });
  app.post("/:token", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const p = await de(parse(tokenSchema, req.params).token);
    await app.db.update(prospectos).set({ estado: "Baja", nota: "Se dio de baja con el link del email" }).where(eq(prospectos.id, p.id));
    return { dadoDeBaja: true };
  });
};
