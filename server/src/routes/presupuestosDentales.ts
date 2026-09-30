import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { cargosPaciente, odontograma, pacientes, prestaciones, presupuestoDentalItems, presupuestosDentales, usuarios } from "../db/schema.js";
import { r2 } from "../lib/arca/montos.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { coberturaDe, precioDe, registrarRealizada } from "../lib/cuentasDental.js";
import { CARAS, PIEZAS } from "../lib/dental.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { siguienteNumero } from "../lib/numeracion.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { sumarDias } from "../lib/suscripcion.js";
import { fechaValida, MAX_IMPORTE } from "../lib/validation.js";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const idSchema = z.object({ id: z.string().uuid("Id inválido") });

const itemSchema = z.object({
  prestacionId: z.string({ required_error: "Elegí la prestación" }).uuid("Elegí la prestación"),
  pieza: z.number().int().refine((p) => PIEZAS.includes(p), "Pieza inválida").optional().nullable(),
  caras: z.array(z.enum(CARAS)).max(5).default([]),
  odontogramaId: z.string().uuid().optional().nullable(),
  /** Si no viene, el precio de la lista de su obra social */
  importePaciente: z.coerce.number().min(0, "No puede ser negativo").max(MAX_IMPORTE).optional(),
  descuento: z.coerce.number().min(0, "Descuento inválido").max(100, "Hasta 100 %").default(0),
});

const presupuestoSchema = z.object({
  pacienteId: z.string({ required_error: "Elegí el paciente" }).uuid("Elegí el paciente"),
  validoHasta: fechaIso.optional(),
  observaciones: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  items: z.array(itemSchema).min(1, "Agregá al menos una prestación").max(100, "Hasta 100 renglones"),
});

