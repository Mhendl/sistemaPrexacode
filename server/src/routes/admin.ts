import { asc, count, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { adminsPlataforma } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { badRequest, conflict, forbidden, notFound, parse, unauthorized } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { emailSchema, passwordSchema } from "../lib/validation.js";

type Admin = typeof adminsPlataforma.$inferSelect;
const publico = ({ passwordHash: _p, ...a }: Admin) => a;

/** Si todavía no hay administradores, crea el primero (variables ADMIN_EMAIL y ADMIN_PASSWORD al desplegar) */
export async function crearAdminInicial(db: Db, email: string, password: string) {
  const [{ n }] = await db.select({ n: count() }).from(adminsPlataforma);
  if (Number(n) > 0) return false;
  await db.insert(adminsPlataforma).values({ email: email.trim().toLowerCase(), nombre: "Administrador", passwordHash: await hashPassword(password) }).onConflictDoNothing();
  return true;
}

/** Administrador activo del token (o error) */
export async function adminDe(app: FastifyInstance, req: FastifyRequest): Promise<Admin> {
  const [a] = await app.db.select().from(adminsPlataforma).where(eq(adminsPlataforma.id, req.user.sub));
  if (!a || !a.activo) throw unauthorized("Tu usuario del panel no está activo");
  return a;
}

/** Entrada al panel de administración de la plataforma: usuario y contraseña propios, separados de las empresas */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req) => {
    const d = parse(z.object({ email: emailSchema, password: z.string().min(1, "Ingresá la contraseña") }), req.body);
    const [a] = await app.db.select().from(adminsPlataforma).where(eq(adminsPlataforma.email, d.email));
    // Mismo mensaje si no existe o la contraseña no coincide
    if (!a || !a.activo || !(await verifyPassword(d.password, a.passwordHash))) throw unauthorized("Email o contraseña incorrectos");
    const [act] = await app.db.update(adminsPlataforma).set({ ultimoAcceso: new Date() }).where(eq(adminsPlataforma.id, a.id)).returning();
    const token = app.jwt.sign({ sub: a.id, empresaId: "", rol: "admin", tipo: "plataforma" }, { expiresIn: "8h" });
    return { token, admin: publico(act!) };
  });

  app.get("/me", { preHandler: requirePlataforma }, async (req) => publico(await adminDe(app, req)));

  app.post("/password", { preHandler: requirePlataforma }, async (req, reply) => {
    const d = parse(z.object({ actual: z.string().min(1, "Ingresá tu contraseña actual"), nueva: passwordSchema }), req.body);
    const a = await adminDe(app, req);
    if (!(await verifyPassword(d.actual, a.passwordHash))) throw badRequest("La contraseña actual no es correcta", { actual: "Incorrecta" });
    await app.db.update(adminsPlataforma).set({ passwordHash: await hashPassword(d.nueva) }).where(eq(adminsPlataforma.id, a.id));
    return reply.status(204).send();
  });

  app.get("/administradores", { preHandler: requirePlataforma }, async (req) => {
    await adminDe(app, req);
    return (await app.db.select().from(adminsPlataforma).orderBy(asc(adminsPlataforma.createdAt))).map(publico);
  });

  app.post("/administradores", { preHandler: requirePlataforma }, async (req, reply) => {
    await adminDe(app, req);
    const d = parse(z.object({ nombre: z.string().trim().min(2, "Indicá el nombre").max(80), email: emailSchema, password: passwordSchema }), req.body);
    const [existe] = await app.db.select({ id: adminsPlataforma.id }).from(adminsPlataforma).where(eq(adminsPlataforma.email, d.email));
    if (existe) throw conflict("Ya hay un administrador con ese email", { email: "Ya existe" });
    const [a] = await app.db.insert(adminsPlataforma).values({ nombre: d.nombre, email: d.email, passwordHash: await hashPassword(d.password) }).returning();
    return reply.status(201).send(publico(a!));
  });

  app.patch("/administradores/:id", { preHandler: requirePlataforma }, async (req) => {
    const yo = await adminDe(app, req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { activo } = parse(z.object({ activo: z.boolean() }), req.body);
    if (id === yo.id && !activo) throw forbidden("No podés desactivarte a vos mismo");
    const [a] = await app.db.update(adminsPlataforma).set({ activo }).where(eq(adminsPlataforma.id, id)).returning();
    if (!a) throw notFound("Administrador no encontrado");
    return publico(a);
  });
};
