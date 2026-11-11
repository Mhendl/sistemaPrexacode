/**
 * Prospección: emails comerciales de Prexacode a posibles clientes (consultorios, PyMEs), desde un alias de la casilla
 * de Prexacode. Pensado para no caer en spam ni quemar la casilla:
 *  - pocos por día, y se empieza de a poco (10 el primer día, +2 por día hasta el tope)
 *  - solo de lunes a viernes en horario laboral, espaciados a lo largo del día
 *  - texto simple y personalizado, una secuencia corta (3 emails) que se corta cuando la persona responde
 *  - cada email con su link de baja; los rebotes y las respuestas "BAJA" se detectan solos leyendo la casilla (IMAP)
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { interesados, prospeccionCampanas, prospeccionConfig, prospeccionEnvios, prospectos } from "../db/schema.js";
import { ahoraAr } from "./turnos.js";
import { PLANES } from "./precios.js";
import { promoPublica } from "./promo.js";

export interface Respuesta {
  de: string;
  asunto: string;
  texto: string;
  /** El servidor la marcó como respuesta automática (contestador, fuera de la oficina) */
  automatica?: boolean;
}

/** Lee los emails que llegaron a la casilla (en las pruebas se reemplaza por uno falso) */
export interface Buzon {
  leer(c: { host: string; puerto: number; usuario: string; password: string }, desde: Date): Promise<Respuesta[]>;
}

export function buzonImap(): Buzon {
  return {
    async leer(c, desde) {
      const cliente = new ImapFlow({ host: c.host, port: c.puerto, secure: c.puerto === 993, auth: { user: c.usuario, pass: c.password }, logger: false, socketTimeout: 30_000 });
      // Un corte de la conexión no puede tirar abajo el servidor: el error queda en la lectura y se reintenta en la próxima vuelta
      cliente.on("error", () => {});
      await cliente.connect();
      const out: Respuesta[] = [];
      const lock = await cliente.getMailboxLock("INBOX");
      try {
        let n = 0;
        for await (const m of cliente.fetch({ since: desde }, { envelope: true, source: true })) {
          if (++n > 300) break;
          const de = m.envelope?.from?.[0]?.address ?? "";
          let texto = "";
          let automatica = false;
          try {
            if (m.source) {
              const mail = await simpleParser(m.source);
              texto = mail.text ?? "";
              const h = (k: string) => String(mail.headers.get(k) ?? "").toLowerCase();
              automatica = (!!h("auto-submitted") && h("auto-submitted") !== "no") || !!h("x-autoreply") || !!h("x-autorespond") || /auto_reply|bulk|junk/.test(h("precedence"));
            }
          } catch {
            /* un email que no se puede leer no frena al resto */
          }
          out.push({ de, asunto: m.envelope?.subject ?? "", texto: texto.slice(0, 20_000), automatica });
        }
      } finally {
        lock.release();
        await cliente.logout().catch(() => {});
      }
      return out;
    },
  };
}

export const nuevoToken = () => randomBytes(12).toString("base64url");

/** Suma días hábiles (lunes a viernes) */
export function sumarDiasHabiles(desde: Date, dias: number) {
  const d = new Date(desde);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = new Date(d.getTime() - 3 * 3600_000).getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return d;
}

/** Tope del día: arranca en 10 y sube de a 2 por día hasta el máximo configurado (calentamiento de la casilla) */
export function topeDelDia(max: number, primerEnvio: Date | null, ahora = new Date()) {
  const dias = primerEnvio ? Math.floor((ahora.getTime() - primerEnvio.getTime()) / 86_400_000) : 0;
  return Math.min(max, 10 + 2 * Math.max(0, dias));
}

/** ¿Es horario de envío? (entre las horas configuradas, hora de Argentina; de lunes a viernes salvo que se elija también el fin de semana) */
export function enHorario(horaDesde: number, horaHasta: number, ahora = new Date(), finesDeSemana = false) {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  const dia = ar.getUTCDay();
  const hora = ar.getUTCHours() + ar.getUTCMinutes() / 60;
  return (finesDeSemana || (dia !== 0 && dia !== 6)) && hora >= horaDesde && hora < horaHasta;
}

/** Cuánto puede subir por día el envío respecto del mejor día de la última semana (subir de golpe es lo que manda a spam) */
const SUBA_DIARIA = 5;
/** Si rebota más que esto en la última semana, no sube (y el control diario avisa) */
export const REBOTE_MAXIMO = 0.05;

