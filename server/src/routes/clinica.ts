import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { consentimientos, empresas, pacientes, periodontogramas, plantillasConsentimiento, usuarios } from "../db/schema.js";
import { requireAuth, requirePermiso } from "../lib/auth.js";
import { completarPlantilla, indicesPerio, PIEZAS_PERIO, plantillasDe, type PiezaPerio } from "../lib/clinica.js";
import { hoyAr } from "../lib/cuentas.js";
import { badRequest, conflict, notFound, parse } from "../lib/errors.js";
import { ipDe } from "./legal.js";
import { productoDeEmpresa } from "../lib/productos.js";
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

/** Firma dibujada en pantalla: imagen PNG de hasta 300 KB */
const FIRMA_MAX = 300 * 1024;
const firmaSchema = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "La firma no es válida")
  .refine((f) => {
    const buf = Buffer.from(f.slice(f.indexOf(",") + 1), "base64");
    return buf.length > 100 && buf.length <= FIRMA_MAX && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }, "La firma no es válida o está vacía");

const plantillaSchema = z.object({
  titulo: z.string().trim().min(3, "Poné el título").max(150),
  texto: z.string().trim().min(20, "El texto es muy corto").max(20_000),
  activa: z.boolean().optional(),
});

const sitios = <T extends z.ZodTypeAny>(t: T) => z.array(t).length(6, "Tienen que ser 6 sitios");
const mm = z.number().int().min(-10, "Valor inválido").max(20, "Valor inválido").nullable();
const piezaPerioSchema = z.object({
  ausente: z.boolean().optional(),
  ps: sitios(mm.refine((v) => v === null || v >= 0, "La profundidad no puede ser negativa")),
  mg: sitios(mm),
  sangrado: sitios(z.boolean()),
  placa: sitios(z.boolean()),
  movilidad: z.number().int().min(0).max(3),
  furca: z.number().int().min(0).max(3),
});

