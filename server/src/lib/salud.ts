/**
 * Control diario de producción: lo que puede romperse sin que nadie lo note (una casilla pausada, la copia de
 * seguridad que no se hizo, el disco lleno, el certificado de ARCA por vencer, el correo caído).
 * Corre con las tareas automáticas: a partir de las 8 (hora de Argentina), una vez por día; si encuentra algo,
 * les manda un email a los administradores de la plataforma. También se consulta desde el panel.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { and, count, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { adminsPlataforma, configArca, plataformaConfig, prospeccionCampanas, prospeccionConfig, prospeccionEnvios, prospectos } from "../db/schema.js";
import { SinServidorPlataforma } from "./email/cartero.js";
import { enviarDePlataforma } from "./email/plataforma.js";
import { configPlataforma } from "./facturacionPropia.js";
import { ahoraAr } from "./turnos.js";

export interface Opciones {
  carpetaCopias?: string;
  ahora?: Date;
  /** Qué parte del disco está libre (0 a 1); en las pruebas, una falsa */
  espacioLibre?: () => Promise<number | null>;
}

const espacioDelServidor = async () => {
  const d = await fs.statfs("/").catch(() => null);
  return d && d.blocks > 0 ? d.bavail / d.blocks : null;
};

export interface Problema {
  que: string;
  detalle: string;
}

const HORAS = 3600_000;

/** Revisa todo y devuelve lo que anda mal (vacío: todo bien) */
export async function revisarSalud(app: FastifyInstance, opciones: Opciones = {}): Promise<Problema[]> {
  const ahora = opciones.ahora ?? new Date();
  const problemas: Problema[] = [];
  const ar = ahoraAr(ahora.getTime());
  const hoy = ar.slice(0, 10);
  const hora = Number(ar.slice(11, 13));
  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();

  // 1) Casillas de prospección pausadas por un error
  const casillas = await app.db.select().from(prospeccionConfig).where(isNotNull(prospeccionConfig.remitenteEmail));
  for (const c of casillas.filter((x) => !x.activa && x.ultimoError)) {
    problemas.push({ que: `La casilla de prospección ${c.remitenteEmail} está pausada`, detalle: `${c.ultimoError}. Revisala en el panel → Prospección y volvé a arrancarla.` });
  }

  // 2) Un día hábil, después de las 14, una casilla activa que tenía a quién escribirle y no mandó nada
  if (diaSemana >= 1 && diaSemana <= 5 && hora >= 14) {
    const inicioDia = new Date(`${hoy}T03:00:00Z`);
    for (const c of casillas.filter((x) => x.activa)) {
      const [{ n }] = await app.db.select({ n: count() }).from(prospeccionEnvios).where(and(eq(prospeccionEnvios.casillaId, c.id), eq(prospeccionEnvios.estado, "Enviado"), gte(prospeccionEnvios.enviadoEn, inicioDia)));
      if (Number(n) > 0) continue;
      const [{ porMandar }] = await app.db
        .select({ porMandar: count() })
        .from(prospectos)
        .innerJoin(prospeccionCampanas, eq(prospeccionCampanas.id, prospectos.campanaId))
        .where(and(inArray(prospectos.estado, ["Pendiente", "En curso"]), eq(prospeccionCampanas.activa, true), eq(prospeccionCampanas.producto, c.producto), lte(prospectos.proximoEnvio, ahora)));
      if (Number(porMandar) > 0) problemas.push({ que: `La casilla ${c.remitenteEmail} no mandó ningún email hoy`, detalle: `Tiene ${porMandar} contactos esperando. Puede ser un problema de la casilla o del servidor.` });
    }
  }

  // 3) El certificado de ARCA con el que se facturan las suscripciones
  const plataforma = await configPlataforma(app);
  if (plataforma.emisorEmpresaId) {
    const [arca] = await app.db.select({ modo: configArca.modo, vence: configArca.certificadoVence }).from(configArca).where(eq(configArca.empresaId, plataforma.emisorEmpresaId));
    if (arca?.modo === "produccion" && arca.vence) {
      const dias = Math.floor((arca.vence.getTime() - ahora.getTime()) / (24 * HORAS));
      if (dias <= 30) {
        problemas.push({
          que: dias < 0 ? "Venció el certificado de ARCA de tu facturación" : `El certificado de ARCA de tu facturación vence en ${dias} ${dias === 1 ? "día" : "días"}`,
          detalle: "Sin certificado no se pueden facturar las suscripciones. Generá uno nuevo en ARCA y cargalo en el panel → Facturación propia.",
        });
      }
    }
  }

  // 4) La copia de seguridad del día
  if (opciones.carpetaCopias) {
    const archivos = await fs.readdir(opciones.carpetaCopias).catch(() => null);
    if (archivos) {
      const copias = archivos.filter((a) => /^prexacode-.*\.dump$/.test(a));
      const fechas = await Promise.all(copias.map((a) => fs.stat(join(opciones.carpetaCopias!, a)).then((s) => s.mtimeMs)));
      const ultima = fechas.length ? Math.max(...fechas) : 0;
      if (!ultima) problemas.push({ que: "No hay copias de seguridad de la base", detalle: "Revisá el servicio de copias (backup) del servidor." });
      else if (ahora.getTime() - ultima > 30 * HORAS) {
        problemas.push({ que: "No se hizo la copia de seguridad de hoy", detalle: `La última es de hace ${Math.round((ahora.getTime() - ultima) / HORAS)} horas. Revisá el servicio de copias (backup) del servidor.` });
      }
    }
  }

  // 5) Lugar en el disco
  const libre = await (opciones.espacioLibre ?? espacioDelServidor)();
  if (libre !== null) {
    if (libre < 0.1) problemas.push({ que: "Al disco del servidor le queda poco lugar", detalle: `Queda ${Math.round(libre * 100)} % libre. Si se llena, la base deja de guardar.` });
  }

  // 6) El correo de la plataforma (bienvenidas, contraseñas, avisos)
  if (app.cartero.verificarPlataforma) {
    try {
      await app.cartero.verificarPlataforma();
    } catch (e) {
      if (!(e instanceof SinServidorPlataforma)) problemas.push({ que: "No funciona el correo del sistema", detalle: `No llegan las bienvenidas, los cambios de contraseña ni los avisos: ${(e as Error).message}` });
    }
  }
  return problemas;
}

