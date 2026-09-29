import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { roles, usuarios } from "../db/schema.js";
import { badRequest } from "./errors.js";
import { ROLES_PREARMADOS, type Prearmado } from "./permisos.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type RolRow = typeof roles.$inferSelect;

/** Los roles con los que arranca una empresa nueva */
export async function crearRolesPrearmados(db: Db | Tx, empresaId: string) {
  const filas = await db
    .insert(roles)
    .values(Object.entries(ROLES_PREARMADOS).map(([clave, r]) => ({ empresaId, nombre: r.nombre, descripcion: r.descripcion, esAdmin: r.esAdmin, prearmado: clave, permisos: [...r.permisos] })))
    .returning();
  return Object.fromEntries(filas.map((f) => [f.prearmado, f])) as Record<Prearmado, RolRow>;
}

/** Tipo de rol que se guarda en usuarios.rol: el pre armado, o "personalizado" */
export const tipoDeRol = (r: Pick<RolRow, "prearmado">) => r.prearmado ?? "personalizado";

/**
 * El rol a asignar: por id, o por su clave de pre armado ("admin", "ventas", "operaciones").
 * Tiene que ser de la misma empresa.
 */
export async function rolParaAsignar(db: Db, empresaId: string, d: { rolId?: string; rol?: string }) {
  const [r] = d.rolId
    ? await db.select().from(roles).where(and(eq(roles.id, d.rolId), eq(roles.empresaId, empresaId)))
    : d.rol
      ? await db.select().from(roles).where(and(eq(roles.prearmado, d.rol), eq(roles.empresaId, empresaId)))
      : [];
  if (!r) throw badRequest("Elegí un rol", { rolId: "Rol inválido" });
  return r;
}

/** Cantidad de usuarios activos con acceso total (sin contar a `excepto`) */
export async function administradoresActivos(db: Db, empresaId: string, excepto?: string) {
  const admins = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.empresaId, empresaId), eq(roles.esAdmin, true)));
  if (!admins.length) return 0;
  const filtros = [eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo"), inArray(usuarios.rolId, admins.map((a) => a.id))];
  if (excepto) filtros.push(ne(usuarios.id, excepto));
  const [{ n }] = await db.select({ n: count() }).from(usuarios).where(and(...filtros));
  return Number(n);
}

/** Datos del rol que ve la app de cada usuario (para mostrar el menú y los botones que corresponden) */
export async function perfilDe(db: Db, rolId: string | null) {
  const [r] = rolId ? await db.select().from(roles).where(eq(roles.id, rolId)) : [];
  return { rolId: r?.id ?? null, rolNombre: r?.nombre ?? "Sin rol", esAdmin: !!r?.esAdmin, permisos: r?.permisos ?? [] };
}
