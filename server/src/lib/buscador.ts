import { promises as dns } from "node:dns";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { empresas, interesados, prospeccionBusquedas, prospeccionCampanas, prospectos, usuarios } from "../db/schema.js";
import { nuevoToken } from "./prospeccion.js";

/**
 * Buscador de contactos: busca negocios con la API oficial de Google Places (nombre, teléfono, web)
 * y entra a la web de cada uno a buscar el email de contacto que publican. Lo encontrado entra
 * directo a la campaña, filtrado y sin repetidos.
 */

export interface Lugar {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  web: string | null;
  tipo: string | null;
  abierto: boolean;
}

export interface Rastreador {
  /** Hay clave de Google configurada */
  disponible: boolean;
  /** Una página de resultados de Google Places (hasta 20) */
  lugares(consulta: string, pagina?: string): Promise<{ lugares: Lugar[]; siguiente: string | null }>;
  /** El HTML de una página web (null si no responde o no es HTML) */
  pagina(url: string): Promise<string | null>;
  /** El dominio recibe emails (tiene servidor de correo) */
  recibeCorreo(dominio: string): Promise<boolean>;
}

/** Tope de pedidos a Google por mes (cada pedido trae hasta 20 lugares): con la cuota gratis de Google sobra */
export const PEDIDOS_POR_MES = 900;
/** Por búsqueda: hasta 10 consultas y 3 páginas de resultados cada una (60 lugares): 30 pedidos, el tope diario puesto en Google */
export const MAX_CONSULTAS = 10;
const PAGINAS_POR_CONSULTA = 3;

export function rastreadorGoogle(clave: string | undefined): Rastreador {
  const mx = new Map<string, boolean>();
  return {
    disponible: !!clave,
    async lugares(consulta, pagina) {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": clave ?? "",
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.businessStatus,nextPageToken",
        },
        body: JSON.stringify({ textQuery: consulta, languageCode: "es", regionCode: "AR", pageSize: 20, ...(pagina ? { pageToken: pagina } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => "");
        throw new Error(r.status === 429 ? "Google: se llegó al tope de búsquedas del día (lo encontrado hasta acá ya está en la campaña). Seguí mañana." : `Google respondió ${r.status}: ${detalle.slice(0, 200)}`);
      }
      const d = (await r.json()) as {
        places?: { id: string; displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; primaryType?: string; businessStatus?: string }[];
        nextPageToken?: string;
      };
      return {
        lugares: (d.places ?? []).map((p) => ({
          id: p.id,
          nombre: p.displayName?.text ?? "",
          direccion: p.formattedAddress ?? null,
          telefono: p.nationalPhoneNumber ?? null,
          web: p.websiteUri ?? null,
          tipo: p.primaryType ?? null,
          abierto: !p.businessStatus || p.businessStatus === "OPERATIONAL",
        })),
        siguiente: d.nextPageToken ?? null,
      };
    },
    async pagina(url) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PrexacodeBot/1.0; +https://productos.prexacode.com)", Accept: "text/html" },
          redirect: "follow",
          signal: AbortSignal.timeout(8_000),
        });
        if (!r.ok || !/html/i.test(r.headers.get("content-type") ?? "")) return null;
        return (await r.text()).slice(0, 1_000_000);
      } catch {
        return null;
      }
    },
    async recibeCorreo(dominio) {
      if (!mx.has(dominio)) mx.set(dominio, await dns.resolveMx(dominio).then((r) => r.length > 0, () => false));
      return mx.get(dominio)!;
    },
  };
}

