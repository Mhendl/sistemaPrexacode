/**
 * CoreDental: precios por obra social, prestaciones realizadas (cuenta del paciente) y caja diaria.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { cajas, cargosPaciente, gastos, ingresosCaja, obrasSociales, pacientes, pagosPaciente, prestacionPrecios, prestaciones, presupuestoDentalItems, presupuestosDentales } from "../db/schema.js";
import { r2 } from "./arca/montos.js";
import { conflict } from "./errors.js";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MEDIOS_DENTAL = ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Otro"] as const;
export const CATEGORIAS_GASTO = ["Proveedores e insumos", "Laboratorio", "Alquiler y expensas", "Servicios", "Sueldos y honorarios", "Impuestos", "Mantenimiento", "Otros"] as const;

/**
 * Precio de una prestación para un paciente: el de su obra social; si su obra social no tiene precio cargado
 * para esa prestación (o es particular), el precio particular. Si no hay nada cargado, 0.
 */
export async function precioDe(db: Tx, empresaId: string, prestacionId: string, obraSocialId: string | null) {
  const filas = await db
    .select()
    .from(prestacionPrecios)
    .where(and(eq(prestacionPrecios.empresaId, empresaId), eq(prestacionPrecios.prestacionId, prestacionId)));
  const deObra = obraSocialId ? filas.find((f) => f.obraSocialId === obraSocialId) : undefined;
  if (deObra) return { paciente: deObra.precioPaciente, obraSocial: deObra.precioObraSocial, lista: "obra" as const };
  const particular = filas.find((f) => f.obraSocialId === null);
  return { paciente: particular?.precioPaciente ?? 0, obraSocial: 0, lista: particular ? ("particular" as const) : ("sin precio" as const) };
}

/** Cobertura del paciente hoy (queda copiada en cada prestación realizada, para liquidar a la obra social) */
export async function coberturaDe(db: Tx, pacienteId: string) {
  const [p] = await db
    .select({ obraSocialId: pacientes.obraSocialId, obraSocial: obrasSociales.nombre, plan: pacientes.plan, numeroAfiliado: pacientes.numeroAfiliado })
    .from(pacientes)
    .leftJoin(obrasSociales, eq(obrasSociales.id, pacientes.obraSocialId))
    .where(eq(pacientes.id, pacienteId));
  return p ?? { obraSocialId: null, obraSocial: null, plan: null, numeroAfiliado: null };
}

/**
 * Registra una prestación realizada en la cuenta del paciente.
 * El importe: el del renglón del presupuesto aceptado (si viene de ahí), si no el de la lista de precios.
 */
export async function registrarRealizada(
  db: Tx,
  d: {
    empresaId: string;
    pacienteId: string;
    prestacionId: string;
    pieza: number | null;
    caras: string[];
    fecha: string;
    profesional: string;
    usuarioId: string;
    odontogramaId?: string | null;
    presupuestoItemId?: string | null;
    importes?: { paciente: number; obraSocial: number };
  },
) {
  const cob = await coberturaDe(db, d.pacienteId);
  let importes = d.importes;
  let presupuestoItemId = d.presupuestoItemId ?? null;
  // Si la marca del odontograma estaba en un presupuesto aceptado sin realizar, vale el precio acordado
  if (!importes && d.odontogramaId) {
    const [item] = await db
      .select({ id: presupuestoDentalItems.id, paciente: presupuestoDentalItems.importePaciente, obraSocial: presupuestoDentalItems.importeObraSocial })
      .from(presupuestoDentalItems)
      .innerJoin(presupuestosDentales, eq(presupuestosDentales.id, presupuestoDentalItems.presupuestoId))
      .where(and(eq(presupuestoDentalItems.odontogramaId, d.odontogramaId), isNull(presupuestoDentalItems.cargoId), eq(presupuestosDentales.estado, "Aceptado")));
    if (item) {
      importes = { paciente: item.paciente, obraSocial: item.obraSocial };
      presupuestoItemId = item.id;
    }
  }
  if (!importes) {
    const p = await precioDe(db, d.empresaId, d.prestacionId, cob.obraSocialId);
    importes = { paciente: p.paciente, obraSocial: p.obraSocial };
  }
  const [c] = await db
    .insert(cargosPaciente)
    .values({
      empresaId: d.empresaId,
      pacienteId: d.pacienteId,
      prestacionId: d.prestacionId,
      pieza: d.pieza,
      caras: d.caras,
      fecha: d.fecha,
      profesional: d.profesional,
      usuarioId: d.usuarioId,
      obraSocialId: cob.obraSocialId,
      obraSocial: cob.obraSocial,
      plan: cob.plan,
      numeroAfiliado: cob.numeroAfiliado,
      importePaciente: r2(importes.paciente),
      importeObraSocial: r2(importes.obraSocial),
      odontogramaId: d.odontogramaId ?? null,
      presupuestoItemId,
    })
    .returning();
  if (presupuestoItemId) await db.update(presupuestoDentalItems).set({ cargoId: c!.id }).where(eq(presupuestoDentalItems.id, presupuestoItemId));
  return c!;
}

