import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { movimientosStock, productos } from "../db/schema.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { badRequest, conflict, edicionConcurrente, esReferenciado, notFound, parse } from "../lib/errors.js";
import { alertasStock } from "../lib/notificaciones.js";
import { versionSchema } from "../lib/validation.js";
import { MAX_CANTIDAD, MAX_IMPORTE } from "../lib/validation.js";

/** Alícuotas de IVA que acepta ARCA */
export const ALICUOTAS_IVA = [0, 2.5, 5, 10.5, 21, 27] as const;

const numero = (msg: string) => z.coerce.number({ invalid_type_error: msg }).max(MAX_CANTIDAD, "Es demasiado grande");

export const productoSchema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio").max(40),
  descripcion: z.string().trim().min(2, "La descripción es obligatoria").max(200),
  categoria: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  unidad: z.string().trim().min(1).max(15).default("u."),
  precio: z.coerce.number({ invalid_type_error: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(MAX_IMPORTE, "El precio es demasiado grande"),
  alicuotaIva: numero("Alícuota inválida").refine((v) => (ALICUOTAS_IVA as readonly number[]).includes(v), "Alícuota de IVA inválida"),
  controlaStock: z.boolean().default(true),
  stockMinimo: numero("Stock mínimo inválido").min(0, "No puede ser negativo").default(0),
  activo: z.boolean().optional(),
});

const altaSchema = productoSchema.extend({
  stockInicial: numero("Stock inicial inválido").min(0, "No puede ser negativo").default(0),
});

const movimientoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("ingreso"),
    cantidad: numero("Cantidad inválida").positive("La cantidad tiene que ser mayor a cero"),
    motivo: z.string().trim().min(2, "Indicá el motivo").max(200),
  }),
  z.object({
    tipo: z.literal("egreso"),
    cantidad: numero("Cantidad inválida").positive("La cantidad tiene que ser mayor a cero"),
    motivo: z.string().trim().min(2, "Indicá el motivo").max(200),
  }),
  z.object({
    tipo: z.literal("ajuste"),
    /** Stock contado físicamente: el sistema registra la diferencia */
    stockContado: numero("Cantidad inválida").min(0, "No puede ser negativo"),
    motivo: z.string().trim().min(2, "Indicá el motivo").max(200),
  }),
]);

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const listaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoria: z.string().trim().max(60).optional(),
});

const esDuplicado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};
const errorCodigo = () => conflict("Ya existe un producto con ese código", { codigo: "Ya existe" });

/** Redondeo a 3 decimales para evitar arrastres de coma flotante */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const soloEdicion = requirePermiso("productos.editar");
const soloStock = requirePermiso("stock.movimientos");

