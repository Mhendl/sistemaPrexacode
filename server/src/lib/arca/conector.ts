import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { configArca, puntosVenta } from "../../db/schema.js";
import type { Cifrador } from "../cifrado.js";
import { ErrorArca, type ConectorArca } from "./cliente.js";
import { crearSimulador } from "./simulador.js";
import { transporteFetch, urlsArca, type TransporteSoap, type UrlsArca } from "./soap.js";
import { pedirTicket, type TicketAcceso } from "./wsaa.js";
import { crearConectorWsfe } from "./wsfe.js";

/** Configuración ARCA de la empresa; si no existe, se crea en modo simulado con el punto de venta 1 */
export async function configuracionArca(db: Db, empresaId: string) {
  let [cfg] = await db.select().from(configArca).where(eq(configArca.empresaId, empresaId));
  if (!cfg) {
    [cfg] = await db.insert(configArca).values({ empresaId }).onConflictDoNothing().returning();
    cfg ??= (await db.select().from(configArca).where(eq(configArca.empresaId, empresaId)))[0]!;
  }
  const pvs = await db.select().from(puntosVenta).where(eq(puntosVenta.empresaId, empresaId));
  if (pvs.length === 0) {
    await db.insert(puntosVenta).values({ empresaId, numero: 1, nombre: "Casa central" }).onConflictDoNothing();
  }
  return cfg;
}

export interface OpcionesArca {
  cifrador: Cifrador;
  /** Para pruebas: apuntar a un ARCA falso */
  urls?: Partial<Record<"homologacion" | "produccion", UrlsArca>>;
  transporte?: TransporteSoap;
}

/** Un solo pedido de ticket a la vez por empresa: ARCA rechaza un segundo pedido mientras el primero sigue vigente */
const pidiendo = new Map<string, Promise<TicketAcceso>>();
/** Tickets que ARCA rechazó: no se reutilizan aunque la base todavía no se haya actualizado */
const rechazados = new Set<string>();

/** Ticket de acceso vigente: el guardado si le quedan más de 10 minutos; si no, uno nuevo de WSAA */
async function ticketVigente(db: Db, empresaId: string, o: OpcionesArca & { url: string; transporte: TransporteSoap }): Promise<TicketAcceso> {
  const [cfg] = await db.select().from(configArca).where(eq(configArca.empresaId, empresaId));
  if (cfg?.token && cfg.sign && cfg.tokenVence && !rechazados.has(cfg.token) && cfg.tokenVence.getTime() > Date.now() + 10 * 60_000) {
    return { token: cfg.token, sign: cfg.sign, vence: cfg.tokenVence };
  }
  if (!cfg?.certificado || !cfg.clavePrivadaCifrada) throw new ErrorArca("Falta cargar el certificado de ARCA", false);
  const enCurso = pidiendo.get(empresaId);
  if (enCurso) return enCurso;
  const pedido = (async () => {
    try {
      const t = await pedirTicket({ url: o.url, certificado: cfg.certificado!, clave: o.cifrador.descifrar(cfg.clavePrivadaCifrada!), transporte: o.transporte });
      await db.update(configArca).set({ token: t.token, sign: t.sign, tokenVence: t.vence, ultimaConexion: new Date(), ultimoError: null, updatedAt: new Date() }).where(eq(configArca.empresaId, empresaId));
      return t;
    } catch (e) {
      await db.update(configArca).set({ ultimoError: e instanceof Error ? e.message : String(e) }).where(eq(configArca.empresaId, empresaId));
      throw e;
    } finally {
      pidiendo.delete(empresaId);
    }
  })();
  pidiendo.set(empresaId, pedido);
  return pedido;
}

/** Elige el conector según el modo de la empresa */
export async function conectorPara(db: Db, empresa: { id: string; cuit: string }, o: OpcionesArca): Promise<ConectorArca> {
  const cfg = await configuracionArca(db, empresa.id);
  if (cfg.modo === "simulado") return crearSimulador(empresa.cuit);
  const modo = cfg.modo as "homologacion" | "produccion";
  if (!cfg.certificado || !cfg.clavePrivadaCifrada) {
    throw new ErrorArca("Falta cargar el certificado de ARCA. Revisá Configuración → Facturación ARCA.", false);
  }
  if (cfg.certificadoVence && cfg.certificadoVence.getTime() < Date.now()) {
    throw new ErrorArca("El certificado de ARCA está vencido. Generá uno nuevo en Configuración → Facturación ARCA.", false);
  }
  const urls = { ...urlsArca[modo], ...o.urls?.[modo] };
  const transporte = o.transporte ?? transporteFetch;
  // El ticket se guarda también en memoria: una vez preparado, el conector no vuelve a leer la base
  let actual: TicketAcceso | null = null;
  return crearConectorWsfe({
    modo,
    url: urls.wsfe,
    cuit: empresa.cuit,
    transporte,
    ticket: async () => {
      // Preparado (antes de la transacción): alcanza con que no haya vencido; el margen de 10 min se aplica al pedirlo
      if (actual && actual.vence.getTime() > Date.now() + 60_000) return actual;
      actual = await ticketVigente(db, empresa.id, { ...o, url: urls.wsaa, transporte });
      return actual;
    },
    invalidarTicket: async () => {
      if (actual) rechazados.add(actual.token);
      actual = null;
      // Sin esperar: puede llamarse dentro de la transacción de la factura
      void db
        .update(configArca)
        .set({ token: null, sign: null, tokenVence: null })
        .where(eq(configArca.empresaId, empresa.id))
        .catch(() => {});
    },
  });
}
