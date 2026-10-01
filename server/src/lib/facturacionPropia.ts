/**
 * Facturación propia de la plataforma: cada pago aprobado de una suscripción (Prexacode o CoreDental) se factura
 * desde la cuenta del dueño de la plataforma (su CUIT, Factura C de monotributo) a la empresa que pagó,
 * y la factura se le manda por email a sus administradores.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clientes, empresas, pagosSuscripcion, plataformaConfig, roles, suscripciones, usuarios } from "../db/schema.js";
import { configuracionArca } from "./arca/conector.js";
import type { SessionUser } from "./auth.js";
import { hoyAr } from "./cuentas.js";
import { enviarDocumentoPorEmail } from "./documentos.js";
import { marcaDe, nombrePlan } from "./productos.js";
import { sumarDias } from "./suscripcion.js";

export async function configPlataforma(app: FastifyInstance) {
  await app.db.insert(plataformaConfig).values({ id: 1 }).onConflictDoNothing();
  const [c] = await app.db.select().from(plataformaConfig).where(eq(plataformaConfig.id, 1));
  return c!;
}

/** La empresa que factura (la cuenta de la plataforma) */
export async function emisor(app: FastifyInstance) {
  const c = await configPlataforma(app);
  if (!c.emisorEmpresaId) return null;
  const [e] = await app.db.select().from(empresas).where(eq(empresas.id, c.emisorEmpresaId));
  return e ?? null;
}

/** Un ticket para operar como el administrador de la cuenta emisora (sin cerrarle la sesión si está adentro) */
async function tokenEmisor(app: FastifyInstance, empresaId: string) {
  const [u] = await app.db
    .select({ id: usuarios.id, rol: usuarios.rol, sesionId: usuarios.sesionId })
    .from(usuarios)
    .innerJoin(roles, eq(roles.id, usuarios.rolId))
    .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo"), eq(roles.esAdmin, true)))
    .limit(1);
  if (!u) throw new Error("La cuenta emisora no tiene un administrador activo");
  let sid = u.sesionId;
  if (!sid) {
    sid = randomUUID();
    await app.db.update(usuarios).set({ sesionId: sid }).where(eq(usuarios.id, u.id));
  }
  return app.jwt.sign({ sub: u.id, empresaId, rol: u.rol as SessionUser["rol"], sid });
}

/** La cuenta emisora es de la plataforma: nunca queda en solo lectura */
async function mantenerEmisorActivo(app: FastifyInstance, empresaId: string) {
  const [s] = await app.db.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId));
  if (s && s.pruebaHasta < sumarDias(hoyAr(), 60)) await app.db.update(suscripciones).set({ pruebaHasta: sumarDias(hoyAr(), 365) }).where(eq(suscripciones.empresaId, empresaId));
}

const formatoPeriodo = (f: string | null) => (f ? f.split("-").reverse().join("/") : "");

/**
 * Factura un pago aprobado. Devuelve el número de factura o tira el error (que queda anotado en el pago).
 * Si ya estaba facturado, no hace nada.
 */
export const FACTURANDO = "Facturando…";

