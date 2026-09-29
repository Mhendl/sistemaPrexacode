import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.js";
import { z } from "zod";
import { clientes, comprobantes, empresas, oportunidades, presupuestoItems, presupuestos } from "../db/schema.js";
import { letraSegun } from "../lib/arca/codigos.js";
import { calcularTotales } from "../lib/arca/montos.js";
import { permisoPorMetodo } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { badRequest, conflict, edicionConcurrente, notFound, parse } from "../lib/errors.js";
import { armarRenglones, itemSchema } from "../lib/items.js";
import { siguienteNumero } from "../lib/numeracion.js";
import { fechaValida } from "../lib/validation.js";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const presupuestoSchema = z.object({
  clienteId: z.string({ required_error: "Elegí un cliente" }).uuid("Elegí un cliente"),
  fecha: fechaIso.optional(),
  validoHasta: fechaIso.optional(),
  condiciones: texto(2000),
  observaciones: texto(2000),
  items: z.array(itemSchema).min(1, "Agregá al menos un ítem").max(200, "Hasta 200 ítems por presupuesto"),
  version: z.number().int().positive().max(2_000_000_000).optional(),
  /** Si el presupuesto sale de una oportunidad del embudo */
  oportunidadId: z.string().uuid().optional().nullable(),
});