/** Una vez por día, desde las 8 de la mañana: si hay algo para revisar, avisa por email a los administradores de la plataforma */
export async function controlDiario(app: FastifyInstance, opciones: Opciones = {}) {
  const ar = ahoraAr((opciones.ahora ?? new Date()).getTime());
  const hoy = ar.slice(0, 10);
  if (Number(ar.slice(11, 13)) < 8) return null;
  await configPlataforma(app);
  // Se anota antes de revisar: si el servidor se reinicia, no manda el aviso dos veces
  const [tocaHoy] = await app.db
    .update(plataformaConfig)
    .set({ saludRevisada: hoy })
    .where(and(eq(plataformaConfig.id, 1), sql`coalesce(${plataformaConfig.saludRevisada}, '') <> ${hoy}`))
    .returning({ id: plataformaConfig.id });
  if (!tocaHoy) return null;
  const problemas = await revisarSalud(app, opciones);
  if (problemas.length) {
    const admins = await app.db.select({ email: adminsPlataforma.email }).from(adminsPlataforma).where(eq(adminsPlataforma.activo, true));
    for (const a of admins) {
      await enviarDePlataforma(app, {
        para: a.email,
        asunto: problemas.length === 1 ? `Prexacode: ${problemas[0]!.que}` : `Prexacode: ${problemas.length} cosas para revisar`,
        saludo: "Hola",
        parrafos: ["El control diario de producción encontró esto:", ...problemas.map((p) => `• ${p.que}. ${p.detalle}`)],
        boton: { texto: "Abrir el panel", url: `${app.urlDe("gestion")}/admin` },
      });
    }
  }
  return problemas;
}