export const productosRoutes: FastifyPluginAsync = async (app) => {
  // Todos los roles consultan (ventas necesita precios); solo admin y operaciones modifican
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    const { q, categoria } = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(productos.empresaId, req.user.empresaId)];
    if (categoria) filtros.push(eq(productos.categoria, categoria));
    if (q) filtros.push(or(ilike(productos.codigo, `%${q}%`), ilike(productos.descripcion, `%${q}%`))!);
    return app.db.select().from(productos).where(and(...filtros)).orderBy(asc(productos.descripcion));
  });

  app.get("/categorias", async (req) => {
    const rows = await app.db
      .selectDistinct({ categoria: productos.categoria })
      .from(productos)
      .where(and(eq(productos.empresaId, req.user.empresaId), isNotNull(productos.categoria)))
      .orderBy(asc(productos.categoria));
    return rows.map((r) => r.categoria);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [p] = await app.db.select().from(productos).where(and(eq(productos.id, id), eq(productos.empresaId, req.user.empresaId)));
    if (!p) throw notFound("Producto no encontrado");
    return p;
  });

  app.post("/", { preHandler: soloEdicion }, async (req, reply) => {
    const { stockInicial, ...datos } = parse(altaSchema, req.body);
    const inicial = datos.controlaStock ? r3(stockInicial) : 0;
    try {
      const p = await app.db.transaction(async (tx) => {
        const [p] = await tx
          .insert(productos)
          .values({ ...datos, empresaId: req.user.empresaId, stock: inicial })
          .returning();
        if (inicial > 0) {
          await tx.insert(movimientosStock).values({
            empresaId: req.user.empresaId,
            productoId: p.id,
            tipo: "ingreso",
            cantidad: inicial,
            stockResultante: inicial,
            motivo: "Stock inicial",
            usuarioId: req.user.sub,
          });
        }
        return p;
      });
      return reply.status(201).send(p);
    } catch (e) {
      if (esDuplicado(e)) throw errorCodigo();
      throw e;
    }
  });

  /**
   * Aumento (o baja) de precios en masa, por porcentaje: todos los productos o los de una categoría.
   * Con `simular` solo muestra cuántos cambian y algunos ejemplos.
   */
  app.post("/actualizar-precios", { preHandler: soloEdicion }, async (req) => {
    const d = parse(
      z.object({
        porcentaje: z.coerce.number({ invalid_type_error: "Porcentaje inválido" }).min(-90, "Como mucho se puede bajar un 90 %").max(1000, "Como mucho se puede subir un 1000 %").refine((v) => v !== 0, "Indicá un porcentaje distinto de cero"),
        categoria: z.string().trim().max(60).optional().nullable().transform((v) => (v ? v : null)),
        /** Redondear el precio nuevo: 0 = centavos, 1 = pesos, 10, 100 */
        redondeo: z.coerce.number().refine((v) => [0, 1, 10, 100].includes(v), "Redondeo inválido").default(0),
        soloActivos: z.boolean().default(true),
        /** Solo estos productos (los tildados en la lista) */
        ids: z.array(z.string().uuid("Producto inválido")).max(10_000).optional(),
        simular: z.boolean().default(false),
      }),
      req.body,
    );
    const filtros = [eq(productos.empresaId, req.user.empresaId)];
    if (d.ids) filtros.push(inArray(productos.id, d.ids.length ? d.ids : ["00000000-0000-0000-0000-000000000000"]));
    if (d.categoria) filtros.push(eq(productos.categoria, d.categoria));
    if (d.soloActivos && !d.ids) filtros.push(eq(productos.activo, true));
    const lista = await app.db.select().from(productos).where(and(...filtros)).orderBy(asc(productos.descripcion));
    const nuevo = (precio: number) => {
      const bruto = precio * (1 + d.porcentaje / 100);
      const n = d.redondeo ? Math.round(bruto / d.redondeo) * d.redondeo : Math.round(bruto * 100) / 100;
      return Math.min(MAX_IMPORTE, Math.max(0, n));
    };
    const cambios = lista.map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, antes: p.precio, despues: nuevo(p.precio) })).filter((c) => c.despues !== c.antes);
    const resumen = { productos: lista.length, cambian: cambios.length, ejemplos: cambios.slice(0, 5), aplicado: false };
    if (d.simular || !cambios.length) return resumen;
    await app.db.transaction(async (tx) => {
      for (const c of cambios) {
        await tx.update(productos).set({ precio: c.despues, version: sql`${productos.version} + 1`, updatedAt: new Date() }).where(and(eq(productos.id, c.id), eq(productos.empresaId, req.user.empresaId)));
      }
    });
    return { ...resumen, aplicado: true };
  });

  /** Cambiar lo mismo a muchos productos a la vez (categoría, IVA, stock mínimo, activo) */
  app.post("/masivo", { preHandler: soloEdicion }, async (req) => {
    const d = parse(
      z.object({
        ids: z.array(z.string().uuid("Producto inválido")).min(1, "Elegí al menos un producto").max(10_000),
        cambios: z
          .object({
            categoria: z.string().trim().max(60).nullable().optional(),
            alicuotaIva: z.coerce.number().refine((v) => (ALICUOTAS_IVA as readonly number[]).includes(v), "Alícuota de IVA inválida").optional(),
            stockMinimo: z.coerce.number({ invalid_type_error: "Stock mínimo inválido" }).min(0, "No puede ser negativo").max(MAX_CANTIDAD).optional(),
            activo: z.boolean().optional(),
          })
          .refine((c) => Object.values(c).some((v) => v !== undefined), "Elegí qué cambiar"),
      }),
      req.body,
    );
    const cambios = { ...d.cambios, ...(d.cambios.categoria !== undefined ? { categoria: d.cambios.categoria || null } : {}) };
    const r = await app.db
      .update(productos)
      .set({ ...cambios, version: sql`${productos.version} + 1`, updatedAt: new Date() })
      .where(and(eq(productos.empresaId, req.user.empresaId), inArray(productos.id, d.ids)))
      .returning({ id: productos.id });
    return { actualizados: r.length };
  });

  app.put("/:id", { preHandler: soloEdicion }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const datos = parse(productoSchema, req.body);
    const { version } = parse(versionSchema, req.body);
    try {
      const [actual] = await app.db.select().from(productos).where(and(eq(productos.id, id), eq(productos.empresaId, req.user.empresaId)));
      if (!actual) throw notFound("Producto no encontrado");
      if (version && version !== actual.version) throw edicionConcurrente("este producto");
      if (actual.controlaStock && !datos.controlaStock && actual.stock !== 0) {
        throw badRequest("Para dejar de controlar stock, primero llevá el stock a cero con un ajuste", { controlaStock: "Tiene stock" });
      }
      // El stock no se edita acá: solo con movimientos (que no cambian la versión)
      const filtros = [eq(productos.id, id), eq(productos.empresaId, req.user.empresaId)];
      if (version) filtros.push(eq(productos.version, version));
      const [p] = await app.db
        .update(productos)
        .set({ ...datos, version: sql`${productos.version} + 1`, updatedAt: new Date() })
        .where(and(...filtros))
        .returning();
      if (!p) throw edicionConcurrente("este producto");
      await alertasStock(app.db, actual, p);
      return p;
    } catch (e) {
      if (esDuplicado(e)) throw errorCodigo();
      throw e;
    }
  });

  app.delete("/:id", { preHandler: soloEdicion }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [p] = await app.db.select({ id: productos.id }).from(productos).where(and(eq(productos.id, id), eq(productos.empresaId, req.user.empresaId)));
    if (!p) throw notFound("Producto no encontrado");
    const [{ n }] = await app.db.select({ n: sql<number>`count(*)::int` }).from(movimientosStock).where(eq(movimientosStock.productoId, id));
    if (n > 0) throw conflict("El producto tiene movimientos de stock. Desactivalo en lugar de eliminarlo.");
    try {
      await app.db.delete(productos).where(eq(productos.id, id));
    } catch (e) {
      if (esReferenciado(e)) throw conflict("El producto figura en remitos o comprobantes. Desactivalo en lugar de eliminarlo.");
      throw e;
    }
    return reply.status(204).send();
  });

  app.get("/:id/movimientos", async (req) => {
    const { id } = parse(idSchema, req.params);
    return app.db
      .select()
      .from(movimientosStock)
      .where(and(eq(movimientosStock.productoId, id), eq(movimientosStock.empresaId, req.user.empresaId)))
      .orderBy(desc(movimientosStock.secuencia))
      .limit(200);
  });

  app.post("/:id/movimientos", { preHandler: soloStock }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const mov = parse(movimientoSchema, req.body);

    const resultado = await app.db.transaction(async (tx) => {
      // Bloquea la fila para que dos movimientos simultáneos no pisen el stock
      const [p] = await tx
        .select()
        .from(productos)
        .where(and(eq(productos.id, id), eq(productos.empresaId, req.user.empresaId)))
        .for("update");
      if (!p) throw notFound("Producto no encontrado");
      if (!p.controlaStock) throw badRequest("Este producto no controla stock (es un servicio)");

      let delta: number;
      if (mov.tipo === "ingreso") delta = mov.cantidad;
      else if (mov.tipo === "egreso") delta = -mov.cantidad;
      else delta = mov.stockContado - p.stock;
      delta = r3(delta);

      if (mov.tipo === "ajuste" && delta === 0) throw badRequest("El stock contado es igual al actual: no hay nada que ajustar");
      const nuevo = r3(p.stock + delta);
      if (nuevo < 0) {
        throw conflict(`Stock insuficiente: hay ${p.stock.toLocaleString("es-AR")} ${p.unidad}`, { cantidad: "Supera el stock disponible" });
      }

      const [m] = await tx
        .insert(movimientosStock)
        .values({ empresaId: req.user.empresaId, productoId: p.id, tipo: mov.tipo, cantidad: delta, stockResultante: nuevo, motivo: mov.motivo, usuarioId: req.user.sub })
        .returning();
      const [actualizado] = await tx.update(productos).set({ stock: nuevo, updatedAt: new Date() }).where(eq(productos.id, p.id)).returning();
      return { movimiento: m, producto: actualizado, antes: p };
    });

    // Después de confirmar el movimiento: avisar si cruzó el mínimo o se quedó sin stock
    await alertasStock(app.db, resultado.antes, resultado.producto);
    return reply.status(201).send({ movimiento: resultado.movimiento, producto: resultado.producto });
  });
};
