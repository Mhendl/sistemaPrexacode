import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, inArray, max, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { aceptacionesTerminos, auditoriaPlataforma, clientes, comprobantes, empresas, pagosSuscripcion, productos, solicitudesLegales, suscripciones, ticketMensajes, tickets, usuarios } from "../db/schema.js";
import { notificarUsuario } from "../lib/notificaciones.js";
import { avisarPorEmail, mensajesDe } from "./soporte.js";
import { requirePlataforma } from "../lib/auth.js";
import { hoyAr, TIPOS_NC } from "../lib/cuentas.js";
import { notFound, parse } from "../lib/errors.js";
import { DIAS_PRUEBA, estadoDe, limitesDe, obtenerSuscripcion, PLAN_IDS, PLANES, precioUsd, sumarDias, type Periodo, type PlanId } from "../lib/suscripcion.js";
import { adminDe } from "./admin.js";
import { aplicarPago } from "./suscripcion.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Mes (aaaa-mm) de una fecha y hora, en hora argentina */
const mesDe = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Los últimos 12 meses (aaaa-mm), del más viejo al actual */
function ultimos12() {
  const [a, m] = hoyAr().split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1));
    return { clave: d.toISOString().slice(0, 7), etiqueta: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` };
  });
}

/**
 * Panel de administración de la plataforma (quien vende Prexacode).
 * Solo con sesión del panel (/api/admin/login). Cada acción queda registrada en la auditoría.
 */
export const plataformaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);
  app.addHook("preHandler", async (req) => {
    (req as FastifyRequest & { adminEmail: string }).adminEmail = (await adminDe(app, req)).email;
  });

  const auditar = (req: FastifyRequest, empresaId: string | null, accion: string, detalle: Record<string, unknown> = {}) =>
    app.db.insert(auditoriaPlataforma).values({ adminEmail: (req as FastifyRequest & { adminEmail: string }).adminEmail, empresaId, accion, detalle });

  /** Todas las empresas con su suscripción (si nunca se consultó, con la prueba desde el alta) */
  async function empresasConEstado() {
    const filas = await app.db.select({ e: empresas, s: suscripciones }).from(empresas).leftJoin(suscripciones, eq(suscripciones.empresaId, empresas.id)).orderBy(desc(empresas.createdAt));
    return filas.map(({ e, s }) => {
      const alta = new Date(e.createdAt.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
      const sus = s ?? { plan: "profesional", usuariosAdicionales: 0, periodo: "mensual", pruebaHasta: sumarDias(alta, DIAS_PRUEBA), pagoHasta: null, bajaSolicitadaEn: null, bajaCodigo: null, planProximo: null, adicionalesProximos: null };
      return { e, s: sus, est: estadoDe(sus) };
    });
  }

  /** Lo que cada empresa paga por mes hoy (USD): 0 si no está al día o está suspendida */
  const mensualUsd = (x: Awaited<ReturnType<typeof empresasConEstado>>[number]) => {
    if (x.est.estado !== "Activa" || x.e.suspendidaEn) return 0;
    const p = x.s.periodo as Periodo;
    return precioUsd(x.s.plan as PlanId, x.s.usuariosAdicionales, p) / (p === "anual" ? 12 : 1);
  };

  const pagosAprobados = () => app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.estado, "Aprobado"));

  app.get("/resumen", async () => {
    const todas = await empresasConEstado();
    const porEstado = { Prueba: 0, Activa: 0, Gracia: 0, SoloLectura: 0 };
    const porPlan: Record<string, number> = { basico: 0, profesional: 0, empresa: 0 };
    let mrrUsd = 0;
    for (const x of todas) {
      // Las suspendidas se cuentan aparte (no suman como activas ni al MRR)
      if (x.e.suspendidaEn) continue;
      porEstado[x.est.estado]++;
      if (x.est.estado === "Activa") porPlan[x.s.plan] = (porPlan[x.s.plan] ?? 0) + 1;
      mrrUsd += mensualUsd(x);
    }
    const aprobados = await pagosAprobados();
    const meses = ultimos12();
    const ingresosPorMes = meses.map((m) => ({ ...m, ars: r2(aprobados.filter((p) => p.aprobadoAt && mesDe(p.aprobadoAt) === m.clave).reduce((a, p) => a + p.importeArs, 0)) }));
    const altasPorMes = meses.map((m) => ({ ...m, altas: todas.filter((x) => mesDe(x.e.createdAt) === m.clave).length }));
    const hace30 = new Date(Date.now() - 30 * 86_400_000);
    const ult30 = aprobados.filter((p) => p.aprobadoAt && p.aprobadoAt >= hace30);
    const [pendientes] = await app.db.select({ n: count() }).from(solicitudesLegales).where(eq(solicitudesLegales.estado, "Pendiente"));
    const [abiertos] = await app.db.select({ n: count() }).from(tickets).where(eq(tickets.estado, "Abierto"));
    const nombres = new Map(todas.map((x) => [x.e.id, x.e.razonSocial]));
    const ultimosPagos = [...aprobados]
      .sort((a, b) => (b.aprobadoAt?.getTime() ?? 0) - (a.aprobadoAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((p) => ({ id: p.id, empresaId: p.empresaId, empresa: nombres.get(p.empresaId) ?? "", importeArs: p.importeArs, tipo: p.tipo, plan: p.plan, periodo: p.periodo, proveedor: p.proveedor, aprobadoAt: p.aprobadoAt }));
    const proximosVencimientos = todas
      .filter((x) => !x.e.suspendidaEn && (x.est.estado === "Activa" || x.est.estado === "Prueba" || x.est.estado === "Gracia") && x.est.diasRestantes <= 10)
      .sort((a, b) => a.est.vence.localeCompare(b.est.vence))
      .slice(0, 10)
      .map((x) => ({ empresaId: x.e.id, empresa: x.e.razonSocial, plan: x.s.plan, estado: x.est.estado, vence: x.est.vence, diasRestantes: x.est.diasRestantes }));
    return {
      empresas: todas.length,
      porEstado,
      porPlan,
      suspendidas: todas.filter((x) => x.e.suspendidaEn).length,
      bajasPedidas: todas.filter((x) => x.s.bajaSolicitadaEn).length,
      altas30Dias: todas.filter((x) => x.e.createdAt >= hace30).length,
      vencenEn7Dias: todas.filter((x) => !x.e.suspendidaEn && (x.est.estado === "Activa" || x.est.estado === "Prueba") && x.est.diasRestantes <= 7).length,
      mrrUsd: r2(mrrUsd),
      cobrado30Dias: { ars: r2(ult30.reduce((a, p) => a + p.importeArs, 0)), pagos: ult30.length },
      cobradoMes: r2(aprobados.filter((p) => p.aprobadoAt && mesDe(p.aprobadoAt) === hoyAr().slice(0, 7)).reduce((a, p) => a + p.importeArs, 0)),
      cobradoTotal: r2(aprobados.reduce((a, p) => a + p.importeArs, 0)),
      solicitudesPendientes: Number(pendientes?.n ?? 0),
      ticketsAbiertos: Number(abiertos?.n ?? 0),
      ingresosPorMes,
      altasPorMes,
      ultimosPagos,
      proximosVencimientos,
    };
  });

  app.get("/empresas", async () => {
    const todas = await empresasConEstado();
    const ids = todas.map((x) => x.e.id);
    if (!ids.length) return [];
    const mes = hoyAr().slice(0, 7);
    const [usos, admins, comps, pagos, nClientes] = await Promise.all([
      app.db
        .select({
          empresaId: usuarios.empresaId,
          activos: sql<number>`count(*) filter (where ${usuarios.estado} = 'Activo')::int`,
          ultimoAcceso: max(usuarios.ultimoAcceso),
          sesionesPisadas: sql<number>`coalesce(sum(${usuarios.sesionesPisadas}), 0)::int`,
        })
        .from(usuarios)
        .where(inArray(usuarios.empresaId, ids))
        .groupBy(usuarios.empresaId),
      app.db.select({ empresaId: usuarios.empresaId, email: usuarios.email, nombre: usuarios.nombre }).from(usuarios).where(and(inArray(usuarios.empresaId, ids), eq(usuarios.rol, "admin"))).orderBy(usuarios.createdAt),
      app.db
        .select({
          empresaId: comprobantes.empresaId,
          n: count(),
          facturadoMes: sql<number>`coalesce(sum(case when ${comprobantes.fecha} like ${`${mes}%`} then (case when ${comprobantes.tipoCbte} in (${sql.join(TIPOS_NC.map((t) => sql`${t}`), sql`, `)}) then -${comprobantes.total} else ${comprobantes.total} end) else 0 end), 0)::float`,
        })
        .from(comprobantes)
        .where(and(inArray(comprobantes.empresaId, ids), eq(comprobantes.estado, "Autorizado")))
        .groupBy(comprobantes.empresaId),
      app.db
        .select({ empresaId: pagosSuscripcion.empresaId, total: sql<number>`coalesce(sum(${pagosSuscripcion.importeArs}), 0)::float`, n: count() })
        .from(pagosSuscripcion)
        .where(and(inArray(pagosSuscripcion.empresaId, ids), eq(pagosSuscripcion.estado, "Aprobado")))
        .groupBy(pagosSuscripcion.empresaId),
      app.db.select({ empresaId: clientes.empresaId, n: count() }).from(clientes).where(inArray(clientes.empresaId, ids)).groupBy(clientes.empresaId),
    ]);
    const uso = new Map(usos.map((u) => [u.empresaId, u]));
    const admin = new Map<string, { email: string; nombre: string }>();
    for (const a of admins) if (!admin.has(a.empresaId)) admin.set(a.empresaId, a);
    const comp = new Map(comps.map((c) => [c.empresaId, c]));
    const pago = new Map(pagos.map((p) => [p.empresaId, p]));
    const cli = new Map(nClientes.map((c) => [c.empresaId, Number(c.n)]));
    return todas.map((x) => ({
      id: x.e.id,
      razonSocial: x.e.razonSocial,
      cuit: x.e.cuit,
      alta: x.e.createdAt,
      plan: x.s.plan,
      planNombre: PLANES[x.s.plan as PlanId]?.nombre ?? x.s.plan,
      planProximo: x.s.planProximo,
      periodo: x.s.periodo,
      usuariosAdicionales: x.s.usuariosAdicionales,
      ...x.est,
      bajaSolicitada: !!x.s.bajaSolicitadaEn,
      suspendida: !!x.e.suspendidaEn,
      usuariosActivos: uso.get(x.e.id)?.activos ?? 0,
      limiteUsuarios: limitesDe(x.s).usuarios,
      ultimoAcceso: uso.get(x.e.id)?.ultimoAcceso ?? null,
      sesionesPisadas: Number(uso.get(x.e.id)?.sesionesPisadas ?? 0),
      comprobantes: Number(comp.get(x.e.id)?.n ?? 0),
      facturadoMes: r2(Number(comp.get(x.e.id)?.facturadoMes ?? 0)),
      clientes: cli.get(x.e.id) ?? 0,
      mensualUsd: r2(mensualUsd(x)),
      pagadoTotal: r2(Number(pago.get(x.e.id)?.total ?? 0)),
      pagos: Number(pago.get(x.e.id)?.n ?? 0),
      admin: admin.get(x.e.id) ?? null,
    }));
  });

  app.get("/empresas/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [e] = await app.db.select().from(empresas).where(eq(empresas.id, id));
    if (!e) throw notFound("Empresa no encontrada");
    const s = await obtenerSuscripcion(app.db, id);
    const [us, pagos, acept, auditoria, solicitudes, comps, [nCli], [nProd], soporte] = await Promise.all([
      app.db.select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol, estado: usuarios.estado, ultimoAcceso: usuarios.ultimoAcceso, sesionesPisadas: usuarios.sesionesPisadas, createdAt: usuarios.createdAt }).from(usuarios).where(eq(usuarios.empresaId, id)),
      app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.empresaId, id)).orderBy(desc(pagosSuscripcion.createdAt)),
      app.db.select().from(aceptacionesTerminos).where(eq(aceptacionesTerminos.empresaId, id)).orderBy(desc(aceptacionesTerminos.aceptadoEn)),
      app.db.select().from(auditoriaPlataforma).where(eq(auditoriaPlataforma.empresaId, id)).orderBy(desc(auditoriaPlataforma.createdAt)).limit(50),
      app.db.select().from(solicitudesLegales).where(eq(solicitudesLegales.empresaId, id)).orderBy(desc(solicitudesLegales.createdAt)),
      app.db
        .select({ fecha: comprobantes.fecha, tipoCbte: comprobantes.tipoCbte, total: comprobantes.total })
        .from(comprobantes)
        .where(and(eq(comprobantes.empresaId, id), eq(comprobantes.estado, "Autorizado"), gte(comprobantes.fecha, `${ultimos12()[0]!.clave}-01`))),
      app.db.select({ n: count() }).from(clientes).where(eq(clientes.empresaId, id)),
      app.db.select({ n: count() }).from(productos).where(eq(productos.empresaId, id)),
      app.db.select().from(tickets).where(eq(tickets.empresaId, id)).orderBy(desc(tickets.updatedAt)).limit(50),
    ]);
    const actividad = ultimos12().map((m) => {
      const delMes = comps.filter((c) => c.fecha.startsWith(m.clave));
      return { ...m, comprobantes: delMes.length, facturado: r2(delMes.reduce((a, c) => a + (TIPOS_NC.includes(c.tipoCbte) ? -c.total : c.total), 0)) };
    });
    const aprobados = pagos.filter((p) => p.estado === "Aprobado");
    return {
      empresa: e,
      suscripcion: { ...s, ...estadoDe(s), planNombre: PLANES[s.plan as PlanId]?.nombre ?? s.plan, limites: limitesDe(s) },
      uso: { usuariosActivos: us.filter((u) => u.estado === "Activo").length, clientes: Number(nCli?.n ?? 0), productos: Number(nProd?.n ?? 0), actividad },
      pagadoTotal: r2(aprobados.reduce((a, p) => a + p.importeArs, 0)),
      usuarios: us,
      pagos: pagos.map(({ urlPago: _u, ...p }) => p),
      aceptaciones: acept,
      auditoria,
      solicitudes,
      tickets: soporte,
    };
  });

  /* ---------- Soporte: pedidos de ayuda de las empresas ---------- */

  app.get("/tickets", async (req) => {
    const { estado } = parse(z.object({ estado: z.enum(["Abierto", "Respondido", "Cerrado"]).optional() }), req.query);
    const filas = await app.db
      .select({ t: tickets, empresa: empresas.razonSocial, usuario: usuarios.nombre, email: usuarios.email })
      .from(tickets)
      .innerJoin(empresas, eq(empresas.id, tickets.empresaId))
      .leftJoin(usuarios, eq(usuarios.id, tickets.usuarioId))
      .where(estado ? eq(tickets.estado, estado) : undefined)
      .orderBy(desc(tickets.updatedAt))
      .limit(500);
    return filas.map(({ t, ...x }) => ({ ...t, ...x }));
  });

  async function ticketCompleto(id: string) {
    const [f] = await app.db
      .select({ t: tickets, empresa: empresas.razonSocial, usuario: usuarios.nombre, email: usuarios.email })
      .from(tickets)
      .innerJoin(empresas, eq(empresas.id, tickets.empresaId))
      .leftJoin(usuarios, eq(usuarios.id, tickets.usuarioId))
      .where(eq(tickets.id, id));
    if (!f) throw notFound("Ticket no encontrado");
    return { ...f.t, empresa: f.empresa, usuario: f.usuario, email: f.email, mensajes: await mensajesDe(app, id) };
  }

  app.get("/tickets/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    await app.db.update(tickets).set({ sinLeerSoporte: false }).where(eq(tickets.id, id));
    return ticketCompleto(id);
  });

  app.post("/tickets/:id/responder", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(z.object({ texto: z.string().trim().min(2, "Escribí la respuesta").max(5000), cerrar: z.boolean().optional() }), req.body);
    const t = await ticketCompleto(id);
    const admin = await adminDe(app, req);
    await app.db.insert(ticketMensajes).values({ ticketId: id, autor: "soporte", nombre: `${admin.nombre} (Prexacode)`, texto: d.texto });
    await app.db
      .update(tickets)
      .set({ estado: d.cerrar ? "Cerrado" : "Respondido", sinLeerCliente: true, sinLeerSoporte: false, updatedAt: new Date() })
      .where(eq(tickets.id, id));
    await auditar(req, t.empresaId, "responder-ticket", { numero: t.numero, cerrar: !!d.cerrar });
    // Aviso a quien lo pidió: en la campanita y por email
    if (t.usuarioId) {
      await notificarUsuario(app.db, t.empresaId, t.usuarioId, {
        tipo: "soporte_respuesta",
        titulo: `Respondimos tu pedido #${t.numero}`,
        detalle: t.asunto,
        link: `/soporte/${id}`,
      });
    }
    if (t.email) void avisarPorEmail(app, [t.email], `Respuesta a tu pedido #${t.numero}: ${t.asunto}`, d.texto, `${app.appUrl}/soporte/${id}`);
    return reply.status(201).send(await ticketCompleto(id));
  });

  app.post("/tickets/:id/estado", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { estado } = parse(z.object({ estado: z.enum(["Abierto", "Respondido", "Cerrado"]) }), req.body);
    const t = await ticketCompleto(id);
    await app.db.update(tickets).set({ estado, updatedAt: new Date() }).where(eq(tickets.id, id));
    await auditar(req, t.empresaId, "estado-ticket", { numero: t.numero, estado });
    return ticketCompleto(id);
  });

  /** Todos los pagos de todas las empresas */
  app.get("/pagos", async (req) => {
    const { estado } = parse(z.object({ estado: z.enum(["Pendiente", "Aprobado", "Rechazado"]).optional() }), req.query);
    const filas = await app.db
      .select({ p: pagosSuscripcion, empresa: empresas.razonSocial })
      .from(pagosSuscripcion)
      .innerJoin(empresas, eq(empresas.id, pagosSuscripcion.empresaId))
      .where(estado ? eq(pagosSuscripcion.estado, estado) : undefined)
      .orderBy(desc(pagosSuscripcion.createdAt))
      .limit(500);
    return filas.map(({ p: { urlPago: _u, ...p }, empresa }) => ({ ...p, empresa }));
  });

  /** Todo lo que hicieron los administradores del panel */
  app.get("/auditoria", async () =>
    app.db
      .select({ a: auditoriaPlataforma, empresa: empresas.razonSocial })
      .from(auditoriaPlataforma)
      .leftJoin(empresas, eq(empresas.id, auditoriaPlataforma.empresaId))
      .orderBy(desc(auditoriaPlataforma.createdAt))
      .limit(300)
      .then((r) => r.map((x) => ({ ...x.a, empresa: x.empresa }))),
  );

  /** Extender la prueba o el período pago (ej. compensación, demo más larga) */
  app.post("/empresas/:id/extender", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { dias, nota } = parse(z.object({ dias: z.coerce.number().int().min(1, "Mínimo 1 día").max(366), nota: z.string().trim().max(300).optional() }), req.body);
    const s = await obtenerSuscripcion(app.db, id);
    const hoy = hoyAr();
    const cambios =
      s.pagoHasta && s.pagoHasta >= s.pruebaHasta
        ? { pagoHasta: sumarDias(s.pagoHasta > hoy ? s.pagoHasta : hoy, dias) }
        : { pruebaHasta: sumarDias(s.pruebaHasta > hoy ? s.pruebaHasta : hoy, dias) };
    await app.db.update(suscripciones).set({ ...cambios, updatedAt: new Date() }).where(eq(suscripciones.empresaId, id));
    await auditar(req, id, "extender", { dias, nota: nota ?? null, ...cambios });
    return estadoDe({ ...s, ...cambios });
  });

  /** Registrar un pago recibido por fuera (transferencia, efectivo) */
  app.post("/empresas/:id/pago-manual", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        periodo: z.enum(["mensual", "anual"]),
        importeArs: z.coerce.number().positive("Importe inválido").max(99_999_999_999, "Importe inválido"),
        nota: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const s = await obtenerSuscripcion(app.db, id);
    const plan = (s.planProximo ?? s.plan) as PlanId;
    const adicionales = s.adicionalesProximos ?? s.usuariosAdicionales;
    const referencia = `MAN-${randomBytes(9).toString("base64url")}`;
    const usd = precioUsd(plan, adicionales, d.periodo);
    await app.db.insert(pagosSuscripcion).values({
      empresaId: id,
      referencia,
      plan,
      periodo: d.periodo,
      usuariosAdicionales: adicionales,
      importeUsd: usd,
      tipoCambio: Math.round((d.importeArs / usd) * 100) / 100,
      importeArs: d.importeArs,
      proveedor: "manual",
    });
    const pago = await aplicarPago(app, referencia, "Aprobado");
    await auditar(req, id, "pago-manual", { referencia, periodo: d.periodo, importeArs: d.importeArs, nota: d.nota ?? null, desde: pago.desde, hasta: pago.hasta });
    return reply.status(201).send(pago);
  });

  app.put("/empresas/:id/plan", async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(z.object({ plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]), usuariosAdicionales: z.coerce.number().int().min(0).max(500) }), req.body);
    const antes = await obtenerSuscripcion(app.db, id);
    await app.db.update(suscripciones).set({ ...d, planProximo: null, adicionalesProximos: null, version: sql`${suscripciones.version} + 1`, updatedAt: new Date() }).where(eq(suscripciones.empresaId, id));
    await auditar(req, id, "cambiar-plan", { de: { plan: antes.plan, usuariosAdicionales: antes.usuariosAdicionales }, a: d });
    return d;
  });

  app.post("/empresas/:id/suspender", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Indicá el motivo").max(500) }), req.body);
    const [e] = await app.db.update(empresas).set({ suspendidaEn: new Date(), motivoSuspension: motivo }).where(eq(empresas.id, id)).returning({ id: empresas.id });
    if (!e) throw notFound("Empresa no encontrada");
    await auditar(req, id, "suspender", { motivo });
    return { suspendida: true };
  });

  app.post("/empresas/:id/reactivar", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [e] = await app.db.update(empresas).set({ suspendidaEn: null, motivoSuspension: null }).where(eq(empresas.id, id)).returning({ id: empresas.id });
    if (!e) throw notFound("Empresa no encontrada");
    await auditar(req, id, "reactivar");
    return { suspendida: false };
  });

  app.get("/solicitudes", async (req) => {
    const { estado } = parse(z.object({ estado: z.enum(["Pendiente", "Resuelta"]).optional() }), req.query);
    return app.db
      .select({ s: solicitudesLegales, empresa: empresas.razonSocial })
      .from(solicitudesLegales)
      .leftJoin(empresas, eq(empresas.id, solicitudesLegales.empresaId))
      .where(estado ? eq(solicitudesLegales.estado, estado) : undefined)
      .orderBy(desc(solicitudesLegales.createdAt))
      .limit(200)
      .then((r) => r.map((x) => ({ ...x.s, empresa: x.empresa })));
  });

  app.post("/solicitudes/:id/resolver", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { nota } = parse(z.object({ nota: z.string().trim().min(3, "Contá cómo se resolvió").max(1000) }), req.body);
    const [s] = await app.db.update(solicitudesLegales).set({ estado: "Resuelta", nota, resueltaEn: new Date() }).where(eq(solicitudesLegales.id, id)).returning();
    if (!s) throw notFound("Solicitud no encontrada");
    await auditar(req, s.empresaId, "resolver-solicitud", { codigo: s.codigo, tipo: s.tipo, nota });
    return s;
  });
};
