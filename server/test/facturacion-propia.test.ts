import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const ADMIN = "duenio@prexacode.com.ar";
const CLAVE_PANEL = "clave-del-panel-2026";
let panel = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, modoPruebas: true, cotizacion: async () => 1000, adminInicial: { email: ADMIN, password: CLAVE_PANEL } }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE_PANEL } })).json().token;
});
afterAll(() => cerrar());

const plataforma = (method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api/plataforma/facturacion${url}`, headers: auth(panel), ...(payload ? { payload } : {}) });
const esperar = async (cond: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("No pasó a tiempo");
};

async function empresa(nombre: string, condicionIva: string, producto: "gestion" | "dental" = "gestion") {
  const email = emailUnico("adm");
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: nombre, cuit: cuitValido(condicionIva === "Monotributista" ? "20" : "30"), condicionIva }, usuario: { nombre: "Admin", email, password: "clave-segura-123" }, aceptaTerminos: true, producto },
  });
  expect(r.statusCode, r.body).toBe(201);
  const j = r.json();
  const api = (method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(j.token), ...(payload ? { payload } : {}) });
  return { api, cuit: j.empresa.cuit as string, email, id: j.empresa.id as string };
}

/** Un pago de suscripción aprobado (con el simulador de pagos) */
async function pagar(c: Awaited<ReturnType<typeof empresa>>) {
  const p = (await c.api("POST", "/suscripcion/pagar", { periodo: "mensual" })).json();
  expect((await c.api("POST", `/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" })).statusCode).toBe(200);
  return p.referencia as string;
}

describe("facturación propia de la plataforma", () => {
  it("cada pago de una suscripción se factura una sola vez, desde la cuenta del dueño, y le llega al cliente", async () => {
    expect((await app.inject({ method: "GET", url: "/api/plataforma/facturacion" })).statusCode).toBe(401);
    expect((await plataforma("GET", "/")).json()).toMatchObject({ emisor: null, facturarSuscripciones: false });
    // Sin emisor no se puede activar ni conectar ARCA
    expect((await plataforma("PUT", "/automatica", { activa: true })).statusCode).toBe(400);
    expect((await plataforma("GET", "/arca")).statusCode).toBe(400);

    // La cuenta del dueño (monotributista) es la que factura
    const duenio = await empresa("Martín Hendl", "Monotributista");
    expect((await plataforma("POST", "/emisor", { cuit: "20-00000000-1" })).statusCode).toBe(404);
    const conEmisor = (await plataforma("POST", "/emisor", { cuit: duenio.cuit })).json();
    expect(conEmisor.emisor).toMatchObject({ razonSocial: "Martín Hendl", condicionIva: "Monotributista" });
    expect(conEmisor.puntosVenta).toEqual([1]);
    // Los datos que salen en la factura se corrigen desde el panel
    const datos = (await plataforma("PUT", "/emisor", { razonSocial: "HENDL MARTIN", nombreFantasia: "Prexacode", domicilio: "Av. Rivadavia 4227, Piso 6, Dto. 18", localidad: "CABA" })).json();
    expect(datos.emisor).toMatchObject({ razonSocial: "HENDL MARTIN", nombreFantasia: "Prexacode" });
    // La conexión con ARCA de esa cuenta, desde el panel (pedido de certificado incluido)
    expect((await plataforma("GET", "/arca")).json()).toMatchObject({ modo: "simulado" });
    const csr = await plataforma("POST", "/arca/csr", {});
    expect(csr.statusCode, csr.body).toBe(200);
    expect(csr.json().csr).toContain("BEGIN CERTIFICATE REQUEST");
    expect((await plataforma("POST", "/arca/certificado", { pem: "no es un certificado ".repeat(10) })).statusCode).toBe(400);
    expect((await plataforma("PUT", "/punto-venta", { numero: 2 })).json().puntosVenta).toEqual([2]);
    expect((await plataforma("PUT", "/punto-venta", { numero: 1 })).json().puntosVenta).toEqual([1]);

    // Sin la automática: el pago se aprueba y queda sin facturar
    const consultorio = await empresa("Clínica Dental Sur SRL", "Responsable Inscripto", "dental");
    const ref1 = await pagar(consultorio);
    let pagos = (await plataforma("GET", "/")).json().pagos;
    expect(pagos[0]).toMatchObject({ empresa: "Clínica Dental Sur SRL", facturado: false });

    // Se factura a mano: Factura C del dueño a la clínica, y le llega por email
    const manual = await plataforma("POST", `/pagos/${pagos[0].id}/facturar`, {});
    expect(manual.statusCode, manual.body).toBe(200);
    expect(manual.json().numero).toMatch(/^Factura C 0001-0000000\d$/);
    pagos = (await plataforma("GET", "/")).json().pagos;
    expect(pagos[0]).toMatchObject({ facturado: true, facturaError: null });
    const factura = (await duenio.api("GET", "/comprobantes")).json();
    const lista = Array.isArray(factura) ? factura : (factura.items ?? factura.comprobantes);
    expect(lista).toHaveLength(1);
    expect(JSON.stringify(lista[0])).toContain("Clínica Dental Sur SRL");
    await esperar(async () => correo.enviados.some((e) => e.mensaje.para === consultorio.email && /Factura C/.test(e.mensaje.asunto)));
    // El link para verla
    expect((await plataforma("GET", `/pagos/${pagos[0].id}/factura`)).json().url).toMatch(/\/ver\//);
    // Facturar de nuevo el mismo pago no hace otra factura
    expect((await plataforma("POST", `/pagos/${pagos[0].id}/facturar`, {})).json().numero).toBe(manual.json().numero);
    void ref1;

    // Con la automática: cada pago aprobado se factura solo
    expect((await plataforma("PUT", "/automatica", { activa: true })).json().facturarSuscripciones).toBe(true);
    const pyme = await empresa("Distribuidora Norte SA", "Responsable Inscripto");
    const ref2 = await pagar(pyme);
    await esperar(async () => (await plataforma("GET", "/")).json().pagos.some((p: { empresa: string; facturado: boolean }) => p.empresa === "Distribuidora Norte SA" && p.facturado));
    // El aviso de Mercado Pago repetido no factura otra vez
    await pyme.api("POST", `/suscripcion/pagos/${ref2}/simular`, { resultado: "Aprobado" });
    await new Promise((r) => setTimeout(r, 200));
    const todas = (await duenio.api("GET", "/comprobantes")).json();
    expect((Array.isArray(todas) ? todas : (todas.items ?? todas.comprobantes)).length).toBe(2);

    // Dos pedidos a la vez sobre el mismo pago: una sola factura
    await plataforma("PUT", "/automatica", { activa: false });
    const otra = await empresa("Ferretería Centro", "Monotributista");
    await pagar(otra);
    const pagoOtra = (await plataforma("GET", "/")).json().pagos.find((p: { empresa: string }) => p.empresa === "Ferretería Centro");
    const [a, b] = await Promise.all([plataforma("POST", `/pagos/${pagoOtra.id}/facturar`, {}), plataforma("POST", `/pagos/${pagoOtra.id}/facturar`, {})]);
    expect([a.statusCode, b.statusCode].sort()).toEqual(expect.arrayContaining([200]));
    const final = (await duenio.api("GET", "/comprobantes")).json();
    expect((Array.isArray(final) ? final : (final.items ?? final.comprobantes)).length).toBe(3);
  });
});
