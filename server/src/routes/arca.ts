import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { configArca, empresas, puntosVenta } from "../db/schema.js";
import { aliasPara, coincidenClaveYCertificado, generarClaveYCsr, leerCertificado } from "../lib/arca/certificados.js";
import { ErrorArca } from "../lib/arca/cliente.js";
import { TIPO_CBTE, letraSegun } from "../lib/arca/codigos.js";
import { conectorPara, configuracionArca } from "../lib/arca/conector.js";
import { requirePermiso } from "../lib/auth.js";
import { badRequest, HttpError, parse } from "../lib/errors.js";

type Config = typeof configArca.$inferSelect;

/** Los certificados de homologación los emite la CA de prueba de ARCA ("Computadores Test") */
const esDePrueba = (emisor: string) => /test/i.test(emisor);

function datosCertificado(c: Config) {
  if (!c.certificado) return null;
  try {
    const d = leerCertificado(c.certificado);
    return { alias: d.alias, cuit: d.cuit, desde: d.desde, vence: d.vence, emisor: d.emisor, deHomologacion: esDePrueba(d.emisor) };
  } catch {
    return null;
  }
}

/** Configuración de la conexión con ARCA (solo administradores) */
export const arcaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requirePermiso("configuracion"));

  const empresaDe = async (id: string) => (await app.db.select().from(empresas).where(eq(empresas.id, id)))[0]!;

  const estado = async (empresaId: string) => {
    const c = await configuracionArca(app.db, empresaId);
    const e = await empresaDe(empresaId);
    return {
      modo: c.modo,
      certificado: datosCertificado(c),
      csrPendiente: !!c.csr,
      aliasSugerido: aliasPara(e.razonSocial),
      ultimaConexion: c.ultimaConexion,
      ultimoError: c.ultimoError,
    };
  };

  app.get("/", async (req) => estado(req.user.empresaId));

  /** Genera la clave privada (queda cifrada en el servidor) y el pedido de certificado para subir a ARCA */
  app.post("/csr", async (req) => {
    const { alias } = parse(z.object({ alias: z.string().trim().regex(/^[a-zA-Z0-9-]{3,40}$/, "Solo letras, números y guiones (3 a 40)").optional() }), req.body ?? {});
    const e = await empresaDe(req.user.empresaId);
    await configuracionArca(app.db, e.id);
    const a = alias ?? aliasPara(e.razonSocial);
    const { clavePrivadaPem, csrPem } = generarClaveYCsr({ cuit: e.cuit, razonSocial: e.razonSocial, alias: a });
    await app.db.update(configArca).set({ csr: csrPem, clavePendienteCifrada: app.cifrador.cifrar(clavePrivadaPem), updatedAt: new Date() }).where(eq(configArca.empresaId, e.id));
    return { csr: csrPem, alias: a, archivo: `${a}.csr` };
  });

  app.get("/csr", async (req) => {
    const c = await configuracionArca(app.db, req.user.empresaId);
    if (!c.csr) throw new HttpError(404, "No hay un pedido de certificado generado");
    return { csr: c.csr };
  });

  /** Carga el certificado que devolvió ARCA: tiene que ser de este CUIT y corresponder a la clave generada acá */
  app.post("/certificado", async (req) => {
    const { pem } = parse(z.object({ pem: z.string().min(100, "Pegá o subí el certificado completo").max(20_000) }), req.body);
    const e = await empresaDe(req.user.empresaId);
    const c = await configuracionArca(app.db, e.id);
    let datos;
    try {
      datos = leerCertificado(pem);
    } catch {
      throw badRequest("El archivo no es un certificado válido. Subí el .crt que descargaste de ARCA.", { pem: "Certificado inválido" });
    }
    if (datos.cuit && datos.cuit !== e.cuit) throw badRequest(`El certificado es del CUIT ${datos.cuit}, no del de esta empresa.`, { pem: "CUIT distinto" });
    if (datos.vence.getTime() < Date.now()) throw badRequest("El certificado ya venció. Generá un pedido nuevo.", { pem: "Vencido" });

    // Puede corresponder al pedido pendiente (lo normal) o a la clave actual (renovación con la misma clave)
    const pendiente = c.clavePendienteCifrada ? app.cifrador.descifrar(c.clavePendienteCifrada) : null;
    const actual = c.clavePrivadaCifrada ? app.cifrador.descifrar(c.clavePrivadaCifrada) : null;
    let clave: string;
    if (pendiente && coincidenClaveYCertificado(pem, pendiente)) clave = c.clavePendienteCifrada!;
    else if (actual && coincidenClaveYCertificado(pem, actual)) clave = c.clavePrivadaCifrada!;
    else throw badRequest("Este certificado no corresponde al pedido (CSR) generado en Prexacode. Generá el pedido acá y subí ese en ARCA.", { pem: "No corresponde" });

    const certificado = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)![0];
    await app.db
      .update(configArca)
      .set({ certificado, clavePrivadaCifrada: clave, certificadoVence: datos.vence, csr: null, clavePendienteCifrada: null, token: null, sign: null, tokenVence: null, ultimoError: null, updatedAt: new Date() })
      .where(eq(configArca.empresaId, e.id));
    return estado(e.id);
  });

  app.put("/modo", async (req) => {
    const { modo } = parse(z.object({ modo: z.enum(["simulado", "homologacion", "produccion"], { errorMap: () => ({ message: "Modo inválido" }) }) }), req.body);
    const c = await configuracionArca(app.db, req.user.empresaId);
    if (modo !== "simulado") {
      const cert = datosCertificado(c);
      if (!cert) throw badRequest("Primero cargá el certificado de ARCA", { modo: "Falta el certificado" });
      if (modo === "produccion" && cert.deHomologacion) throw badRequest("El certificado cargado es de homologación (prueba). Para producción necesitás uno emitido por ARCA para producción.", { modo: "Certificado de prueba" });
      if (modo === "homologacion" && !cert.deHomologacion) throw badRequest("El certificado cargado es de producción. Para homologación se usa uno de prueba.", { modo: "Certificado de producción" });
    }
    // Cada ambiente tiene su propio ticket de acceso
    await app.db.update(configArca).set({ modo, token: null, sign: null, tokenVence: null, ultimoError: null, updatedAt: new Date() }).where(eq(configArca.empresaId, req.user.empresaId));
    return estado(req.user.empresaId);
  });

  /** Prueba la conexión: pide acceso a WSAA y consulta el último comprobante autorizado */
  app.post("/probar", async (req) => {
    const e = await empresaDe(req.user.empresaId);
    const c = await configuracionArca(app.db, e.id);
    if (c.modo === "simulado") throw badRequest("En modo de prueba no hay conexión con ARCA para probar");
    const [pv] = await app.db.select().from(puntosVenta).where(and(eq(puntosVenta.empresaId, e.id), eq(puntosVenta.activo, true))).orderBy(asc(puntosVenta.numero));
    if (!pv) throw badRequest("Cargá al menos un punto de venta activo");
    const letra = letraSegun(e.condicionIva, "Consumidor Final");
    const tipo = TIPO_CBTE.factura[letra];
    try {
      const conector = await conectorPara(app.db, e, { cifrador: app.cifrador, ...app.arcaPruebas });
      const ultimo = await conector.ultimoAutorizado(pv.numero, tipo);
      await app.db.update(configArca).set({ ultimaConexion: new Date(), ultimoError: null }).where(eq(configArca.empresaId, e.id));
      return { ok: true, puntoVenta: pv.numero, tipo: `Factura ${letra}`, ultimoNumero: ultimo };
    } catch (err) {
      if (!(err instanceof ErrorArca)) throw err;
      await app.db.update(configArca).set({ ultimoError: err.message }).where(eq(configArca.empresaId, e.id));
      throw new HttpError(502, `ARCA respondió: ${err.message}`);
    }
  });
};