/** Para el servidor de pruebas automáticas: lugares y webs inventados (no sale a internet) */
export function rastreadorDePrueba(): Rastreador {
  return {
    disponible: true,
    async lugares(consulta) {
      const zona = consulta.split(/ en /i)[1]?.trim() ?? "Prueba";
      const slug = zona.toLowerCase().replace(/[^a-z]/g, "");
      return {
        lugares: [
          { id: `${slug}-1`, nombre: `Consultorio Sonrisa ${zona}`, direccion: `Calle 1, ${zona}`, telefono: "011 4000-0001", web: `https://sonrisa${slug}.test/`, tipo: "dentist", abierto: true },
          { id: `${slug}-2`, nombre: `Clínica Norte ${zona}`, direccion: `Calle 2, ${zona}`, telefono: "011 4000-0002", web: `https://norte${slug}.test/`, tipo: "dental_clinic", abierto: true },
          { id: `${slug}-3`, nombre: `Hospital Municipal ${zona}`, direccion: null, telefono: null, web: `https://hospital${slug}.test/`, tipo: "hospital", abierto: true },
          { id: `${slug}-4`, nombre: `Odontología sin web ${zona}`, direccion: null, telefono: "011 4000-0004", web: null, tipo: "dentist", abierto: true },
        ],
        siguiente: null,
      };
    },
    async pagina(url) {
      const host = new URL(url).hostname;
      if (url.endsWith("/contacto")) return `<p>Escribinos a <a href="mailto:turnos@${host}">turnos@${host}</a></p>`;
      if (host.startsWith("norte")) return `<a href="/contacto">Contacto</a>`;
      return `<footer>info@${host} · <img src="logo@2x.png"></footer>`;
    },
    async recibeCorreo() {
      return true;
    },
  };
}

// ---------------------------------------------------------------- emails de una web

const GRATUITOS = /^(gmail|hotmail|yahoo|outlook|live|icloud|fibertel|speedy|arnet)\.(com|com\.ar|ar)(\.ar)?$/i;
const NO_ES_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js|ico)$/i;
const EMAIL_MALO = /^(no-?reply|noreply|mailer-daemon|postmaster|abuse|webmaster|example|test|sentry|wix|wordpress|rrhh|recursoshumanos|cv|empleo|empleos|trabajo|seleccion|busquedas?|cobranzas|legal|privacidad|privacy|soporte|support|prensa)@/i;
const PREFERIDO = /^(info|contacto|consultas|hola|ventas|administracion|recepcion|turnos|estudio|odontologia)@/i;
const REDES = /(instagram|facebook|linktr|wa\.me|whatsapp|twitter|tiktok|youtube|google)\./i;

const dominioDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/** Los emails de un HTML (incluye los de mailto y los que esconde Cloudflare) */
export function emailsDelHtml(html: string): string[] {
  const texto = html
    .replace(/&#64;|&commat;|&#x40;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/\s*\[\s*(at|arroba)\s*\]\s*/gi, "@")
    .replace(/%40/g, "@");
  const out = new Set<string>();
  for (const m of texto.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) out.add(m[0].toLowerCase().replace(/^mailto:/, ""));
  // Cloudflare: data-cfemail="…" (el email cifrado con XOR)
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) {
    const hex = m[1]!;
    const k = parseInt(hex.slice(0, 2), 16);
    let e = "";
    for (let i = 2; i < hex.length; i += 2) e += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
    if (e.includes("@")) out.add(e.toLowerCase());
  }
  return [...out];
}

/** El mejor email del negocio: de su propio dominio (o de un correo gratuito), sin casillas que no son para esto */
export function mejorEmail(emails: string[], web: string): string | null {
  const sitio = dominioDe(web);
  const validos = emails.filter((e) => {
    const dom = e.split("@")[1] ?? "";
    if (NO_ES_EMAIL.test(e) || EMAIL_MALO.test(e) || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;
    // Un email de otro dominio suele ser de quien hizo la web o de un servicio (no del negocio)
    return GRATUITOS.test(dom) || (!!sitio && (dom === sitio || sitio.endsWith(`.${dom}`) || dom.endsWith(`.${sitio}`)));
  });
  validos.sort((a, b) => Number(!PREFERIDO.test(a)) - Number(!PREFERIDO.test(b)) || Number(GRATUITOS.test(a.split("@")[1]!)) - Number(GRATUITOS.test(b.split("@")[1]!)));
  return validos[0] ?? null;
}

/** Links a "Contacto" o "Nosotros" de la misma web */
function paginasDeContacto(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const [, href, texto] = m;
    if (!/contact|nosotros|about|quienes|turnos|ubicaci/i.test(`${href} ${texto}`)) continue;
    try {
      const u = new URL(href!, base);
      if (dominioDe(u.href) === dominioDe(base) && !out.includes(u.href)) out.push(u.href);
    } catch {
      /* link roto */
    }
  }
  return out.slice(0, 3);
}

