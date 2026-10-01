import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { empresas, pagosSuscripcion, plataformaConfig, puntosVenta } from "../db/schema.js";
import { configuracionArca } from "../lib/arca/conector.js";
import { requirePlataforma } from "../lib/auth.js";
import { resumenDocumento } from "../lib/documentos.js";
import { badRequest, conflict, HttpError, notFound, parse } from "../lib/errors.js";
import { configPlataforma, emisor, facturarPagoSuscripcion } from "../lib/facturacionPropia.js";
import { rutasArca } from "./arca.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });

/** Panel de la plataforma: la facturación de las suscripciones (Factura C del dueño a cada empresa que paga) */
export const facturacionPropiaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);

  const estado = async () => {
    const c = await configPlataforma(app);
    const e = await emisor(app);
    const arca = e ? await configuracionArca(app.db, e.id) : null;
    const pvs = e ? await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, e.id), eq(puntosVenta.activo, true))) : [];
    const pagos = await app.db
      .select({ pago: pagosSuscripcion, empresa: empresas.razonSocial, producto: empresas.producto })
      .from(pagosSuscripcion)
      .innerJoin(empresas, eq(empresas.id, pagosSuscripcion.empresaId))
      .where(eq(pagosSuscripcion.estado, "Aprobado"))
      .orderBy(desc(pagosSuscripcion.aprobadoAt))
      .limit(100);
    return {
      facturarSuscripciones: c.facturarSuscripciones,
      emisor: e ? { id: e.id, razonSocial: e.razonSocial, cuit: e.cuit, condicionIva: e.condicionIva, domicilio: e.domicilio, localidad: e.localidad, nombreFantasia: e.nombreFantasia } : null,
      modoArca: arca?.modo ?? null,
      puntosVenta: pvs.map((p) => p.numero),
      pagos: pagos
        .filter((x) => x.pago.empresaId !== e?.id)
        .map((x) => ({
          id: x.pago.id,
          empresa: x.empresa,
          producto: x.producto,
          plan: x.pago.plan,
          periodo: x.pago.periodo,
          importeArs: x.pago.importeArs,
          proveedor: x.pago.proveedor,
          aprobadoAt: x.pago.aprobadoAt,
          facturaNumero: x.pago.facturaNumero,
          facturaError: x.pago.facturaError,
          facturado: !!x.pago.comprobanteId,
        })),
    };
  };

  app.get("/", async () => estado());

  /** Cuál es la cuenta que factura: la de la plataforma, por su CUIT */
  app.post("/emisor", async (req) => {
    const { cuit } = parse(z.object({ cuit: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 11, "CUIT inválido") }), req.body);
    const [e] = await app.db.select().from(empresas).where(eq(empresas.cuit, cuit));
    if (!e) throw notFound("No hay una cuenta con ese CUIT. Creala primero (registro de Prexacode).");
    await configPlataforma(app);
    await app.db.update(plataformaConfig).set({ emisorEmpresaId: e.id }).where(eq(plataformaConfig.id, 1));
    return estado();
  });

  /** Datos del emisor que salen en la factura (tienen que coincidir con ARCA) */
  app.put("/emisor", async (req) => {
    const d = parse(
      z.object({
        razonSocial: z.string().trim().min(2, "Poné tu nombre como figura en ARCA").max(200),
        nombreFantasia: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
        domicilio: z.string().trim().min(3, "Poné el domicilio fiscal").max(200),
        localidad: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
      }),
      req.body,
    );
    const e = await emisor(app);
    if (!e) throw badRequest("Primero elegí la cuenta que factura");
    await app.db.update(empresas).set(d).where(eq(empresas.id, e.id));
    return estado();
  });

  /** El punto de venta de ARCA (tipo Web Services) con el que se factura */
  app.put("/punto-venta", async (req) => {
    const { numero } = parse(z.object({ numero: z.coerce.number().int().min(1, "Entre 1 y 99998").max(99998, "Entre 1 y 99998") }), req.body);
    const e = await emisor(app);
    if (!e) throw badRequest("Primero elegí la cuenta que factura");
    await configuracionArca(app.db, e.id);
    await app.db.update(puntosVenta).set({ activo: false }).where(eq(puntosVenta.empresaId, e.id));
    const [ya] = await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, e.id), eq(puntosVenta.numero, numero)));
    if (ya) await app.db.update(puntosVenta).set({ activo: true }).where(eq(puntosVenta.id, ya.id));
    else await app.db.insert(puntosVenta).values({ empresaId: e.id, numero, nombre: "Web Services", activo: true });
    return estado();
  });

  /** Facturar sola cada suscripción que se cobra: solo con ARCA en producción y la conexión probada */
  app.put("/automatica", async (req) => {
    const { activa } = parse(z.object({ activa: z.boolean() }), req.body);
    if (activa) {
      const e = await emisor(app);
      if (!e) throw badRequest("Primero elegí la cuenta que factura");
      const arca = await configuracionArca(app.db, e.id);
      if (arca.modo !== "produccion" && !app.modoPruebas) throw badRequest("Primero conectá ARCA en producción y probá la conexión");
      if (arca.modo !== "simulado" && !arca.ultimaConexion) throw badRequest("Probá la conexión con ARCA antes de activarla");
    }
    await configPlataforma(app);
    await app.db.update(plataformaConfig).set({ facturarSuscripciones: activa }).where(eq(plataformaConfig.id, 1));
    return estado();
  });

  /** Facturar a mano un pago (por ejemplo, uno anterior a activar la automática, o reintentar uno que falló) */
  app.post("/pagos/:id/facturar", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { forzar } = parse(z.object({ forzar: z.boolean().default(false) }), req.body ?? {});
    try {
      const numero = await facturarPagoSuscripcion(app, id, { forzar });
      return { numero };
    } catch (e) {
      const msg = (e as Error).message;
      if (/ya se está facturando/.test(msg)) throw conflict(msg);
      throw new HttpError(502, `No se pudo facturar: ${msg}`);
    }
  });

  /** Link para ver o imprimir la factura de un pago */
  app.get("/pagos/:id/factura", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [p] = await app.db.select().from(pagosSuscripcion).where(eq(pagosSuscripcion.id, id));
    const e = await emisor(app);
    if (!p?.comprobanteId || !e) throw notFound("Ese pago no tiene factura");
    const r = await resumenDocumento(app, e.id, "comprobante", p.comprobanteId);
    if (!r) throw notFound("La factura no está disponible");
    return { url: r.url };
  });

  // La conexión con ARCA de la cuenta emisora (pedido de certificado, certificado, modo y prueba)
  await app.register(
    rutasArca({
      preHandler: async () => {},
      empresaDelPedido: async (a) => {
        const e = await emisor(a);
        if (!e) throw badRequest("Primero elegí la cuenta que factura");
        return e.id;
      },
    }),
    { prefix: "/arca" },
  );
};