export async function facturarPagoSuscripcion(app: FastifyInstance, pagoId: string, opts: { forzar?: boolean } = {}): Promise<string> {
  const [antes] = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.id, pagoId));
  if (!antes) throw new Error("Pago no encontrado");
  if (antes.comprobanteId) return antes.facturaNumero ?? "";
  if (antes.estado !== "Aprobado") throw new Error("El pago no está aprobado");
  // Candado: si llegan dos avisos del mismo pago a la vez, factura uno solo
  const [p] = await app.db
    .update(pagosSuscripcion)
    .set({ facturaError: FACTURANDO })
    .where(and(eq(pagosSuscripcion.id, pagoId), isNull(pagosSuscripcion.comprobanteId), opts.forzar ? undefined : or(isNull(pagosSuscripcion.facturaError), ne(pagosSuscripcion.facturaError, FACTURANDO))))
    .returning();
  if (!p) {
    const [ahora] = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.id, pagoId));
    if (ahora?.comprobanteId) return ahora.facturaNumero ?? "";
    throw new Error("Este pago ya se está facturando");
  }
  try {
    const e = await emisor(app);
    if (!e) throw new Error("Falta elegir la cuenta que factura (Facturación propia)");
    if (e.id === p.empresaId) throw new Error("No se factura a sí misma");
    const arca = await configuracionArca(app.db, e.id);
    if (arca.modo !== "produccion" && !app.modoPruebas) throw new Error("La conexión con ARCA no está en producción");
    await mantenerEmisorActivo(app, e.id);
    const [cliente] = await app.db.select().from(empresas).where(eq(empresas.id, p.empresaId));
    if (!cliente) throw new Error("La empresa que pagó ya no existe");
    const admins = await app.db
      .select({ email: usuarios.email })
      .from(usuarios)
      .innerJoin(roles, eq(roles.id, usuarios.rolId))
      .where(and(eq(usuarios.empresaId, cliente.id), eq(usuarios.estado, "Activo"), eq(roles.esAdmin, true)));
    const emailCliente = cliente.email || admins[0]?.email || null;

    const token = await tokenEmisor(app, e.id);
    const pedir = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
      const r = await app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
      if (r.statusCode >= 400) {
        const j = r.json() as { error?: string; details?: Record<string, string> };
        throw new Error([j.error, ...Object.values(j.details ?? {})].filter(Boolean).join(" · ") || `Error ${r.statusCode}`);
      }
      return r.json();
    };

    // El cliente, en la cuenta emisora (por CUIT)
    const [existente] = await app.db.select().from(clientes).where(and(eq(clientes.empresaId, e.id), eq(clientes.cuit, cliente.cuit)));
    const datosCliente = {
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
      condicionIva: cliente.condicionIva,
      email: emailCliente,
      domicilio: [cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") || null,
    };
    const c = existente ?? (await pedir("POST", "/clientes", datosCliente));

    const marca = marcaDe(cliente.producto);
    const concepto =
      p.tipo === "cambio"
        ? `Suscripción ${marca.nombre} · diferencia por cambio de plan o usuarios (${formatoPeriodo(p.desde)} al ${formatoPeriodo(p.hasta)})`
        : `Suscripción ${marca.nombre} · plan ${nombrePlan(cliente.producto, p.plan)}${p.usuariosAdicionales ? ` + ${p.usuariosAdicionales} usuario${p.usuariosAdicionales > 1 ? "s" : ""} adicional${p.usuariosAdicionales > 1 ? "es" : ""}` : ""} · ${p.periodo === "anual" ? "anual" : "mensual"} (${formatoPeriodo(p.desde)} al ${formatoPeriodo(p.hasta)})`;
    const factura = (await pedir("POST", "/comprobantes", {
      clienteId: c.id,
      condicionVenta: "Contado",
      cobro: { medio: p.proveedor === "mercadopago" ? "Mercado Pago" : "Transferencia", referencia: p.proveedorPagoId ?? p.referencia },
      // Servicios: el período facturado es el de la suscripción
      ...(p.desde && p.hasta ? { fechaServicioDesde: p.desde, fechaServicioHasta: p.hasta } : {}),
      observaciones: `Pago ${p.referencia} · USD ${p.importeUsd} al dólar ${p.tipoCambio}`,
      items: [{ descripcion: concepto, cantidad: 1, precioUnitario: p.importeArs, alicuotaIva: 0 }],
    })) as { id: string; tipo: string; puntoVenta: number; numero: number };
    const numero = `${factura.tipo} ${String(factura.puntoVenta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}`;
    await app.db.update(pagosSuscripcion).set({ comprobanteId: factura.id, facturaNumero: numero, facturaError: null }).where(eq(pagosSuscripcion.id, p.id));

    // Se le manda al cliente (no frena si el email falla)
    if (emailCliente) {
      await enviarDocumentoPorEmail(app, { empresaId: e.id, tipo: "comprobante", id: factura.id, para: emailCliente, mensaje: `Gracias por tu pago de ${marca.nombre}. Te dejamos la factura.`, usuarioId: null }).catch((err) =>
        app.log.warn(err, "No se pudo mandar la factura de la suscripción"),
      );
    }
    return numero;
  } catch (err) {
    const msg = (err as Error).message || "No se pudo facturar";
    await app.db.update(pagosSuscripcion).set({ facturaError: msg.slice(0, 500) }).where(eq(pagosSuscripcion.id, p.id));
    throw err;
  }
}

/** Después de aprobarse un pago: si la facturación automática está activa, se factura (sin frenar el pago) */
export async function alAprobarPago(app: FastifyInstance, pagoId: string) {
  const c = await configPlataforma(app);
  if (!c.facturarSuscripciones) return;
  await facturarPagoSuscripcion(app, pagoId).catch((e) => app.log.error(e, "No se pudo facturar el pago de la suscripción"));
}
