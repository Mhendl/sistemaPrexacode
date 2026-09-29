import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientes } from "../db/schema.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { badRequest, conflict, edicionConcurrente, esReferenciado, notFound, parse } from "../lib/errors.js";
import { clienteInputSchema, versionSchema } from "../lib/validation.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const listaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(["Activo", "Inactivo"]).optional(),
});

/** Error de clave única de Postgres (mismo CUIT dos veces en la empresa) */
const esDuplicado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

// Consultar: todos los roles (Operaciones elige el cliente al hacer un remito). Modificar: admin y ventas.
const soloEdicion = requirePermiso("clientes.editar");

const NO_SE_EDITA = "El consumidor final sin identificar es el de las ventas de mostrador: no se modifica ni se elimina.";

export const clientesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  const noEsConsumidorFinal = async (id: string) => {
    const [c] = await app.db.select({ sinIdentificar: clientes.sinIdentificar }).from(clientes).where(eq(clientes.id, id));
    if (c?.sinIdentificar) throw badRequest(NO_SE_EDITA);
  };

  app.get("/", async (req) => {
    const { q, estado } = parse(listaSchema, req.query);
    // El consumidor final sin identificar no es un cliente de la cartera: no se lista
    const filtros: SQL[] = [eq(clientes.empresaId, req.user.empresaId), eq(clientes.sinIdentificar, false)];
    if (estado) filtros.push(eq(clientes.estado, estado));
    if (q) {
      const like = `%${q}%`;
      filtros.push(or(ilike(clientes.razonSocial, like), ilike(clientes.cuit, `%${q.replace(/\D/g, "") || q}%`), ilike(clientes.contacto, like), ilike(clientes.email, like))!);
    }
    return app.db.select().from(clientes).where(and(...filtros)).orderBy(asc(clientes.razonSocial));
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [c] = await app.db.select().from(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, req.user.empresaId)));
    if (!c) throw notFound("Cliente no encontrado");
    return c;
  });

  app.post("/", { preHandler: soloEdicion }, async (req, reply) => {
    const body = parse(clienteInputSchema, req.body);
    try {
      const [c] = await app.db.insert(clientes).values({ ...body, empresaId: req.user.empresaId }).returning();
      return reply.status(201).send(c);
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya tenés un cliente con ese CUIT", { cuit: "Ya existe" });
      throw e;
    }
  });

  /** Cambiar lo mismo a muchos clientes a la vez (rubro, localidad, activo/inactivo) */
  app.post("/masivo", { preHandler: soloEdicion }, async (req) => {
    const texto = z.string().trim().max(300).nullable().optional();
    const d = parse(
      z.object({
        ids: z.array(z.string().uuid("Cliente inválido")).min(1, "Elegí al menos un cliente").max(10_000),
        cambios: z
          .object({ rubro: texto, localidad: texto, estado: z.enum(["Activo", "Inactivo"]).optional() })
          .refine((c) => Object.values(c).some((v) => v !== undefined), "Elegí qué cambiar"),
      }),
      req.body,
    );
    const cambios = Object.fromEntries(Object.entries(d.cambios).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === "" ? null : v]));
    const r = await app.db
      .update(clientes)
      .set({ ...cambios, version: sql`${clientes.version} + 1`, updatedAt: new Date() })
      .where(and(eq(clientes.empresaId, req.user.empresaId), inArray(clientes.id, d.ids), eq(clientes.sinIdentificar, false)))
      .returning({ id: clientes.id });
    return { actualizados: r.length };
  });

  app.put("/:id", { preHandler: soloEdicion }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const body = parse(clienteInputSchema, req.body);
    const { version } = parse(versionSchema, req.body);
    await noEsConsumidorFinal(id);
    try {
      const filtros = [eq(clientes.id, id), eq(clientes.empresaId, req.user.empresaId)];
      if (version) filtros.push(eq(clientes.version, version));
      const [c] = await app.db
        .update(clientes)
        .set({ ...body, version: sql`${clientes.version} + 1`, updatedAt: new Date() })
        .where(and(...filtros))
        .returning();
      if (!c) {
        const [existe] = await app.db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, req.user.empresaId)));
        throw existe ? edicionConcurrente("este cliente") : notFound("Cliente no encontrado");
      }
      return c;
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya tenés un cliente con ese CUIT", { cuit: "Ya existe" });
      throw e;
    }
  });

  app.delete("/:id", { preHandler: soloEdicion }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    await noEsConsumidorFinal(id);
    let c: { id: string } | undefined;
    try {
      [c] = await app.db.delete(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, req.user.empresaId))).returning({ id: clientes.id });
    } catch (e) {
      if (esReferenciado(e)) throw conflict("El cliente tiene remitos o comprobantes. Marcalo como Inactivo en lugar de eliminarlo.");
      throw e;
    }
    if (!c) throw notFound("Cliente no encontrado");
    return reply.status(204).send();
  });
};