export async function emailDeLaWeb(r: Rastreador, web: string): Promise<string | null> {
  if (REDES.test(web)) return null;
  const inicio = await r.pagina(web);
  if (!inicio) return null;
  let email = mejorEmail(emailsDelHtml(inicio), web);
  if (!email) {
    for (const url of paginasDeContacto(inicio, web)) {
      const html = await r.pagina(url);
      email = html ? mejorEmail(emailsDelHtml(html), web) : null;
      if (email) break;
    }
  }
  if (email && !(await r.recibeCorreo(email.split("@")[1]!))) return null;
  return email;
}

// ---------------------------------------------------------------- la búsqueda

/** Lo que no es un cliente: organismos, hospitales, obras sociales, cadenas y grandes empresas */
const NO_CLIENTE =
  /\b(hospital|municipal|municipalidad|universidad|facultad|obra social|osde|swiss medical|omint|galeno|sanatorio|c[ií]rculo|colegio|federaci[oó]n|sindicato|ministerio|gobierno|easy|sodimac|blaisten|coto|carrefour|walmart|changomas|chango m[aá]s|jumbo|diarco|makro|vital|yenny|el ateneo|c[uú]spide|musimundo|garbarino|fr[aá]vega|mercado libre)\b/i;
const TIPOS_FUERA = new Set(["hospital", "university", "school", "government_office", "local_government_office", "city_hall", "embassy", "courthouse"]);

