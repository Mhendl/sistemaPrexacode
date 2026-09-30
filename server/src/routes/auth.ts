import { registrarAlta } from "../lib/prospeccion.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { aceptacionesTerminos, empresas, recuperacionesClave, suscripciones, usuarios } from "../db/schema.js";
import { enviarDePlataforma } from "../lib/email/plataforma.js";
import { hoyAr } from "../lib/cuentas.js";
import { crearRolesPrearmados, perfilDe } from "../lib/roles.js";
import { prepararConsultorio } from "../lib/dental.js";
import { DIAS_PRUEBA, PLAN_IDS, sumarDias } from "../lib/suscripcion.js";
import { marcaDe, PRODUCTO_IDS, productoDeEmpresa } from "../lib/productos.js";
import { empresaDeCodigo, nuevoCodigo } from "../lib/referidos.js";
import { TERMINOS_VERSION } from "../lib/legal.js";
import { requireAuth, type SessionUser } from "../lib/auth.js";
import { badRequest, conflict, HttpError, notFound, parse, unauthorized } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { condicionIvaSchema, cuitSchema, emailSchema, passwordSchema } from "../lib/validation.js";

const registroSchema = z.object({
  empresa: z.object({
    razonSocial: z.string().trim().min(2, "La razón social es obligatoria").max(200),
    cuit: cuitSchema,
    condicionIva: condicionIvaSchema,
  }),
  usuario: z.object({
    nombre: z.string().trim().min(2, "El nombre es obligatorio").max(120),
    email: emailSchema,
    password: passwordSchema,
  }),
  /** Código de quien lo recomendó (link /registro?ref=…) */
  ref: z.string().trim().max(20).optional().nullable(),
  /** Vino desde un email de prospección (link con ?p=…) */
  prospecto: z.string().trim().max(40).optional().nullable(),
  /** Qué producto contrata (lo define la dirección web desde la que se registra) */
  producto: z.enum(PRODUCTO_IDS).default("gestion"),
  aceptaTerminos: z.literal(true, { errorMap: () => ({ message: "Tenés que aceptar los Términos y Condiciones y la Política de Privacidad" }) }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type UsuarioRow = typeof usuarios.$inferSelect;
type EmpresaRow = typeof empresas.$inferSelect;

/** Nunca devolvemos el hash de la contraseña */
export const usuarioPublico = ({ passwordHash: _omit, sesionId: _s, ultimaSesionPisada: _p, ...u }: UsuarioRow) => u;

export const authRoutes: FastifyPluginAsync = async (app) => {
  const firmar = (u: UsuarioRow) => app.jwt.sign({ sub: u.id, empresaId: u.empresaId, rol: u.rol, sid: u.sesionId ?? undefined } as SessionUser);

  /** El usuario con su rol y permisos: con eso la app arma el menú y muestra los botones que corresponden */
  const conPerfil = async (u: UsuarioRow) => ({ ...usuarioPublico(u), ...(await perfilDe(app.db, u.rolId)) });
  const sesion = async (u: UsuarioRow, e: EmpresaRow) => ({ token: firmar(u), usuario: await conPerfil(u), empresa: e });

  /** Alta de una empresa nueva con su primer usuario administrador */
  // Límite de intentos por IP: frena la creación masiva de cuentas
  app.post("/registro", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = parse(registroSchema, req.body);

    const [cuitUsado] = await app.db.select({ id: empresas.id }).from(empresas).where(eq(empresas.cuit, body.empresa.cuit));
    if (cuitUsado) throw conflict("Ya existe una cuenta para ese CUIT", { "empresa.cuit": "Ya registrado" });

    const [emailUsado] = await app.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, body.usuario.email));
    if (emailUsado) throw conflict("Ese email ya tiene una cuenta", { "usuario.email": "Ya registrado" });

    const passwordHash = await hashPassword(body.usuario.password);
    const { empresa, usuario } = await app.db.transaction(async (tx) => {
      // Fechas con el reloj de la aplicación (el mismo con el que se calculan vencimientos)
      const ahora = new Date();
      const referidaPor = await empresaDeCodigo(tx, body.ref);
      const [empresa] = await tx.insert(empresas).values({ ...body.empresa, producto: body.producto, referidaPor, codigoReferido: nuevoCodigo(), createdAt: ahora }).returning();
      await tx.insert(suscripciones).values({ empresaId: empresa.id, plan: (PLAN_IDS as string[]).includes(empresa.plan) ? empresa.plan : "profesional", pruebaHasta: sumarDias(hoyAr(), DIAS_PRUEBA) });
      const rolesEmpresa = await crearRolesPrearmados(tx, empresa.id, empresa.producto);
      const [usuario] = await tx
        .insert(usuarios)
        .values({ empresaId: empresa.id, nombre: body.usuario.nombre, email: body.usuario.email, passwordHash, rol: "admin", rolId: rolesEmpresa.admin.id, ultimoAcceso: new Date(), sesionId: randomUUID() })
        .returning();
      // Un consultorio arranca con su nomenclador, obras sociales y la agenda de turnos (el administrador como profesional)
      if (empresa.producto === "dental") await prepararConsultorio(tx, empresa.id, usuario);
      await tx.insert(aceptacionesTerminos).values({
        empresaId: empresa.id,
        usuarioId: usuario.id,
        version: TERMINOS_VERSION,
        ip: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
        aceptadoEn: ahora,
      });
      return { empresa, usuario };
    });

    if (body.prospecto) await registrarAlta(app, body.prospecto, empresa.id).catch((e) => app.log.warn(e, "No se pudo marcar el alta del prospecto"));

    // Bienvenida (no frena el registro si el correo falla)
    const marca = marcaDe(empresa.producto);
    const pasos =
      empresa.producto === "dental"
        ? "Para arrancar en pocos minutos:\n1. Completá los datos del consultorio y subí el logo (Configuración → Empresa).\n2. Cargá a los profesionales y sus horarios de atención.\n3. Cargá o importá tus pacientes.\n4. Sumá a tu equipo (secretaría, profesionales) como usuarios, cada uno con su rol."
        : "Para arrancar en pocos minutos:\n1. Completá los datos de la empresa y subí el logo (Configuración → Empresa).\n2. Cargá o importá tus clientes y productos desde Excel.\n3. Sumá a tu equipo como usuarios, cada uno con su rol.\n4. Conectá ARCA para facturar (mientras tanto podés practicar en modo pruebas).";
    void enviarDePlataforma(app, {
      producto: empresa.producto,
      para: usuario.email,
      asunto: `¡Bienvenido a ${marca.nombre}, ${usuario.nombre.split(" ")[0]}!`,
      saludo: `Hola ${usuario.nombre.split(" ")[0]},`,
      parrafos: [`Ya está creada la cuenta de ${empresa.razonSocial}. Tenés 14 días de prueba gratis con todo habilitado, sin tarjeta.`, pasos, "Cualquier duda, escribinos desde Soporte dentro del sistema."],
      boton: { texto: `Entrar a ${marca.nombre}`, url: app.urlDe(empresa.producto) },
    });

    return reply.status(201).send(await sesion(usuario, empresa));
  });

  /* ---------- Olvidé mi contraseña ---------- */

  const huella = (token: string) => createHash("sha256").update(token).digest("hex");
  /** Solo en el servidor de pruebas: el último link enviado a cada email (las pruebas no leen correo) */
  const ultimosLinks = new Map<string, string>();

  // Siempre responde lo mismo: no revela si el email tiene cuenta
  app.post("/olvide", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const [u] = await app.db.select().from(usuarios).where(eq(usuarios.email, email));
    if (u && u.estado === "Activo") {
      const token = randomBytes(32).toString("base64url");
      await app.db.insert(recuperacionesClave).values({ usuarioId: u.id, tokenHash: huella(token), expira: new Date(Date.now() + 60 * 60_000) });
      const producto = await productoDeEmpresa(app.db, u.empresaId);
      const link = `${app.urlDe(producto)}/restablecer?token=${token}`;
      if (app.modoPruebas) ultimosLinks.set(email, link);
      void enviarDePlataforma(app, {
        producto,
        para: u.email,
        asunto: `Elegí una contraseña nueva para ${marcaDe(producto).nombre}`,
        saludo: `Hola ${u.nombre.split(" ")[0]},`,
        parrafos: ["Pediste elegir una contraseña nueva. Tocá el botón: el link sirve una sola vez y vence en 1 hora.", "Si no lo pediste vos, ignorá este email: tu contraseña sigue igual."],
        boton: { texto: "Elegir contraseña nueva", url: link },
      });
    }
    return { ok: true };
  });

  app.post("/restablecer", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const d = parse(z.object({ token: z.string().min(20, "El link no es válido").max(200), password: passwordSchema }), req.body);
    const [r] = await app.db
      .select()
      .from(recuperacionesClave)
      .where(and(eq(recuperacionesClave.tokenHash, huella(d.token)), isNull(recuperacionesClave.usadoEn), gt(recuperacionesClave.expira, new Date())));
    if (!r) throw badRequest("El link venció o ya se usó. Pedí uno nuevo desde \"¿Olvidaste tu contraseña?\".", { token: "Vencido" });
    const [u] = await app.db.select().from(usuarios).where(eq(usuarios.id, r.usuarioId));
    if (!u || u.estado !== "Activo") throw badRequest("Tu usuario está suspendido. Hablá con el administrador.");
    await app.db.transaction(async (tx) => {
      // La contraseña nueva cierra las sesiones abiertas, y el link (y cualquier otro pedido) deja de servir
      await tx.update(usuarios).set({ passwordHash: await hashPassword(d.password), sesionId: null }).where(eq(usuarios.id, u.id));
      await tx.update(recuperacionesClave).set({ usadoEn: new Date() }).where(and(eq(recuperacionesClave.usuarioId, u.id), isNull(recuperacionesClave.usadoEn)));
    });
    return reply.status(204).send();
  });

  if (app.modoPruebas) {
    app.get("/pruebas/ultimo-link", async (req) => {
      const { email } = parse(z.object({ email: emailSchema }), req.query);
      return { link: ultimosLinks.get(email) ?? null };
    });
  }

  // Límite de intentos por IP: evita que se prueben contraseñas por fuerza bruta
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } }, async (req) => {
    const body = parse(loginSchema, req.body);
    const [u] = await app.db.select().from(usuarios).where(eq(usuarios.email, body.email));
    // Mismo mensaje para email inexistente o contraseña incorrecta
    if (!u || !(await verifyPassword(body.password, u.passwordHash))) throw unauthorized("Email o contraseña incorrectos");
    if (u.estado !== "Activo") throw unauthorized("Tu usuario está suspendido. Hablá con el administrador.");

    const [e] = await app.db.select().from(empresas).where(eq(empresas.id, u.empresaId));
    if (e?.suspendidaEn) throw new HttpError(403, "La cuenta de esta empresa está suspendida. Escribinos para resolverlo.", undefined, "EMPRESA_SUSPENDIDA");
    // Sesión nueva: si estaba abierto en otro dispositivo, allá se cierra
    const [actualizado] = await app.db.update(usuarios).set({ ultimoAcceso: new Date(), sesionId: randomUUID() }).where(eq(usuarios.id, u.id)).returning();
    return sesion(actualizado, e);
  });

  /** Cerrar sesión: el token deja de servir también en el servidor */
  app.post("/logout", { preHandler: requireAuth }, async (req, reply) => {
    await app.db.update(usuarios).set({ sesionId: null }).where(eq(usuarios.id, req.user.sub));
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const [u] = await app.db.select().from(usuarios).where(eq(usuarios.id, req.user.sub));
    if (!u || u.estado !== "Activo") throw unauthorized();
    const [e] = await app.db.select().from(empresas).where(eq(empresas.id, u.empresaId));
    if (!e) throw notFound();
    if (e.suspendidaEn) throw new HttpError(403, "La cuenta de esta empresa está suspendida. Escribinos para resolverlo.", undefined, "EMPRESA_SUSPENDIDA");
    return { usuario: await conPerfil(u), empresa: e };
  });
};