/** Rebotes de la última semana de una casilla: proporción sobre los primeros emails mandados */
export async function rebotesSemana(app: FastifyInstance, c: Config, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 7 * 86_400_000);
  const productos = await productosDeCasilla(app, c);
  const [{ primeros }] = await app.db
    .select({ primeros: sql<number>`count(*)::int` })
    .from(prospeccionEnvios)
    .where(and(eq(prospeccionEnvios.casillaId, c.id), eq(prospeccionEnvios.estado, "Enviado"), eq(prospeccionEnvios.paso, 0), gte(prospeccionEnvios.enviadoEn, desde)));
  const [{ rebotes }] = await app.db
    .select({ rebotes: sql<number>`count(*)::int` })
    .from(prospectos)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
    .where(and(eq(prospectos.estado, "Rebotó"), inArray(prospeccionCampanas.producto, productos), gte(prospectos.ultimoEnvio, desde)));
  return { primeros: Number(primeros), rebotes: Number(rebotes), proporcion: Number(primeros) >= 20 ? Number(rebotes) / Number(primeros) : 0 };
}

/**
 * El tope de hoy de una casilla: el calentamiento inicial, sin pasar el máximo configurado, y como mucho
 * SUBA_DIARIA por encima del mejor día de la última semana (si rebota mucho, no sube nada).
 */
export async function topeDeHoy(app: FastifyInstance, c: Config, ahora = new Date()) {
  const rampa = topeDelDia(c.maxPorDia, c.primerEnvioEn, ahora);
  const hoy = ahoraAr(ahora.getTime()).slice(0, 10);
  const [{ mejor }] = await app.db
    .select({ mejor: sql<number>`coalesce(max(n), 0)::int` })
    .from(
      app.db
        .select({ n: sql<number>`count(*)`.as("n") })
        .from(prospeccionEnvios)
        .where(and(eq(prospeccionEnvios.casillaId, c.id), eq(prospeccionEnvios.estado, "Enviado"), gte(prospeccionEnvios.enviadoEn, new Date(ahora.getTime() - 8 * 86_400_000)), lt(prospeccionEnvios.enviadoEn, new Date(`${hoy}T03:00:00Z`))))
        .groupBy(sql`(${prospeccionEnvios.enviadoEn} at time zone 'America/Argentina/Buenos_Aires')::date`)
        .as("dias"),
    );
  const { proporcion } = await rebotesSemana(app, c, ahora);
  const suba = proporcion > REBOTE_MAXIMO ? 0 : SUBA_DIARIA;
  return Math.min(rampa, Math.max(10, Number(mejor) + suba));
}

/** El link de baja de un clic (lo usa el botón "Anular suscripción" del programa de correo) */
const bajaApi = (app: FastifyInstance, producto: string, token: string) => `${app.urlDe(producto === "dental" ? "dental" : "gestion")}/api/publico/baja-prospecto/${token}`;

const LANDING = { dental: "https://coredental.com.ar", gestion: "https://productos.prexacode.com" } as const;
const productoDe = (p: string) => (p === "dental" ? "dental" : "gestion");

