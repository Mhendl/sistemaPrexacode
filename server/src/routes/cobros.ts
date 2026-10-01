import { adminDe } from "./admin.js";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditoriaPlataforma, empresas, pagosSuscripcion, plataformaConfig } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { conflict, notFound, parse } from "../lib/errors.js";
import { configPlataforma } from "../lib/facturacionPropia.js";
import { aplicarPrecios, PLAN_IDS, PLANES, preciosVigentes } from "../lib/precios.js";
import { aplicarPago } from "./suscripcion.js";

const usd = z.coerce.number({ invalid_type_error: "Precio inválido" }).positive("Tiene que ser mayor a cero").max(100_000, "Precio inválido");
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

/** Panel de la plataforma: los precios de los planes y los pagos por transferencia */
export const cobrosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);
  // Queda anotado quién hizo cada cambio (como en el resto del panel)
  const auditar = async (req: FastifyRequest, empresaId: string | null, accion: string, detalle: Record<string, unknown> = {}) =>
    app.db.insert(auditoriaPlataforma).values({ adminEmail: (await adminDe(app, req)).email, empresaId, accion, detalle });

  const pendientes = () =>
    app.db
      .select({ pago: pagosSuscripcion, empresa: empresas.razonSocial, producto: empresas.producto })
      .from(pagosSuscripcion)
      .innerJoin(empresas, eq(empresas.id, pagosSuscripcion.empresaId))
      .where(eq(pagosSuscripcion.proveedor, "transferencia"))
      .orderBy(desc(pagosSuscripcion.createdAt))
      .limit(50);

  const estado = async () => {
    const c = await configPlataforma(app);
    return {
      planes: PLAN_IDS.map((id) => ({ id, nombre: PLANES[id].nombre, precioUsd: PLANES[id].precioUsd, usuarios: PLANES[id].usuarios })),
      usuarioAdicionalUsd: preciosVigentes().usuarioAdicionalUsd,
      mesesCobradosAnual: preciosVigentes().mesesCobradosAnual,
      transferencia: c.transferencia ?? null,
      transferencias: (await pendientes()).map((x) => ({ ...x.pago, empresa: x.empresa, producto: x.producto })),
    };
  };

  app.get("/", async () => estado());

  /** Precios nuevos: rigen para los próximos pagos (lo ya pagado no cambia) */
  app.put("/precios", async (req) => {
    const d = parse(
      z.object({
        planes: z.object({ basico: usd, profesional: usd, empresa: usd }),
        usuarioAdicionalUsd: usd,
        mesesCobradosAnual: z.coerce.number().int().min(1, "Entre 1 y 12").max(12, "Entre 1 y 12"),
      }),
      req.body,
    );
    const antes = preciosVigentes();
    await configPlataforma(app);
    await app.db.update(plataformaConfig).set({ precios: d }).where(eq(plataformaConfig.id, 1));
    aplicarPrecios(d);
    await auditar(req, null, "precios", { antes, despues: d });
    return estado();
  });

  /** Datos de la cuenta para recibir transferencias (sin datos, la opción no se le muestra a los clientes) */
  app.put("/transferencia", async (req) => {
    const d = parse(
      z
        .object({
          titular: z.string().trim().min(3, "Poné el titular de la cuenta").max(120),
          cuit: texto(20),
          banco: texto(80),
          cbu: z
            .string()
            .optional()
            .nullable()
            .transform((v) => (v ? v.replace(/\D/g, "") : null))
            .refine((v) => v === null || v.length === 22, "El CBU o CVU tiene 22 números"),
          alias: z
            .string()
            .trim()
            .optional()
            .nullable()
            .transform((v) => v || null)
            .refine((v) => v === null || /^[a-zA-Z0-9.-]{6,20}$/.test(v), "Alias inválido (6 a 20 letras, números, puntos o guiones)"),
        })
        .nullable()
        .refine((t) => !t || t.cbu || t.alias, { message: "Poné el CBU/CVU o el alias", path: ["cbu"] }),
      // Sin datos (o vacío): se apaga la opción
      req.body ?? null,
    );
    await configPlataforma(app);
    await app.db.update(plataformaConfig).set({ transferencia: d }).where(eq(plataformaConfig.id, 1));
    return estado();
  });

  const transferencia = async (id: string) => {
    const [p] = await app.db.select().from(pagosSuscripcion).where(and(eq(pagosSuscripcion.id, id), eq(pagosSuscripcion.proveedor, "transferencia")));
    if (!p) throw notFound("Transferencia no encontrada");
    if (p.estado !== "Pendiente") throw conflict(`Ya estaba ${p.estado.toLowerCase()}`);
    return p;
  };

  /** Llegó la plata: se le extiende la suscripción (y si la facturación propia está activa, se factura) */
  app.post("/transferencias/:id/confirmar", async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const p = await transferencia(id);
    const pago = await aplicarPago(app, p.referencia, "Aprobado");
    await auditar(req, p.empresaId, "transferencia-confirmada", { referencia: p.referencia, importeArs: p.importeArs, desde: pago.desde, hasta: pago.hasta });
    return estado();
  });

  app.post("/transferencias/:id/rechazar", async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Contá por qué (ej.: no llegó la plata)").max(300) }), req.body);
    const p = await transferencia(id);
    await aplicarPago(app, p.referencia, "Rechazado");
    await auditar(req, p.empresaId, "transferencia-rechazada", { referencia: p.referencia, motivo });
    return estado();
  });
};
