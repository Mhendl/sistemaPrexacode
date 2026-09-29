import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { aceptacionesTerminos, empresas, solicitudesLegales } from "../db/schema.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { soloDigitos } from "../lib/cuit.js";
import { parse } from "../lib/errors.js";
import { TERMINOS_VERSION } from "../lib/legal.js";
import { emailSchema } from "../lib/validation.js";

/** Código de constancia legible: BAJA-7K2M9Q / ARRE-… */
export const codigoConstancia = (tipo: "baja" | "arrepentimiento") =>
  `${tipo === "baja" ? "BAJA" : "ARRE"}-${randomBytes(6)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "X")
    .slice(0, 8)}`;

export const ipDe = (req: FastifyRequest) => (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip;

const solicitudSchema = z.object({
  tipo: z.enum(["baja", "arrepentimiento"], { errorMap: () => ({ message: "Tipo inválido" }) }),
  nombre: z.string().trim().min(2, "Indicá tu nombre").max(120),
  email: emailSchema,
  cuit: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? soloDigitos(v) || null : null)),
  motivo: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const legalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({ version: TERMINOS_VERSION }));

  /** ¿La empresa aceptó la versión vigente? (si no, un administrador tiene que aceptarla) */
  app.get("/estado", { preHandler: requireAuth }, async (req) => {
    const [ultima] = await app.db.select().from(aceptacionesTerminos).where(eq(aceptacionesTerminos.empresaId, req.user.empresaId)).orderBy(desc(aceptacionesTerminos.aceptadoEn)).limit(1);
    const [vigente] = await app.db
      .select()
      .from(aceptacionesTerminos)
      .where(and(eq(aceptacionesTerminos.empresaId, req.user.empresaId), eq(aceptacionesTerminos.version, TERMINOS_VERSION)))
      .limit(1);
    return { version: TERMINOS_VERSION, aceptada: !!vigente, aceptadaEn: vigente?.aceptadoEn ?? null, versionAnterior: ultima?.version ?? null };
  });

  app.post("/aceptar", { preHandler: requireAdmin }, async (req) => {
    await app.db.insert(aceptacionesTerminos).values({ empresaId: req.user.empresaId, usuarioId: req.user.sub, version: TERMINOS_VERSION, ip: ipDe(req), userAgent: req.headers["user-agent"] ?? null });
    return { version: TERMINOS_VERSION, aceptada: true };
  });

  /** Solo en el servidor de pruebas automáticas: simular que la empresa aceptó una versión vieja */
  if (app.modoPruebas) {
    app.post("/pruebas/version-vieja", { preHandler: requireAdmin }, async (req) => {
      await app.db.update(aceptacionesTerminos).set({ version: "2020-01-01" }).where(eq(aceptacionesTerminos.empresaId, req.user.empresaId));
      return { ok: true };
    });
  }

  /** Botón de baja / Botón de arrepentimiento: públicos (sin iniciar sesión), con código de constancia */
  app.post("/solicitud", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const d = parse(solicitudSchema, req.body);
    const [emp] = d.cuit ? await app.db.select({ id: empresas.id }).from(empresas).where(eq(empresas.cuit, d.cuit)) : [];
    const codigo = codigoConstancia(d.tipo);
    const [s] = await app.db.insert(solicitudesLegales).values({ ...d, codigo, empresaId: emp?.id ?? null, ip: ipDe(req) }).returning();
    return reply.status(201).send({ codigo: s!.codigo, tipo: s!.tipo, fecha: s!.createdAt });
  });
};
