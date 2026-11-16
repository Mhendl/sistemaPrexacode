import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { adminsPlataforma, interesados, prospectos } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { enviarDePlataforma } from "../lib/email/plataforma.js";
import { notFound, parse } from "../lib/errors.js";
import { ipDe } from "./legal.js";
import { PLANES } from "../lib/precios.js";
import { nombrePlan } from "../lib/productos.js";
import { promoPublica } from "../lib/promo.js";

/** A dónde responde quien recibe el email de la demo: la casilla de cada producto */
const RESPONDER_A = { gestion: "sistema@prexacode.com", dental: "martin@coredental.com.ar" } as const;

/** El email que recibe en el momento quien pide una demo: cómo empezar, qué incluye, los precios y cómo consultarnos */
export function emailDeDemo(producto: "gestion" | "dental", nombre: string, empresa: string | null) {
  const dental = producto === "dental";
  const marca = dental ? "CoreDental" : "Prexacode";
  const registro = dental ? "https://app.coredental.com.ar/registro" : "https://sistema.prexacode.com/registro";
  const pagina = dental ? "coredental.com.ar" : "productos.prexacode.com";
  const plan = (id: "basico" | "profesional" | "empresa") => `${nombrePlan(producto, id)} (${PLANES[id].usuarios} usuarios, USD ${PLANES[id].precioUsd} por mes)`;
  // "Dra. Ana Gómez" → "Dra. Ana"
  const partes = nombre.trim().split(/\s+/);
  const quien = /^(dr|dra|lic|ing|sr|sra|od|prof)\.?$/i.test(partes[0] ?? "") && partes[1] ? `${partes[0]} ${partes[1]}` : (partes[0] ?? "");
  const promo = promoPublica.vigente ? ` Y por el lanzamiento, ${promoPublica.vigente.pagos === 1 ? "el primer mes tiene" : `los primeros ${promoPublica.vigente.pagos} meses tienen`} ${promoPublica.vigente.descuentoPct} % de descuento.` : "";
  return {
    asunto: `Tu demo de ${marca}, ${quien}`,
    saludo: `Hola ${quien},`,
    parrafos: [
      `Soy Martín Hendl, el creador de ${marca}. Vi que pediste una demo${empresa ? ` para ${empresa}` : ""}: ¡gracias por el interés!`,
      `Lo más rápido es que lo veas funcionando con ${dental ? "tu propio consultorio" : "tu propio negocio"}: creás la cuenta en 2 minutos y lo usás 14 días gratis, sin tarjeta.`,
      dental
        ? "Vas a encontrar: la agenda de cada profesional con turnos online y recordatorios; la historia clínica con odontograma; las obras sociales con la liquidación de fin de mes; y cobros, caja diaria, presupuestos y facturación con ARCA. Si tenés tus pacientes en un Excel, los subís vos mismo desde «Importar y exportar»."
        : "Vas a encontrar: facturación electrónica con ARCA, stock que se descuenta solo, cuentas corrientes y cobranzas, caja diaria, presupuestos, remitos y reportes. Si tenés tus clientes y productos en un Excel, los subís vos mismo desde «Importar y exportar».",
      "Cada pantalla tiene una guía (el ícono de la brújula, arriba) que te muestra para qué sirve cada cosa.",
      `Los precios, para que los tengas: ${plan("basico")}, ${plan("profesional")} o ${plan("empresa")}, todos con todas las funciones. Se paga en pesos al dólar oficial y lo das de baja cuando quieras.${promo}`,
      "Si preferís que te lo muestre yo, lo vemos en 15 minutos por videollamada o por teléfono: respondeme este email con un día y un horario que te queden cómodos.",
      `Y cualquier consulta, respondé este email o escribinos por el chat de la página (${pagina}).`,
    ],
    boton: { texto: "Crear mi cuenta gratis", url: registro },
    pie: `Martín Hendl · ${marca}`,
    producto,
    responderA: RESPONDER_A[producto],
  };
}

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
    // Si llegó desde un email de prospección (?r=…), esa persona sale de la secuencia: ya respondió
    const ref = /[?&]r=([A-Za-z0-9_-]{10,40})/.exec(d.origen ?? "")?.[1];
    if (ref) {
      await app.db
        .update(prospectos)
        .set({ estado: "Respondió", nota: "Pidió una demo desde la landing" })
        .where(and(eq(prospectos.token, ref), inArray(prospectos.estado, ["Pendiente", "En curso", "Terminado"])));
    }
    const marca = d.producto === "dental" ? "CoreDental" : "Prexacode";
    // A quien la pidió le llega en el momento el email con cómo empezar, los precios y cómo consultarnos
    void enviarDePlataforma(app, { para: d.email, ...emailDeDemo(d.producto === "dental" ? "dental" : "gestion", d.nombre, d.empresa ?? null) }).then((ok) =>
      app.db.update(interesados).set({ nota: ok ? "Se le mandó sola la respuesta con los datos y el link para registrarse" : "No se le pudo mandar la respuesta automática: escribile a mano" }).where(eq(interesados.id, i!.id)),
    );
    const admins = await app.db.select({ email: adminsPlataforma.email }).from(adminsPlataforma).where(eq(adminsPlataforma.activo, true));
    for (const a of admins) {
      void enviarDePlataforma(app, {
        para: a.email,
        asunto: `Nuevo interesado en ${marca}: ${d.nombre}${d.empresa ? ` (${d.empresa})` : ""}`,
        saludo: "Hola,",
        parrafos: [
          `${d.nombre} pidió una demo de ${marca}.`,
          [`Email: ${d.email}`, `Teléfono: ${d.telefono}`, d.empresa && `Empresa: ${d.empresa}`, d.cargo && `Cargo: ${d.cargo}`, d.tamano && `Tamaño: ${d.tamano}`, d.mensaje && `Mensaje: ${d.mensaje}`, d.origen && `Vino de: ${d.origen}`].filter(Boolean).join("\n"),
          "Ya le llegó sola la respuesta con los datos, los precios y el link para registrarse. Conviene además llamarlo o escribirle en el día: es el momento en que más chances hay de que se sume.",
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