/** Presupuestos odontológicos (CoreDental) */
export const presupuestosDentalesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  const ver = requirePermiso("presupuestos.ver");
  const editar = requirePermiso("presupuestos.editar");

  const autorDe = async (req: FastifyRequest) => {
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return u?.nombre ?? "Usuario";
  };

  const detalle = async (empresaId: string, id: string) => {
    const [p] = await app.db
      .select({ p: presupuestosDentales, paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}`, dni: pacientes.dni })
      .from(presupuestosDentales)
      .innerJoin(pacientes, eq(pacientes.id, presupuestosDentales.pacienteId))
      .where(and(eq(presupuestosDentales.id, id), eq(presupuestosDentales.empresaId, empresaId)));
    if (!p) throw notFound("Presupuesto no encontrado");
    const items = await app.db
      .select({ item: presupuestoDentalItems, codigo: prestaciones.codigo, prestacion: prestaciones.nombre, alcance: prestaciones.alcance })
      .from(presupuestoDentalItems)
      .innerJoin(prestaciones, eq(prestaciones.id, presupuestoDentalItems.prestacionId))
      .where(eq(presupuestoDentalItems.presupuestoId, id))
      .orderBy(asc(presupuestoDentalItems.orden));
    const lista = items.map((i) => ({ ...i.item, codigo: i.codigo, prestacion: i.prestacion, alcance: i.alcance, realizado: !!i.item.cargoId }));
    return { ...p.p, paciente: p.paciente, dni: p.dni, items: lista, realizados: lista.filter((i) => i.realizado).length, vencido: p.p.estado === "Pendiente" && p.p.validoHasta < hoyAr() };
  };

  /** Arma los renglones con los precios (de la lista de su obra social, si no se indicó otro) */
  async function armarItems(empresaId: string, pacienteId: string, items: z.infer<typeof itemSchema>[]) {
    const ids = [...new Set(items.map((i) => i.prestacionId))];
    const prest = await app.db.select().from(prestaciones).where(and(eq(prestaciones.empresaId, empresaId), inArray(prestaciones.id, ids)));
    const cob = await coberturaDe(app.db, pacienteId);
    const marcas = items.some((i) => i.odontogramaId)
      ? await app.db.select().from(odontograma).where(and(eq(odontograma.pacienteId, pacienteId), inArray(odontograma.id, items.map((i) => i.odontogramaId).filter((x): x is string => !!x))))
      : [];
    const errores: Record<string, string> = {};
    const filas = [];
    for (const [orden, i] of items.entries()) {
      const p = prest.find((x) => x.id === i.prestacionId);
      if (!p || !p.activa) {
        errores[`items.${orden}.prestacionId`] = "Prestación inválida";
        continue;
      }
      if (p.alcance !== "general" && !i.pieza) errores[`items.${orden}.pieza`] = "Indicá la pieza";
      if (i.odontogramaId && !marcas.some((m) => m.id === i.odontogramaId && !m.anuladoEn)) errores[`items.${orden}.odontogramaId`] = "Marca inválida";
      const lista = await precioDe(app.db, empresaId, p.id, cob.obraSocialId);
      const bruto = i.importePaciente ?? lista.paciente;
      filas.push({
        prestacionId: p.id,
        pieza: p.alcance === "general" ? null : (i.pieza ?? null),
        caras: p.alcance === "cara" ? i.caras : [],
        odontogramaId: i.odontogramaId ?? null,
        descuento: i.descuento,
        importePaciente: r2(bruto * (1 - i.descuento / 100)),
        importeObraSocial: lista.obraSocial,
        orden,
      });
    }
    if (Object.keys(errores).length) throw badRequest("Revisá los renglones del presupuesto", errores);
    return { filas, cob };
  }

  app.get("/", { preHandler: ver }, async (req) => {
    const { pacienteId } = parse(z.object({ pacienteId: z.string().uuid().optional() }), req.query);
    const filtros = [eq(presupuestosDentales.empresaId, req.user.empresaId)];
    if (pacienteId) filtros.push(eq(presupuestosDentales.pacienteId, pacienteId));
    const filas = await app.db
      .select({ p: presupuestosDentales, paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}` })
      .from(presupuestosDentales)
      .innerJoin(pacientes, eq(pacientes.id, presupuestosDentales.pacienteId))
      .where(and(...filtros))
      .orderBy(desc(presupuestosDentales.numero))
      .limit(500);
    const hoy = hoyAr();
    return filas.map((f) => ({ ...f.p, paciente: f.paciente, vencido: f.p.estado === "Pendiente" && f.p.validoHasta < hoy }));
  });

  app.get("/:id", { preHandler: ver }, async (req) => detalle(req.user.empresaId, parse(idSchema, req.params).id));

  app.post("/", { preHandler: editar }, async (req, reply) => {
    const d = parse(presupuestoSchema, req.body);
    const empresaId = req.user.empresaId;
    const [pac] = await app.db.select({ id: pacientes.id }).from(pacientes).where(and(eq(pacientes.id, d.pacienteId), eq(pacientes.empresaId, empresaId)));
    if (!pac) throw badRequest("El paciente no existe", { pacienteId: "Inválido" });
    const { filas, cob } = await armarItems(empresaId, d.pacienteId, d.items);
    const hoy = hoyAr();
    const validoHasta = d.validoHasta ?? sumarDias(hoy, 30);
    if (validoHasta < hoy) throw badRequest("La validez no puede ser anterior a hoy", { validoHasta: "Anterior a hoy" });
    const profesional = await autorDe(req);
    const id = await app.db.transaction(async (tx) => {
      const numero = await siguienteNumero(tx, empresaId, "presupuesto-dental");
      const [p] = await tx
        .insert(presupuestosDentales)
        .values({ empresaId, pacienteId: d.pacienteId, numero, fecha: hoy, validoHasta, obraSocialId: cob.obraSocialId, obraSocial: cob.obraSocial, profesional, usuarioId: req.user.sub, observaciones: d.observaciones, total: r2(filas.reduce((a, f) => a + f.importePaciente, 0)) })
        .returning();
      await tx.insert(presupuestoDentalItems).values(filas.map((f) => ({ ...f, presupuestoId: p!.id })));
      return p!.id;
    });
    return reply.status(201).send(await detalle(empresaId, id));
  });

  /** Mientras está pendiente se puede corregir */
  app.put("/:id", { preHandler: editar }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(presupuestoSchema.omit({ pacienteId: true }), req.body);
    const actual = await detalle(req.user.empresaId, id);
    if (actual.estado !== "Pendiente") throw conflict("Solo se puede modificar un presupuesto pendiente");
    const { filas } = await armarItems(req.user.empresaId, actual.pacienteId, d.items);
    await app.db.transaction(async (tx) => {
      await tx.delete(presupuestoDentalItems).where(eq(presupuestoDentalItems.presupuestoId, id));
      await tx.insert(presupuestoDentalItems).values(filas.map((f) => ({ ...f, presupuestoId: id })));
      await tx
        .update(presupuestosDentales)
        .set({ validoHasta: d.validoHasta ?? actual.validoHasta, observaciones: d.observaciones, total: r2(filas.reduce((a, f) => a + f.importePaciente, 0)), version: sql`${presupuestosDentales.version} + 1` })
        .where(eq(presupuestosDentales.id, id));
    });
    return detalle(req.user.empresaId, id);
  });

  app.post("/:id/estado", { preHandler: editar }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { estado } = parse(z.object({ estado: z.enum(["Pendiente", "Aceptado", "Rechazado"], { errorMap: () => ({ message: "Estado inválido" }) }) }), req.body);
    const actual = await detalle(req.user.empresaId, id);
    if (actual.realizados > 0 && estado !== "Aceptado") throw conflict("Ya hay prestaciones realizadas de este presupuesto: queda aceptado.");
    const [r] = await app.db.update(presupuestosDentales).set({ estado, version: sql`${presupuestosDentales.version} + 1` }).where(eq(presupuestosDentales.id, id)).returning();
    return r;
  });

  /**
   * Se hizo un renglón: queda cargado en la cuenta del paciente con el precio acordado,
   * y si va en una pieza, en el odontograma como realizado.
   */
  app.post("/:id/items/:itemId/realizar", { preHandler: requirePermiso("historia.editar") }, async (req) => {
    const { id, itemId } = parse(z.object({ id: z.string().uuid(), itemId: z.string().uuid() }), req.params);
    const { fecha } = parse(z.object({ fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura") }), req.body ?? {});
    const p = await detalle(req.user.empresaId, id);
    if (p.estado !== "Aceptado") throw conflict("Primero el paciente tiene que aceptar el presupuesto");
    const item = p.items.find((i) => i.id === itemId);
    if (!item) throw notFound("Renglón no encontrado");
    if (item.realizado) throw conflict("Ese renglón ya está realizado");
    const autor = await autorDe(req);
    const dia = fecha ?? hoyAr();
    await app.db.transaction(async (tx) => {
      let marcaId = item.odontogramaId;
      if (marcaId) {
        const [m] = await tx.select().from(odontograma).where(eq(odontograma.id, marcaId));
        // Ya se había marcado como realizada en el odontograma (antes de aceptar el presupuesto): el renglón queda unido a esa prestación
        if (m && !m.anuladoEn && m.estado === "realizado") {
          const [yaCargado] = await tx.select({ id: cargosPaciente.id }).from(cargosPaciente).where(and(eq(cargosPaciente.odontogramaId, m.id), isNull(cargosPaciente.anuladoEn)));
          if (yaCargado) {
            await tx.update(presupuestoDentalItems).set({ cargoId: yaCargado.id }).where(eq(presupuestoDentalItems.id, item.id));
            return;
          }
        }
        if (m && !m.anuladoEn && m.estado === "a_realizar") {
          await tx.update(odontograma).set({ estado: "realizado", realizadoEn: dia, realizadoPor: autor, version: sql`${odontograma.version} + 1` }).where(and(eq(odontograma.id, marcaId), isNull(odontograma.anuladoEn)));
        } else if (!m || m.anuladoEn) marcaId = null;
      } else if (item.alcance !== "general" && item.pieza) {
        const [m] = await tx
          .insert(odontograma)
          .values({ empresaId: req.user.empresaId, pacienteId: p.pacienteId, prestacionId: item.prestacionId, pieza: item.pieza, caras: item.caras, estado: "realizado", fecha: dia, usuarioId: req.user.sub, autor, realizadoEn: dia, realizadoPor: autor })
          .returning();
        marcaId = m!.id;
      }
      await registrarRealizada(tx, {
        empresaId: req.user.empresaId,
        pacienteId: p.pacienteId,
        prestacionId: item.prestacionId,
        pieza: item.pieza,
        caras: item.caras,
        fecha: dia,
        profesional: autor,
        usuarioId: req.user.sub,
        odontogramaId: marcaId,
        presupuestoItemId: item.id,
        importes: { paciente: item.importePaciente, obraSocial: item.importeObraSocial },
      });
    });
    return detalle(req.user.empresaId, id);
  });

  app.delete("/:id", { preHandler: editar }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const p = await detalle(req.user.empresaId, id);
    if (p.realizados > 0) throw conflict("Tiene prestaciones realizadas: no se puede eliminar.");
    await app.db.delete(presupuestosDentales).where(eq(presupuestosDentales.id, id));
    return reply.status(204).send();
  });
};
