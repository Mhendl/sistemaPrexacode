import { eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { roles, usuarios } from "../db/schema.js";
import { forbidden, HttpError, unauthorized } from "./errors.js";
import type { Permiso } from "./permisos.js";

/** Tipo de rol: los pre armados, o uno creado por la empresa */
export const ROLES = ["admin", "ventas", "operaciones", "profesional", "recepcion"] as const;
export type Rol = (typeof ROLES)[number] | "personalizado";

/** Datos que viajan firmados dentro del token */
export interface SessionUser {
  sub: string; // id de usuario
  empresaId: string;
  rol: Rol;
  /** Solo en los tokens del panel de la plataforma: "plataforma". Los de las empresas no lo tienen. */
  tipo?: "plataforma";
  /** Sesión: si el usuario entra desde otro dispositivo, esta deja de valer */
  sid?: string;
  /** Se completan en cada pedido desde la base (no viajan en el token) */
  esAdmin?: boolean;
  permisos?: string[];
  autenticado?: boolean;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

/** preHandler: exige sesión válida de un usuario de una empresa (un token del panel de la plataforma no sirve acá) */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  if (req.user?.autenticado) return; // ya se verificó en este mismo pedido
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized("Tu sesión venció. Volvé a iniciar sesión.");
  }
  if (req.user.tipo === "plataforma" || !req.user.empresaId) throw unauthorized("Tu sesión venció. Volvé a iniciar sesión.");
  // El token solo dice quién era al entrar: el estado, el rol y la sesión vigente se leen de la base en cada pedido
  const [u] = await req.server.db
    .select({
      empresaId: usuarios.empresaId,
      estado: usuarios.estado,
      rol: usuarios.rol,
      sesionId: usuarios.sesionId,
      ultimaSesionPisada: usuarios.ultimaSesionPisada,
      esAdmin: roles.esAdmin,
      permisos: roles.permisos,
    })
    .from(usuarios)
    .leftJoin(roles, eq(roles.id, usuarios.rolId))
    .where(eq(usuarios.id, req.user.sub));
  if (!u || u.empresaId !== req.user.empresaId) throw unauthorized("Tu sesión venció. Volvé a iniciar sesión.");
  if (u.estado !== "Activo") throw new HttpError(401, "Tu usuario está suspendido. Hablá con el administrador.", undefined, "USUARIO_SUSPENDIDO");
  if (!req.user.sid || req.user.sid !== u.sesionId) {
    // Un dispositivo que sigue usando una sesión reemplazada: se cuenta una vez por sesión
    if (req.user.sid && u.sesionId && u.ultimaSesionPisada !== req.user.sid) {
      await req.server.db
        .update(usuarios)
        .set({ sesionesPisadas: sql`${usuarios.sesionesPisadas} + 1`, ultimaSesionPisada: req.user.sid })
        .where(eq(usuarios.id, req.user.sub));
    }
    throw new HttpError(401, "Se abrió tu usuario en otro dispositivo, por eso se cerró esta sesión. Cada persona tiene que usar su propio usuario.", undefined, "SESION_REEMPLAZADA");
  }
  req.user.rol = u.rol as Rol;
  req.user.esAdmin = !!u.esAdmin;
  req.user.permisos = u.permisos ?? [];
  req.user.autenticado = true;
}

/** ¿El usuario del pedido tiene alguno de estos permisos? (el administrador tiene todos) */
export const tienePermiso = (req: FastifyRequest, ...alguno: Permiso[]) => !!req.user.esAdmin || alguno.some((p) => req.user.permisos?.includes(p));

/** preHandler: exige sesión y alguno de los permisos */
export function requirePermiso(...alguno: Permiso[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply);
    if (!tienePermiso(req, ...alguno)) throw forbidden();
  };
}

/** preHandler: solo el administrador (usuarios, roles, plan y pagos no se delegan) */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (!req.user.esAdmin) throw forbidden();
}

/**
 * preHandler para un módulo entero: consultar pide `ver`; cargar o modificar pide `editar`.
 * `especiales` fija otro permiso para cambios en rutas puntuales (por el final de la ruta, ej. "/:id/anular").
 */
export function permisoPorMetodo(ver: Permiso, editar: Permiso, especiales: Record<string, Permiso> = {}) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply);
    const ruta = req.routeOptions.url ?? "";
    const lectura = req.method === "GET" || req.method === "HEAD";
    const especial = lectura ? undefined : Object.entries(especiales).find(([fin]) => ruta.endsWith(fin));
    const hace = especial ? especial[1] : lectura ? ver : editar;
    if (!tienePermiso(req, hace)) throw forbidden();
  };
}

/** preHandler: exige sesión del panel de la plataforma (los tokens de las empresas no sirven acá) */
export async function requirePlataforma(req: FastifyRequest, _reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized("Tu sesión del panel venció. Volvé a entrar.");
  }
  if (req.user.tipo !== "plataforma") throw unauthorized("Tenés que entrar al panel de administración");
}


