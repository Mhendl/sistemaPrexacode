import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientes, movimientosStock, productos, remitoItems, remitos } from "../db/schema.js";
import { permisoPorMetodo } from "../lib/auth.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { alertasStock } from "../lib/notificaciones.js";
import { formatNumero, siguienteNumero } from "../lib/numeracion.js";
import { fechaValida } from "../lib/validation.js";

const hoy = () => new Date().toISOString().slice(0, 10);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const remitoSchema = z.object({
  clienteId: z.string({ required_error: "Elegí un cliente" }).uuid("Elegí un cliente"),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe")
    .optional()
    .transform((v) => v ?? hoy()),
  domicilioEntrega: textoOpcional(200),
  observaciones: textoOpcional(1000),
  items: z
    .array(
      z.object({
        productoId: z.string().uuid("Producto inválido"),
        cantidad: z.coerce.number({ invalid_type_error: "Cantidad inválida" }).positive("La cantidad tiene que ser mayor a cero").max(10_000_000, "La cantidad es demasiado grande"),
      }),
    )
    .min(1, "Agregá al menos un producto")
    .max(200, "Hasta 200 ítems por remito"),
});

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const listaSchema = z.object({
  clienteId: z.string().uuid().optional(),
  estado: z.enum(["Emitido", "Anulado"]).optional(),
});
const anularSchema = z.object({ motivo: z.string().trim().min(3, "Indicá el motivo de la anulación").max(300) });

