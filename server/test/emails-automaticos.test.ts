import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comprobantes, recuperacionesClave, suscripciones } from "../src/db/schema.js";
import { hoyAr } from "../src/lib/cuentas.js";
import { sumarDias } from "../src/lib/suscripcion.js";
import { avisosDeSuscripcion, recordatoriosDeFacturas } from "../src/lib/tareas.js";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, modoPruebas: true, appUrl: "https://sistema.prexacode.com" }));
});
afterAll(() => cerrar());

const esperar = () => new Promise((ok) => setTimeout(ok, 30));
const mandadosA = (para: string) => correo.enviados.filter((e) => e.mensaje.para === para);
const pedir = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api${url}`, headers: token ? auth(token) : {}, ...(payload ? { payload } : {}) });

describe("bienvenida", () => {
  it("al registrarse le llega un email con los primeros pasos", async () => {
    const { email } = await registrarEmpresa(app, "Panadería La Espiga S.R.L.");
    await esperar();
    const [m] = mandadosA(email);
    expect(m?.mensaje.asunto).toContain("Bienvenido a Prexacode");
    expect(m?.mensaje.texto).toContain("14 días de prueba gratis");
    expect(m?.mensaje.texto).toContain("https://sistema.prexacode.com");
    expect(m?.transporte).toEqual({ tipo: "plataforma" });
  });
});

describe("olvidé mi contraseña", () => {
  it("manda un link de un solo uso; la clave nueva sirve, la vieja no, y se cierran las sesiones", async () => {
    const { token, email } = await registrarEmpresa(app);
    // Un email que no existe responde igual (no revela quién tiene cuenta) y no manda nada
    const antes = correo.enviados.length;
    expect((await pedir("POST", "/auth/olvide", undefined, { email: "nadie.existe@prueba.com" })).json()).toEqual({ ok: true });
    await esperar();
    expect(correo.enviados.length).toBe(antes);

    expect((await pedir("POST", "/auth/olvide", undefined, { email })).json()).toEqual({ ok: true });
    await esperar();
    const m = mandadosA(email).find((x) => x.mensaje.asunto.includes("contraseña nueva"))!;
    const link = m.mensaje.texto.match(/https:\/\/sistema\.prexacode\.com\/restablecer\?token=([\w-]+)/)!;
    expect(link).toBeTruthy();
    const t = link[1]!;
    // En la base queda solo la huella, no el link
    const guardadas = await app.db.select().from(recuperacionesClave);
    expect(guardadas.some((g) => g.tokenHash === t)).toBe(false);

    expect((await pedir("POST", "/auth/restablecer", undefined, { token: t, password: "corta" })).statusCode).toBe(400);
    expect((await pedir("POST", "/auth/restablecer", undefined, { token: t, password: "mi-clave-nueva-2026" })).statusCode).toBe(204);
    // El link ya no sirve
    const otra = await pedir("POST", "/auth/restablecer", undefined, { token: t, password: "otra-clave-9999" });
    expect(otra.json().error).toContain("venció o ya se usó");
    // La vieja no entra, la nueva sí; la sesión que estaba abierta se cerró
    expect((await pedir("POST", "/auth/login", undefined, { email, password: "clave-segura-123" })).statusCode).toBe(401);
    expect((await pedir("POST", "/auth/login", undefined, { email, password: "mi-clave-nueva-2026" })).statusCode).toBe(200);
    expect((await pedir("GET", "/clientes", token)).statusCode).toBe(401);
  });

  it("un link vencido no sirve, y uno inventado tampoco", async () => {
    const { email } = await registrarEmpresa(app);
    await pedir("POST", "/auth/olvide", undefined, { email });
    const { link } = (await pedir("GET", `/auth/pruebas/ultimo-link?email=${encodeURIComponent(email)}`)).json();
    const t = new URL(link).searchParams.get("token")!;
    await app.db.update(recuperacionesClave).set({ expira: new Date(Date.now() - 1000) });
    expect((await pedir("POST", "/auth/restablecer", undefined, { token: t, password: "mi-clave-nueva-2026" })).statusCode).toBe(400);
    expect((await pedir("POST", "/auth/restablecer", undefined, { token: "x".repeat(43), password: "mi-clave-nueva-2026" })).statusCode).toBe(400);
  });
});

describe("avisos de la suscripción por email", () => {
  it("prueba por terminar, pago por vencer, vencida y solo lectura: a los administradores, una sola vez cada uno", async () => {
    const { token, email, empresaId } = await registrarEmpresa(app, "Taller Mecánico Rueda S.A.");
    const vendedor = emailUnico("vend");
    await pedir("POST", "/usuarios", token, { nombre: "Vendedor", email: vendedor, rol: "ventas", password: "clave-segura-123" });
    const fechas = (f: { pruebaHasta: string; pagoHasta: string | null }) => app.db.update(suscripciones).set(f).where(eq(suscripciones.empresaId, empresaId));
    const hoy = hoyAr();
    const asuntos = () => mandadosA(email).map((m) => m.mensaje.asunto);

    await fechas({ pruebaHasta: sumarDias(hoy, 2), pagoHasta: null });
    await avisosDeSuscripcion(app, hoy);
    await avisosDeSuscripcion(app, hoy); // la segunda vez no repite
    expect(asuntos().filter((a) => a.includes("prueba gratis de Prexacode termina"))).toHaveLength(1);

    await fechas({ pruebaHasta: sumarDias(hoy, -30), pagoHasta: sumarDias(hoy, 4) });
    await avisosDeSuscripcion(app, hoy);
    expect(asuntos().some((a) => a.includes("vence el"))).toBe(true);

    await fechas({ pruebaHasta: sumarDias(hoy, -30), pagoHasta: sumarDias(hoy, -2) });
    await avisosDeSuscripcion(app, hoy);
    expect(asuntos()).toContain("Tu suscripción a Prexacode venció");

    await fechas({ pruebaHasta: sumarDias(hoy, -40), pagoHasta: sumarDias(hoy, -20) });
    await avisosDeSuscripcion(app, hoy);
    await avisosDeSuscripcion(app, hoy);
    expect(asuntos().filter((a) => a === "Prexacode quedó en modo solo lectura")).toHaveLength(1);
    // Al vendedor no le llega nada de esto
    expect(mandadosA(vendedor)).toHaveLength(0);
    const m = mandadosA(email).find((x) => x.mensaje.asunto.includes("solo lectura"))!;
    expect(m.mensaje.html).toContain("https://sistema.prexacode.com/configuracion?tab=plan");
  });
});

describe("recordatorios de facturas a los clientes", () => {
  it("si la empresa lo activa: 3 días antes y al vencer, una vez cada uno; nunca facturas viejas ni pagadas", async () => {
    const { token } = await registrarEmpresa(app, "Distribuidora Norte S.A.");
    const clienteEmail = emailUnico("cliente");
    const cliente = (await pedir("POST", "/clientes", token, { razonSocial: "Cliente Moroso S.A.", cuit: cuitValido(), condicionIva: "Responsable Inscripto", email: clienteEmail })).json();
    const factura = async () =>
      (await pedir("POST", "/comprobantes", token, { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 10000, alicuotaIva: 21 }] })).json();
    const f1 = await factura();
    const f2 = await factura();
    const vieja = await factura();
    const pagada = await factura();
    const hoy = hoyAr();
    const vence = (id: string, f: string) => app.db.update(comprobantes).set({ vencimiento: f }).where(eq(comprobantes.id, id));
    await vence(f1.id, sumarDias(hoy, 2));
    await vence(f2.id, sumarDias(hoy, -3));
    await vence(vieja.id, sumarDias(hoy, -90));
    await vence(pagada.id, sumarDias(hoy, -3));
    await pedir("POST", "/recibos", token, { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: pagada.total }], imputaciones: [{ comprobanteId: pagada.id, importe: pagada.total }] });

    // Apagado (así viene): no manda nada
    await recordatoriosDeFacturas(app, hoy);
    expect(mandadosA(clienteEmail)).toHaveLength(0);

    const conf = (await pedir("GET", "/email/config", token)).json();
    expect((await pedir("PUT", "/email/config", token, { modo: "plataforma", recordarFacturas: true, version: conf.version })).statusCode).toBe(200);
    await recordatoriosDeFacturas(app, hoy);
    await recordatoriosDeFacturas(app, hoy);
    const asuntos = mandadosA(clienteEmail).map((m) => m.mensaje.asunto);
    expect(asuntos).toHaveLength(2);
    expect(asuntos.some((a) => a.startsWith("Recordatorio de vencimiento: Factura"))).toBe(true);
    expect(asuntos.some((a) => a.startsWith("Factura vencida: Factura"))).toBe(true);
    const vencida = mandadosA(clienteEmail).find((m) => m.mensaje.asunto.startsWith("Factura vencida"))!;
    expect(vencida.mensaje.texto).toContain("saldo pendiente de $ 12.100,00");
    // Queda en el historial de envíos de la empresa, como automático
    const envios = (await pedir("GET", "/email/enviados", token)).json() as { automatico: boolean; para: string }[];
    expect(envios.filter((e) => e.para === clienteEmail && e.automatico)).toHaveLength(2);
  });
});
