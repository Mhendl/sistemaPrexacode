/**
 * Chat de las páginas (landings): el visitante pregunta sin registrarse. Las preguntas típicas se responden solas
 * al instante; las demás quedan en el panel (y llega un email) para que las responda una persona. Si el visitante
 * deja su email, la respuesta también le llega ahí.
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { adminsPlataforma, chatConversaciones, chatMensajes } from "../db/schema.js";
import { requirePlataforma } from "../lib/auth.js";
import { enviarDePlataforma } from "../lib/email/plataforma.js";
import { notFound, parse } from "../lib/errors.js";
import { PLANES, precios } from "../lib/precios.js";
import { promoPublica } from "../lib/promo.js";
import { emailSchema } from "../lib/validation.js";

type Producto = "gestion" | "dental";
const MARCA = { gestion: "Prexacode", dental: "CoreDental" } as const;
const REGISTRO = { gestion: "https://sistema.prexacode.com/registro", dental: "https://app.coredental.com.ar/registro" } as const;

/** Las preguntas de los botones del chat (y lo que se reconoce si la escriben a mano) con su respuesta */
export function respuestasRapidas(producto: Producto): { id: string; pregunta: string; reconoce: RegExp; respuesta: string }[] {
  const promo = promoPublica.vigente ? ` Y por el lanzamiento, ${promoPublica.vigente.pagos === 1 ? "el primer mes tiene" : `los primeros ${promoPublica.vigente.pagos} meses tienen`} ${promoPublica.vigente.descuentoPct} % de descuento.` : "";
  const precio = {
    id: "precio",
    pregunta: "¿Cuánto sale?",
    reconoce: /cu[aá]nto (sale|cuesta|vale|es)|precio|costo|planes|tarifa|abono|mensualidad/i,
    respuesta: `Los planes van de USD ${PLANES.basico.precioUsd} a USD ${PLANES.empresa.precioUsd} por mes según la cantidad de usuarios (${PLANES.basico.usuarios}, ${PLANES.profesional.usuarios} o ${PLANES.empresa.usuarios}), con todas las funciones incluidas. Se paga en pesos al dólar oficial y lo das de baja cuando quieras. Pagando el año, 12 meses por el precio de ${precios.mesesCobradosAnual}.${promo} Los primeros 14 días son gratis, sin tarjeta.`,
  };
  const celular = { id: "celular", pregunta: "¿Anda en el celular?", reconoce: /celular|tel[eé]fono|m[oó]vil|tablet|app|instalar|descargar/i, respuesta: "Sí. Funciona desde el navegador en la compu, la tablet y el celular, sin instalar nada. Entrás con tu usuario desde cualquier lado." };
  const empezar = { id: "empezar", pregunta: "¿Cómo empiezo?", reconoce: /c[oó]mo (empiezo|arranco|empezar|me registro|pruebo)|registr|probar|prueba gratis|demo/i, respuesta: `Creás tu cuenta en 2 minutos y ya lo estás usando: 14 días gratis, sin tarjeta. ${REGISTRO[producto]}` };
  if (producto === "dental")
    return [
      precio,
      { id: "turnos", pregunta: "¿Cómo son los turnos online?", reconoce: /turno|agenda|recordatorio|reserva/i, respuesta: "Cada consultorio tiene su link para que los pacientes saquen turno solos, en los horarios que vos definís. Antes del turno les llega un recordatorio por email con un botón para confirmar o cancelar; si cancelan, el horario queda libre en la agenda." },
      { id: "obras", pregunta: "¿Maneja obras sociales?", reconoce: /obra social|obras sociales|prepaga|liquidaci|nomenclador|osde|ioma/i, respuesta: "Sí. Cargás tus obras sociales con lo que paga cada una por prestación, y a fin de mes la liquidación sale sola con lo realizado a sus afiliados, lista para exportar a Excel." },
      { id: "importar", pregunta: "¿Puedo traer mis pacientes?", reconoce: /importar|excel|migrar|pasar (mis|los) (pacientes|datos)|otro sistema|traer/i, respuesta: "Sí. Subís vos mismo tu planilla de Excel como la tengas y el sistema reconoce las columnas solo; en un minuto están todos adentro. Tus datos son tuyos: los exportás cuando quieras." },
      celular,
      empezar,
    ];
  return [
    precio,
    { id: "arca", pregunta: "¿Factura con ARCA?", reconoce: /arca|afip|factura|cae|electr[oó]nica|monotribut/i, respuesta: "Sí. Emite facturas A, B y C y notas de crédito electrónicas con CAE, directo contra ARCA con tu propio certificado (te guiamos para conectarlo). Mientras tanto podés practicar en modo prueba." },
    { id: "importar", pregunta: "¿Puedo traer mis productos y clientes?", reconoce: /importar|excel|migrar|pasar (mis|los) (productos|clientes|datos)|otro sistema|traer/i, respuesta: "Sí. Subís vos mismo tus planillas de Excel de clientes y productos y el sistema reconoce las columnas solo; en un minuto está todo adentro. Tus datos son tuyos: los exportás cuando quieras." },
    { id: "stock", pregunta: "¿Controla el stock?", reconoce: /stock|inventario|existencia|dep[oó]sito/i, respuesta: "Sí. Cada factura o remito descuenta el stock solo, te marca los productos por debajo del mínimo y podés actualizar todos los precios de una vez con un porcentaje." },
    celular,
    empezar,
  ];
}

