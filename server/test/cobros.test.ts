import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const ADMIN = "duenio@prexacode.com.ar";
const CLAVE_PANEL = "clave-del-panel-2026";
let panel = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, cotizacion: async () => 1000, adminInicial: { email: ADMIN, password: CLAVE_PANEL } }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE_PANEL } })).json().token;
});
afterAll(() => cerrar());

const plataforma = (method: "GET" | "POST" | "PUT", url: string, payload?: object | null) => app.inject({ method, url: `/api/plataforma/cobros${url}`, headers: auth(panel), ...(payload !== undefined ? { payload: payload as object } : {}) });

async function empresa() {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: "Distribuidora Norte SA", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" }, usuario: { nombre: "Admin", email: emailUnico("adm"), password: "clave-segura-123" }, aceptaTerminos: true },
  });
  expect(r.statusCode, r.body).toBe(201);
  const t = r.json().token;
  return (method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(t), ...(payload ? { payload } : {}) });
}

describe("precios y cobros desde el panel", () => {
  it("los precios se cambian desde el panel y rigen para los próximos pagos (y en las landings)", async () => {
    expect((await app.inject({ method: "GET", url: "/api/plataforma/cobros" })).statusCode).toBe(401);
    const publico = async () => (await app.inject({ method: "GET", url: "/api/publico/precios" })).json();
    expect(await publico()).toMatchObject({ usuarioAdicionalUsd: 15, mesesCobradosAnual: 10 });
    expect((await publico()).planes.map((p: { precioUsd: number }) => p.precioUsd)).toEqual([45, 89, 169]);

    // Validaciones
    expect((await plataforma("PUT", "/precios", { planes: { basico: -1, profesional: 99, empresa: 189 }, usuarioAdicionalUsd: 18, mesesCobradosAnual: 10 })).statusCode).toBe(400);
    expect((await plataforma("PUT", "/precios", { planes: { basico: 50, profesional: 99, empresa: 189 }, usuarioAdicionalUsd: 18, mesesCobradosAnual: 13 })).statusCode).toBe(400);

    const r = await plataforma("PUT", "/precios", { planes: { basico: 50, profesional: 99, empresa: 189 }, usuarioAdicionalUsd: 18, mesesCobradosAnual: 10 });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().planes.map((p: { precioUsd: number }) => p.precioUsd)).toEqual([50, 99, 189]);
    expect((await publico()).planes.map((p: { precioUsd: number }) => p.precioUsd)).toEqual([50, 99, 189]);
    expect((await publico()).usuarioAdicionalUsd).toBe(18);

    // El cliente ve los precios nuevos y el próximo pago se cobra con ellos
    const api = await empresa();
    const planes = (await api("GET", "/suscripcion/planes")).json();
    expect(planes.planes.find((p: { id: string }) => p.id === "profesional").precioUsd).toBe(99);
    expect(planes.precioUsuarioAdicionalUsd).toBe(18);
    const pago = (await api("POST", "/suscripcion/pagar", { periodo: "mensual" })).json();
    const detalle = (await api("GET", `/suscripcion/pagos/${pago.referencia}`)).json();
    expect(detalle).toMatchObject({ importeUsd: 99, importeArs: 99000 });
    const anual = (await api("POST", "/suscripcion/pagar", { periodo: "anual" })).json();
    expect((await api("GET", `/suscripcion/pagos/${anual.referencia}`)).json().importeUsd).toBe(990);

    // Queda registrado quién lo cambió
    expect((await app.inject({ method: "GET", url: "/api/plataforma/auditoria", headers: auth(panel) })).body).toContain("precios");
  });

  it("pago por transferencia: el cliente avisa, la plataforma confirma (o rechaza) y recién ahí se extiende", async () => {
    const api = await empresa();
    // Sin datos cargados, la opción no está
    expect((await api("GET", "/suscripcion/transferencia")).json()).toEqual({ datos: null, pendiente: null });
    expect((await api("POST", "/suscripcion/transferencia", { periodo: "mensual" })).statusCode).toBe(400);

    // Los datos de la cuenta
    expect((await plataforma("PUT", "/transferencia", { titular: "Hendl Martín Ezequiel", cbu: "123", alias: null })).statusCode).toBe(400);
    expect((await plataforma("PUT", "/transferencia", { titular: "Hendl Martín Ezequiel" })).statusCode).toBe(400);
    const datos = { titular: "Hendl Martín Ezequiel", cuit: "24-35324876-2", banco: "Banco Galicia", cbu: "0070999030004123456789", alias: "prexacode.pagos" };
    expect((await plataforma("PUT", "/transferencia", datos)).json().transferencia).toMatchObject({ alias: "prexacode.pagos", cbu: "0070999030004123456789" });
    expect((await api("GET", "/suscripcion/transferencia")).json().datos).toMatchObject({ titular: "Hendl Martín Ezequiel", alias: "prexacode.pagos" });

    // El cliente avisa que transfirió: queda pendiente, con el importe en pesos, y le llega el aviso a la plataforma
    const antes = (await api("GET", "/suscripcion")).json();
    const t = await api("POST", "/suscripcion/transferencia", { periodo: "mensual", comprobante: "Op. 123456" });
    expect(t.statusCode, t.body).toBe(201);
    expect(t.json()).toMatchObject({ estado: "Pendiente", proveedor: "transferencia" });
    expect(t.json().importeArs).toBeGreaterThan(0);
    expect((await api("POST", "/suscripcion/transferencia", { periodo: "mensual" })).statusCode).toBe(409);
    expect((await api("GET", "/suscripcion/transferencia")).json().pendiente).toMatchObject({ referencia: t.json().referencia });
    await new Promise((r) => setTimeout(r, 50));
    expect(correo.enviados.some((e) => e.mensaje.para === ADMIN && /Transferencia avisada: Distribuidora Norte SA/.test(e.mensaje.asunto))).toBe(true);
    // Todavía no cambió nada
    expect((await api("GET", "/suscripcion")).json().pagoHasta ?? null).toBe(antes.pagoHasta ?? null);

    // La plataforma ve la plata y confirma: se extiende
    const lista = (await plataforma("GET", "/")).json().transferencias;
    const pendiente = lista.find((x: { referencia: string }) => x.referencia === t.json().referencia);
    expect(pendiente).toMatchObject({ estado: "Pendiente", empresa: "Distribuidora Norte SA" });
    const ok = await plataforma("POST", `/transferencias/${pendiente.id}/confirmar`, {});
    expect(ok.statusCode, ok.body).toBe(200);
    const despues = (await api("GET", "/suscripcion")).json();
    expect(despues.estado).toBe("Activa");
    expect(despues.pagoHasta).toBeTruthy();
    expect((await plataforma("POST", `/transferencias/${pendiente.id}/confirmar`, {})).statusCode).toBe(409);
    expect((await api("GET", "/suscripcion/transferencia")).json().pendiente).toBeNull();

    // Otra que no llegó: se rechaza con el motivo y no extiende nada
    const t2 = (await api("POST", "/suscripcion/transferencia", { periodo: "anual" })).json();
    expect((await plataforma("POST", `/transferencias/${t2.id}/rechazar`, {})).statusCode).toBe(400);
    expect((await plataforma("POST", `/transferencias/${t2.id}/rechazar`, { motivo: "No llegó la plata" })).statusCode).toBe(200);
    expect((await api("GET", `/suscripcion/pagos/${t2.referencia}`)).json().estado).toBe("Rechazado");
    expect((await api("GET", "/suscripcion")).json().pagoHasta).toBe(despues.pagoHasta);

    // Se apaga la opción
    expect((await plataforma("PUT", "/transferencia", null)).json().transferencia).toBeNull();
    const sinDatos = await api("GET", "/suscripcion/transferencia");
    expect(sinDatos.json(), sinDatos.body).toMatchObject({ datos: null });
  });
});
