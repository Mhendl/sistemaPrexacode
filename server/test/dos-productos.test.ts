import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suscripciones } from "../src/db/schema.js";
import type { Cobro, ProveedorPagos } from "../src/lib/pagos.js";
import { PLANES } from "../src/lib/precios.js";
import { hoyAr } from "../src/lib/cuentas.js";
import { sumarDias } from "../src/lib/suscripcion.js";
import { avisosDeSuscripcion } from "../src/lib/tareas.js";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const ADMIN = "duenio@prexacode.test";
const CLAVE = "clave-del-panel-2026";

beforeAll(async () => {
  ({ app, cerrar } = await crearApp({
    cartero: correo.cartero,
    modoPruebas: true,
    appUrl: "https://sistema.prexacode.com",
    appUrlDental: "https://coredental.prexacode.com",
    adminInicial: { email: ADMIN, password: CLAVE },
    cotizacion: async () => 1000,
  }));
});
afterAll(() => cerrar());

const esperar = () => new Promise((ok) => setTimeout(ok, 30));
const mandadosA = (para: string) => correo.enviados.filter((e) => e.mensaje.para === para);

async function registrar(producto?: string) {
  const email = emailUnico("alta");
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Laura Pérez", email, password: "clave-segura-123" }, aceptaTerminos: true, ...(producto ? { producto } : {}) },
  });
  return { r, email };
}

describe("dos productos sobre la misma plataforma", () => {
  it("sin decir nada, la empresa es de Prexacode (gestión)", async () => {
    const { r } = await registrar();
    expect(r.statusCode).toBe(201);
    expect(r.json().empresa.producto).toBe("gestion");
  });

  it("un consultorio de CoreDental: su bienvenida, sus planes y sus links son de CoreDental", async () => {
    const { r, email } = await registrar("dental");
    expect(r.statusCode).toBe(201);
    const { token, empresa } = r.json();
    expect(empresa.producto).toBe("dental");
    await esperar();

    const [bienvenida] = mandadosA(email);
    expect(bienvenida!.mensaje.asunto).toBe("¡Bienvenido a CoreDental, Laura!");
    expect(bienvenida!.mensaje.de).toContain('"CoreDental"');
    expect(bienvenida!.mensaje.texto).toContain("https://coredental.prexacode.com");
    expect(bienvenida!.mensaje.texto).toContain("pacientes");
    expect(bienvenida!.mensaje.texto).not.toContain("Prexacode");

    // Mismos precios, con los nombres de CoreDental
    const planes = (await app.inject({ method: "GET", url: "/api/suscripcion/planes", headers: auth(token) })).json();
    expect(planes.planes.map((p: { nombre: string }) => p.nombre)).toEqual(["Consultorio", "Clínica", "Centro odontológico"]);
    expect(planes.planes.map((p: { precioUsd: number }) => p.precioUsd)).toEqual([PLANES.basico.precioUsd, PLANES.profesional.precioUsd, PLANES.empresa.precioUsd]);
    expect((await app.inject({ method: "GET", url: "/api/suscripcion", headers: auth(token) })).json().planNombre).toBe("Clínica");

    // Recuperar la contraseña: el link lleva a CoreDental
    await app.inject({ method: "POST", url: "/api/auth/olvide", payload: { email } });
    const { link } = (await app.inject({ method: "GET", url: `/api/auth/pruebas/ultimo-link?email=${encodeURIComponent(email)}` })).json();
    expect(link).toMatch(/^https:\/\/coredental\.prexacode\.com\/restablecer\?token=/);
    await esperar();
    expect(mandadosA(email).some((m) => m.mensaje.asunto === "Elegí una contraseña nueva para CoreDental")).toBe(true);

    // Avisos de la suscripción con la marca y el link de CoreDental
    await app.db.update(suscripciones).set({ pruebaHasta: sumarDias(hoyAr(), 2) }).where(eq(suscripciones.empresaId, empresa.id));
    await avisosDeSuscripcion(app, hoyAr());
    const aviso = mandadosA(email).find((m) => m.mensaje.asunto.includes("prueba gratis"))!;
    expect(aviso.mensaje.asunto).toContain("Tu prueba gratis de CoreDental termina");
    expect(aviso.mensaje.html).toContain("https://coredental.prexacode.com/configuracion?tab=plan");
  });

  it("el pago de CoreDental vuelve a CoreDental y lleva su nombre en Mercado Pago", async () => {
    const cobros: Cobro[] = [];
    const pagos: ProveedorPagos = {
      nombre: "mercadopago",
      crearCobro: async (c) => {
        cobros.push(c);
        return { id: "pref-1", url: "https://www.mercadopago.com.ar/checkout" };
      },
      consultarPago: async () => ({ referencia: "", estado: "Pendiente", importe: 0 }),
    };
    const otra = await crearApp({ pagos, appUrl: "https://sistema.prexacode.com", appUrlDental: "https://coredental.prexacode.com", cotizacion: async () => 1000 });
    try {
      const alta = (payload: object) => otra.app.inject({ method: "POST", url: "/api/auth/registro", payload: { empresa: { razonSocial: "Empresa de prueba", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Ana Díaz", email: emailUnico(), password: "clave-segura-123" }, aceptaTerminos: true, ...payload } });
      for (const producto of ["dental", "gestion"]) {
        const token = (await alta({ producto })).json().token;
        expect((await otra.app.inject({ method: "POST", url: "/api/suscripcion/pagar", headers: auth(token), payload: { periodo: "mensual" } })).statusCode).toBe(200);
      }
      expect(cobros[0]).toMatchObject({ titulo: "CoreDental plan Clínica (1 mes)", urlVolver: expect.stringMatching(/^https:\/\/coredental\.prexacode\.com\/configuracion\?tab=plan/) });
      expect(cobros[1]).toMatchObject({ titulo: "Prexacode plan Profesional (1 mes)", urlVolver: expect.stringMatching(/^https:\/\/sistema\.prexacode\.com\//) });
    } finally {
      await otra.cerrar();
    }
  });

  it("un producto que no existe se rechaza", async () => {
    const { r } = await registrar("veterinaria");
    expect(r.statusCode).toBe(400);
  });

  it("el panel de administración muestra de qué producto es cada empresa", async () => {
    const { r } = await registrar("dental");
    const login = await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE } });
    const lista = (await app.inject({ method: "GET", url: "/api/plataforma/empresas", headers: auth(login.json().token) })).json() as { id: string; producto: string; planNombre: string }[];
    const e = lista.find((x) => x.id === r.json().empresa.id)!;
    expect(e).toMatchObject({ producto: "dental", planNombre: "Clínica" });
    expect(lista.some((x) => x.producto === "gestion")).toBe(true);
  });
});
