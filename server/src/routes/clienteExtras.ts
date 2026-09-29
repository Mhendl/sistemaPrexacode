import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clienteNotas, clienteProductos, clientes, productos, usuarios } from "../db/schema.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors.js";

const idCliente = z.object({ id: z.string().uuid("Id inválido") });
const idSub = z.object({ id: z.string().uuid("Id inválido"), sub: z.string().uuid("Id inválido") });

const notaSchema = z.object({
  texto: z.string().trim().min(1, "Escribí la nota").max(4000, "Hasta 4000 caracteres"),
  fijada: z.boolean().default(false),
});

const FRECUENCIAS = ["por semana", "cada 15 días", "por mes", "por bimestre", "por trimestre", "por año"] as const;
const usoSchema = z.object({
  productoId: z.string({ required_error: "Elegí un producto" }).uuid("Elegí un producto"),
  cantidad: z.coerce.number({ invalid_type_error: "Cantidad inválida" }).positive("Tiene que ser mayor a cero").max(1_000_000).optional().nullable(),
  frecuencia: z.enum(FRECUENCIAS, { errorMap: () => ({ message: "Frecuencia inválida" }) }).optional().nullable(),
  nota: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

const soloVentas = requirePermiso("clientes.editar");

/** Bitácora de notas y productos habituales de cada cliente */
export const clienteExtrasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  const clienteDe = async (empresaId: string, id: string) => {
    const [c] = await app.db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId)));
    if (!c) throw notFound("Cliente no encontrado");
    return c;
  };

  // ------------------------------------------------------------------ notas

  const notasDe = (empresaId: string, clienteId: string) =>
    app.db
      .select({ nota: clienteNotas, autor: usuarios.nombre })
      .from(clienteNotas)
      .leftJoin(usuarios, eq(usuarios.id, clienteNotas.usuarioId))
      .where(and(eq(clienteNotas.empresaId, empresaId), eq(clienteNotas.clienteId, clienteId)))
      .orderBy(desc(clienteNotas.fijada), desc(clienteNotas.createdAt));

  const plana = (r: { nota: typeof clienteNotas.$inferSelect; autor: string | null }) => ({ ...r.nota, autor: r.autor });

  app.get("/:id/notas", async (req) => {
    const { id } = parse(idCliente, req.params);
    await clienteDe(req.user.empresaId, id);
    return (await notasDe(req.user.empresaId, id)).map(plana);
  });

  app.post("/:id/notas", { preHandler: soloVentas }, async (req, reply) => {
    const { id } = parse(idCliente, req.params);
    const d = parse(notaSchema, req.body);
    await clienteDe(req.user.empresaId, id);
    const [n] = await app.db.insert(clienteNotas).values({ ...d, empresaId: req.user.empresaId, clienteId: id, usuarioId: req.user.sub }).returning();
    const [autor] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return reply.status(201).send({ ...n, autor: autor?.nombre ?? null });
  });

  /** Solo quien la escribió (o un administrador) la puede cambiar o borrar */
  const notaEditable = async (req: { user: { empresaId: string; sub: string; esAdmin?: boolean } }, clienteId: string, notaId: string) => {
    const [n] = await app.db.select().from(clienteNotas).where(and(eq(clienteNotas.id, notaId), eq(clienteNotas.clienteId, clienteId), eq(clienteNotas.empresaId, req.user.empresaId)));
    if (!n) throw notFound("Nota no encontrada");
    if (n.usuarioId !== req.user.sub && !req.user.esAdmin) throw forbidden("Solo quien escribió la nota (o un administrador) puede cambiarla");
    return n;
  };

  app.put("/:id/notas/:sub", { preHandler: soloVentas }, async (req) => {
    const { id, sub } = parse(idSub, req.params);
    const d = parse(notaSchema, req.body);
    await notaEditable(req, id, sub);
    await app.db.update(clienteNotas).set({ ...d, updatedAt: new Date() }).where(eq(clienteNotas.id, sub));
    const [r] = (await notasDe(req.user.empresaId, id)).filter((x) => x.nota.id === sub);
    return plana(r!);
  });

  app.delete("/:id/notas/:sub", { preHandler: soloVentas }, async (req, reply) => {
    const { id, sub } = parse(idSub, req.params);
    await notaEditable(req, id, sub);
    await app.db.delete(clienteNotas).where(eq(clienteNotas.id, sub));
    return reply.status(204).send();
  });

  // ------------------------------------------------------- productos que usa

  const usosDe = (empresaId: string, clienteId: string) =>
    app.db
      .select({
        uso: clienteProductos,
        producto: { id: productos.id, codigo: productos.codigo, descripcion: productos.descripcion, unidad: productos.unidad, precio: productos.precio, alicuotaIva: productos.alicuotaIva, controlaStock: productos.controlaStock, stock: productos.stock, stockMinimo: productos.stockMinimo, activo: productos.activo },
      })
      .from(clienteProductos)
      .innerJoin(productos, eq(productos.id, clienteProductos.productoId))
      .where(and(eq(clienteProductos.empresaId, empresaId), eq(clienteProductos.clienteId, clienteId)))
      .orderBy(asc(productos.descripcion));

  const plano = (r: Awaited<ReturnType<typeof usosDe>>[number]) => ({ ...r.uso, producto: r.producto });

  app.get("/:id/productos", async (req) => {
    const { id } = parse(idCliente, req.params);
    await clienteDe(req.user.empresaId, id);
    return (await usosDe(req.user.empresaId, id)).map(plano);
  });

  app.post("/:id/productos", { preHandler: soloVentas }, async (req, reply) => {
    const { id } = parse(idCliente, req.params);
    const d = parse(usoSchema, req.body);
    await clienteDe(req.user.empresaId, id);
    const [p] = await app.db.select({ id: productos.id, descripcion: productos.descripcion }).from(productos).where(and(eq(productos.id, d.productoId), eq(productos.empresaId, req.user.empresaId)));
    if (!p) throw badRequest("El producto no existe", { productoId: "Elegí un producto" });
    const [u] = await app.db.insert(clienteProductos).values({ ...d, empresaId: req.user.empresaId, clienteId: id }).onConflictDoNothing().returning();
    if (!u) throw conflict(`${p.descripcion} ya está en la lista de este cliente`, { productoId: "Ya está en la lista" });
    const [r] = (await usosDe(req.user.empresaId, id)).filter((x) => x.uso.id === u.id);
    return reply.status(201).send(plano(r!));
  });

  app.put("/:id/productos/:sub", { preHandler: soloVentas }, async (req) => {
    const { id, sub } = parse(idSub, req.params);
    const d = parse(usoSchema.omit({ productoId: true }), req.body ?? {});
    const [u] = await app.db
      .update(clienteProductos)
      .set(d)
      .where(and(eq(clienteProductos.id, sub), eq(clienteProductos.clienteId, id), eq(clienteProductos.empresaId, req.user.empresaId)))
      .returning();
    if (!u) throw notFound("No encontrado");
    const [r] = (await usosDe(req.user.empresaId, id)).filter((x) => x.uso.id === sub);
    return plano(r!);
  });

  app.delete("/:id/productos/:sub", { preHandler: soloVentas }, async (req, reply) => {
    const { id, sub } = parse(idSub, req.params);
    const [u] = await app.db.delete(clienteProductos).where(and(eq(clienteProductos.id, sub), eq(clienteProductos.clienteId, id), eq(clienteProductos.empresaId, req.user.empresaId))).returning({ id: clienteProductos.id });
    if (!u) throw notFound("No encontrado");
    return reply.status(204).send();
  });
};