/** Anula lo cargado a la cuenta por una marca del odontograma (si se anula la marca) */
export async function anularCargoDeMarca(db: Tx, odontogramaId: string, quien: string, motivo: string) {
  const anulados = await db
    .update(cargosPaciente)
    .set({ anuladoEn: new Date(), anuladoPor: quien, motivoAnulacion: motivo })
    .where(and(eq(cargosPaciente.odontogramaId, odontogramaId), isNull(cargosPaciente.anuladoEn)))
    .returning({ id: cargosPaciente.id });
  if (anulados.length) await db.update(presupuestoDentalItems).set({ cargoId: null }).where(sql`${presupuestoDentalItems.cargoId} in (${sql.join(anulados.map((a) => sql`${a.id}`), sql`, `)})`);
}

/** Saldo del paciente: lo realizado a su cargo menos lo que pagó (positivo: debe; negativo: tiene a favor) */
export async function saldoPaciente(db: Tx, pacienteId: string) {
  const [[cargos], [pagos]] = await Promise.all([
    db.select({ t: sql<number>`coalesce(sum(${cargosPaciente.importePaciente}), 0)::float` }).from(cargosPaciente).where(and(eq(cargosPaciente.pacienteId, pacienteId), isNull(cargosPaciente.anuladoEn))),
    db.select({ t: sql<number>`coalesce(sum(${pagosPaciente.importe}), 0)::float` }).from(pagosPaciente).where(and(eq(pagosPaciente.pacienteId, pacienteId), isNull(pagosPaciente.anuladoEn))),
  ]);
  return { cargos: r2(Number(cargos?.t ?? 0)), pagos: r2(Number(pagos?.t ?? 0)), saldo: r2(Number(cargos?.t ?? 0) - Number(pagos?.t ?? 0)) };
}

/** Si la caja de ese día ya se cerró, no se pueden mover efectivo con esa fecha (el arqueo dejaría de cerrar) */
export async function exigirCajaAbierta(db: Tx, empresaId: string, fecha: string, medio: string) {
  if (medio !== "Efectivo") return;
  const [c] = await db.select({ cerradaEn: cajas.cerradaEn }).from(cajas).where(and(eq(cajas.empresaId, empresaId), eq(cajas.fecha, fecha)));
  if (c?.cerradaEn) throw conflict(`La caja del ${fecha.split("-").reverse().join("/")} ya está cerrada: no se puede mover efectivo con esa fecha.`);
}

/** Todo lo que pasó por caja en un día, por medio de pago, y el efectivo que tiene que haber */
export async function resumenCaja(db: Tx, empresaId: string, fecha: string) {
  const [caja] = await db.select().from(cajas).where(and(eq(cajas.empresaId, empresaId), eq(cajas.fecha, fecha)));
  const pagos = await db
    .select({ id: pagosPaciente.id, numero: pagosPaciente.numero, importe: pagosPaciente.importe, medio: pagosPaciente.medio, paciente: sql<string>`${pacientes.apellido} || ', ' || ${pacientes.nombre}`, pacienteId: pagosPaciente.pacienteId, cobradoPor: pagosPaciente.cobradoPor, createdAt: pagosPaciente.createdAt })
    .from(pagosPaciente)
    .innerJoin(pacientes, eq(pacientes.id, pagosPaciente.pacienteId))
    .where(and(eq(pagosPaciente.empresaId, empresaId), eq(pagosPaciente.fecha, fecha), isNull(pagosPaciente.anuladoEn)));
  const ingresos = await db.select().from(ingresosCaja).where(and(eq(ingresosCaja.empresaId, empresaId), eq(ingresosCaja.fecha, fecha), isNull(ingresosCaja.anuladoEn)));
  const egresos = await db.select().from(gastos).where(and(eq(gastos.empresaId, empresaId), eq(gastos.fecha, fecha), isNull(gastos.anuladoEn)));
  const porMedio = new Map<string, { ingresos: number; egresos: number }>();
  const suma = (medio: string, campo: "ingresos" | "egresos", v: number) => {
    const x = porMedio.get(medio) ?? { ingresos: 0, egresos: 0 };
    x[campo] = r2(x[campo] + v);
    porMedio.set(medio, x);
  };
  for (const p of pagos) suma(p.medio, "ingresos", p.importe);
  for (const i of ingresos) suma(i.medio, "ingresos", i.importe);
  for (const g of egresos) suma(g.medio, "egresos", g.importe);
  const efectivo = porMedio.get("Efectivo") ?? { ingresos: 0, egresos: 0 };
  const esperadoEfectivo = r2((caja?.aperturaEfectivo ?? 0) + efectivo.ingresos - efectivo.egresos);
  const totalIngresos = r2([...porMedio.values()].reduce((a, x) => a + x.ingresos, 0));
  const totalEgresos = r2([...porMedio.values()].reduce((a, x) => a + x.egresos, 0));
  return {
    fecha,
    caja: caja ?? null,
    porMedio: [...porMedio.entries()].map(([medio, x]) => ({ medio, ...x })).sort((a, b) => (a.medio === "Efectivo" ? -1 : b.medio === "Efectivo" ? 1 : a.medio.localeCompare(b.medio))),
    pagos,
    ingresos,
    gastos: egresos,
    totalIngresos,
    totalEgresos,
    esperadoEfectivo,
  };
}

/** Prestación de la empresa (activa si se va a usar ahora) */
export async function prestacionDe(db: Tx, empresaId: string, id: string) {
  const [p] = await db.select().from(prestaciones).where(and(eq(prestaciones.id, id), eq(prestaciones.empresaId, empresaId)));
  return p;
}