const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/, "Conversación inválida") });
const ipDe = (req: FastifyRequest) => req.ip?.slice(0, 60) ?? null;

async function mensajesDe(app: FastifyInstance, conversacionId: string) {
  return app.db.select({ id: chatMensajes.id, de: chatMensajes.de, texto: chatMensajes.texto, createdAt: chatMensajes.createdAt }).from(chatMensajes).where(eq(chatMensajes.conversacionId, conversacionId)).orderBy(asc(chatMensajes.createdAt), asc(chatMensajes.n));
}

/** Lo que usa el globito de las páginas (sin usuario) */
export const chatPublicoRoutes: FastifyPluginAsync = async (app) => {
  /** Las preguntas de los botones */
  app.get("/preguntas", async (req) => {
    const { producto } = parse(z.object({ producto: z.enum(["gestion", "dental"]).default("gestion") }), req.query);
    return { marca: MARCA[producto], preguntas: respuestasRapidas(producto).map((r) => ({ id: r.id, pregunta: r.pregunta })) };
  });

  /** Un mensaje del visitante (el primero abre la conversación). Devuelve la conversación completa. */
  app.post("/", { config: { rateLimit: { max: 40, timeWindow: "1 hour" } } }, async (req, reply) => {
    const d = parse(
      z.object({
        producto: z.enum(["gestion", "dental"]).default("gestion"),
        texto: z.string().trim().min(1, "Escribí tu consulta").max(1000, "Hasta 1000 caracteres"),
        token: z.string().max(40).optional().nullable(),
        origen: z.string().max(500).optional().nullable(),
        /** Campo trampa para robots */
        sitio: z.string().max(0).optional(),
      }),
      req.body,
    );
    let [c] = d.token ? await app.db.select().from(chatConversaciones).where(eq(chatConversaciones.token, d.token)) : [];
    if (!c) [c] = await app.db.insert(chatConversaciones).values({ producto: d.producto, token: randomBytes(18).toString("base64url"), origen: d.origen ?? null, ip: ipDe(req) }).returning();
    const conv = c!;
    const producto = conv.producto as Producto;
    await app.db.insert(chatMensajes).values({ conversacionId: conv.id, de: "visitante", texto: d.texto });

    // Si es una pregunta típica, se responde sola al instante
    const rapida = respuestasRapidas(producto).find((r) => r.pregunta === d.texto || r.reconoce.test(d.texto));
    // Una consulta larga o puntual ("¿se puede con dos depósitos?") merece además la respuesta de una persona
    const necesitaPersona = !rapida || (rapida.pregunta !== d.texto && d.texto.length > 60);
    if (rapida) await app.db.insert(chatMensajes).values({ conversacionId: conv.id, de: "auto", texto: rapida.respuesta });
    if (rapida && necesitaPersona && !conv.avisadoEn) {
      await app.db.insert(chatMensajes).values({ conversacionId: conv.id, de: "auto", texto: conv.email ? "Igual le aviso a una persona para que te responda puntualmente, por acá y por email." : "Igual le aviso a una persona para que te responda puntualmente. Si no querés quedarte esperando, dejanos tu email acá abajo y te contestamos ahí." });
    } else if (!rapida && !conv.avisadoEn) {
      await app.db.insert(chatMensajes).values({ conversacionId: conv.id, de: "auto", texto: conv.email ? "¡Gracias! Te respondemos en un rato por acá y por email." : "¡Gracias! Te responde una persona en un rato. Si no querés quedarte esperando, dejanos tu email acá abajo y te contestamos ahí." });
    }
    // Aviso al equipo: cuando la pregunta necesita una persona (como mucho uno cada 30 minutos por conversación)
    const hayQueAvisar = necesitaPersona && (!conv.avisadoEn || Date.now() - conv.avisadoEn.getTime() > 30 * 60_000);
    await app.db
      .update(chatConversaciones)
      .set({ ultimoMensajeEn: new Date(), ...(necesitaPersona ? { pendiente: true } : {}), ...(hayQueAvisar ? { avisadoEn: new Date() } : {}) })
      .where(eq(chatConversaciones.id, conv.id));
    if (hayQueAvisar) {
      const admins = await app.db.select({ email: adminsPlataforma.email }).from(adminsPlataforma).where(eq(adminsPlataforma.activo, true));
      for (const a of admins) {
        void enviarDePlataforma(app, {
          para: a.email,
          asunto: `Consulta en el chat de ${MARCA[producto]}`,
          saludo: "Hola,",
          parrafos: [`Alguien preguntó en el chat de la página de ${MARCA[producto]}:`, `«${d.texto}»`, conv.email ? `Dejó su email: ${conv.email}` : "Todavía no dejó su email: si le respondés pronto, lo ve en el chat."],
          boton: { texto: "Responder", url: `${app.urlDe("gestion")}/admin/chat` },
          producto,
        });
      }
    }
    return reply.status(201).send({ token: conv.token, email: conv.email, mensajes: await mensajesDe(app, conv.id) });
  });

  /** Los mensajes de la conversación (el globito lo consulta cada tanto para ver si le respondieron) */
  app.get("/:token", { config: { rateLimit: { max: 600, timeWindow: "1 hour" } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const [c] = await app.db.select().from(chatConversaciones).where(eq(chatConversaciones.token, token));
    if (!c) throw notFound("Conversación no encontrada");
    return { token: c.token, email: c.email, mensajes: await mensajesDe(app, c.id) };
  });

  /** El visitante deja su email para que le respondan ahí */
  app.post("/:token/contacto", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const d = parse(z.object({ email: emailSchema, nombre: z.string().trim().max(80).optional().nullable() }), req.body);
    const [c] = await app.db.update(chatConversaciones).set({ email: d.email, nombre: d.nombre || null }).where(eq(chatConversaciones.token, token)).returning();
    if (!c) throw notFound("Conversación no encontrada");
    await app.db.insert(chatMensajes).values({ conversacionId: c.id, de: "auto", texto: `Listo, te respondemos también a ${d.email}.` });
    return { token: c.token, email: c.email, mensajes: await mensajesDe(app, c.id) };
  });
};

