import type { AddressInfo } from "node:net";
import { simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();

beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, appUrl: "https://app.prexacode.test" }));
});
afterAll(() => cerrar());

const api = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
  post: (url: string, payload: object = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: auth(token) }),
});

async function preparar(clienteExtra: object = {}) {
  const { token } = await registrarEmpresa(app, "Distribuidora Norte S.A.");
  const a = api(token);
  const cliente = (await a.post("/clientes", { razonSocial: "Ferretería El Tornillo", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto", email: "compras@eltornillo.com.ar", telefono: "011 15 5555-1234", contacto: "Julia Pérez", ...clienteExtra })).json();
  return { token, a, cliente };
}

const factura = async (a: ReturnType<typeof api>, clienteId: string, extra: object = {}) =>
  (await a.post("/comprobantes", { clienteId, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Tornillos x 1000", cantidad: 2, precioUnitario: 10000, alicuotaIva: 21 }], ...extra })).json();

const esperar = async (cond: () => boolean | Promise<boolean>, ms = 3000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("No se cumplió a tiempo");
};

describe("configuración de email", () => {
  it("guarda el SMTP con la contraseña cifrada y nunca la devuelve", async () => {
    const { a } = await preparar();
    const inicial = (await a.get("/email/config")).json();
    expect(inicial).toMatchObject({ modo: "plataforma", tienePassword: false, verificado: false, enviarFacturaAlEmitir: false });
    expect(inicial).not.toHaveProperty("passwordCifrada");

    const sinPass = await a.put("/email/config", { modo: "smtp", host: "smtp.gmail.com", puerto: 587, seguridad: "STARTTLS", usuario: "ventas@norte.com.ar" });
    expect(sinPass.statusCode).toBe(400);
    expect(sinPass.json().details).toHaveProperty("password");
    const incompleto = await a.put("/email/config", { modo: "smtp", password: "x" });
    expect(Object.keys(incompleto.json().details).sort()).toEqual(["host", "puerto", "usuario"]);

    const put = await a.put("/email/config", { modo: "smtp", host: "smtp.gmail.com", puerto: 587, seguridad: "STARTTLS", usuario: "ventas@norte.com.ar", password: "abcd efgh ijkl mnop", remitenteNombre: "Distribuidora Norte", responderA: "cobranzas@norte.com.ar" });
    expect(put.statusCode).toBe(200);
    const c = put.json();
    expect(c).toMatchObject({ modo: "smtp", tienePassword: true, usuario: "ventas@norte.com.ar", verificado: false });
    expect(JSON.stringify(c)).not.toContain("abcd");

    // En la base queda cifrada
    const filas = await app.db.execute<{ password_cifrada: string }>("select password_cifrada from config_email where usuario = 'ventas@norte.com.ar'" as never);
    const guardada = (filas as unknown as { rows: { password_cifrada: string }[] }).rows[0]!.password_cifrada;
    expect(guardada.startsWith("v1:")).toBe(true);
    expect(guardada).not.toContain("abcd");
    expect(app.cifrador.descifrar(guardada)).toBe("abcd efgh ijkl mnop");

    // Guardar sin contraseña conserva la anterior; con la versión vieja, avisa
    const otra = await a.put("/email/config", { modo: "smtp", host: "smtp.gmail.com", puerto: 587, seguridad: "STARTTLS", usuario: "ventas@norte.com.ar", remitenteNombre: "Norte", version: c.version });
    expect(otra.json()).toMatchObject({ tienePassword: true, remitenteNombre: "Norte" });
    expect((await a.put("/email/config", { modo: "plataforma", version: c.version })).json().code).toBe("EDICION_CONCURRENTE");
  });

  it("email de prueba: marca verificado si sale y explica el error si falla", async () => {
    const { a, token } = await preparar();
    await a.put("/email/config", { modo: "smtp", host: "smtp.norte.com.ar", puerto: 465, seguridad: "SSL/TLS", usuario: "admin@norte.com.ar", password: "secreta" });
    const antes = correo.enviados.length;
    const ok = (await a.post("/email/probar", { para: "yo@norte.com.ar" })).json();
    expect(ok).toMatchObject({ estado: "Enviado", error: null, para: "yo@norte.com.ar" });
    const m = correo.enviados[antes]!;
    expect(m.transporte).toEqual({ tipo: "smtp", host: "smtp.norte.com.ar", puerto: 465, seguridad: "SSL/TLS", usuario: "admin@norte.com.ar", password: "secreta" });
    expect(m.mensaje.de).toBe('"Distribuidora Norte S.A." <admin@norte.com.ar>');
    expect((await a.get("/email/config")).json().verificado).toBe(true);

    correo.estado.falla = Object.assign(new Error("Invalid login: 535 Authentication failed"), { code: "EAUTH" });
    const mal = (await a.post("/email/probar")).json();
    correo.estado.falla = null;
    expect(mal.estado).toBe("Error");
    expect(mal.error).toContain("contraseña de aplicación");
    expect((await a.get("/email/config")).json()).toMatchObject({ verificado: false, ultimoError: mal.error });

    const hist = (await a.get("/email/enviados")).json();
    expect(hist.map((h: { estado: string }) => h.estado)).toEqual(["Error", "Enviado"]);
    // Ventas no configura el email
    const email = emailUnico("v");
    await a.post("/usuarios", { nombre: "Vendedor", email, rol: "ventas", password: "clave-segura-123" });
    const v = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await api(v).get("/email/config")).statusCode).toBe(403);
    void token;
  });
});

describe("compartir documentos", () => {
  it("link público, email con botón y datos para WhatsApp de una factura", async () => {
    const { a, cliente } = await preparar();
    const f = await factura(a, cliente.id);
    const comp = (await a.get(`/documentos/comprobante/${f.id}/compartir`)).json();
    expect(comp).toMatchObject({ titulo: "Factura A 0001-00000001", email: "compras@eltornillo.com.ar", vistas: 0 });
    expect(comp.url).toMatch(/^https:\/\/app\.prexacode\.test\/ver\/[A-Za-z0-9_-]{32}$/);
    // Pedirlo de nuevo devuelve el mismo link
    expect((await a.get(`/documentos/comprobante/${f.id}/compartir`)).json().url).toBe(comp.url);
    expect(comp.whatsapp.telefono).toBe("5491155551234");
    expect(comp.whatsapp.texto).toContain("Hola Julia,");
    expect(comp.whatsapp.texto).toContain("Factura A 0001-00000001 por $ 24.200,00");
    expect(comp.whatsapp.texto).toContain(comp.url);
    expect(comp.whatsapp.url.startsWith("https://wa.me/5491155551234?text=")).toBe(true);

    const antes = correo.enviados.length;
    const envio = (await a.post(`/documentos/comprobante/${f.id}/enviar`, { para: "compras@eltornillo.com.ar", mensaje: "Cualquier consulta, avisanos." })).json();
    expect(envio.estado).toBe("Enviado");
    const m = correo.enviados[antes]!.mensaje;
    expect(m.asunto).toBe("Factura A 0001-00000001 · Distribuidora Norte S.A.");
    expect(m.para).toBe("compras@eltornillo.com.ar");
    expect(m.html).toContain(comp.url);
    expect(m.html).toContain("Ver factura");
    expect(m.texto).toContain("Cualquier consulta, avisanos.");
    expect(m.texto).toContain("Vence el");
    // Plataforma: sale con el remitente de Prexacode y responde a la empresa
    expect(m.de).toBe('"Distribuidora Norte S.A." <notificaciones@prexacode.com.ar>');

    const compartir = (await a.get(`/documentos/comprobante/${f.id}/compartir`)).json();
    expect(compartir.enviados[0]).toMatchObject({ para: "compras@eltornillo.com.ar", estado: "Enviado", tipo: "comprobante" });
    expect((await a.post(`/documentos/comprobante/${f.id}/enviar`, { para: "no-es-un-email" })).statusCode).toBe(400);
  });

  it("el cliente abre el link sin usuario; se cuentan las vistas; se puede anular", async () => {
    const { a, cliente } = await preparar();
    const f = await factura(a, cliente.id);
    const { url } = (await a.get(`/documentos/comprobante/${f.id}/compartir`)).json();
    const token = url.split("/ver/")[1];

    const pub = await app.inject({ method: "GET", url: `/api/publico/${token}` });
    expect(pub.statusCode).toBe(200);
    const d = pub.json();
    expect(d.tipo).toBe("comprobante");
    expect(d.empresa).toMatchObject({ razonSocial: "Distribuidora Norte S.A." });
    expect(d.empresa).not.toHaveProperty("plan");
    expect(d.documento).toMatchObject({ tipo: "Factura A", total: 24200, cae: expect.stringMatching(/^\d{14}$/) });
    expect(d.documento.items).toHaveLength(1);
    expect(d.documento.qr).toContain("afip.gob.ar/fe/qr");
    expect(d.documento).not.toHaveProperty("usuarioId");
    await app.inject({ method: "GET", url: `/api/publico/${token}` });
    expect((await a.get(`/documentos/comprobante/${f.id}/compartir`)).json().vistas).toBe(2);

    // Anular: el link viejo deja de andar y se genera otro
    expect((await a.del(`/documentos/comprobante/${f.id}/enlace`)).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/publico/${token}` })).statusCode).toBe(404);
    expect((await a.get(`/documentos/comprobante/${f.id}/compartir`)).json().url).not.toBe(url);
    expect((await app.inject({ method: "GET", url: "/api/publico/inventado-inventado-inventado" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/publico/corto" })).statusCode).toBe(400);
  });

  it("presupuestos también; sin teléfono válido WhatsApp deja elegir el contacto", async () => {
    const { a, cliente } = await preparar({ telefono: "4555-1234", contacto: null });
    const p = (await a.post("/presupuestos", { clienteId: cliente.id, validoHasta: "2099-12-31", items: [{ descripcion: "Instalación", cantidad: 1, precioUnitario: 50000, alicuotaIva: 21 }] })).json();
    const c = (await a.get(`/documentos/presupuesto/${p.id}/compartir`)).json();
    expect(c.titulo).toBe("Presupuesto N° 00000001");
    expect(c.whatsapp.telefono).toBeNull();
    expect(c.whatsapp.url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(c.whatsapp.texto).toContain("Hola,");
    expect(c.whatsapp.texto).toContain("válido hasta el 31/12/2099");
    const pub = (await app.inject({ method: "GET", url: `/api/publico/${c.url.split("/ver/")[1]}` })).json();
    expect(pub).toMatchObject({ tipo: "presupuesto", documento: { numero: 1, total: 60500 } });
  });

  it("aislamiento: otra empresa no puede compartir ni enviar documentos ajenos", async () => {
    const { a, cliente } = await preparar();
    const f = await factura(a, cliente.id);
    const b = api((await registrarEmpresa(app)).token);
    expect((await b.get(`/documentos/comprobante/${f.id}/compartir`)).statusCode).toBe(404);
    expect((await b.post(`/documentos/comprobante/${f.id}/enviar`, { para: "x@y.com" })).statusCode).toBe(404);
    await b.del(`/documentos/comprobante/${f.id}/enlace`);
    // el link de A sigue andando
    const { url } = (await a.get(`/documentos/comprobante/${f.id}/compartir`)).json();
    expect((await app.inject({ method: "GET", url: `/api/publico/${url.split("/ver/")[1]}` })).statusCode).toBe(200);
  });

  it("envío automático al emitir, solo si está activado y el cliente tiene email; sin demorar la factura", async () => {
    const { a, cliente } = await preparar();
    const antes = correo.enviados.length;
    await factura(a, cliente.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(correo.enviados.length).toBe(antes); // desactivado

    await a.put("/email/config", { modo: "plataforma", enviarFacturaAlEmitir: true });
    const f = await factura(a, cliente.id);
    await esperar(() => correo.enviados.length === antes + 1);
    expect(correo.enviados[antes]!.mensaje.asunto).toContain("Factura A 0001-00000002");
    await esperar(async () => (await a.get("/email/enviados")).json().some((e: { automatico: boolean; refId: string }) => e.automatico && e.refId === f.id));

    // Cliente sin email: no se intenta
    const sinEmail = (await a.post("/clientes", { razonSocial: "Sin Mail SRL", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).json();
    await factura(a, sinEmail.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(correo.enviados.length).toBe(antes + 1);
  });
});

describe("envío real por SMTP", () => {
  let servidor: SMTPServer;
  let puerto = 0;
  const recibidos: { de: string; para: string[]; asunto: string; texto: string; usuario: string }[] = [];

  beforeAll(async () => {
    servidor = new SMTPServer({
      authOptional: false,
      disabledCommands: ["STARTTLS"],
      allowInsecureAuth: true,
      onAuth(a, _s, cb) {
        if (a.username === "ventas@norte.com.ar" && a.password === "clave-correcta") return cb(null, { user: a.username });
        return cb(Object.assign(new Error("Invalid login"), { responseCode: 535 }));
      },
      onData(stream, session, cb) {
        simpleParser(stream).then((m) => {
          recibidos.push({ de: m.from?.text ?? "", para: (session.envelope.rcptTo ?? []).map((r) => r.address), asunto: m.subject ?? "", texto: m.text ?? "", usuario: String(session.user) });
          cb();
        }, cb);
      },
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
    puerto = (servidor.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

  it("conecta con usuario y contraseña, entrega el mensaje, y explica si la clave es incorrecta", async () => {
    // Esta app usa el cartero real (nodemailer)
    const real = await crearApp({ appUrl: "https://app.prexacode.test" });
    try {
      const { token } = await registrarEmpresa(real.app, "Norte SMTP S.A.");
      const put = (payload: object) => real.app.inject({ method: "PUT", url: "/api/email/config", headers: auth(token), payload });
      const probar = async () => (await real.app.inject({ method: "POST", url: "/api/email/probar", headers: auth(token), payload: { para: "destino@cliente.com" } })).json();

      await put({ modo: "smtp", host: "127.0.0.1", puerto, seguridad: "Ninguna", usuario: "ventas@norte.com.ar", password: "clave-correcta", remitenteNombre: "Ventas Norte" });
      const ok = await probar();
      expect(ok).toMatchObject({ estado: "Enviado", error: null });
      expect(recibidos).toHaveLength(1);
      expect(recibidos[0]).toMatchObject({ para: ["destino@cliente.com"], asunto: "Prueba de envío · Norte SMTP S.A.", usuario: "ventas@norte.com.ar" });
      expect(recibidos[0]!.de).toContain("ventas@norte.com.ar");
      expect(recibidos[0]!.texto).toContain("email de prueba de Prexacode");

      await put({ modo: "smtp", host: "127.0.0.1", puerto, seguridad: "Ninguna", usuario: "ventas@norte.com.ar", password: "clave-mal" });
      const mal = await probar();
      expect(mal.estado).toBe("Error");
      expect(mal.error).toContain("usuario o la contraseña");
      expect(recibidos).toHaveLength(1);

      // Servidor que no existe
      await put({ modo: "smtp", host: "127.0.0.1", puerto: 1, seguridad: "Ninguna", usuario: "ventas@norte.com.ar", password: "x" });
      const caido = await probar();
      expect(caido.estado).toBe("Error");
      expect(caido.error).toContain("No se pudo conectar");

      // Seguridad equivocada (SSL/TLS contra un servidor que no lo usa): lo explica
      await put({ modo: "smtp", host: "127.0.0.1", puerto, seguridad: "SSL/TLS", usuario: "ventas@norte.com.ar", password: "clave-correcta" });
      const tls = await probar();
      expect(tls.estado).toBe("Error");
      expect(tls.error).toMatch(/conexión segura|no respondió/);

      // Sin servidor de la plataforma configurado, el modo "plataforma" queda simulado
      await put({ modo: "plataforma" });
      expect((await probar()).estado).toBe("Simulado");
      expect((await real.app.inject({ method: "GET", url: "/api/email/config", headers: auth(token) })).json().correoPlataforma).toBe(false);
    } finally {
      await real.cerrar();
    }
  }, 30_000);
});
