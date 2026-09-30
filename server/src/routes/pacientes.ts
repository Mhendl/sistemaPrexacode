import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { agendaRecursos, eventos, evoluciones, obrasSociales, odontograma, pacienteArchivoDatos, pacienteArchivos, pacientes, prestaciones, usuarios } from "../db/schema.js";
import { requireAuth, requirePermiso, tienePermiso } from "../lib/auth.js";
import { hoyAr } from "../lib/cuentas.js";
import { CARAS, edad, ESTADOS_ODONTOGRAMA, PIEZAS, TIPOS_ARCHIVO } from "../lib/dental.js";
import { badRequest, conflict, edicionConcurrente, esReferenciado, notFound, parse } from "../lib/errors.js";
import { productoDeEmpresa } from "../lib/productos.js";
import { emailSchema, fechaValida, versionSchema } from "../lib/validation.js";

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine(fechaValida, "Esa fecha no existe");
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Hasta ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => v || null);

/** Datos de salud del paciente: solo los ve y los carga quien tiene permiso de historia clínica */
const ANTECEDENTES = ["alergias", "medicacion", "antecedentes", "intervenciones"] as const;

const pacienteSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  apellido: z.string().trim().min(1, "El apellido es obligatorio").max(80),
  dni: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || /^\d{7,8}$/.test(v), "El DNI tiene que tener 7 u 8 números"),
  fechaNacimiento: z
    .union([fechaIso, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || v <= hoyAr(), "La fecha de nacimiento no puede ser futura"),
  sexo: z
    .union([z.enum(["F", "M", "X"]), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  telefono: texto(40),
  email: z
    .union([emailSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  domicilio: texto(200),
  localidad: texto(100),
  obraSocialId: z
    .union([z.string().uuid("Obra social inválida"), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  plan: texto(60),
  numeroAfiliado: texto(60),
  alergias: texto(2000),
  medicacion: texto(2000),
  antecedentes: texto(4000),
  intervenciones: texto(4000),
  notas: texto(2000),
  estado: z.enum(["Activo", "Inactivo"]).optional(),
});

const listaSchema = z.object({ q: z.string().trim().max(100).optional(), estado: z.enum(["Activo", "Inactivo"]).optional() });

/** Error de clave única de Postgres (mismo DNI dos veces en el consultorio) */
const esDuplicado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

const ARCHIVO_MAX_BYTES = 8 * 1024 * 1024;
/** Tipo real del archivo, por su contenido (no por la extensión) */
function tipoReal(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

type PacienteRow = typeof pacientes.$inferSelect;

export const pacientesRoutes: FastifyPluginAsync = async (app) => {
  // Solo para consultorios (CoreDental)
  app.addHook("preHandler", async (req, reply) => {
    await requireAuth(req, reply);
    if ((await productoDeEmpresa(app.db, req.user.empresaId)) !== "dental") throw notFound("Esta sección es de CoreDental");
  });

  const ver = requirePermiso("pacientes.ver");
  const editar = requirePermiso("pacientes.editar");
  const verHistoria = requirePermiso("historia.ver");
  const editarHistoria = requirePermiso("historia.editar");

  /** Sin permiso de historia clínica, los antecedentes (datos de salud) no se muestran */
  const paraUsuario = (req: FastifyRequest, p: PacienteRow & { obraSocial?: string | null }) => {
    const veSalud = tienePermiso(req, "historia.ver");
    const r: Record<string, unknown> = { ...p, edad: edad(p.fechaNacimiento, hoyAr()), veAntecedentes: veSalud };
    if (!veSalud) for (const k of ANTECEDENTES) r[k] = null;
    return r;
  };

  const autorDe = async (req: FastifyRequest) => {
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    return u?.nombre ?? "Usuario";
  };

  const pacienteDe = async (empresaId: string, id: string) => {
    const [p] = await app.db
      .select({ paciente: pacientes, obraSocial: obrasSociales.nombre })
      .from(pacientes)
      .leftJoin(obrasSociales, eq(obrasSociales.id, pacientes.obraSocialId))
      .where(and(eq(pacientes.id, id), eq(pacientes.empresaId, empresaId)));
    if (!p) throw notFound("Paciente no encontrado");
    return { ...p.paciente, obraSocial: p.obraSocial };
  };

  const validarObraSocial = async (empresaId: string, id: string | null) => {
    if (!id) return;
    const [o] = await app.db.select({ id: obrasSociales.id }).from(obrasSociales).where(and(eq(obrasSociales.id, id), eq(obrasSociales.empresaId, empresaId)));
    if (!o) throw badRequest("La obra social no existe", { obraSocialId: "Inválida" });
  };

  /** Los antecedentes solo los carga quien tiene permiso de historia clínica: si no, se dejan como estaban */
  const sinAntecedentesAjenos = (req: FastifyRequest, d: z.infer<typeof pacienteSchema>) => {
    if (tienePermiso(req, "historia.editar")) return d;
    const r = { ...d } as Partial<typeof d>;
    for (const k of ANTECEDENTES) delete r[k];
    return r;
  };

  // ---------------------------------------------------------------- obras sociales (para elegir en la ficha)

  app.get("/obras-sociales", { preHandler: ver }, async (req) =>
    app.db.select().from(obrasSociales).where(eq(obrasSociales.empresaId, req.user.empresaId)).orderBy(asc(obrasSociales.nombre)),
  );

  app.post("/obras-sociales", { preHandler: editar }, async (req, reply) => {
    const { nombre } = parse(z.object({ nombre: z.string().trim().min(2, "Poné el nombre").max(80) }), req.body);
    const [existe] = await app.db.select().from(obrasSociales).where(and(eq(obrasSociales.empresaId, req.user.empresaId), sql`lower(${obrasSociales.nombre}) = lower(${nombre})`));
    if (existe) return reply.status(200).send(existe);
    const [o] = await app.db.insert(obrasSociales).values({ empresaId: req.user.empresaId, nombre }).returning();
    return reply.status(201).send(o);
  });

  // ---------------------------------------------------------------- pacientes

  app.get("/", { preHandler: ver }, async (req) => {
    const { q, estado } = parse(listaSchema, req.query);
    const filtros: SQL[] = [eq(pacientes.empresaId, req.user.empresaId)];
    if (estado) filtros.push(eq(pacientes.estado, estado));
    if (q) {
      const like = `%${q}%`;
      const digitos = q.replace(/\D/g, "");
      filtros.push(
        or(
          ilike(pacientes.apellido, like),
          ilike(pacientes.nombre, like),
          ilike(sql`${pacientes.apellido} || ' ' || ${pacientes.nombre}`, like),
          ilike(sql`${pacientes.nombre} || ' ' || ${pacientes.apellido}`, like),
          ...(digitos.length >= 3 ? [ilike(pacientes.dni, `%${digitos}%`)] : []),
          ilike(pacientes.telefono, like),
        )!,
      );
    }
    const filas = await app.db
      .select({
        id: pacientes.id,
        nombre: pacientes.nombre,
        apellido: pacientes.apellido,
        dni: pacientes.dni,
        telefono: pacientes.telefono,
        email: pacientes.email,
        fechaNacimiento: pacientes.fechaNacimiento,
        obraSocial: obrasSociales.nombre,
        plan: pacientes.plan,
        datosPendientes: pacientes.datosPendientes,
        estado: pacientes.estado,
        createdAt: pacientes.createdAt,
      })
      .from(pacientes)
      .leftJoin(obrasSociales, eq(obrasSociales.id, pacientes.obraSocialId))
      .where(and(...filtros))
      .orderBy(asc(pacientes.apellido), asc(pacientes.nombre))
      .limit(q ? 50 : 5000);
    const hoy = hoyAr();
    return filas.map((f) => ({ ...f, edad: edad(f.fechaNacimiento, hoy) }));
  });

  app.get("/:id", { preHandler: ver }, async (req) => {
    const { id } = parse(idSchema, req.params);
    return paraUsuario(req, await pacienteDe(req.user.empresaId, id));
  });

  app.post("/", { preHandler: editar }, async (req, reply) => {
    const d = sinAntecedentesAjenos(req, parse(pacienteSchema, req.body));
    await validarObraSocial(req.user.empresaId, d.obraSocialId ?? null);
    try {
      const [p] = await app.db
        .insert(pacientes)
        .values({ ...(d as z.infer<typeof pacienteSchema>), empresaId: req.user.empresaId, datosPendientes: !d.dni })
        .returning();
      return reply.status(201).send(paraUsuario(req, await pacienteDe(req.user.empresaId, p!.id)));
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay un paciente con ese DNI", { dni: "Ya existe" });
      throw e;
    }
  });

  app.put("/:id", { preHandler: editar }, async (req) => {
    const { id } = parse(idSchema, req.params);
    const d = sinAntecedentesAjenos(req, parse(pacienteSchema, req.body));
    const { version } = parse(versionSchema, req.body);
    await validarObraSocial(req.user.empresaId, d.obraSocialId ?? null);
    const filtros: SQL[] = [eq(pacientes.id, id), eq(pacientes.empresaId, req.user.empresaId)];
    await pacienteDe(req.user.empresaId, id);
    if (version) filtros.push(eq(pacientes.version, version));
    try {
      const [p] = await app.db
        .update(pacientes)
        .set({ ...d, datosPendientes: !d.dni, version: sql`${pacientes.version} + 1`, updatedAt: new Date() })
        .where(and(...filtros))
        .returning();
      if (!p) throw edicionConcurrente("este paciente");
      return paraUsuario(req, await pacienteDe(req.user.empresaId, id));
    } catch (e) {
      if (esDuplicado(e)) throw conflict("Ya hay un paciente con ese DNI", { dni: "Ya existe" });
      throw e;
    }
  });

  /** Solo se borra un paciente sin historia: si ya tiene registros clínicos o turnos, se pasa a inactivo */
  app.delete("/:id", { preHandler: editar }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    const [[turnos]] = await Promise.all([app.db.select({ n: count() }).from(eventos).where(eq(eventos.pacienteId, id))]);
    if (Number(turnos?.n ?? 0) > 0) throw conflict("El paciente tiene turnos. Pasalo a Inactivo en lugar de borrarlo.");
    try {
      await app.db.delete(pacientes).where(and(eq(pacientes.id, id), eq(pacientes.empresaId, req.user.empresaId)));
    } catch (e) {
      if (esReferenciado(e)) throw conflict("El paciente tiene historia clínica. No se puede borrar: pasalo a Inactivo (la ley obliga a conservarla).");
      throw e;
    }
    return reply.status(204).send();
  });

  /** Turnos del paciente (últimos y próximos) */
  app.get("/:id/turnos", { preHandler: ver }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    return app.db
      .select({ id: eventos.id, fecha: eventos.fecha, inicio: eventos.inicio, fin: eventos.fin, estado: eventos.estado, tipo: eventos.tipo, profesional: agendaRecursos.nombre, notas: eventos.notas })
      .from(eventos)
      .innerJoin(agendaRecursos, eq(agendaRecursos.id, eventos.recursoId))
      .where(and(eq(eventos.pacienteId, id), eq(eventos.empresaId, req.user.empresaId)))
      .orderBy(desc(eventos.fecha), desc(eventos.inicio))
      .limit(200);
  });

  // ---------------------------------------------------------------- historia clínica (evoluciones)

  app.get("/:id/evoluciones", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    return app.db.select().from(evoluciones).where(and(eq(evoluciones.pacienteId, id), eq(evoluciones.empresaId, req.user.empresaId))).orderBy(desc(evoluciones.fecha), desc(evoluciones.createdAt));
  });

  /** Una evolución nueva. No hay edición ni borrado: la historia clínica es inalterable (Ley 26.529) */
  app.post("/:id/evoluciones", { preHandler: editarHistoria }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        texto: z.string().trim().min(3, "Escribí la evolución").max(10_000, "Hasta 10.000 caracteres"),
        fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "No se puede cargar una evolución con fecha futura"),
      }),
      req.body,
    );
    await pacienteDe(req.user.empresaId, id);
    const [e] = await app.db
      .insert(evoluciones)
      .values({ empresaId: req.user.empresaId, pacienteId: id, texto: d.texto, fecha: d.fecha ?? hoyAr(), usuarioId: req.user.sub, autor: await autorDe(req) })
      .returning();
    return reply.status(201).send(e);
  });

  // ---------------------------------------------------------------- radiografías, fotos y estudios

  app.get("/:id/archivos", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    return app.db.select().from(pacienteArchivos).where(and(eq(pacienteArchivos.pacienteId, id), eq(pacienteArchivos.empresaId, req.user.empresaId))).orderBy(desc(pacienteArchivos.fecha), desc(pacienteArchivos.createdAt));
  });

  app.post("/:id/archivos", { preHandler: editarHistoria, bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        datos: z.string().min(1, "Falta el archivo"),
        nombreArchivo: z.string().trim().min(1).max(200),
        tipo: z.enum(TIPOS_ARCHIVO, { errorMap: () => ({ message: "Tipo inválido" }) }),
        descripcion: texto(300),
        fecha: fechaIso.optional(),
      }),
      req.body,
    );
    await pacienteDe(req.user.empresaId, id);
    const buf = Buffer.from(d.datos.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buf.length === 0) throw badRequest("El archivo está vacío");
    if (buf.length > ARCHIVO_MAX_BYTES) throw badRequest("El archivo no puede pesar más de 8 MB");
    const mime = tipoReal(buf);
    if (!mime) throw badRequest("Formato no admitido. Subí una imagen (JPG, PNG, WEBP) o un PDF.");
    const autor = await autorDe(req);
    const a = await app.db.transaction(async (tx) => {
      const [a] = await tx
        .insert(pacienteArchivos)
        .values({ empresaId: req.user.empresaId, pacienteId: id, tipo: d.tipo, descripcion: d.descripcion, nombreArchivo: d.nombreArchivo, mime, tamano: buf.length, fecha: d.fecha ?? hoyAr(), usuarioId: req.user.sub, autor })
        .returning();
      await tx.insert(pacienteArchivoDatos).values({ archivoId: a!.id, datos: buf.toString("base64") });
      return a!;
    });
    return reply.status(201).send(a);
  });

  /** El contenido: con sesión y permiso (son datos de salud). Nunca queda guardado en el navegador. */
  app.get("/:id/archivos/:archivoId", { preHandler: verHistoria }, async (req, reply) => {
    const { id, archivoId } = parse(z.object({ id: z.string().uuid(), archivoId: z.string().uuid() }), req.params);
    const [a] = await app.db
      .select({ mime: pacienteArchivos.mime, nombre: pacienteArchivos.nombreArchivo, datos: pacienteArchivoDatos.datos })
      .from(pacienteArchivos)
      .innerJoin(pacienteArchivoDatos, eq(pacienteArchivoDatos.archivoId, pacienteArchivos.id))
      .where(and(eq(pacienteArchivos.id, archivoId), eq(pacienteArchivos.pacienteId, id), eq(pacienteArchivos.empresaId, req.user.empresaId)));
    if (!a) throw notFound("Archivo no encontrado");
    return reply
      .header("content-type", a.mime)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `inline; filename="${encodeURIComponent(a.nombre)}"`)
      .send(Buffer.from(a.datos, "base64"));
  });

  /** Un archivo subido por error (por ejemplo, a otro paciente) se puede quitar */
  app.delete("/:id/archivos/:archivoId", { preHandler: editarHistoria }, async (req, reply) => {
    const { id, archivoId } = parse(z.object({ id: z.string().uuid(), archivoId: z.string().uuid() }), req.params);
    const r = await app.db
      .delete(pacienteArchivos)
      .where(and(eq(pacienteArchivos.id, archivoId), eq(pacienteArchivos.pacienteId, id), eq(pacienteArchivos.empresaId, req.user.empresaId)))
      .returning({ id: pacienteArchivos.id });
    if (!r.length) throw notFound("Archivo no encontrado");
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- odontograma

  app.get("/:id/odontograma", { preHandler: verHistoria }, async (req) => {
    const { id } = parse(idSchema, req.params);
    await pacienteDe(req.user.empresaId, id);
    const filas = await app.db
      .select({ marca: odontograma, prestacion: { codigo: prestaciones.codigo, nombre: prestaciones.nombre, alcance: prestaciones.alcance, simbolo: prestaciones.simbolo, etiqueta: prestaciones.etiqueta } })
      .from(odontograma)
      .innerJoin(prestaciones, eq(prestaciones.id, odontograma.prestacionId))
      .where(and(eq(odontograma.pacienteId, id), eq(odontograma.empresaId, req.user.empresaId)))
      .orderBy(asc(odontograma.createdAt));
    return filas.map((f) => ({ ...f.marca, prestacion: f.prestacion }));
  });

  /** Marca una prestación en una o varias piezas (por ejemplo, la misma caries en tres piezas) */
  app.post("/:id/odontograma", { preHandler: editarHistoria }, async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const d = parse(
      z.object({
        prestacionId: z.string({ required_error: "Elegí la prestación" }).uuid("Elegí la prestación"),
        piezas: z
          .array(z.number().int().refine((p) => PIEZAS.includes(p), "Pieza inválida"))
          .min(1, "Elegí al menos una pieza")
          .max(52)
          .transform((ps) => [...new Set(ps)]),
        caras: z.array(z.enum(CARAS, { errorMap: () => ({ message: "Cara inválida" }) })).max(5).default([]).transform((cs) => [...new Set(cs)]),
        estado: z.enum(ESTADOS_ODONTOGRAMA, { errorMap: () => ({ message: "Estado inválido" }) }),
        fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura"),
        notas: texto(500),
      }),
      req.body,
    );
    await pacienteDe(req.user.empresaId, id);
    const [p] = await app.db.select().from(prestaciones).where(and(eq(prestaciones.id, d.prestacionId), eq(prestaciones.empresaId, req.user.empresaId)));
    if (!p || !p.activa) throw badRequest("La prestación no existe o está desactivada", { prestacionId: "Inválida" });
    if (p.alcance === "general") throw badRequest(`"${p.nombre}" no se marca en el odontograma`, { prestacionId: "No va al odontograma" });
    if (p.alcance === "cara" && d.caras.length === 0) throw badRequest("Elegí en qué caras", { caras: "Obligatorio" });
    const caras = p.alcance === "cara" ? d.caras : [];
    const autor = await autorDe(req);
    const fecha = d.fecha ?? hoyAr();
    const marcas = await app.db
      .insert(odontograma)
      .values(
        d.piezas.map((pieza) => ({
          empresaId: req.user.empresaId,
          pacienteId: id,
          prestacionId: p.id,
          pieza,
          caras,
          estado: d.estado,
          fecha,
          notas: d.notas,
          usuarioId: req.user.sub,
          autor,
          ...(d.estado === "realizado" ? { realizadoEn: fecha, realizadoPor: autor } : {}),
        })),
      )
      .returning();
    return reply.status(201).send(marcas);
  });

  const marcaDe = async (empresaId: string, pacienteId: string, marcaId: string) => {
    const [m] = await app.db.select().from(odontograma).where(and(eq(odontograma.id, marcaId), eq(odontograma.pacienteId, pacienteId), eq(odontograma.empresaId, empresaId)));
    if (!m) throw notFound("Marca no encontrada");
    if (m.anuladoEn) throw conflict("Esa marca está anulada");
    return m;
  };

  /** Lo que estaba "a realizar" ya se hizo */
  app.post("/:id/odontograma/:marcaId/realizar", { preHandler: editarHistoria }, async (req) => {
    const { id, marcaId } = parse(z.object({ id: z.string().uuid(), marcaId: z.string().uuid() }), req.params);
    const { fecha } = parse(z.object({ fecha: fechaIso.optional().refine((f) => !f || f <= hoyAr(), "La fecha no puede ser futura") }), req.body ?? {});
    const m = await marcaDe(req.user.empresaId, id, marcaId);
    if (m.estado !== "a_realizar") throw conflict("Solo se puede marcar como realizado lo que estaba a realizar");
    const [r] = await app.db
      .update(odontograma)
      .set({ estado: "realizado", realizadoEn: fecha ?? hoyAr(), realizadoPor: await autorDe(req), version: sql`${odontograma.version} + 1` })
      .where(and(eq(odontograma.id, marcaId), eq(odontograma.estado, "a_realizar"), isNull(odontograma.anuladoEn)))
      .returning();
    if (!r) throw conflict("Otra persona la modificó recién. Actualizá la pantalla.");
    return r;
  });

  /** Una marca cargada por error no se borra: se anula con el motivo y queda en el historial */
  app.post("/:id/odontograma/:marcaId/anular", { preHandler: editarHistoria }, async (req) => {
    const { id, marcaId } = parse(z.object({ id: z.string().uuid(), marcaId: z.string().uuid() }), req.params);
    const { motivo } = parse(z.object({ motivo: z.string().trim().min(3, "Contá por qué se anula").max(300) }), req.body);
    await marcaDe(req.user.empresaId, id, marcaId);
    const [r] = await app.db
      .update(odontograma)
      .set({ anuladoEn: new Date(), anuladoPor: await autorDe(req), motivoAnulacion: motivo, version: sql`${odontograma.version} + 1` })
      .where(and(eq(odontograma.id, marcaId), isNull(odontograma.anuladoEn)))
      .returning();
    if (!r) throw conflict("Otra persona la modificó recién. Actualizá la pantalla.");
    return r;
  });
};