/** Panel: las conversaciones del chat y sus respuestas */
export const chatAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePlataforma);
  const idSchema = z.object({ id: z.string().uuid("Id inválido") });

  app.get("/", async () => {
    const lista = await app.db
      .select({
        c: chatConversaciones,
        mensajes: sql<number>`(select count(*) from chat_mensajes m where m.conversacion_id = "chat_conversaciones"."id")::int`,
        ultimo: sql<string>`(select m.texto from chat_mensajes m where m.conversacion_id = "chat_conversaciones"."id" and m.de = 'visitante' order by m.created_at desc, m.n desc limit 1)`,
      })
      .from(chatConversaciones)
      .orderBy(desc(chatConversaciones.pendiente), desc(chatConversaciones.ultimoMensajeEn))
      .limit(200);
    return { pendientes: lista.filter((x) => x.c.pendiente).length, conversaciones: lista.map(({ c, ...x }) => ({ id: c.id, producto: c.producto, email: c.email, nombre: c.nombre, origen: c.origen, pendiente: c.pendiente, ultimoMensajeEn: c.ultimoMensajeEn, createdAt: c.createdAt, ...x })) };
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const [c] = await app.db.select().from(chatConversaciones).where(eq(chatConversaciones.id, id));
    if (!c) throw notFound("Conversación no encontrada");
    const { token: _t, ip: _ip, ...conv } = c;
    return { ...conv, mensajes: await mensajesDe(app, id) };
  });

  /** Responder: lo ve en el chat si sigue ahí y, si dejó su email, también le llega por email */
  app.post("/:id/responder", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { texto } = parse(z.object({ texto: z.string().trim().min(1, "Escribí la respuesta").max(2000) }), req.body);
    const [c] = await app.db.select().from(chatConversaciones).where(eq(chatConversaciones.id, id));
    if (!c) throw notFound("Conversación no encontrada");
    await app.db.insert(chatMensajes).values({ conversacionId: id, de: "equipo", texto });
    await app.db.update(chatConversaciones).set({ pendiente: false, ultimoMensajeEn: new Date() }).where(eq(chatConversaciones.id, id));
    let porEmail = false;
    if (c.email) {
      const [pregunta] = await app.db.select({ texto: chatMensajes.texto }).from(chatMensajes).where(and(eq(chatMensajes.conversacionId, id), eq(chatMensajes.de, "visitante"))).orderBy(desc(chatMensajes.createdAt), desc(chatMensajes.n)).limit(1);
      porEmail = await enviarDePlataforma(app, {
        para: c.email,
        asunto: `Respuesta a tu consulta sobre ${MARCA[c.producto as Producto]}`,
        saludo: c.nombre ? `Hola ${c.nombre.split(/\s+/)[0]},` : "Hola,",
        parrafos: [...(pregunta ? [`Preguntaste: «${pregunta.texto}»`] : []), texto, "Si te queda alguna duda, respondé este email."],
        boton: { texto: "Probar 14 días gratis", url: REGISTRO[c.producto as Producto] },
        producto: c.producto,
      });
    }
    return { porEmail, mensajes: await mensajesDe(app, id) };
  });

  /** Marcar como resuelta (o no) sin responder */
  app.post("/:id/pendiente", async (req) => {
    const { id } = parse(idSchema, req.params);
    const { pendiente } = parse(z.object({ pendiente: z.boolean() }), req.body);
    const [c] = await app.db.update(chatConversaciones).set({ pendiente }).where(eq(chatConversaciones.id, id)).returning({ id: chatConversaciones.id });
    if (!c) throw notFound("Conversación no encontrada");
    return { ok: true };
  });

  /** Cuántas esperan respuesta (para el aviso del menú) */
  app.get("/resumen/pendientes", async () => {
    const [{ n }] = await app.db.select({ n: sql<number>`count(*)::int` }).from(chatConversaciones).where(and(eq(chatConversaciones.pendiente, true), gt(chatConversaciones.ultimoMensajeEn, new Date(Date.now() - 30 * 86_400_000))));
    return { pendientes: Number(n) };
  });
};
