import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aliasPara, coincidenClaveYCertificado, firmarCms, generarClaveYCsr, leerCertificado } from "../src/lib/arca/certificados.js";
import { armarTra } from "../src/lib/arca/wsaa.js";
import { detalleCae } from "../src/lib/arca/wsfe.js";
import { certificadoAjeno, contenidoCms, crearArcaFalso, crearCa } from "./arca-falso.js";
import { auth, crearApp, cuitValido, registrarEmpresa, type TestApp } from "./helpers.js";

const caPrueba = crearCa("Computadores Test");
const caProduccion = crearCa("Computadores");

describe("certificados", () => {
  const cuit = "30712345678";
  const { clavePrivadaPem, csrPem } = generarClaveYCsr({ cuit, razonSocial: "Ñandú Comercial S.R.L.", alias: "prexacode-nandu" });

  it("el pedido (CSR) lleva los datos que exige ARCA y está firmado", () => {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    expect(csr.verify()).toBe(true);
    const campo = (t: string) => csr.subject.attributes.find((a) => a.shortName === t || a.type === t)?.value;
    expect(campo("C")).toBe("AR");
    expect(campo("O")).toBe("Nandu Comercial S.R.L.");
    expect(campo("CN")).toBe("prexacode-nandu");
    expect(campo("2.5.4.5")).toBe(`CUIT ${cuit}`);
    expect((csr.publicKey as forge.pki.rsa.PublicKey).n.bitLength()).toBe(2048);
    expect(aliasPara("Ñandú Comercial S.R.L.")).toBe("prexacode-nandu-comercial-s-r-l");
  });

  it("lee el certificado de ARCA y verifica que corresponda a la clave", () => {
    const cert = caPrueba.firmar(csrPem);
    const d = leerCertificado(`Texto antes\n${cert}\ntexto después`);
    expect(d).toMatchObject({ cuit, alias: "prexacode-nandu", emisor: "Computadores Test" });
    expect(d.vence.getTime()).toBeGreaterThan(Date.now());
    expect(coincidenClaveYCertificado(cert, clavePrivadaPem)).toBe(true);
    expect(coincidenClaveYCertificado(certificadoAjeno(caPrueba, cuit), clavePrivadaPem)).toBe(false);
    expect(() => leerCertificado("no es un certificado")).toThrow();
  });

  it("firma el TRA en CMS con el contenido incluido (verificado con OpenSSL)", () => {
    const cert = caPrueba.firmar(csrPem);
    const tra = armarTra("wsfe", new Date("2026-09-26T13:00:00Z"));
    expect(tra).toContain("<generationTime>2026-09-26T09:50:00-03:00</generationTime>");
    expect(tra).toContain("<expirationTime>2026-09-26T10:10:00-03:00</expirationTime>");
    expect(tra).toContain("<service>wsfe</service>");
    const cms = firmarCms(tra, cert, clavePrivadaPem);

    let openssl = true;
    try {
      execFileSync("openssl", ["version"], { stdio: "ignore" });
    } catch {
      openssl = false;
    }
    if (!openssl) {
      // Sin OpenSSL: al menos el contenido y el certificado van dentro del CMS
      const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms))) as forge.pkcs7.PkcsSignedData;
      expect(contenidoCms(msg)).toBe(tra);
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "cms-"));
    try {
      writeFileSync(join(dir, "tra.cms"), Buffer.from(cms, "base64"));
      writeFileSync(join(dir, "ca.pem"), caPrueba.pem);
      const contenido = execFileSync("openssl", ["cms", "-verify", "-inform", "DER", "-in", join(dir, "tra.cms"), "-CAfile", join(dir, "ca.pem"), "-purpose", "any"], { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
      expect(contenido).toBe(tra);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("detalle del pedido de CAE (WSFEv1)", () => {
  const base = { cuitEmisor: "30712345678", puntoVenta: 2, tipoCbte: 1, numero: 15, concepto: 1 as const, docTipo: 80, docNro: "30500010912", condicionIvaReceptor: 1, fecha: "2026-09-26" };

  it("factura A: importes con 2 decimales, fecha AAAAMMDD, IVA por alícuota y condición del receptor", () => {
    const x = detalleCae({ ...base, importeTotal: 1210, importeNeto: 1000, importeExento: 0, importeIva: 210, iva: [{ id: 5, baseImponible: 1000, importe: 210 }] });
    expect(x).toContain("<ar:CbteDesde>15</ar:CbteDesde><ar:CbteHasta>15</ar:CbteHasta><ar:CbteFch>20260926</ar:CbteFch>");
    expect(x).toContain("<ar:ImpTotal>1210.00</ar:ImpTotal>");
    expect(x).toContain("<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>1000.00</ar:BaseImp><ar:Importe>210.00</ar:Importe></ar:AlicIva></ar:Iva>");
    expect(x).toContain("<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>");
    expect(x).toContain("<ar:MonId>PES</ar:MonId>");
    expect(x).not.toContain("FchServDesde");
  });

  it("factura C sin IVA; servicios con período y vencimiento; nota de crédito con comprobante asociado", () => {
    const c = detalleCae({ ...base, tipoCbte: 11, concepto: 2, importeTotal: 5000, importeNeto: 5000, importeExento: 0, importeIva: 0, iva: [], fechaServicioDesde: "2026-09-01", fechaServicioHasta: "2026-09-30", fechaVencimientoPago: "2026-10-10" });
    expect(c).not.toContain("<ar:Iva>");
    expect(c).toContain("<ar:FchServDesde>20260901</ar:FchServDesde><ar:FchServHasta>20260930</ar:FchServHasta><ar:FchVtoPago>20261010</ar:FchVtoPago>");
    const nc = detalleCae({ ...base, tipoCbte: 3, importeTotal: 121, importeNeto: 100, importeExento: 0, importeIva: 21, iva: [{ id: 5, baseImponible: 100, importe: 21 }], asociado: { tipoCbte: 1, puntoVenta: 2, numero: 14, cuit: "30712345678", fecha: "2026-09-20" } });
    expect(nc).toContain("<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>2</ar:PtoVta><ar:Nro>14</ar:Nro><ar:Cuit>30712345678</ar:Cuit><ar:CbteFch>20260920</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>");
  });
});

describe("conexión con ARCA (contra un ARCA falso)", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  const arca = crearArcaFalso();

  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ arca: { urls: arca.urls, transporte: arca.transporte } }));
  });
  afterAll(() => cerrar());

  const api = (token: string) => ({
    get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
    post: (url: string, payload: object = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload }),
    put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload }),
  });

  /** Empresa con certificado de homologación cargado y en modo homologación */
  async function conectada(condicionIva = "Responsable Inscripto") {
    const { token } = await registrarEmpresa(app, "Conectada S.A.", condicionIva);
    const a = api(token);
    const { csr } = (await a.post("/arca/csr")).json();
    const cert = caPrueba.firmar(csr);
    expect((await a.post("/arca/certificado", { pem: cert })).statusCode).toBe(200);
    expect((await a.put("/arca/modo", { modo: "homologacion" })).statusCode).toBe(200);
    const cliente = (await a.post("/clientes", { razonSocial: "Cliente ARCA S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).json();
    return { a, token, cliente };
  }

  const emitir = (a: ReturnType<typeof api>, clienteId: string, extra: object = {}) =>
    a.post("/comprobantes", { clienteId, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio técnico", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }], ...extra });

  it("alta del certificado: pedido, validaciones y paso a homologación", async () => {
    const { token } = await registrarEmpresa(app, "Ñandú Hogar S.A.");
    const a = api(token);
    const inicial = (await a.get("/arca")).json();
    expect(inicial).toMatchObject({ modo: "simulado", certificado: null, csrPendiente: false, aliasSugerido: "prexacode-nandu-hogar-s-a" });
    expect((await a.put("/arca/modo", { modo: "homologacion" })).statusCode).toBe(400); // sin certificado

    const gen = (await a.post("/arca/csr")).json();
    expect(gen.csr).toContain("-----BEGIN CERTIFICATE REQUEST-----");
    expect(gen.archivo).toBe("prexacode-nandu-hogar-s-a.csr");
    expect((await a.get("/arca")).json().csrPendiente).toBe(true);
    expect((await a.get("/arca/csr")).json().csr).toBe(gen.csr);

    // Rechazos
    const ajeno = await a.post("/arca/certificado", { pem: certificadoAjeno(caPrueba, (await a.get("/empresa")).json().cuit) });
    expect(ajeno.statusCode).toBe(400);
    expect(ajeno.json().error).toContain("no corresponde al pedido");
    const otroCuit = await a.post("/arca/certificado", { pem: certificadoAjeno(caPrueba, "20111111112") });
    expect(otroCuit.json().error).toContain("es del CUIT 20111111112");
    expect((await a.post("/arca/certificado", { pem: "x".repeat(200) })).json().error).toContain("no es un certificado válido");
    expect((await a.post("/arca/certificado", { pem: caPrueba.firmar(gen.csr, { dias: -1, desdeDias: -30 }) })).json().error).toContain("venció");

    // El bueno
    const ok = await a.post("/arca/certificado", { pem: caPrueba.firmar(gen.csr) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ csrPendiente: false, certificado: { alias: "prexacode-nandu-hogar-s-a", emisor: "Computadores Test", deHomologacion: true } });

    // Un certificado de prueba no sirve para producción
    const prod = await a.put("/arca/modo", { modo: "produccion" });
    expect(prod.statusCode).toBe(400);
    expect(prod.json().error).toContain("es de homologación");
    expect((await a.put("/arca/modo", { modo: "homologacion" })).json().modo).toBe("homologacion");

    // La clave privada nunca sale por la API y queda cifrada en la base
    expect(JSON.stringify((await a.get("/arca")).json())).not.toContain("PRIVATE KEY");
  });

  it("probar la conexión: pide acceso a WSAA y consulta el último número", async () => {
    const { a } = await conectada();
    const antes = arca.estado.logins;
    const r = await a.post("/arca/probar");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, puntoVenta: 1, tipo: "Factura B", ultimoNumero: 0 });
    expect(arca.estado.logins).toBe(antes + 1);
    expect((await a.get("/arca")).json().ultimaConexion).not.toBeNull();
  });

  it("emite con CAE real: numera según ARCA, reusa el ticket y manda los datos correctos", async () => {
    const { a, cliente } = await conectada();
    const antes = arca.estado.logins;
    const f1 = await emitir(a, cliente.id);
    expect(f1.statusCode).toBe(201);
    expect(f1.json()).toMatchObject({ estado: "Autorizado", numero: 1, modo: "homologacion", cae: expect.stringMatching(/^\d{14}$/) });
    const f2 = (await emitir(a, cliente.id)).json();
    expect(f2).toMatchObject({ estado: "Autorizado", numero: 2 });
    expect(arca.estado.logins).toBe(antes + 1); // un solo ticket para las dos

    const pedido = arca.estado.pedidos.at(-1)!;
    expect(pedido).toMatchObject({ ptoVta: 1, tipo: 1 });
    expect(pedido.det).toMatchObject({ DocTipo: "80", DocNro: cliente.cuit, ImpTotal: "1210.00", ImpNeto: "1000.00", ImpIVA: "210.00", CondicionIVAReceptorId: "1" });

    // Nota de crédito con su factura asociada
    const nc = await a.post("/comprobantes", { clase: "nota_credito", asociadoId: f2.id, clienteId: cliente.id, moverStock: false, items: [{ descripcion: "Servicio técnico", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] });
    expect(nc.json()).toMatchObject({ estado: "Autorizado", tipoCbte: 3, numero: 1 });
    expect(arca.estado.pedidos.at(-1)!.det.CbtesAsoc).toMatchObject({ CbteAsoc: { Tipo: "1", Nro: "2" } });
  });

  it("factura C de un monotributista: sin IVA discriminado", async () => {
    const { a, cliente } = await conectada("Monotributista");
    const f = await emitir(a, cliente.id);
    expect(f.json()).toMatchObject({ estado: "Autorizado", tipoCbte: 11, total: 1000 });
    expect(arca.estado.pedidos.at(-1)!.det).toMatchObject({ ImpNeto: "1000.00", ImpIVA: "0.00" });
    expect(arca.estado.pedidos.at(-1)!.det.Iva).toBeUndefined();
  });

  it("si ARCA rechaza, queda Rechazado con el motivo, sin número ni stock", async () => {
    const { a, cliente } = await conectada();
    arca.estado.rechazar = { codigo: 10015, mensaje: "El documento del receptor no es valido" };
    const r = (await emitir(a, cliente.id)).json();
    expect(r).toMatchObject({ estado: "Rechazado", numero: null, cae: null, errores: [{ codigo: 10015, mensaje: "El documento del receptor no es valido" }] });
    // la siguiente sale con el número 1 (el rechazado no lo consumió)
    expect((await emitir(a, cliente.id)).json()).toMatchObject({ estado: "Autorizado", numero: 1 });
  });

  it("ticket rechazado: avisa, lo descarta y el siguiente intento pide uno nuevo", async () => {
    const { a, cliente } = await conectada();
    expect((await emitir(a, cliente.id)).statusCode).toBe(201);
    const logins = arca.estado.logins;
    arca.estado.rechazarTokenUnaVez = true;
    const mal = await emitir(a, cliente.id);
    expect(mal.statusCode).toBe(503);
    expect(mal.json().error).toContain("Administrador de Relaciones");
    const bien = await emitir(a, cliente.id);
    expect(bien.json()).toMatchObject({ estado: "Autorizado", numero: 2 });
    expect(arca.estado.logins).toBe(logins + 1);
  });

  it("ticket por vencer: pide uno nuevo antes de usarlo", async () => {
    arca.estado.horasTicket = 0.1; // 6 minutos: menos que el margen de 10
    try {
      const { a, cliente } = await conectada();
      const antes = arca.estado.logins;
      await emitir(a, cliente.id);
      await emitir(a, cliente.id);
      expect(arca.estado.logins).toBe(antes + 2);
    } finally {
      arca.estado.horasTicket = 12;
    }
  });

  it("ARCA caído: no se guarda ningún comprobante ni se consume numeración", async () => {
    const { a, cliente } = await conectada();
    await a.post("/arca/probar"); // ya tiene ticket
    arca.estado.caido = true;
    try {
      const r = await emitir(a, cliente.id);
      expect(r.statusCode).toBe(503);
      expect(r.json().error).toContain("No se emitió ningún comprobante");
      expect((await a.get("/comprobantes")).json()).toHaveLength(0);
      const p = await a.post("/arca/probar");
      expect(p.statusCode).toBe(502);
      expect((await a.get("/arca")).json().ultimoError).toContain("ECONNREFUSED");
    } finally {
      arca.estado.caido = false;
    }
    expect((await emitir(a, cliente.id)).json()).toMatchObject({ estado: "Autorizado", numero: 1 });
  });

  it("error de WSAA con el certificado (no autorizado): se informa claro", async () => {
    const { a } = await conectada();
    arca.estado.faultWsaa = { codigo: "cms.cert.untrusted", mensaje: "Certificado no emitido por AC de confianza" };
    const r = await a.post("/arca/probar");
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toContain("Certificado no emitido por AC de confianza");
  });

  it("producción con certificado de producción; y Ventas no puede tocar la configuración", async () => {
    const { token } = await registrarEmpresa(app, "Productiva S.A.");
    const a = api(token);
    const { csr } = (await a.post("/arca/csr")).json();
    await a.post("/arca/certificado", { pem: caProduccion.firmar(csr) });
    expect((await a.put("/arca/modo", { modo: "homologacion" })).json().error).toContain("es de producción");
    expect((await a.put("/arca/modo", { modo: "produccion" })).json().modo).toBe("produccion");
    const antes = arca.estado.logins;
    expect((await a.post("/arca/probar")).json()).toMatchObject({ ok: true });
    expect(arca.estado.logins).toBe(antes + 1);

    const emailVentas = `ventas${Date.now()}@prueba.com.ar`;
    expect((await a.post("/usuarios", { nombre: "Vendedor", email: emailVentas, rol: "ventas", password: "clave-segura-123" })).statusCode).toBe(201);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: emailVentas, password: "clave-segura-123" } });
    expect((await api(login.json().token).get("/arca")).statusCode).toBe(403);
    expect((await api(login.json().token).post("/arca/csr")).statusCode).toBe(403);
  });
});
