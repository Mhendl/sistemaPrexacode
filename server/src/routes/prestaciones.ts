import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { obrasSociales, prestacionPrecios, prestaciones } from "../db/schema.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, requirePermiso, tienePermiso } from "../lib/auth.js";
import { ALCANCES, SIMBOLOS } from "../lib/dental.js";
import { badRequest, conflict, edicionConcurrente, forbidden, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { MAX_IMPORTE, versionSchema } from "../lib/validation.js";

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

  // ---------------------------------------------------------------- listas de precios

  /** "particular" o el id de una obra social del consultorio */
  const listaSchema = z.object({ lista: z.union([z.literal("particular"), z.string().uuid("Lista inválida")]) });
  const obraDeLista = async (empresaId: string, lista: string) => {
    if (lista === "particular") return null;
    const [o] = await app.db.select().from(obrasSociales).where(and(eq(obrasSociales.id, lista), eq(obrasSociales.empresaId, empresaId)));
    if (!o) throw badRequest("La obra social no existe", { lista: "Inválida" });
    return o.id;
  };
  const filtroLista = (empresaId: string, obraId: string | null) =>
    and(eq(prestacionPrecios.empresaId, empresaId), obraId ? eq(prestacionPrecios.obraSocialId, obraId) : isNull(prestacionPrecios.obraSocialId));

  /** Las prestaciones con su precio en una lista (particular u obra social) */
  app.get("/precios", async (req) => {
    if (!tienePermiso(req, "pacientes.ver", "presupuestos.ver", "configuracion")) throw forbidden();
    const { lista } = parse(listaSchema, req.query);
    const obraId = await obraDeLista(req.user.empresaId, lista);
    const [todas, precios] = await Promise.all([
      app.db.select().from(prestaciones).where(eq(prestaciones.empresaId, req.user.empresaId)).orderBy(asc(prestaciones.codigo)),
      app.db.select().from(prestacionPrecios).where(filtroLista(req.user.empresaId, obraId)),
    ]);
    const por = new Map(precios.map((p) => [p.prestacionId, p]));
    return todas.map((p) => ({ ...p, precioPaciente: por.get(p.id)?.precioPaciente ?? null, precioObraSocial: por.get(p.id)?.precioObraSocial ?? null }));
  });

  const precio = z.coerce.number({ invalid_type_error: "Precio inválido" }).min(0, "No puede ser negativo").max(MAX_IMPORTE, "Precio demasiado grande");

  /** Guarda los precios de una lista (los que vienen en null se quitan) */
  app.put("/precios", { preHandler: soloConfig }, async (req) => {
    const d = parse(
      z.object({
        lista: listaSchema.shape.lista,
        precios: z
          .array(z.object({ prestacionId: z.string().uuid(), precioPaciente: precio.nullable(), precioObraSocial: precio.nullable().default(0) }))
          .max(2000),
      }),
      req.body,
    );
    const empresaId = req.user.empresaId;
    const obraId = await obraDeLista(empresaId, d.lista);
    const propias = new Set((await app.db.select({ id: prestaciones.id }).from(prestaciones).where(eq(prestaciones.empresaId, empresaId))).map((p) => p.id));
    if (d.precios.some((p) => !propias.has(p.prestacionId))) throw badRequest("Hay prestaciones que no son del consultorio");
    await app.db.transaction(async (tx) => {
      for (const p of d.precios) {
        const donde = and(filtroLista(empresaId, obraId), eq(prestacionPrecios.prestacionId, p.prestacionId));
        if (p.precioPaciente === null) {
          await tx.delete(prestacionPrecios).where(donde);
          continue;
        }
        const valores = { precioPaciente: r2(p.precioPaciente), precioObraSocial: obraId ? r2(p.precioObraSocial ?? 0) : 0, updatedAt: new Date() };
        const [act] = await tx.update(prestacionPrecios).set(valores).where(donde).returning({ id: prestacionPrecios.id });
        if (!act) await tx.insert(prestacionPrecios).values({ empresaId, prestacionId: p.prestacionId, obraSocialId: obraId, ...valores });
      }
    });
    return { guardados: d.precios.length };
  });

  /** Aumento por porcentaje de toda una lista (con redondeo), como con la inflación */
  app.post("/precios/aumento", { preHandler: soloConfig }, async (req) => {
    const d = parse(
      z.object({
        lista: listaSchema.shape.lista,
        porcentaje: z.coerce.number().min(-90, "Hasta −90 %").max(500, "Hasta 500 %"),
        redondeo: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)]).default(1),
      }),
      req.body,
    );
    const obraId = await obraDeLista(req.user.empresaId, d.lista);
    const filas = await app.db.select().from(prestacionPrecios).where(filtroLista(req.user.empresaId, obraId));
    const ajustar = (v: number) => (v === 0 ? 0 : Math.max(0, Math.round((v * (1 + d.porcentaje / 100)) / d.redondeo) * d.redondeo));
    await app.db.transaction(async (tx) => {
      for (const f of filas) {
        await tx.update(prestacionPrecios).set({ precioPaciente: ajustar(f.precioPaciente), precioObraSocial: ajustar(f.precioObraSocial), updatedAt: new Date() }).where(eq(prestacionPrecios.id, f.id));
      }
    });
    return { actualizados: filas.length };
  });
};