/** Consentimientos informados y periodontograma del paciente (CoreDental) */
export const clinicaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });
  const verHistoria = requirePermiso("historia.ver");
  const editarHistoria = requirePermiso("historia.editar");

  const autorDe = async (req: FastifyRequest) => {
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return u?.nombre ?? "Usuario";
  };
  const pacienteDe = async (empresaId: string, id: string) => {
    const [p] = await app.db.select().from(pacientes).where(and(eq(pacientes.id, id), eq(pacientes.empresaId, empresaId)));
    if (!p) throw notFound("Paciente no encontrado");
    return p;
  };

  // ---------------------------------------------------------------- plantillas

  app.get("/consentimientos/plantillas", { preHandler: verHistoria }, async (req) => {
    const lista = await plantillasDe(app.db, req.user.empresaId);
    return [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo));
  });

  app.post("/consentimientos/plantillas", { preHandler: requirePermiso("configuracion") }, async (req, reply) => {
    const d = parse(plantillaSchema, req.body);
    await plantillasDe(app.db, req.user.empresaId);
    const [p] = await app.db.insert(plantillasConsentimiento).values({ ...d, empresaId: req.user.empresaId }).returning();
    return reply.status(201).send(p);
  });

  app.put("/consentimientos/plantillas/:id", { preHandler: requirePermiso("configuracion") }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(plantillaSchema, req.body);
    const [p] = await app.db
      .update(plantillasConsentimiento)
      .set(d)
      .where(and(eq(plantillasConsentimiento.id, id), eq(plantillasConsentimiento.empresaId, req.user.empresaId)))
      .returning();
    if (!p) throw notFound("Plantilla no encontrada");
    return p;
  });

  // ---------------------------------------------------------------- consentimientos del paciente

  /** El texto que va a leer y firmar, ya completado con sus datos */
  app.get("/pacientes/:id/consentimientos/previa", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const { plantillaId } = parse(z.object({ plantillaId: z.string().uuid("Elegí el consentimiento") }), req.query);
    const p = await pacienteDe(req.user.empresaId, id);
    const [pl] = await app.db.select().from(plantillasConsentimiento).where(and(eq(plantillasConsentimiento.id, plantillaId), eq(plantillasConsentimiento.empresaId, req.user.empresaId)));
    if (!pl) throw notFound("Plantilla no encontrada");
    const [e] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia }).from(empresas).where(eq(empresas.id, req.user.empresaId));
    return { titulo: pl.titulo, texto: completarPlantilla(pl.texto, { paciente: `${p.nombre} ${p.apellido}`, dni: p.dni, profesional: await autorDe(req), consultorio: e?.nombreFantasia || e?.razonSocial || "", fecha: hoyAr() }) };
  });

  app.get("/pacientes/:id/consentimientos", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    const lista = await app.db.select().from(consentimientos).where(and(eq(consentimientos.pacienteId, id), eq(consentimientos.empresaId, req.user.empresaId))).orderBy(desc(consentimientos.firmadoEn));
    // En la lista no viajan las firmas (pesan); se ven al abrir cada uno
    return lista.map(({ firmaPaciente: _f, firmaProfesional: _g, texto: _t, ...c }) => c);
  });

  app.get("/pacientes/:id/consentimientos/:cid", { preHandler: verHistoria }, async (req) => {
    const { id, cid } = parse(z.object({ id: z.string().uuid(), cid: z.string().uuid() }), req.params);
    const [c] = await app.db.select().from(consentimientos).where(and(eq(consentimientos.id, cid), eq(consentimientos.pacienteId, id), eq(consentimientos.empresaId, req.user.empresaId)));
    if (!c) throw notFound("Consentimiento no encontrado");
    return c;
  });

  /** Se firma en pantalla: queda el texto tal como se leyó, las firmas, quién, cuándo y desde dónde */
  app.post("/pacientes/:id/consentimientos", { preHandler: editarHistoria, bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        plantillaId: z.string({ required_error: "Elegí el consentimiento" }).uuid("Elegí el consentimiento"),
        vinculo: z.enum(["Paciente", "Madre, padre o tutor", "Representante legal"]).default("Paciente"),
        firmante: texto(120),
        firmanteDni: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((v) => (v ? v.replace(/\D/g, "") : null))
          .refine((v) => v === null || /^\d{7,8}$/.test(v), "DNI inválido"),
        firmaPaciente: firmaSchema,
        firmaProfesional: firmaSchema.optional().nullable(),
      }),
      req.body,
    );
    const p = await pacienteDe(req.user.empresaId, id);
    if (d.vinculo !== "Paciente" && !d.firmante) throw badRequest("Poné el nombre de quien firma", { firmante: "Obligatorio" });
    const [pl] = await app.db.select().from(plantillasConsentimiento).where(and(eq(plantillasConsentimiento.id, d.plantillaId), eq(plantillasConsentimiento.empresaId, req.user.empresaId)));
    if (!pl || !pl.activa) throw badRequest("La plantilla no existe o está desactivada", { plantillaId: "Inválida" });
    const [e] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia }).from(empresas).where(eq(empresas.id, req.user.empresaId));
    const profesional = await autorDe(req);
    const [c] = await app.db
      .insert(consentimientos)
      .values({
        empresaId: req.user.empresaId,
        pacienteId: id,
        plantillaId: pl.id,
        titulo: pl.titulo,
        texto: completarPlantilla(pl.texto, { paciente: `${p.nombre} ${p.apellido}`, dni: p.dni, profesional, consultorio: e?.nombreFantasia || e?.razonSocial || "", fecha: hoyAr() }),
        profesional,
        usuarioId: req.user.sub,
        firmante: d.vinculo === "Paciente" ? `${p.nombre} ${p.apellido}` : d.firmante!,
        firmanteDni: d.vinculo === "Paciente" ? p.dni : d.firmanteDni,
        vinculo: d.vinculo,
        firmaPaciente: d.firmaPaciente,
        firmaProfesional: d.firmaProfesional ?? null,
        ip: ipDe(req),
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      })
      .returning();
    const { firmaPaciente: _f, firmaProfesional: _g, ...resto } = c!;
    return reply.status(201).send(resto);
  });

  /** El paciente puede revocar su consentimiento (Ley 26.529, art. 10): queda registrado, no se borra */
  app.post("/pacientes/:id/consentimientos/:cid/revocar", { preHandler: editarHistoria }, async (req) => {
    const { id, cid } = parse(z.object({ id: z.string().uuid(), cid: z.string().uuid() }), req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Contá el motivo").max(300) }), req.body);
    const [r] = await app.db
      .update(consentimientos)
      .set({ revocadoEn: new Date(), revocadoPor: await autorDe(req), motivoRevocacion: motivo })
      .where(and(eq(consentimientos.id, cid), eq(consentimientos.pacienteId, id), eq(consentimientos.empresaId, req.user.empresaId), isNull(consentimientos.revocadoEn)))
      .returning();
    if (!r) throw conflict("No existe o ya estaba revocado");
    const { firmaPaciente: _f, firmaProfesional: _g, ...resto } = r;
    return resto;
  });

  // ---------------------------------------------------------------- periodontograma

  app.get("/pacientes/:id/periodontogramas", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    const lista = await app.db.select().from(periodontogramas).where(and(eq(periodontogramas.pacienteId, id), eq(periodontogramas.empresaId, req.user.empresaId))).orderBy(asc(periodontogramas.fecha), asc(periodontogramas.createdAt));
    return lista.map((p) => ({ ...p, indices: indicesPerio(p.piezas) }));
  });

  /** Un examen nuevo (no se modifican: para corregir o controlar, se hace otro) */
  app.post("/pacientes/:id/periodontogramas", { preHandler: editarHistoria }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura"),
        notas: texto(2000),
        piezas: z.record(z.string(), piezaPerioSchema).refine((p) => Object.keys(p).every((k) => PIEZAS_PERIO.includes(Number(k))), "Hay piezas inválidas"),
      }),
      req.body,
    );
    await pacienteDe(req.user.empresaId, id);
    const indices = indicesPerio(d.piezas as Record<string, PiezaPerio>);
    if (indices.sitios === 0) throw badRequest("Cargá al menos una medición de profundidad de sondaje");
    const [p] = await app.db
      .insert(periodontogramas)
      .values({ empresaId: req.user.empresaId, pacienteId: id, fecha: d.fecha ?? hoyAr(), profesional: await autorDe(req), usuarioId: req.user.sub, notas: d.notas, piezas: d.piezas as Record<string, PiezaPerio> })
      .returning();
    return reply.status(201).send({ ...p!, indices });
  });
};