export const remitosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", permisoPorMetodo("remitos.ver", "remitos.emitir", { "/:id/anular": "remitos.anular" }));

  app.get("/", async (req) => {
    const { clienteId, estado } = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(remitos.empresaId, req.user.empresaId)];
    if (clienteId) filtros.push(eq(remitos.clienteId, clienteId));
    if (estado) filtros.push(eq(remitos.estado, estado));
    return app.db
      .select({
        id: remitos.id,
        puntoVenta: remitos.puntoVenta,
        numero: remitos.numero,
        fecha: remitos.fecha,
        estado: remitos.estado,
        clienteId: remitos.clienteId,
        clienteRazonSocial: clientes.razonSocial,
        items: count(remitoItems.id),
        createdAt: remitos.createdAt,
      })
      .from(remitos)
      .innerJoin(clientes, eq(clientes.id, remitos.clienteId))
      .leftJoin(remitoItems, eq(remitoItems.remitoId, remitos.id))
      .where(and(...filtros))
      .groupBy(remitos.id, clientes.razonSocial)
      .orderBy(desc(remitos.numero))
      .limit(500);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [r] = await app.db.select().from(remitos).where(and(eq(remitos.id, id), eq(remitos.empresaId, req.user.empresaId)));
    if (!r) throw notFound("Remito no encontrado");
    const [cliente] = await app.db.select().from(clientes).where(eq(clientes.id, r.clienteId));
    const items = await app.db.select().from(remitoItems).where(eq(remitoItems.remitoId, r.id)).orderBy(asc(remitoItems.orden));
    return { ...r, cliente, items };
  });

  app.post("/", async (req, reply) => {
    const datos = parse(remitoSchema, req.body);
    const empresaId = req.user.empresaId;

    const ids = datos.items.map((i) => i.productoId);
    const repetido = ids.findIndex((id, i) => ids.indexOf(id) !== i);
    if (repetido >= 0) throw badRequest("Hay un producto repetido: sumá las cantidades en un solo renglón", { [`items.${repetido}.productoId`]: "Repetido" });

    const [cliente] = await app.db.select().from(clientes).where(and(eq(clientes.id, datos.clienteId), eq(clientes.empresaId, empresaId)));
    if (!cliente) throw badRequest("El cliente no existe", { clienteId: "Elegí un cliente" });

    const resultado = await app.db.transaction(async (tx) => {
      // Bloquea los productos (en orden fijo para evitar bloqueos cruzados entre dos remitos)
      const prods = await tx
        .select()
        .from(productos)
        .where(and(eq(productos.empresaId, empresaId), inArray(productos.id, [...ids].sort())))
        .orderBy(asc(productos.id))
        .for("update");
      const porId = new Map(prods.map((p) => [p.id, p]));

      const detalles: Record<string, string> = {};
      datos.items.forEach((it, i) => {
        const p = porId.get(it.productoId);
        if (!p) detalles[`items.${i}.productoId`] = "Producto inexistente";
        else if (!p.activo) detalles[`items.${i}.productoId`] = `${p.descripcion} está inactivo`;
        else if (p.controlaStock && r3(p.stock - it.cantidad) < 0) {
          detalles[`items.${i}.cantidad`] = `Stock insuficiente: hay ${p.stock.toLocaleString("es-AR")} ${p.unidad}`;
        }
      });
      if (Object.keys(detalles).length) {
        const faltaStock = Object.keys(detalles).some((k) => k.endsWith(".cantidad"));
        throw faltaStock ? conflict("No hay stock suficiente para algunos productos", detalles) : badRequest("Revisá los productos del remito", detalles);
      }

      const numero = await siguienteNumero(tx, empresaId, "remito");
      const [remito] = await tx
        .insert(remitos)
        .values({
          empresaId,
          numero,
          clienteId: cliente.id,
          fecha: datos.fecha,
          domicilioEntrega: datos.domicilioEntrega ?? ([cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") || null),
          observaciones: datos.observaciones,
          usuarioId: req.user.sub,
        })
        .returning();

      const cambios: { antes: typeof prods[number]; despues: typeof prods[number] }[] = [];
      for (const [orden, it] of datos.items.entries()) {
        const p = porId.get(it.productoId)!;
        await tx.insert(remitoItems).values({ remitoId: remito.id, productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, cantidad: r3(it.cantidad), orden });
        if (p.controlaStock) {
          const nuevo = r3(p.stock - it.cantidad);
          await tx.insert(movimientosStock).values({
            empresaId,
            productoId: p.id,
            tipo: "egreso",
            cantidad: -r3(it.cantidad),
            stockResultante: nuevo,
            motivo: `Remito ${formatNumero(remito.puntoVenta, numero)} · ${cliente.razonSocial}`,
            usuarioId: req.user.sub,
          });
          const [despues] = await tx.update(productos).set({ stock: nuevo, updatedAt: new Date() }).where(eq(productos.id, p.id)).returning();
          cambios.push({ antes: p, despues });
        }
      }
      return { remito, cambios };
    });

    for (const c of resultado.cambios) await alertasStock(app.db, c.antes, c.despues);
    return reply.status(201).send(resultado.remito);
  });

  /** Anular devuelve la mercadería al stock; el remito queda registrado como anulado */
  app.post("/:id/anular", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { motivo } = parse(anularSchema, req.body);
    const empresaId = req.user.empresaId;

    return app.db.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(remitos)
        .where(and(eq(remitos.id, id), eq(remitos.empresaId, empresaId)))
        .for("update");
      if (!r) throw notFound("Remito no encontrado");
      if (r.estado === "Anulado") throw conflict("El remito ya está anulado");

      const items = await tx.select().from(remitoItems).where(eq(remitoItems.remitoId, r.id));
      const prods = await tx
        .select()
        .from(productos)
        .where(inArray(productos.id, items.map((i) => i.productoId).sort()))
        .orderBy(asc(productos.id))
        .for("update");
      for (const it of items) {
        const p = prods.find((x) => x.id === it.productoId);
        if (!p?.controlaStock) continue;
        const nuevo = r3(p.stock + it.cantidad);
        await tx.insert(movimientosStock).values({
          empresaId,
          productoId: p.id,
          tipo: "ingreso",
          cantidad: it.cantidad,
          stockResultante: nuevo,
          motivo: `Anulación remito ${formatNumero(r.puntoVenta, r.numero)}`,
          usuarioId: req.user.sub,
        });
        await tx.update(productos).set({ stock: nuevo, updatedAt: new Date() }).where(eq(productos.id, p.id));
        p.stock = nuevo;
      }
      const [anulado] = await tx
        .update(remitos)
        .set({ estado: "Anulado", motivoAnulacion: motivo, anuladoEn: new Date() })
        .where(eq(remitos.id, r.id))
        .returning();
      return anulado;
    });
  });
};
