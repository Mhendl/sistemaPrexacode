import { desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { adminsPlataforma, interesados } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { enviarDePlataforma } from "../lib/email/plataforma.js";
import { notFound, parse } from "../lib/errors.js";
import { ipDe } from "./legal.js";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const interesadoSchema = z.object({
  producto: z.enum(["gestion", "dental"]).default("gestion"),
  nombre: z.string().trim().min(2, "Poné tu nombre").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  telefono: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 8, "Poné un teléfono con característica"),
  empresa: texto(160),
  cargo: texto(80),
  tamano: texto(40),
  mensaje: texto(1000),
  origen: texto(500),
  /** Campo trampa para robots */
  sitio: z.string().max(0).optional(),
});

/** Pedidos de demo desde las landings (sin usuario): quedan en el panel de administración y se avisa por email */
export const interesadosPublicosRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { sitio: _s, ...d } = parse(interesadoSchema, req.body);
    const [i] = await app.db.insert(interesados).values({ ...d, ip: ipDe(req) }).returning();
    const marca = d.producto === "dental" ? "CoreDental" : "Prexacode";
    const admins = await app.db.select({ email: adminsPlataforma.email }).from(adminsPlataforma).where(eq(adminsPlataforma.activo, true));
    for (const a of admins) {
      void enviarDePlataforma(app, {
        para: a.email,
        asunto: `Nuevo interesado en ${marca}: ${d.nombre}${d.empresa ? ` (${d.empresa})` : ""}`,
        saludo: "Hola,",
        parrafos: [
          `${d.nombre} pidió una demo de ${marca}.`,
          [`Email: ${d.email}`, `Teléfono: ${d.telefono}`, d.empresa && `Empresa: ${d.empresa}`, d.cargo && `Cargo: ${d.cargo}`, d.tamano && `Tamaño: ${d.tamano}`, d.mensaje && `Mensaje: ${d.mensaje}`, d.origen && `Vino de: ${d.origen}`].filter(Boolean).join("\n"),
          "Conviene responder en el día: es el momento en que más chances hay de que se sume.",
        ],
        boton: { texto: "Ver en el panel", url: `${app.urlDe("gestion")}/admin/interesados` },
        producto: d.producto,
      });
    }
    return reply.status(201).send({ ok: true, id: i!.id });
  });
};

/** Panel de administración: la lista de interesados y su seguimiento */
export const interesadosAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);

  app.get("/", async () => app.db.select().from(interesados).orderBy(desc(interesados.createdAt)).limit(500));

  app.put("/:id", async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const d = parse(z.object({ estado: z.enum(["Nuevo", "Contactado", "Cliente", "Descartado"]), nota: texto(1000) }), req.body);
    const [i] = await app.db.update(interesados).set({ ...d, actualizadoEn: new Date() }).where(eq(interesados.id, id)).returning();
    if (!i) throw notFound("No encontrado");
    return i;
  });
};
