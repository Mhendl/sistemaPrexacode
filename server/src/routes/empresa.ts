import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { empresaLogos, empresas } from "../db/schema.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { badRequest, notFound, parse } from "../lib/errors.js";
import { condicionIvaSchema, emailSchema, fechaValida } from "../lib/validation.js";

const opcional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const empresaSchema = z.object({
  razonSocial: z.string().trim().min(2, "La razón social es obligatoria").max(200),
  nombreFantasia: opcional(),
  condicionIva: condicionIvaSchema,
  ingresosBrutos: opcional(40),
  inicioActividades: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  domicilio: opcional(),
  localidad: opcional(100),
  codigoPostal: opcional(15),
  telefono: opcional(40),
  email: z
    .union([emailSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
});

export const LOGO_MAX_BYTES = 500 * 1024;
const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"] as const;

/** Firma de los primeros bytes de cada formato: no confiamos solo en el mime que manda el navegador */
function formatoReal(buf: Buffer): (typeof TIPOS_LOGO)[number] | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const logoSchema = z.object({
  datos: z.string().min(1, "Falta la imagen"),
});

export const empresaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requireAuth }, async (req) => {
    const [e] = await app.db.select().from(empresas).where(eq(empresas.id, req.user.empresaId));
    if (!e) throw notFound();
    return e;
  });

  app.put("/", { preHandler: requirePermiso("configuracion") }, async (req) => {
    const datos = parse(empresaSchema, req.body);
    const [e] = await app.db.update(empresas).set(datos).where(eq(empresas.id, req.user.empresaId)).returning();
    return e;
  });

  /** Subida del logo como base64 (PNG, JPG o WEBP, hasta 500 KB) */
  app.put("/logo", { preHandler: requirePermiso("configuracion"), bodyLimit: 1024 * 1024 }, async (req) => {
    const { datos } = parse(logoSchema, req.body);
    const base64 = datos.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(base64, "base64");
    if (buf.length === 0) throw badRequest("La imagen está vacía");
    if (buf.length > LOGO_MAX_BYTES) throw badRequest("El logo no puede pesar más de 500 KB");
    const mime = formatoReal(buf);
    if (!mime) throw badRequest("Formato no admitido. Subí una imagen PNG, JPG o WEBP.");

    await app.db.transaction(async (tx) => {
      await tx
        .insert(empresaLogos)
        .values({ empresaId: req.user.empresaId, mime, datos: buf.toString("base64") })
        .onConflictDoUpdate({ target: empresaLogos.empresaId, set: { mime, datos: buf.toString("base64") } });
      await tx.update(empresas).set({ logoActualizado: new Date() }).where(eq(empresas.id, req.user.empresaId));
    });
    const [e] = await app.db.select().from(empresas).where(eq(empresas.id, req.user.empresaId));
    return e;
  });

  app.delete("/logo", { preHandler: requirePermiso("configuracion") }, async (req) => {
    await app.db.delete(empresaLogos).where(eq(empresaLogos.empresaId, req.user.empresaId));
    const [e] = await app.db.update(empresas).set({ logoActualizado: null }).where(eq(empresas.id, req.user.empresaId)).returning();
    return e;
  });
};

/**
 * Logo público por id de empresa: lo usan los <img> (que no mandan el token)
 * y los comprobantes. Un logo no es un dato sensible: va impreso en cada factura.
 */
export const logoPublicoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:id/logo", async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid("Id inválido") }), req.params);
    const [l] = await app.db.select().from(empresaLogos).where(eq(empresaLogos.empresaId, id));
    if (!l) throw notFound("La empresa no tiene logo");
    return reply
      .header("content-type", l.mime)
      .header("cache-control", "public, max-age=86400")
      .header("x-content-type-options", "nosniff")
      .send(Buffer.from(l.datos, "base64"));
  });
};
