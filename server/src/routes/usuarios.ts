import { and, asc, count, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { roles, usuarios } from "../db/schema.js";
import { exigirCupo } from "../lib/suscripcion.js";
import { sumarUsuarioALaAgenda } from "./agenda.js";
import { requireAdmin } from "../lib/auth.js";
import { badRequest, conflict, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { completarPermisos, PERMISOS, SECCIONES_PERMISOS } from "../lib/permisos.js";
import { administradoresActivos, rolParaAsignar, tipoDeRol } from "../lib/roles.js";
import { emailSchema, passwordSchema } from "../lib/validation.js";
import { usuarioPublico } from "./auth.js";

/** El rol se elige por id (roles creados por la empresa) o por su clave de pre armado ("ventas") */
const rolElegido = {
  rolId: z.string().uuid("Rol inválido").optional(),
  rol: z.enum(["admin", "ventas", "operaciones"], { errorMap: () => ({ message: "Rol inválido" }) }).optional(),
};

const crearSchema = z
  .object({
    nombre: z.string().trim().min(2, "El nombre es obligatorio").max(120),
    email: emailSchema,
    password: passwordSchema,
    ...rolElegido,
  })
  .refine((d) => d.rolId || d.rol, { message: "Elegí un rol", path: ["rolId"] });

const editarSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  estado: z.enum(["Activo", "Suspendido"]).optional(),
  ...rolElegido,
});

const idSchema = z.object({ id: z.string().uuid("Id inválido") });

/** Gestión de usuarios de la propia empresa (solo administradores) */
export const usuariosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAdmin);

  const conRol = async (u: typeof usuarios.$inferSelect) => {
    const [r] = u.rolId ? await app.db.select({ nombre: roles.nombre }).from(roles).where(eq(roles.id, u.rolId)) : [];
    return { ...usuarioPublico(u), rolNombre: r?.nombre ?? "Sin rol" };
  };

  app.get("/", async (req) => {
    const rows = await app.db
      .select({ u: usuarios, rolNombre: roles.nombre })
      .from(usuarios)
      .leftJoin(roles, eq(roles.id, usuarios.rolId))
      .where(eq(usuarios.empresaId, req.user.empresaId))
      .orderBy(asc(usuarios.nombre));
    return rows.map(({ u, rolNombre }) => ({ ...usuarioPublico(u), rolNombre: rolNombre ?? "Sin rol" }));
  });

  app.post("/", async (req, reply) => {
    const body = parse(crearSchema, req.body);
    const [existe] = await app.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, body.email));
    if (existe) throw conflict("Ese email ya tiene una cuenta", { email: "Ya registrado" });
    const rol = await rolParaAsignar(app.db, req.user.empresaId, body);
    await exigirCupo(app.db, req.user.empresaId, "usuarios");

    const [u] = await app.db
      .insert(usuarios)
      .values({ empresaId: req.user.empresaId, nombre: body.nombre, email: body.email, rol: tipoDeRol(rol), rolId: rol.id, passwordHash: await hashPassword(body.password) })
      .returning();
    await sumarUsuarioALaAgenda(app.db, req.user.empresaId, u!);
    return reply.status(201).send(await conRol(u!));
  });

  app.patch("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const body = parse(editarSchema, req.body ?? {});
    if (Object.values(body).every((v) => v === undefined)) throw badRequest("No hay nada para cambiar");
    const [actual] = await app.db
      .select({ estado: usuarios.estado, esAdmin: roles.esAdmin })
      .from(usuarios)
      .leftJoin(roles, eq(roles.id, usuarios.rolId))
      .where(and(eq(usuarios.id, id), eq(usuarios.empresaId, req.user.empresaId)));
    if (!actual) throw notFound("Usuario no encontrado");

    const nuevoRol = body.rolId || body.rol ? await rolParaAsignar(app.db, req.user.empresaId, body) : null;
    if (id === req.user.sub && nuevoRol && !nuevoRol.esAdmin) throw badRequest("No podés quitarte el rol de administrador a vos mismo");
    if (id === req.user.sub && body.estado === "Suspendido") throw badRequest("No podés suspender tu propio usuario");
    // Siempre tiene que quedar al menos un administrador activo
    const dejaDeSerAdmin = actual.esAdmin && actual.estado === "Activo" && ((nuevoRol && !nuevoRol.esAdmin) || body.estado === "Suspendido");
    if (dejaDeSerAdmin && (await administradoresActivos(app.db, req.user.empresaId, id)) === 0) {
      throw badRequest("Tiene que quedar al menos un administrador activo en la empresa");
    }
    if (body.estado === "Activo" && actual.estado !== "Activo") await exigirCupo(app.db, req.user.empresaId, "usuarios");

    const { rolId: _r, rol: _t, ...resto } = body;
    const [u] = await app.db
      .update(usuarios)
      .set({ ...resto, ...(nuevoRol ? { rolId: nuevoRol.id, rol: tipoDeRol(nuevoRol) } : {}) })
      .where(and(eq(usuarios.id, id), eq(usuarios.empresaId, req.user.empresaId)))
      .returning();
    return conRol(u!);
  });
};