const sumarDias = (f: string, d: number) => {
  const x = new Date(`${f}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

type Presupuesto = typeof presupuestos.$inferSelect;

/** "Vencido" no se guarda: se calcula por la fecha de validez */
export const estadoVisible = (p: Pick<Presupuesto, "estado" | "validoHasta">) =>
  p.estado === "Pendiente" && p.validoHasta < hoyAr() ? "Vencido" : p.estado;

/** Presupuesto con cliente, ítems y factura vinculada (pantalla interna y enlace público) */
export async function detallePresupuesto(db: Db, empresaId: string, id: string) {
  const [p] = await db.select().from(presupuestos).where(and(eq(presupuestos.id, id), eq(presupuestos.empresaId, empresaId)));
  if (!p) return null;
  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, p.clienteId));
  const items = await db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, p.id)).orderBy(asc(presupuestoItems.orden));
  const factura = p.comprobanteId ? (await db.select({ id: comprobantes.id, tipoCbte: comprobantes.tipoCbte, puntoVenta: comprobantes.puntoVenta, numero: comprobantes.numero }).from(comprobantes).where(eq(comprobantes.id, p.comprobanteId)))[0] : null;
  return { ...p, estado: estadoVisible(p), cliente: cliente!, items, factura: factura ?? null };
}

export const presupuestosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", permisoPorMetodo("presupuestos.ver", "presupuestos.editar"));

  /** Calcula ítems y totales (la letra define si el IVA se discrimina, igual que en la factura) */
  async function armar(empresaId: string, d: z.infer<typeof presupuestoSchema>) {
    const [cliente] = await app.db.select().from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.empresaId, empresaId)));
    if (!cliente) throw badRequest("El cliente no existe", { clienteId: "Elegí un cliente" });
    const [empresa] = await app.db.select({ condicionIva: empresas.condicionIva }).from(empresas).where(eq(empresas.id, empresaId));
    const renglones = await armarRenglones(app.db, empresaId, d.items, { rechazarInactivos: true });
    const letra = letraSegun(empresa!.condicionIva, cliente.condicionIva);
    const totales = calcularTotales(renglones, letra);
    const fecha = d.fecha ?? hoyAr();
    const validoHasta = d.validoHasta ?? sumarDias(fecha, 15);
    if (validoHasta < fecha) throw badRequest("La validez no puede ser anterior a la fecha", { validoHasta: "Anterior a la fecha" });
    return { cliente, renglones, letra, totales, fecha, validoHasta };
  }

  app.get("/", async (req) => {
    const { clienteId } = parse(z.object({ clienteId: z.string().uuid().optional() }), req.query);
    const cond = [eq(presupuestos.empresaId, req.user.empresaId)];
    if (clienteId) cond.push(eq(presupuestos.clienteId, clienteId));
    const filas = await app.db
      .select({ p: presupuestos, clienteRazonSocial: clientes.razonSocial })
      .from(presupuestos)
      .innerJoin(clientes, eq(clientes.id, presupuestos.clienteId))
      .where(and(...cond))
      .orderBy(desc(presupuestos.numero))
      .limit(1000);
    return filas.map((f) => ({ ...f.p, estado: estadoVisible(f.p), clienteRazonSocial: f.clienteRazonSocial }));
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = await detallePresupuesto(app.db, req.user.empresaId, id);
    if (!d) throw notFound("Presupuesto no encontrado");
    return d;
  });

  app.post("/", async (req, reply) => {
    const d = parse(presupuestoSchema, req.body);
    const empresaId = req.user.empresaId;
    const a = await armar(empresaId, d);
    let oportunidad: typeof oportunidades.$inferSelect | undefined;
    if (d.oportunidadId) {
      [oportunidad] = await app.db.select().from(oportunidades).where(and(eq(oportunidades.id, d.oportunidadId), eq(oportunidades.empresaId, empresaId)));
      if (!oportunidad) throw badRequest("La oportunidad no existe", { oportunidadId: "Inválida" });
      if (oportunidad.clienteId && oportunidad.clienteId !== a.cliente.id) throw badRequest("La oportunidad es de otro cliente", { clienteId: "No coincide con la oportunidad" });
    }
    const p = await app.db.transaction(async (tx) => {
      const numero = await siguienteNumero(tx, empresaId, "presupuesto");
      const [p] = await tx
        .insert(presupuestos)
        .values({ empresaId, numero, fecha: a.fecha, validoHasta: a.validoHasta, clienteId: a.cliente.id, letra: a.letra, neto: a.totales.neto, exento: a.totales.exento, totalIva: a.totales.totalIva, iva: a.totales.iva, total: a.totales.total, condiciones: d.condiciones, observaciones: d.observaciones, usuarioId: req.user.sub })
        .returning();
      await tx.insert(presupuestoItems).values(a.renglones.map(({ esProducto: _e, ...r }, orden) => ({ ...r, presupuestoId: p!.id, subtotal: a.totales.subtotales[orden]!, orden })));
      if (oportunidad) {
        // La oportunidad avanza a Propuesta; si era un prospecto, queda con el cliente del presupuesto
        const temprana = ["Nuevo", "Contactado"].includes(oportunidad.etapa);
        await tx
          .update(oportunidades)
          .set({
            presupuestoId: p!.id,
            clienteId: a.cliente.id,
            prospecto: null,
            ...(temprana ? { etapa: "Propuesta" } : {}),
            ...(oportunidad.monto === 0 ? { monto: a.totales.total } : {}),
            version: sql`${oportunidades.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(oportunidades.id, oportunidad.id));
      }
      return p!;
    });
    return reply.status(201).send({ ...p, estado: estadoVisible(p) });
  });

  app.put("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(presupuestoSchema, req.body);
    const empresaId = req.user.empresaId;
    const a = await armar(empresaId, d);
    return app.db.transaction(async (tx) => {
      const [actual] = await tx.select().from(presupuestos).where(and(eq(presupuestos.id, id), eq(presupuestos.empresaId, empresaId))).for("update");
      if (!actual) throw notFound("Presupuesto no encontrado");
      if (d.version && d.version !== actual.version) throw edicionConcurrente("este presupuesto");
      if (actual.estado === "Facturado") throw conflict("El presupuesto ya se facturó: no se puede modificar. Duplicalo para hacer uno nuevo.");
      const [p] = await tx
        .update(presupuestos)
        .set({ fecha: a.fecha, validoHasta: a.validoHasta, clienteId: a.cliente.id, letra: a.letra, neto: a.totales.neto, exento: a.totales.exento, totalIva: a.totales.totalIva, iva: a.totales.iva, total: a.totales.total, condiciones: d.condiciones, observaciones: d.observaciones, estado: "Pendiente", version: sql`${presupuestos.version} + 1`, updatedAt: new Date() })
        .where(eq(presupuestos.id, id))
        .returning();
      await tx.delete(presupuestoItems).where(eq(presupuestoItems.presupuestoId, id));
      await tx.insert(presupuestoItems).values(a.renglones.map(({ esProducto: _e, ...r }, orden) => ({ ...r, presupuestoId: id, subtotal: a.totales.subtotales[orden]!, orden })));
      return { ...p!, estado: estadoVisible(p!) };
    });
  });

  /** Aceptado / Rechazado / Pendiente (lo marca el usuario según responda el cliente) */
  app.post("/:id/estado", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { estado } = parse(z.object({ estado: z.enum(["Pendiente", "Aceptado", "Rechazado"], { errorMap: () => ({ message: "Estado inválido" }) }) }), req.body);
    const [actual] = await app.db.select().from(presupuestos).where(and(eq(presupuestos.id, id), eq(presupuestos.empresaId, req.user.empresaId)));
    if (!actual) throw notFound("Presupuesto no encontrado");
    if (actual.estado === "Facturado") throw conflict("El presupuesto ya se facturó");
    const [p] = await app.db.update(presupuestos).set({ estado, updatedAt: new Date(), version: sql`${presupuestos.version} + 1` }).where(eq(presupuestos.id, id)).returning();
    return { ...p!, estado: estadoVisible(p!) };
  });

  /** Copia como presupuesto nuevo con fecha de hoy (útil para cotizar lo mismo a otro cliente o renovar uno vencido) */
  app.post("/:id/duplicar", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const empresaId = req.user.empresaId;
    const [orig] = await app.db.select().from(presupuestos).where(and(eq(presupuestos.id, id), eq(presupuestos.empresaId, empresaId)));
    if (!orig) throw notFound("Presupuesto no encontrado");
    const items = await app.db.select().from(presupuestoItems).where(eq(presupuestoItems.presupuestoId, id)).orderBy(asc(presupuestoItems.orden));
    const hoy = hoyAr();
    const dias = Math.max(1, Math.round((Date.parse(orig.validoHasta) - Date.parse(orig.fecha)) / 86_400_000));
    const p = await app.db.transaction(async (tx) => {
      const numero = await siguienteNumero(tx, empresaId, "presupuesto");
      const { id: _i, numero: _n, createdAt: _c, updatedAt: _u, comprobanteId: _f, version: _v, ...resto } = orig;
      const [p] = await tx.insert(presupuestos).values({ ...resto, numero, fecha: hoy, validoHasta: sumarDias(hoy, dias), estado: "Pendiente", usuarioId: req.user.sub }).returning();
      await tx.insert(presupuestoItems).values(items.map(({ id: _x, presupuestoId: _p, ...it }) => ({ ...it, presupuestoId: p!.id })));
      return p!;
    });
    return reply.status(201).send({ ...p, estado: estadoVisible(p) });
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const [p] = await app.db.select().from(presupuestos).where(and(eq(presupuestos.id, id), eq(presupuestos.empresaId, req.user.empresaId)));
    if (!p) throw notFound("Presupuesto no encontrado");
    if (p.estado === "Facturado") throw conflict("Un presupuesto facturado no se puede eliminar");
    await app.db.delete(presupuestos).where(eq(presupuestos.id, id));
    return reply.status(204).send();
  });
};
