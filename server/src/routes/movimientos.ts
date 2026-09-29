import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { movimientosStock, productos, usuarios } from "../db/schema.js";
import { requirePermiso } from "../lib/auth.js";
import { parse } from "../lib/errors.js";

const listaSchema = z.object({
  tipo: z.enum(["ingreso", "egreso", "ajuste"]).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

/** Últimos movimientos de stock de la empresa, con producto y usuario */
export const movimientosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("stock.movimientos"));

  app.get("/", async (req) => {
    const { tipo, limite } = parse(listaSchema, req.query);
    const filtros = [eq(movimientosStock.empresaId, req.user.empresaId)];
    if (tipo) filtros.push(eq(movimientosStock.tipo, tipo));
    return app.db
      .select({
        id: movimientosStock.id,
        tipo: movimientosStock.tipo,
        cantidad: movimientosStock.cantidad,
        stockResultante: movimientosStock.stockResultante,
        motivo: movimientosStock.motivo,
        createdAt: movimientosStock.createdAt,
        productoId: productos.id,
        productoCodigo: productos.codigo,
        productoDescripcion: productos.descripcion,
        unidad: productos.unidad,
        usuarioNombre: usuarios.nombre,
      })
      .from(movimientosStock)
      .innerJoin(productos, eq(productos.id, movimientosStock.productoId))
      .leftJoin(usuarios, eq(usuarios.id, movimientosStock.usuarioId))
      .where(and(...filtros))
      .orderBy(desc(movimientosStock.secuencia))
      .limit(limite);
  });
};
