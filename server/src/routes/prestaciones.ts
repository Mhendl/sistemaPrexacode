import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prestaciones } from "../db/schema.js";
import { requireAuth, requirePermiso, tienePermiso } from "../lib/auth.js";
import { ALCANCES, SIMBOLOS } from "../lib/dental.js";
import { conflict, edicionConcurrente, forbidden, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { versionSchema } from "../lib/validation.js";

const prestacionSchema = z
  .object({
    codigo: z.string().trim().min(1, "Poné el código").max(20),
    nombre: z.string().trim().min(2, "Poné el nombre").max(120),
    alcance: z.enum(ALCANCES, { errorMap: () => ({ message: "Elegí dónde se marca" }) }),
    simbolo: z.enum(SIMBOLOS).default("relleno"),
    etiqueta: z
      .string()
      .trim()
      .max(3, "Hasta 3 letras")
      .optional()
      .nullable()
      .transform((v) => (v ? v.toUpperCase() : null)),
    activa: z.boolean().optional(),
  })
  .refine((p) => p.simbolo !== "texto" || !!p.etiqueta, { message: "Poné las letras que se ven en la pieza", path: ["etiqueta"] });

const esDuplicado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/** Nomenclador del consultorio (CoreDental). Los precios por obra social se suman en la próxima etapa. */
export const prestacionesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });

  app.get("/", async (req) => {
    if (!tienePermiso(req, "pacientes.ver", "historia.ver", "configuracion")) throw forbidden();
    return app.db.select().from(prestaciones).where(eq(prestaciones.empresaId, req.user.empresaId)).orderBy(asc(prestaciones.codigo));
  });

  const soloConfig = requirePermiso("configuracion");

  app.post("/", { preHandler: soloConfig }, async (req, reply) => {
    const d = parse(prestacionSchema, req.body);
    try {
      const [p] = await app.db.insert(prestaciones).values({ ...d, empresaId: req.user.empresaId }).returning();
      return reply.status(201).send(p);
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay una prestación con ese código", { codigo: "Ya existe" });
      throw e;
    }
  });

  app.put("/:id", { preHandler: soloConfig }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const d = parse(prestacionSchema, req.body);
    const { version } = parse(versionSchema, req.body);
    const filtros: SQL[] = [eq(prestaciones.id, id), eq(prestaciones.empresaId, req.user.empresaId)];
    const [actual] = await app.db.select().from(prestaciones).where(and(...filtros));
    if (!actual) throw notFound("Prestación no encontrada");
    if (version) filtros.push(eq(prestaciones.version, version));
    try {
      const [p] = await app.db
        .update(prestaciones)
        .set({ ...d, version: sql`${prestaciones.version} + 1` })
        .where(and(...filtros))
        .returning();
      if (!p) throw edicionConcurrente("esta prestación");
      return p;
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay una prestación con ese código", { codigo: "Ya existe" });
      throw e;
    }
  });
};
