import { randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { empresas, pagosSuscripcion, solicitudesLegales, suscripciones, usuarios } from "../db/schema.js";
import { codigoConstancia, ipDe } from "./legal.js";
import { marcaDe, nombrePlan, productoDeEmpresa } from "../lib/productos.js";
import { codigoDe, DIAS_REGALO, recompensarReferido } from "../lib/referidos.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { badRequest, conflict, edicionConcurrente, HttpError, notFound, parse, unauthorized } from "../lib/errors.js";
import { ErrorPagos, firmaMercadoPagoValida, PagoAjeno, type EstadoPago } from "../lib/pagos.js";
import {
  DIAS_GRACIA,
  cotizarCambio,
  estadoDe,
  limitesDe,
  MESES_COBRADOS_ANUAL,
  obtenerSuscripcion,
  periodoCubierto,
  PLAN_IDS,
  PLANES,
  PRECIO_USUARIO_ADICIONAL_USD,
  precioUsd,
  usosActuales,
  aplicarCambioPagado,
  type Periodo,
  type PlanId,
} from "../lib/suscripcion.js";

type Pago = typeof pagosSuscripcion.$inferSelect;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aplica el resultado de un pago (idempotente: si ya se procesó, no hace nada).
 * Aprobado: extiende la suscripción desde el vencimiento vigente y deja el plan pagado.
 */
export async function aplicarPago(app: FastifyInstance, referencia: string, estado: EstadoPago, proveedorPagoId?: string) {
  const r = await aplicarPagoTx(app, referencia, estado, proveedorPagoId);
  // Si llegó recomendada y es su primer pago aprobado, quien la recomendó gana un mes
  if (r.estado === "Aprobado") await recompensarReferido(app, r.empresaId);
  return r;
}

async function aplicarPagoTx(app: FastifyInstance, referencia: string, estado: EstadoPago, proveedorPagoId?: string) {
  return app.db.transaction(async (tx) => {
    const [p] = await tx.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.referencia, referencia)).for("update");
    if (!p) throw notFound("Pago no encontrado");
    if (p.estado !== "Pendiente" || estado === "Pendiente") return p;
    if (estado === "Rechazado") {
      const [r] = await tx.update(pagosSuscripcion).set({ estado, proveedorPagoId: proveedorPagoId ?? p.proveedorPagoId }).where(eq(pagosSuscripcion.id, p.id)).returning();
      return r!;
    }
    const [s] = await tx.select().from(suscripciones).where(eq(suscripciones.empresaId, p.empresaId)).for("update");
    if (p.tipo === "cambio") {
      // Diferencia por subir de plan o sumar usuarios: se habilita ya (ver aplicarCambioPagado para los casos raros)
      const c = aplicarCambioPagado(s!, { plan: p.plan as PlanId, usuariosAdicionales: p.usuariosAdicionales, importeUsd: p.importeUsd });
      await tx
        .update(suscripciones)
        .set({
          plan: c.plan,
          usuariosAdicionales: c.usuariosAdicionales,
          pagoHasta: c.pagoHasta,
          ...(c.aplicado ? { planProximo: null, adicionalesProximos: null } : {}),
          version: sql`${suscripciones.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(suscripciones.empresaId, p.empresaId));
      const [r] = await tx
        .update(pagosSuscripcion)
        .set({ estado, desde: hoyAr(), hasta: c.pagoHasta, aprobadoAt: new Date(), proveedorPagoId: proveedorPagoId ?? p.proveedorPagoId })
        .where(eq(pagosSuscripcion.id, p.id))
        .returning();
      return r!;
    }
    const { desde, hasta } = periodoCubierto(s!, p.periodo as Periodo);
    await tx
      .update(suscripciones)
      // Pagar anula una baja pedida: quiere seguir
      .set({ plan: p.plan, periodo: p.periodo, usuariosAdicionales: p.usuariosAdicionales, pagoHasta: hasta, planProximo: null, adicionalesProximos: null, bajaSolicitadaEn: null, bajaCodigo: null, version: sql`${suscripciones.version} + 1`, updatedAt: new Date() })
      .where(eq(suscripciones.empresaId, p.empresaId));
    const [r] = await tx.update(pagosSuscripcion).set({ estado, desde, hasta, aprobadoAt: new Date(), proveedorPagoId: proveedorPagoId ?? p.proveedorPagoId }).where(eq(pagosSuscripcion.id, p.id)).returning();
    return r!;
  });
}

/** Consulta al proveedor y aplica: nunca se confía en lo que manda el navegador */
async function verificarConProveedor(app: FastifyInstance, p: Pago, pagoId: string) {
  let info;
  try {
    info = await app.pagos.consultarPago(pagoId);
  } catch (e) {
    throw new HttpError(502, e instanceof ErrorPagos ? e.message : "No se pudo consultar el pago");
  }
  if (info.referencia !== p.referencia) throw badRequest("El pago no corresponde a este cobro");
  if (app.pagos.nombre === "mercadopago" && info.estado === "Aprobado" && Math.abs(info.importe - p.importeArs) > 0.5) {
    throw conflict("El importe pagado no coincide con el cobro. Comunicate con soporte.");
  }
  return aplicarPago(app, p.referencia, info.estado, pagoId);
}

const cambioSchema = z.object({
  plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]], { errorMap: () => ({ message: "Plan inválido" }) }),
  usuariosAdicionales: z.coerce.number().int().min(0, "No puede ser negativo").max(500),
  version: z.number().int().positive().max(2_000_000_000).optional(),
});

export const suscripcionRoutes: FastifyPluginAsync = async (app) => {
  const soloAdmin = requireAdmin;

  /** Estado de la suscripción (todos los usuarios, para el aviso); el detalle de pagos solo para el administrador */
  app.get("/", { preHandler: requireAuth }, async (req) => {
    const s = await obtenerSuscripcion(app.db, req.user.empresaId);
    const est = estadoDe(s);
    const producto = await productoDeEmpresa(app.db, req.user.empresaId);
    const base = { plan: s.plan, planNombre: nombrePlan(producto, s.plan), ...est, diasGracia: DIAS_GRACIA };
    if (!req.user.esAdmin) return base;
    const pagos = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.empresaId, req.user.empresaId)).orderBy(desc(pagosSuscripcion.createdAt)).limit(24);
    return {
      ...base,
      periodo: s.periodo,
      usuariosAdicionales: s.usuariosAdicionales,
      pruebaHasta: s.pruebaHasta,
      pagoHasta: s.pagoHasta,
      planProximo: s.planProximo,
      adicionalesProximos: s.adicionalesProximos,
      bajaSolicitadaEn: s.bajaSolicitadaEn,
      bajaCodigo: s.bajaCodigo,
      version: s.version,
      limites: limitesDe(s),
      usos: await usosActuales(app.db, req.user.empresaId),
      proveedor: app.pagos.nombre,
      pagos: pagos.map(({ urlPago: _u, ...p }) => p),
    };
  });

  /** Programa de referidos: el link para recomendar y a quiénes recomendó */
  app.get("/referidos", { preHandler: soloAdmin }, async (req) => {
    const empresaId = req.user.empresaId;
    const [codigo, producto] = await Promise.all([codigoDe(app.db, empresaId), productoDeEmpresa(app.db, empresaId)]);
    const lista = await app.db
      .select({ razonSocial: empresas.razonSocial, alta: empresas.createdAt, recompensado: empresas.referidoRecompensadoEn })
      .from(empresas)
      .where(eq(empresas.referidaPor, empresaId))
      .orderBy(desc(empresas.createdAt));
    return {
      codigo,
      link: `${app.urlDe(producto)}/registro?ref=${codigo}`,
      diasPorReferido: DIAS_REGALO,
      referidos: lista.map((x) => ({ razonSocial: x.razonSocial, alta: x.alta, pago: !!x.recompensado })),
      mesesGanados: lista.filter((x) => x.recompensado).length,
    };
  });

  app.get("/planes", { preHandler: requireAuth }, async (req) => {
    const producto = await productoDeEmpresa(app.db, req.user.empresaId);
    let dolar: number | null = null;
    try {
      dolar = await app.cotizacion();
    } catch {
      dolar = null;
    }
    return {
      planes: PLAN_IDS.map((id) => ({ id, ...PLANES[id], nombre: nombrePlan(producto, id) })),
      precioUsuarioAdicionalUsd: PRECIO_USUARIO_ADICIONAL_USD,
      mesesCobradosAnual: MESES_COBRADOS_ANUAL,
      dolar,
    };
  });

  /** Arma el cobro (renovación o diferencia por cambio) en pesos al dólar del día y devuelve a dónde ir a pagar */
  async function iniciarCobro(req: FastifyRequest, d: { tipo: "periodo" | "cambio"; plan: PlanId; adicionales: number; periodo: Periodo; usd: number; titulo: string }) {
    let dolar: number;
    try {
      dolar = await app.cotizacion();
    } catch (e) {
      throw new HttpError(503, e instanceof Error ? e.message : "No se pudo obtener la cotización");
    }
    const ars = r2(d.usd * dolar);
    const referencia = `PXC-${randomBytes(9).toString("base64url")}`;
    const [u] = await app.db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const producto = await productoDeEmpresa(app.db, req.user.empresaId);
    let cobro;
    try {
      cobro = await app.pagos.crearCobro({
        referencia,
        titulo: d.titulo,
        importeArs: ars,
        email: u!.email,
        urlVolver: `${app.urlDe(producto)}/configuracion?tab=plan&pago=${referencia}`,
        urlNotificacion: `${app.urlApi}/api/suscripcion/webhook/mercadopago`,
      });
    } catch (e) {
      throw new HttpError(502, e instanceof ErrorPagos ? e.message : "No se pudo iniciar el pago");
    }
    await app.db.insert(pagosSuscripcion).values({
      empresaId: req.user.empresaId,
      referencia,
      tipo: d.tipo,
      plan: d.plan,
      periodo: d.periodo,
      usuariosAdicionales: d.adicionales,
      importeUsd: d.usd,
      tipoCambio: dolar,
      importeArs: ars,
      proveedor: app.pagos.nombre,
      proveedorPagoId: cobro.id,
      urlPago: cobro.url,
      usuarioId: req.user.sub,
    });
    return { referencia, url: cobro.url, importeArs: ars, importeUsd: d.usd, dolar, titulo: d.titulo };
  }

  const detalleUsuarios = (n: number) => (n ? ` + ${n} usuario${n === 1 ? "" : "s"}` : "");

  /**
   * Cambiar de plan o de usuarios adicionales (lo que ya se usa tiene que entrar):
   * - en prueba o vencida: se aplica ya
   * - con período pago y precio mayor: se paga la diferencia por los días que faltan y se habilita al acreditarse
   * - con período pago y precio menor: queda programado para la próxima renovación
   */
  app.put("/", { preHandler: soloAdmin }, async (req) => {
    const d = parse(cambioSchema, req.body);
    const s = await obtenerSuscripcion(app.db, req.user.empresaId);
    if (d.version && d.version !== s.version) throw edicionConcurrente("la suscripción");
    const lim = limitesDe({ plan: d.plan, usuariosAdicionales: d.usuariosAdicionales });
    const usos = await usosActuales(app.db, req.user.empresaId);
    if (usos.usuarios > lim.usuarios) {
      throw badRequest(`Tenés ${usos.usuarios} usuarios activos y este plan permite ${lim.usuarios}. Sumá usuarios adicionales o suspendé alguno.`, { usuariosAdicionales: "No alcanza" });
    }
    if (lim.puntosVenta !== null && usos.puntosVenta > lim.puntosVenta) {
      throw badRequest(`Tenés ${usos.puntosVenta} puntos de venta activos y este plan permite ${lim.puntosVenta}. Desactivá los que no uses.`, { plan: "Puntos de venta" });
    }
    const cambio = cotizarCambio(s, d.plan, d.usuariosAdicionales);
    const producto = await productoDeEmpresa(app.db, req.user.empresaId);
    if (cambio.tipo === "pagar") {
      const cobro = await iniciarCobro(req, {
        tipo: "cambio",
        plan: d.plan,
        adicionales: d.usuariosAdicionales,
        periodo: s.periodo as Periodo,
        usd: cambio.importeUsd,
        titulo: `${marcaDe(producto).nombre}: cambio a plan ${nombrePlan(producto, d.plan)}${detalleUsuarios(d.usuariosAdicionales)} por los ${cambio.dias} días que faltan`,
      });
      return { aplicado: "pagar", dias: cambio.dias, ...cobro };
    }
    const cambios =
      cambio.tipo === "proximo"
        ? { planProximo: d.plan, adicionalesProximos: d.usuariosAdicionales }
        : { plan: d.plan, usuariosAdicionales: d.usuariosAdicionales, planProximo: null, adicionalesProximos: null };
    const [n] = await app.db
      .update(suscripciones)
      .set({ ...cambios, version: sql`${suscripciones.version} + 1`, updatedAt: new Date() })
      .where(eq(suscripciones.empresaId, req.user.empresaId))
      .returning();
    return {
      aplicado: cambio.tipo,
      desde: cambio.tipo === "proximo" ? cambio.desde : null,
      plan: n!.plan,
      usuariosAdicionales: n!.usuariosAdicionales,
      planProximo: n!.planProximo,
      adicionalesProximos: n!.adicionalesProximos,
      version: n!.version,
    };
  });

  /** Renovación: paga un mes o un año del plan (el programado para la próxima renovación, si hay uno) */
  app.post("/pagar", { preHandler: soloAdmin }, async (req) => {
    const { periodo } = parse(z.object({ periodo: z.enum(["mensual", "anual"]).default("mensual") }), req.body ?? {});
    const s = await obtenerSuscripcion(app.db, req.user.empresaId);
    const plan = (s.planProximo ?? s.plan) as PlanId;
    const adicionales = s.adicionalesProximos ?? s.usuariosAdicionales;
    const producto = await productoDeEmpresa(app.db, req.user.empresaId);
    return iniciarCobro(req, {
      tipo: "periodo",
      plan,
      adicionales,
      periodo,
      usd: precioUsd(plan, adicionales, periodo),
      titulo: `${marcaDe(producto).nombre} plan ${nombrePlan(producto, plan)} ${periodo === "anual" ? "(12 meses)" : "(1 mes)"}${detalleUsuarios(adicionales)}`,
    });
  });

  const pagoDe = async (empresaId: string, referencia: string) => {
    const [p] = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.referencia, referencia));
    if (!p || p.empresaId !== empresaId) throw notFound("Pago no encontrado");
    return p;
  };

  app.get("/pagos/:ref", { preHandler: soloAdmin }, async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(60) }), req.params);
    const { urlPago: _u, ...p } = await pagoDe(req.user.empresaId, ref);
    return { ...p, proveedor: p.proveedor };
  });

  /** Al volver de Mercado Pago: confirma el pago consultándolo (por si el aviso del webhook todavía no llegó) */
  app.post("/pagos/:ref/verificar", { preHandler: soloAdmin }, async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(60) }), req.params);
    const { pagoId } = parse(z.object({ pagoId: z.string().max(60).optional() }), req.body ?? {});
    const p = await pagoDe(req.user.empresaId, ref);
    if (p.estado !== "Pendiente") return p;
    if (!pagoId) return p;
    return verificarConProveedor(app, p, pagoId);
  });

  /** Solo con el simulador (sin credenciales de Mercado Pago): aprobar o rechazar el pago de prueba */
  app.post("/pagos/:ref/simular", { preHandler: soloAdmin }, async (req) => {
    const { ref } = parse(z.object({ ref: z.string().max(60) }), req.params);
    const { resultado } = parse(z.object({ resultado: z.enum(["Aprobado", "Rechazado"]) }), req.body);
    const p = await pagoDe(req.user.empresaId, ref);
    if (p.proveedor !== "simulado" || app.pagos.nombre !== "simulado") throw badRequest("Este pago no es de prueba");
    (app.pagos as { resultados?: Map<string, EstadoPago> }).resultados?.set(ref, resultado);
    return verificarConProveedor(app, p, p.proveedorPagoId!);
  });

  /** Botón de baja (dentro de la app): no se renueva; el acceso sigue hasta el vencimiento. Devuelve el código de constancia. */
  app.post("/baja", { preHandler: soloAdmin }, async (req) => {
    const { motivo } = parse(z.object({ motivo: z.string().trim().max(1000).optional().nullable() }), req.body ?? {});
    const s = await obtenerSuscripcion(app.db, req.user.empresaId);
    if (s.bajaCodigo) return { codigo: s.bajaCodigo, accesoHasta: estadoDe(s).vence };
    const [u] = await app.db.select({ nombre: usuarios.nombre, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const codigo = codigoConstancia("baja");
    await app.db.insert(solicitudesLegales).values({ tipo: "baja", codigo, empresaId: req.user.empresaId, nombre: u!.nombre, email: u!.email, motivo: motivo || null, ip: ipDe(req) });
    await app.db.update(suscripciones).set({ bajaSolicitadaEn: new Date(), bajaCodigo: codigo, updatedAt: new Date() }).where(eq(suscripciones.empresaId, req.user.empresaId));
    return { codigo, accesoHasta: estadoDe(s).vence };
  });

  /** Arrepentirse de la baja (antes de que se haga efectiva) */
  app.delete("/baja", { preHandler: soloAdmin }, async (req, reply) => {
    const s = await obtenerSuscripcion(app.db, req.user.empresaId);
    if (s.bajaCodigo) {
      await app.db.update(solicitudesLegales).set({ estado: "Resuelta", nota: "Anulada por el cliente", resueltaEn: new Date() }).where(eq(solicitudesLegales.codigo, s.bajaCodigo));
      await app.db.update(suscripciones).set({ bajaSolicitadaEn: null, bajaCodigo: null, updatedAt: new Date() }).where(eq(suscripciones.empresaId, req.user.empresaId));
    }
    return reply.status(204).send();
  });

  /** Solo en el servidor de pruebas automáticas (PREXACODE_PRUEBAS=1): mover las fechas para probar vencimientos */
  if (app.modoPruebas) {
    app.post("/pruebas/fechas", { preHandler: soloAdmin }, async (req) => {
      const d = parse(z.object({ pruebaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pagoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) }), req.body);
      await obtenerSuscripcion(app.db, req.user.empresaId);
      await app.db.update(suscripciones).set(d).where(eq(suscripciones.empresaId, req.user.empresaId));
      return estadoDe(d);
    });
  }

  /** Aviso de Mercado Pago (sin usuario): se verifica la firma y se consulta el pago real */
  app.post("/webhook/mercadopago", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const body = (req.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number } };
    const tipo = body.type ?? q.type ?? q.topic;
    const dataId = String(body.data?.id ?? q["data.id"] ?? q.id ?? "");
    if (tipo !== "payment" || !dataId) return reply.status(200).send({ ok: true, ignorado: true });
    if (app.mpWebhookSecret) {
      const valida = firmaMercadoPagoValida({ firma: req.headers["x-signature"] as string | undefined, requestId: req.headers["x-request-id"] as string | undefined, dataId, secreto: app.mpWebhookSecret });
      if (!valida) throw unauthorized("Firma inválida");
    }
    let info;
    try {
      info = await app.pagos.consultarPago(dataId);
    } catch (e) {
      // Un pago que no existe o no es nuestro (la prueba del panel de Mercado Pago): recibido, no hay nada que hacer
      if (e instanceof PagoAjeno) return reply.status(200).send({ ok: true, ignorado: true });
      // Otro error (Mercado Pago caído): respondiendo 503, Mercado Pago reintenta más tarde
      return reply.status(503).send({ ok: false });
    }
    const [p] = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.referencia, info.referencia));
    if (!p) return reply.status(200).send({ ok: true, ignorado: true });
    if (info.estado === "Aprobado" && Math.abs(info.importe - p.importeArs) > 0.5) {
      req.log.error({ referencia: p.referencia, importe: info.importe }, "Importe de Mercado Pago distinto al cobro");
      return reply.status(200).send({ ok: false, motivo: "importe" });
    }
    await aplicarPago(app, p.referencia, info.estado, dataId);
    return reply.status(200).send({ ok: true });
  });
};