/** "Consultorio Dra. Laura Pérez - Odontología" → empresa y nombre */
function datosDe(nombre: string) {
  const partes = nombre.split(/\s[-–|·]\s/);
  let empresa = (partes[0]!.trim().length <= 4 && partes[1] ? partes[1] : partes[0]!).replace(/["“”]/g, "").trim();
  if (empresa.length > 60) empresa = empresa.split(/\s+/).slice(0, 5).join(" ");
  const dr = /\bDr(?:a)?\.?\s+([A-ZÁÉÍÓÚ][a-záéíóúñ]+)/.exec(nombre);
  return { empresa: empresa.slice(0, 120), nombre: dr ? dr[1]! : null };
}

/** Busca en segundo plano y va guardando el avance (el panel lo muestra) */
export async function ejecutarBusqueda(app: FastifyInstance, id: string) {
  const [b] = await app.db.select().from(prospeccionBusquedas).where(eq(prospeccionBusquedas.id, id));
  if (!b) return;
  const avance = { pedidos: 0, lugares: 0, conWeb: 0, conEmail: 0, nuevos: 0 };
  const guardar = (extra: Partial<typeof prospeccionBusquedas.$inferInsert> = {}) => app.db.update(prospeccionBusquedas).set({ ...avance, ...extra }).where(eq(prospeccionBusquedas.id, id));
  try {
    let disponibles = PEDIDOS_POR_MES - (await pedidosDelMes(app));
    const vistos = new Set<string>();
    for (const consulta of b.consultas) {
      const zona = consulta.split(/ en /i).at(-1)?.trim() || null;
      const rubro = consulta.split(/ en /i)[0]?.trim() || null;
      let pagina: string | undefined;
      for (let n = 0; n < PAGINAS_POR_CONSULTA; n++) {
        if (disponibles <= 0) throw new Error(`Se llegó al tope de ${PEDIDOS_POR_MES} búsquedas en Google de este mes`);
        const r = await app.rastreador.lugares(consulta, pagina);
        avance.pedidos++;
        disponibles--;
        const candidatos = r.lugares.filter((l) => !vistos.has(l.id) && l.abierto && !NO_CLIENTE.test(l.nombre) && !TIPOS_FUERA.has(l.tipo ?? ""));
        for (const l of r.lugares) vistos.add(l.id);
        avance.lugares += candidatos.length;
        // De a 5 webs a la vez
        const conWeb = candidatos.filter((l) => l.web);
        avance.conWeb += conWeb.length;
        const encontrados: { lugar: Lugar; email: string }[] = [];
        for (let i = 0; i < conWeb.length; i += 5) {
          const tanda = await Promise.all(conWeb.slice(i, i + 5).map(async (l) => ({ lugar: l, email: await emailDeLaWeb(app.rastreador, l.web!) })));
          for (const t of tanda) if (t.email) encontrados.push({ lugar: t.lugar, email: t.email });
        }
        avance.conEmail += encontrados.length;
        avance.nuevos += await guardarNuevos(
          app,
          b.campanaId,
          encontrados.map(({ lugar, email }) => ({ email, ...datosDe(lugar.nombre), rubro, ciudad: zona, web: dominioDe(lugar.web!), telefono: lugar.telefono })),
        );
        await guardar();
        if (!r.siguiente) break;
        pagina = r.siguiente;
      }
    }
    await guardar({ estado: "Terminada", terminadaEn: new Date() });
  } catch (e) {
    await guardar({ estado: "Error", error: (e as Error).message.slice(0, 500), terminadaEn: new Date() });
  }
}

export async function pedidosDelMes(app: FastifyInstance, ahora = new Date()) {
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const [{ n }] = await app.db
    .select({ n: sql<number>`coalesce(sum(${prospeccionBusquedas.pedidos}), 0)::int` })
    .from(prospeccionBusquedas)
    .where(gte(prospeccionBusquedas.createdAt, inicio));
  return Number(n);
}

type Fila = { email: string; nombre: string | null; empresa: string; rubro: string | null; ciudad: string | null; web: string | null; telefono: string | null };

/** Guarda los que no están en ninguna lista, no son clientes ni pidieron una demo (ni comparten web o nombre con alguien ya cargado) */
async function guardarNuevos(app: FastifyInstance, campanaId: string, filas: Fila[]) {
  if (!filas.length) return 0;
  const emails = filas.map((f) => f.email);
  const webs = filas.map((f) => f.web).filter((w): w is string => !!w);
  const nombres = filas.map((f) => f.empresa.toLowerCase());
  const [ya, clientes, empresasEmails, pidieron, mismaWeb, mismoNombre] = await Promise.all([
    app.db.select({ email: prospectos.email }).from(prospectos).where(inArray(prospectos.email, emails)),
    app.db.select({ email: usuarios.email }).from(usuarios).where(inArray(sql`lower(${usuarios.email})`, emails)),
    app.db.select({ email: empresas.email }).from(empresas).where(inArray(sql`lower(${empresas.email})`, emails)),
    app.db.select({ email: interesados.email }).from(interesados).where(inArray(interesados.email, emails)),
    webs.length ? app.db.select({ web: prospectos.web }).from(prospectos).where(inArray(prospectos.web, webs)) : Promise.resolve([]),
    app.db.select({ n: sql<string>`lower(${prospectos.empresa})` }).from(prospectos).where(inArray(sql`lower(${prospectos.empresa})`, nombres)),
  ]);
  const fuera = new Set([...ya, ...clientes, ...empresasEmails, ...pidieron].map((x) => (x.email ?? "").toLowerCase()));
  const websFuera = new Set(mismaWeb.map((x) => x.web));
  const nombresFuera = new Set(mismoNombre.map((x) => x.n));
  const vistos = new Set<string>();
  const nuevas = filas.filter((f) => {
    const clave = f.email;
    if (fuera.has(f.email) || (f.web && websFuera.has(f.web)) || nombresFuera.has(f.empresa.toLowerCase()) || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  if (!nuevas.length) return 0;
  const guardados = await app.db
    .insert(prospectos)
    .values(nuevas.map((f) => ({ ...f, campanaId, token: nuevoToken() })))
    .onConflictDoNothing()
    .returning({ id: prospectos.id });
  return guardados.length;
}

/** Las últimas búsquedas, con el nombre de la campaña (una que quedó colgada por un reinicio figura con error) */
export async function ultimasBusquedas(app: FastifyInstance) {
  await app.db
    .update(prospeccionBusquedas)
    .set({ estado: "Error", error: "Se cortó (se reinició el servidor): volvé a buscar", terminadaEn: new Date() })
    .where(and(eq(prospeccionBusquedas.estado, "En curso"), sql`${prospeccionBusquedas.createdAt} < now() - interval '30 minutes'`));
  return app.db
    .select({ b: prospeccionBusquedas, campana: prospeccionCampanas.nombre })
    .from(prospeccionBusquedas)
    .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospeccionBusquedas.campanaId))
    .orderBy(desc(prospeccionBusquedas.createdAt))
    .limit(10);
}