const rolSchema = z.object({
  nombre: z.string().trim().min(2, "Poné un nombre al rol").max(60),
  descripcion: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null)),
  permisos: z.array(z.string()).max(100).refine((l) => l.every((p) => (PERMISOS as string[]).includes(p)), "Permiso inválido"),
  version: z.number().int().positive().max(2_000_000_000).optional(),
});

/** Roles de la empresa: el administrador crea, edita y borra los suyos (el de administrador no se toca) */
export const rolesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAdmin);

  /** Catálogo de permisos, por sección, para armar la lista de casillas */
  app.get("/permisos", async () => SECCIONES_PERMISOS);

  app.get("/", async (req) => {
    const lista = await app.db.select().from(roles).where(eq(roles.empresaId, req.user.empresaId)).orderBy(asc(roles.createdAt));
    const usos = await app.db.select({ rolId: usuarios.rolId, n: count() }).from(usuarios).where(eq(usuarios.empresaId, req.user.empresaId)).groupBy(usuarios.rolId);
    const n = new Map(usos.map((u) => [u.rolId, Number(u.n)]));
    // Primero el administrador, después los pre armados y al final los creados por la empresa
    const orden = (r: typeof roles.$inferSelect) => (r.esAdmin ? 0 : r.prearmado ? 1 : 2);
    return lista.sort((a, b) => orden(a) - orden(b)).map((r) => ({ ...r, usuarios: n.get(r.id) ?? 0 }));
  });

  const nombreLibre = async (empresaId: string, nombre: string, excepto?: string) => {
    const [otro] = await app.db.select({ id: roles.id }).from(roles).where(and(eq(roles.empresaId, empresaId), eq(roles.nombre, nombre)));
    if (otro && otro.id !== excepto) throw conflict("Ya hay un rol con ese nombre", { nombre: "Ya existe" });
  };

  app.post("/", async (req, reply) => {
    const d = parse(rolSchema, req.body);
    await nombreLibre(req.user.empresaId, d.nombre);
    const [r] = await app.db.insert(roles).values({ empresaId: req.user.empresaId, nombre: d.nombre, descripcion: d.descripcion, permisos: completarPermisos(d.permisos) }).returning();
    return reply.status(201).send({ ...r, usuarios: 0 });
  });

  app.put("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(rolSchema, req.body);
    const [r] = await app.db.select().from(roles).where(and(eq(roles.id, id), eq(roles.empresaId, req.user.empresaId)));
    if (!r) throw notFound("Rol no encontrado");
    if (r.esAdmin) throw badRequest("El rol Administrador tiene acceso a todo y no se puede modificar");
    if (d.version && d.version !== r.version) throw edicionConcurrente("el rol");
    await nombreLibre(req.user.empresaId, d.nombre, id);
    const [n] = await app.db
      .update(roles)
      .set({ nombre: d.nombre, descripcion: d.descripcion, permisos: completarPermisos(d.permisos), version: r.version + 1 })
      .where(eq(roles.id, id))
      .returning();
    return n;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [r] = await app.db.select().from(roles).where(and(eq(roles.id, id), eq(roles.empresaId, req.user.empresaId)));
    if (!r) throw notFound("Rol no encontrado");
    if (r.esAdmin) throw badRequest("El rol Administrador no se puede borrar");
    const [{ n }] = await app.db.select({ n: count() }).from(usuarios).where(eq(usuarios.rolId, id));
    if (Number(n) > 0) throw conflict(`Hay ${n} ${Number(n) === 1 ? "usuario" : "usuarios"} con este rol: pasalos a otro rol antes de borrarlo`);
    await app.db.delete(roles).where(eq(roles.id, id));
    return reply.status(204).send();
  });
};
