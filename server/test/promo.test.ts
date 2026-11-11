import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { personalizar } from "../src/lib/prospeccion.js";
import { auth, crearApp, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
let panel = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cotizacion: async () => 1000, adminInicial: ADMIN }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
});
afterAll(() => cerrar());

const plataforma = (method: "GET" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api/plataforma/cobros${url}`, headers: auth(panel), ...(payload ? { payload } : {}) });
const publico = async () => (await app.inject({ method: "GET", url: "/api/publico/precios" })).json();

async function empresa() {
  const { token } = await registrarEmpresa(app);
  const api = (method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
  /** Paga (un mes o un año) y devuelve el pago aprobado */
  const pagar = async (periodo: "mensual" | "anual" = "mensual") => {
    const p = (await api("POST", "/suscripcion/pagar", { periodo })).json();
    const r = await api("POST", `/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" });
    expect(r.statusCode, r.body).toBe(200);
    return r.json() as { importeUsd: number; importeArs: number; descuentoPct: number };
  };
  return { api, pagar };
}

describe("promo de lanzamiento", () => {
  it("sin promo, todo sale a precio de lista y no se anuncia", async () => {
    expect((await publico()).promo).toBeNull();
    const { api, pagar } = await empresa();
    expect((await api("GET", "/suscripcion/planes")).json().promo).toBeNull();
    expect(await pagar()).toMatchObject({ importeUsd: 89, descuentoPct: 0 });
  });

  it("50 % en los primeros 3 pagos mensuales, para las primeras 2 empresas; el anual no la usa", async () => {
    expect((await plataforma("PUT", "/promo", { activa: true, descuentoPct: 95, pagos: 3, cupos: 2 })).statusCode).toBe(400);
    const guardada = await plataforma("PUT", "/promo", { activa: true, descuentoPct: 50, pagos: 3, cupos: 2 });
    expect(guardada.statusCode, guardada.body).toBe(200);
    expect(guardada.json().promo).toMatchObject({ activa: true, descuentoPct: 50, pagos: 3, cupos: 2, usadas: 0, quedan: 2 });
    expect((await publico()).promo).toEqual({ descuentoPct: 50, pagos: 3, quedan: 2 });
    // El email de prospección la menciona (y nada si no hay)
    expect(personalizar("Sale {precio}. {promo}", { nombre: null, empresa: null, ciudad: null, rubro: null }, { link: "", firma: "", producto: "gestion" })).toBe("Sale USD 45. Y por el lanzamiento, los primeros 3 meses tienen 50 % de descuento.");

    // La primera empresa: ve la promo, paga 3 meses a mitad de precio y el cuarto a precio de lista
    const a = await empresa();
    expect((await a.api("GET", "/suscripcion/planes")).json().promo).toEqual({ descuentoPct: 50, pagos: 3 });
    expect(await a.pagar()).toMatchObject({ importeUsd: 44.5, importeArs: 44500, descuentoPct: 50 });
    expect((await a.api("GET", "/suscripcion/planes")).json().promo).toEqual({ descuentoPct: 50, pagos: 2 });
    expect((await publico()).promo).toEqual({ descuentoPct: 50, pagos: 3, quedan: 1 });
    expect(await a.pagar()).toMatchObject({ importeUsd: 44.5, descuentoPct: 50 });
    expect(await a.pagar()).toMatchObject({ importeUsd: 44.5, descuentoPct: 50 });
    expect(await a.pagar()).toMatchObject({ importeUsd: 89, descuentoPct: 0 });
    expect((await a.api("GET", "/suscripcion/planes")).json().promo).toBeNull();

    // La segunda paga el año: sin descuento, y no gasta un lugar. Después, con su primer pago mensual, sí la toma
    const b = await empresa();
    expect(await b.pagar("anual")).toMatchObject({ importeUsd: 890, descuentoPct: 0 });
    expect((await publico()).promo).toMatchObject({ quedan: 1 });

    // Otra toma el último lugar; para la siguiente ya no hay
    const c = await empresa();
    expect(await c.pagar()).toMatchObject({ importeUsd: 44.5, descuentoPct: 50 });
    expect((await publico()).promo).toBeNull();
    const d = await empresa();
    expect((await d.api("GET", "/suscripcion/planes")).json().promo).toBeNull();
    expect(await d.pagar()).toMatchObject({ importeUsd: 89, descuentoPct: 0 });
    // La que ya la tenía la conserva aunque no queden lugares (o se apague)
    await plataforma("PUT", "/promo", { activa: false, descuentoPct: 50, pagos: 3, cupos: 2 });
    expect(await c.pagar()).toMatchObject({ importeUsd: 44.5, descuentoPct: 50 });
    expect((await plataforma("GET", "/")).json().promo).toMatchObject({ activa: false, usadas: 2, quedan: 0 });
  });

  it("también por transferencia, y solo la plataforma la configura", async () => {
    await plataforma("PUT", "/promo", { activa: true, descuentoPct: 30, pagos: 2, cupos: 50 });
    await plataforma("PUT", "/transferencia", { titular: "Hendl Martín", alias: "prexacode.pagos" });
    const e = await empresa();
    const t = await e.api("POST", "/suscripcion/transferencia", { periodo: "mensual" });
    expect(t.statusCode, t.body).toBe(201);
    expect(t.json()).toMatchObject({ importeUsd: 62.3, importeArs: 62300, descuentoPct: 30 });
    expect((await app.inject({ method: "PUT", url: "/api/plataforma/cobros/promo", payload: { activa: true, descuentoPct: 50, pagos: 3, cupos: 2 } })).statusCode).toBe(401);
    await plataforma("PUT", "/promo", { activa: false, descuentoPct: 30, pagos: 2, cupos: 50 });
  });
});