/** El link a la landing, con de dónde viene (para saber qué email trajo la demo) */
export function linkLanding(producto: string, campana: string, token: string) {
  const slug = campana
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${LANDING[productoDe(producto)]}/?utm_source=prospeccion&utm_medium=email&utm_campaign=${slug}&r=${token}`;
}

type Prospecto = typeof prospectos.$inferSelect;

/** Reemplaza {nombre}, {empresa}, {ciudad}, {rubro}, {link} y {firma}; si falta un dato, la frase queda bien igual */
/**
 * Prueba de asuntos: si el asunto trae varias opciones separadas por "||", a cada contacto le toca siempre la misma
 * (según su código), así después se compara cuál trae más visitas.
 */
export function variante(texto: string, token: string) {
  const opciones = texto.split("||").map((x) => x.trim()).filter(Boolean);
  if (opciones.length < 2) return texto.trim();
  let h = 0;
  for (const ch of token) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return opciones[h % opciones.length]!;
}

/** Una frase del primer email según el rubro (lo que más le sirve a ese tipo de negocio); si no se conoce, nada */
const GANCHOS: [RegExp, string][] = [
  [/corral|material|ferreter|pinturer|sanitari|electric|maderer/i, "Para un rubro como el tuyo: cuando aumenta el proveedor actualizás todos los precios de una vez con un porcentaje, y hacés el remito de cada entrega."],
  [/librer|mayorista|distribuid|bazar|repuesto|papeler|jugueter/i, "Para un rubro como el tuyo: cuando aumenta el proveedor actualizás todos los precios de una vez con un porcentaje, y ves qué productos quedaron por debajo del stock mínimo."],
];
const ganchoDe = (rubro: string | null) => {
  const g = GANCHOS.find(([r]) => r.test(rubro ?? ""));
  return g ? ` ${g[1]}` : "";
};

export function personalizar(texto: string, p: Pick<Prospecto, "nombre" | "empresa" | "ciudad" | "rubro">, extra: { link: string; firma: string; producto: string }) {
  const primerNombre = (p.nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return texto
    .replace(/\{nombre\}/g, primerNombre)
    .replace(/\{empresa\}/g, p.empresa?.trim() || (extra.producto === "dental" ? "tu consultorio" : "tu empresa"))
    .replace(/ en \{ciudad\}/g, p.ciudad?.trim() ? ` en ${p.ciudad.trim()}` : "")
    .replace(/\{ciudad\}/g, p.ciudad?.trim() ?? "")
    .replace(/\{rubro\}/g, p.rubro?.trim() ?? "")
    .replace(/ ?\{gancho\}/g, ganchoDe(p.rubro))
    .replace(/\{precio\}/g, `USD ${PLANES.basico.precioUsd}`)
    .replace(/ ?\{promo\}/g, promoPublica.vigente ? ` Y por el lanzamiento, los primeros ${promoPublica.vigente.pagos === 1 ? "30 días" : `${promoPublica.vigente.pagos} meses`} tienen ${promoPublica.vigente.descuentoPct} % de descuento.` : "")
    .replace(/\{link\}/g, extra.link)
    .replace(/\{firma\}/g, extra.firma)
    .replace(/Hola ,/g, "Hola,")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** HTML mínimo (sin imágenes ni estilos): se ve como un email escrito a mano */
export const aHtml = (texto: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${texto
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join("")}</div>`;

/** Una casilla por producto: 1 = Prexacode (gestión), 2 = CoreDental */
export const CASILLA = { gestion: 1, dental: 2 } as const;
export type ProductoCasilla = keyof typeof CASILLA;

export async function configProspeccion(app: FastifyInstance, producto: ProductoCasilla = "gestion") {
  const id = CASILLA[producto];
  await app.db.insert(prospeccionConfig).values({ id, producto }).onConflictDoNothing();
  const [c] = await app.db.select().from(prospeccionConfig).where(eq(prospeccionConfig.id, id));
  return c!;
}

type Config = Awaited<ReturnType<typeof configProspeccion>>;

const lista = (c: Config) => !!c.passwordCifrada && !!c.remitenteEmail;

/**
 * De qué casilla sale cada producto. CoreDental usa la suya si está configurada; si no, la de Prexacode
 * (así nada se frena mientras se prepara el dominio nuevo).
 */
/** Los productos cuyas campañas salen de esta casilla */
export async function productosDeCasilla(app: FastifyInstance, c: Config) {
  return (await casillasEnUso(app)).find((x) => x.c.id === c.id)?.productos ?? [c.producto];
}

export async function casillasEnUso(app: FastifyInstance) {
  const gestion = await configProspeccion(app, "gestion");
  const dental = await configProspeccion(app, "dental");
  return lista(dental)
    ? [
        { c: gestion, productos: ["gestion"] },
        { c: dental, productos: ["dental"] },
      ]
    : [{ c: gestion, productos: ["gestion", "dental"] }];
}

const transporteDe = (app: FastifyInstance, c: Config) => ({
  tipo: "smtp" as const,
  host: c.smtpHost,
  puerto: c.smtpPuerto,
  seguridad: (c.smtpPuerto === 465 ? "SSL/TLS" : "STARTTLS") as "SSL/TLS" | "STARTTLS",
  usuario: c.usuario || c.remitenteEmail!,
  password: app.cifrador.descifrar(c.passwordCifrada!),
});

/** Entró a la página desde el link del email (lo avisa la landing) */
export async function registrarVisita(app: FastifyInstance, token: string) {
  const [p] = await app.db
    .update(prospectos)
    .set({ visitas: sql`${prospectos.visitas} + 1`, visitoEn: sql`coalesce(${prospectos.visitoEn}, now())` })
    .where(eq(prospectos.token, token))
    .returning({ id: prospectos.id });
  return !!p;
}

/** Se registró a la prueba desde el email: sale de la secuencia (ya no hay que convencerlo) */
export async function registrarAlta(app: FastifyInstance, token: string, empresaId: string) {
  await app.db
    .update(prospectos)
    .set({ estado: "Registrado", registradoEn: new Date(), empresaId, nota: "Se registró a la prueba gratis desde el email" })
    .where(and(eq(prospectos.token, token), inArray(prospectos.estado, ["Pendiente", "En curso", "Terminado", "Respondió"])));
}

/** Manda un email con la casilla de prospección */
export async function enviarProspeccion(app: FastifyInstance, c: Config, para: string, asunto: string, texto: string, bajaUrl?: string) {
  await app.cartero.enviar(transporteDe(app, c), {
    de: `"${(c.remitenteNombre || "Prexacode").replace(/["<>]/g, "")}" <${c.remitenteEmail}>`,
    responderA: c.remitenteEmail,
    para,
    asunto,
    html: aHtml(texto),
    texto,
    // Con esto Gmail y Outlook muestran su propio botón "Anular suscripción": menos gente lo marca como spam
    ...(bajaUrl ? { cabeceras: { "List-Unsubscribe": `<${bajaUrl}>, <mailto:${c.remitenteEmail}?subject=BAJA>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
  });
}

/** Pedidos de baja (también con errores de tipeo: "no nos intreresa") */
export const PALABRAS_BAJA = /\b(baja|desuscrib\w*|no (me|nos|le|les) (int\w{0,4}esa\w*)|no (estoy|estamos) interesad\w*|no me escrib\w*|no nos escrib\w*|remov\w*|unsubscribe)\b/i;
/** Contestadores automáticos ("escribinos por WhatsApp", "gracias por contactarnos"): no es alguien que respondió */
const ES_AUTOMATICA = (r: Respuesta, propio: string) =>
  !!r.automatica ||
  /respuesta autom|automatic reply|auto.?reply|autorespuesta|fuera de (la )?oficina|out of (the )?office|ausencia/i.test(r.asunto) ||
  /(mensaje|respuesta|correo) (generad[oa] )?autom[aá]tic|gracias por (contactarnos|comunicarte|comunicarse|escribirnos|tu mensaje|su mensaje|su consulta|tu consulta)|recibimos (tu|su) (mensaje|consulta|correo|email)|si te comunicaste para|nuestro nuevo canal|estimados pacientes|no responda a este|te solicitamos (por favor )?(que )?nos contactes|cont[aá]ctanos? por whatsapp|comunicate por whatsapp|(env[ií]o|reenv[ií]o|derivo) (los?|el|tu|su) (mails?|emails?|correos?|mensaje) al (sector|[aá]rea)/i.test(propio);
/** "No, gracias", "ya tenemos un sistema": no es un interesado, es una baja (amable) */
export const NO_LE_INTERESA =
  /\b(no,? (muchas )?gracias|ya (contamos|tenemos|trabajamos|usamos|estamos) con|ya (tenemos|usamos|contamos) (un|otro|nuestro)|por (el momento|ahora) no|no (lo )?(necesitamos|necesito|requerimos)|no estamos buscando|no es de (nuestro|mi) inter[eé]s)\b/i;
const ES_REBOTE = (r: Respuesta) => /mailer-daemon|postmaster/i.test(r.de) || /undeliver|delivery status|delivery failure|returned mail|no se pudo entregar|failure notice|rechazad/i.test(r.asunto);

/** Lee la casilla: quien respondió sale de la secuencia (y queda como interesado); los rebotes y las bajas, también */
export async function revisarRespuestas(app: FastifyInstance, c: Config, ahora = new Date()) {
  const desde = c.imapRevisadoEn ? new Date(c.imapRevisadoEn.getTime() - 3600_000) : new Date(ahora.getTime() - 14 * 86_400_000);
  const respuestas = await app.buzon.leer({ host: c.imapHost, puerto: c.imapPuerto, usuario: c.usuario || c.remitenteEmail!, password: app.cifrador.descifrar(c.passwordCifrada!) }, desde);
  await app.db.update(prospeccionConfig).set({ imapRevisadoEn: ahora }).where(eq(prospeccionConfig.id, c.id));
  if (!respuestas.length) return { respondieron: 0, bajas: 0, rebotes: 0 };

  const activos = await app.db
    .select({ p: prospectos, producto: prospeccionCampanas.producto })
    .from(prospectos)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
    .where(inArray(prospectos.estado, ["Pendiente", "En curso", "Terminado"]));
  const porEmail = new Map(activos.map((x) => [x.p.email, x]));
  let respondieron = 0;
  let bajas = 0;
  let rebotes = 0;
  for (const r of respuestas) {
    if (ES_REBOTE(r)) {
      // El email rebotado aparece en el texto del aviso del servidor
      for (const [email, x] of porEmail) {
        if (r.texto.toLowerCase().includes(email)) {
          await app.db.update(prospectos).set({ estado: "Rebotó", nota: "El email no existe o rebotó" }).where(eq(prospectos.id, x.p.id));
          porEmail.delete(email);
          rebotes++;
        }
      }
      continue;
    }
    const x = porEmail.get(r.de.toLowerCase());
    if (!x) continue;
    // Solo lo que escribió (sin el email citado de abajo)
    const propio = r.texto.split(/\n\s*(>|El .{5,80} escribió:|On .{5,80} wrote:)/)[0] ?? r.texto;
    // Un contestador automático no cuenta: sigue en la secuencia
    if (ES_AUTOMATICA(r, propio)) continue;
    porEmail.delete(r.de.toLowerCase());
    if (PALABRAS_BAJA.test(propio) || PALABRAS_BAJA.test(r.asunto)) {
      await app.db.update(prospectos).set({ estado: "Baja", nota: "Pidió no recibir más emails" }).where(eq(prospectos.id, x.p.id));
      bajas++;
      continue;
    }
    if (NO_LE_INTERESA.test(propio.slice(0, 400))) {
      await app.db.update(prospectos).set({ estado: "Baja", nota: `Respondió que no le interesa: ${propio.trim().slice(0, 300)}` }).where(eq(prospectos.id, x.p.id));
      bajas++;
      continue;
    }
    await app.db.update(prospectos).set({ estado: "Respondió", nota: propio.trim().slice(0, 500) || null }).where(eq(prospectos.id, x.p.id));
    await app.db.insert(interesados).values({
      producto: productoDe(x.producto),
      nombre: x.p.nombre || x.p.empresa || x.p.email,
      email: x.p.email,
      telefono: x.p.telefono,
      empresa: x.p.empresa,
      cargo: x.p.rubro,
      mensaje: propio.trim().slice(0, 1000) || null,
      origen: "Respondió un email de prospección",
    });
    respondieron++;
  }
  return { respondieron, bajas, rebotes };
}

/** El email personal a quien entró a la página: como respuesta al primero, ofreciendo ayuda. Después no recibe más recordatorios. */
async function enviarEmailDeVisita(app: FastifyInstance, c: Config, p: typeof prospectos.$inferSelect, campana: typeof prospeccionCampanas.$inferSelect, ahora: Date) {
  const producto = campana.producto === "dental" ? "dental" : "gestion";
  const extra = { link: linkLanding(campana.producto, campana.nombre, p.token), firma: c.remitenteNombre || "Prexacode", producto: campana.producto };
  const asunto = `Re: ${personalizar(variante(campana.pasos[0]!.asunto, p.token), p, extra)}`;
  const baja = `${app.urlDe(productoDe(campana.producto))}/baja-prospecto/${p.token}`;
  const texto = `${personalizar(EMAIL_VISITA[producto], p, extra)}\n\n--\nSi no te interesa, respondé BAJA o entrá a ${baja} y no te escribo más.`;
  try {
    await enviarProspeccion(app, c, p.email, asunto, texto, bajaApi(app, campana.producto, p.token));
  } catch (e) {
    const msg = (e as Error).message ?? "Error al enviar";
    await app.db.insert(prospeccionEnvios).values({ prospectoId: p.id, paso: -1, asunto, estado: "Error", error: msg, casillaId: c.id });
    // No se reintenta (es un extra): se marca como hecho y la casilla sigue
    await app.db.update(prospectos).set({ visitaEmailEn: ahora }).where(eq(prospectos.id, p.id));
    return "destinatario-rechazado";
  }
  await app.db.insert(prospeccionEnvios).values({ prospectoId: p.id, paso: -1, asunto, estado: "Enviado", enviadoEn: ahora, casillaId: c.id });
  await app.db.update(prospectos).set({ visitaEmailEn: ahora, ultimoEnvio: ahora, estado: "Terminado" }).where(eq(prospectos.id, p.id));
  return "enviado";
}

/** Cuánto se espera a que vuelva la red antes de pausar la casilla */
const PACIENCIA_RED = 2 * 3600_000;
/** No es la casilla: es la red (DNS que no responde, conexión cortada, el servidor reiniciándose) */
export function esFallaDeRed(e: unknown) {
  const err = e as { code?: string; message?: string };
  return (
    ["EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNECTION", "ESOCKET", "ETIMEOUT", "EDNS"].includes(err.code ?? "") ||
    /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|socket hang up|timed? ?out|Command failed|Connection not available|Unexpected close/i.test(err.message ?? "")
  );
}

/**
 * Una vuelta del envío (corre cada 5 minutos): en cada casilla revisa las respuestas y, si toca, manda UN email.
 * Devuelve qué hizo (si alguna mandó, "enviado"), para el panel y las pruebas.
 */
export async function tickProspeccion(app: FastifyInstance, ahora = new Date()): Promise<string> {
  const resultados: string[] = [];
  for (const { c, productos } of await casillasEnUso(app)) resultados.push(await tickCasilla(app, c, productos, ahora));
  return resultados.includes("enviado") ? "enviado" : resultados[0]!;
}

async function tickCasilla(app: FastifyInstance, c: Config, productos: string[], ahora: Date): Promise<string> {
  if (!c.activa || !lista(c)) return "inactiva";

  // Primero las respuestas: que nadie reciba un recordatorio después de haber contestado
  if (!c.imapRevisadoEn || ahora.getTime() - c.imapRevisadoEn.getTime() >= 10 * 60_000) {
    try {
      await revisarRespuestas(app, c, ahora);
    } catch (e) {
      // Sin poder leer la casilla no se manda nada (podría escribirle a alguien que ya respondió).
      // Si es la red (el servidor se reinició, el DNS no respondió), se reintenta en la próxima vuelta; se pausa si dura más de 2 horas
      if (esFallaDeRed(e) && c.imapRevisadoEn && ahora.getTime() - c.imapRevisadoEn.getTime() < PACIENCIA_RED) return "error-red";
      await app.db.update(prospeccionConfig).set({ ultimoError: `No se pudo leer la casilla: ${(e as Error).message}`, activa: false }).where(eq(prospeccionConfig.id, c.id));
      return "error-imap";
    }
  }

  if (!enHorario(c.horaDesde, c.horaHasta, ahora, c.finesDeSemana)) return "fuera-de-horario";
  const tope = await topeDeHoy(app, c, ahora);
  const hoy = ahoraAr(ahora.getTime()).slice(0, 10);
  const inicioDia = new Date(`${hoy}T03:00:00Z`);
  const [{ n }] = await app.db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospeccionEnvios)
    .where(and(eq(prospeccionEnvios.casillaId, c.id), eq(prospeccionEnvios.estado, "Enviado"), gte(prospeccionEnvios.enviadoEn, inicioDia)));
  if (Number(n) >= tope) return "tope-del-dia";
  // Espaciados a lo largo del horario
  const [ultimo] = await app.db.select({ en: prospeccionEnvios.enviadoEn }).from(prospeccionEnvios).where(eq(prospeccionEnvios.casillaId, c.id)).orderBy(desc(prospeccionEnvios.enviadoEn)).limit(1);
  const intervalo = (((c.horaHasta - c.horaDesde) * 60) / tope) * 0.8 * 60_000;
  if (ultimo && ahora.getTime() - ultimo.en.getTime() < intervalo) return "espaciando";

  // Primero, el email personal a quien entró a la página desde el email y no se registró (al día hábil siguiente, uno solo)
  const visitantes = await app.db
    .select({ p: prospectos, campana: prospeccionCampanas })
    .from(prospectos)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
    .where(
      and(
        inArray(prospectos.estado, ["En curso", "Terminado"]),
        isNotNull(prospectos.visitoEn),
        isNull(prospectos.visitaEmailEn),
        eq(prospeccionCampanas.activa, true),
        inArray(prospeccionCampanas.producto, productos),
      ),
    )
    .orderBy(asc(prospectos.visitoEn));
  const visitante = visitantes.find((x) => sumarDiasHabiles(x.p.visitoEn!, 1) <= ahora);
  if (visitante) return enviarEmailDeVisita(app, c, visitante.p, visitante.campana, ahora);

  // Las campañas se turnan: le toca a la que hace más que no manda (así avanzan todas a la vez, no una después de la otra)
  const listas = await app.db
    .selectDistinct({ id: prospectos.campanaId })
    .from(prospectos)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
    .where(and(inArray(prospectos.estado, ["Pendiente", "En curso"]), eq(prospeccionCampanas.activa, true), inArray(prospeccionCampanas.producto, productos), lte(prospectos.proximoEnvio, ahora)));
  if (!listas.length) return "sin-pendientes";
  const ultimos = await app.db
    .select({ id: prospectos.campanaId, en: sql<Date>`max(${prospeccionEnvios.enviadoEn})` })
    .from(prospeccionEnvios)
    .innerJoin(prospectos, eq(prospectos.id, prospeccionEnvios.prospectoId))
    .where(inArray(prospectos.campanaId, listas.map((x) => x.id)))
    .groupBy(prospectos.campanaId);
  const ultimoDe = (id: string) => {
    const u = ultimos.find((x) => x.id === id)?.en;
    return u ? new Date(u).getTime() : 0;
  };
  const turno = [...listas].sort((x, y) => ultimoDe(x.id) - ultimoDe(y.id))[0]!.id;
  const [siguiente] = await app.db
    .select({ p: prospectos, campana: prospeccionCampanas })
    .from(prospectos)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
    .where(and(eq(prospectos.campanaId, turno), inArray(prospectos.estado, ["Pendiente", "En curso"]), lte(prospectos.proximoEnvio, ahora)))
    // Primero los recordatorios que ya tocan (si no, con listas nuevas se atrasan días), después los primeros emails
    .orderBy(sql`case when ${prospectos.estado} = 'En curso' then 0 else 1 end`, asc(prospectos.proximoEnvio), asc(prospectos.createdAt))
    .limit(1);
  if (!siguiente) return "sin-pendientes";
  const { p, campana } = siguiente;
  // Antes del primer email: si el dominio no existe o no recibe correo, no se manda (un rebote menos)
  if (p.paso === 0 && app.dominioRecibeCorreo && !(await app.dominioRecibeCorreo(p.email.split("@")[1] ?? ""))) {
    await app.db.update(prospectos).set({ estado: "Rebotó", nota: "El dominio del email no existe o no recibe correo (no se le escribió)" }).where(eq(prospectos.id, p.id));
    return "dominio-invalido";
  }
  const paso = campana.pasos[p.paso];
  if (!paso) {
    await app.db.update(prospectos).set({ estado: "Terminado" }).where(eq(prospectos.id, p.id));
    return "terminado";
  }
  const extra = { link: linkLanding(campana.producto, campana.nombre, p.token), firma: c.remitenteNombre || "Prexacode", producto: campana.producto };
  const primerAsunto = personalizar(variante(campana.pasos[0]!.asunto, p.token), p, extra);
  const asunto = p.paso === 0 ? primerAsunto : paso.asunto.trim() ? personalizar(paso.asunto, p, extra) : `Re: ${primerAsunto}`;
  const baja = `${app.urlDe(productoDe(campana.producto))}/baja-prospecto/${p.token}`;
  const texto = `${personalizar(paso.cuerpo, p, extra)}\n\n--\nSi no te interesa, respondé BAJA o entrá a ${baja} y no te escribo más.`;
  try {
    await enviarProspeccion(app, c, p.email, asunto, texto, bajaApi(app, campana.producto, p.token));
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; command?: string; message?: string };
    const msg = err.code === "EAUTH" || err.responseCode === 535 ? "La casilla rechazó el usuario o la contraseña" : (err.message ?? "Error al enviar");
    await app.db.insert(prospeccionEnvios).values({ prospectoId: p.id, paso: p.paso, asunto, estado: "Error", error: msg, casillaId: c.id });
    // El problema es de ese destinatario (no existe, su dominio no responde): se saltea él y la casilla sigue
    if (err.code === "EENVELOPE" || err.command === "RCPT TO" || /recipients? (were|was) rejected/i.test(err.message ?? "")) {
      const temporal = (err.responseCode ?? 0) >= 400 && (err.responseCode ?? 0) < 500;
      const [{ fallas }] = await app.db
        .select({ fallas: sql<number>`count(*)::int` })
        .from(prospeccionEnvios)
        .where(and(eq(prospeccionEnvios.prospectoId, p.id), eq(prospeccionEnvios.estado, "Error")));
      // Un error temporal se reintenta otro día; si vuelve a fallar (o es definitivo), no se le escribe más
      if (temporal && Number(fallas) < 3) await app.db.update(prospectos).set({ proximoEnvio: sumarDiasHabiles(ahora, 1) }).where(eq(prospectos.id, p.id));
      else await app.db.update(prospectos).set({ estado: "Rebotó", nota: `El servidor rechazó el email: ${msg}`.slice(0, 500) }).where(eq(prospectos.id, p.id));
      return "destinatario-rechazado";
    }
    // Una falla de red pasajera: se reintenta en la próxima vuelta (se pausa si sigue fallando)
    if (esFallaDeRed(e)) {
      const [{ n }] = await app.db
        .select({ n: sql<number>`count(*)::int` })
        .from(prospeccionEnvios)
        .where(and(eq(prospeccionEnvios.casillaId, c.id), eq(prospeccionEnvios.estado, "Error"), gte(prospeccionEnvios.enviadoEn, new Date(ahora.getTime() - PACIENCIA_RED))));
      if (Number(n) < 6) return "error-red";
    }
    // Ante cualquier otro error se pausa: mejor revisar que insistir y que la casilla quede marcada
    await app.db.update(prospeccionConfig).set({ ultimoError: msg, activa: false }).where(eq(prospeccionConfig.id, c.id));
    return "error-envio";
  }
  await app.db.insert(prospeccionEnvios).values({ prospectoId: p.id, paso: p.paso, asunto, estado: "Enviado", enviadoEn: ahora, casillaId: c.id });
  const siguientePaso = campana.pasos[p.paso + 1];
  await app.db
    .update(prospectos)
    .set({
      estado: siguientePaso ? "En curso" : "Terminado",
      paso: p.paso + 1,
      ultimoEnvio: ahora,
      proximoEnvio: siguientePaso ? sumarDiasHabiles(ahora, Math.max(1, siguientePaso.dias)) : ahora,
    })
    .where(eq(prospectos.id, p.id));
  if (!c.primerEnvioEn) await app.db.update(prospeccionConfig).set({ primerEnvioEn: ahora }).where(eq(prospeccionConfig.id, c.id));
  return "enviado";
}

/**
 * Secuencias sugeridas: cortas y en primera persona. El pedido principal es mirar la página y probarlo gratis
 * (se vende solo); responder queda para quien tenga dudas.
 */
/** El email a quien entró a la página y no se registró: que empezar es fácil (sube su Excel él mismo; nunca se le piden sus datos) */
export const EMAIL_VISITA: Record<"dental" | "gestion", string> = {
  dental:
    "Hola {nombre},\n\nUna cosa más y no te molesto: para probar CoreDental no hace falta cargar todo a mano. Si tenés tus pacientes en un Excel, lo subís vos mismo y el sistema reconoce las columnas solo: en un minuto está todo adentro. Tus datos son tuyos: los exportás cuando quieras.\n\nSon 14 días gratis, sin tarjeta: {link}\n\nSi tenés alguna duda puntual sobre {empresa}, preguntame por acá.\n\nSaludos,\n{firma}",
  gestion:
    "Hola {nombre},\n\nUna cosa más y no te molesto: para probar Prexacode no hace falta cargar todo a mano. Si tenés tus productos o clientes en un Excel, lo subís vos mismo y el sistema reconoce las columnas solo: en un minuto está todo adentro. Tus datos son tuyos: los exportás cuando quieras.\n\nSon 14 días gratis, sin tarjeta: {link}\n\nSi tenés alguna duda puntual sobre {empresa}, preguntame por acá.\n\nSaludos,\n{firma}",
};

export const PLANTILLAS: Record<"dental" | "gestion", { dias: number; asunto: string; cuerpo: string }[]> = {
  dental: [
    {
      dias: 0,
      asunto: "Turnos online para {empresa} || ¿Cuántos turnos se pierden por semana en {empresa}?",
      cuerpo:
        "Hola {nombre},\n\nVi {empresa} en {ciudad} y te escribo corto: armé CoreDental, un sistema para consultorios odontológicos hecho en Argentina. Los pacientes sacan turno online y les llega un recordatorio para confirmar (menos sillones vacíos), la historia clínica tiene odontograma, y a fin de mes la liquidación de obras sociales sale sola.\n\nLo mirás acá y, si te gusta, creás tu cuenta en 2 minutos y ya lo estás usando: 14 días gratis, sin tarjeta y sin tener que hablar con nadie. {link}\n\nSi te surge alguna duda, respondeme este email.\n\nSaludos,\n{firma}",
    },
    {
      dias: 3,
      asunto: "",
      cuerpo:
        "Hola {nombre}, te escribo de nuevo por si se te pasó.\n\nUna pregunta rápida: ¿cuántos turnos por semana se pierden porque el paciente no viene y no avisa? Con CoreDental le llega el recordatorio con un botón para confirmar o cancelar, y si cancela, el horario queda libre para dárselo a otro.\n\nLo probás gratis 14 días: {link}\n\n{firma}",
    },
    {
      dias: 5,
      asunto: "",
      cuerpo:
        "Hola {nombre}, este es mi último email, no quiero llenarte la casilla.\n\nSi en algún momento querés ordenar la agenda, las historias clínicas o las obras sociales del consultorio, lo probás 14 días gratis: {link}\n\nPara que tengas el número: después de la prueba, el plan para empezar sale {precio} por mes (se paga en pesos, al dólar oficial) y lo das de baja cuando quieras. {promo}\n\nY si me contestás con una línea cómo manejan hoy los turnos, te digo con sinceridad si les sirve o no.\n\n¡Gracias por leer!\n{firma}",
    },
  ],
  gestion: [
    {
      dias: 0,
      asunto: "Facturación y stock de {empresa} || ¿Seguís haciendo las facturas desde la página de ARCA?",
      cuerpo:
        "Hola {nombre},\n\nVi {empresa} en {ciudad} y te escribo corto: armé Prexacode, un sistema de gestión hecho en Argentina para comercios y PyMEs. Facturás con ARCA en segundos desde la compu o el celular, el stock se descuenta solo con cada venta y en los reportes ves cuánto vendiste cada día y cada mes. Si además vendés en cuenta corriente, te muestra quién te debe y desde cuándo. {gancho}\n\nLo mirás acá y, si te gusta, creás tu cuenta en 2 minutos y ya lo estás usando: 14 días gratis, sin tarjeta y sin tener que hablar con nadie. {link}\n\nSi te surge alguna duda, respondeme este email.\n\nSaludos,\n{firma}",
    },
    {
      dias: 3,
      asunto: "",
      cuerpo:
        "Hola {nombre}, te escribo de nuevo por si se te pasó.\n\nUna pregunta rápida: ¿hoy cómo hacés las facturas? Si es desde la página de ARCA, cada una te lleva varios minutos. Con Prexacode la hacés en segundos, sale con el logo de {empresa} y se la mandás al cliente por WhatsApp o email desde el mismo lugar. Tus planillas de Excel se importan en minutos.\n\nLo probás gratis 14 días: {link}\n\n{firma}",
    },
    {
      dias: 5,
      asunto: "",
      cuerpo:
        "Hola {nombre}, este es mi último email, no quiero llenarte la casilla.\n\nSi en algún momento querés tener la facturación, el stock y las cobranzas en un solo lugar, lo probás 14 días gratis: {link}\n\nPara que tengas el número: después de la prueba, el plan para empezar sale {precio} por mes (se paga en pesos, al dólar oficial) y lo das de baja cuando quieras. {promo}\n\nY si me contestás con una línea a qué se dedica {empresa}, te digo con sinceridad si te sirve o no.\n\n¡Gracias por leer!\n{firma}",
    },
  ],
};
