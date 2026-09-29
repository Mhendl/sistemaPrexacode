import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suscripciones } from "../src/db/schema.js";
import { cotizacionDolar, firmaMercadoPagoValida, mercadoPago, type HttpJson } from "../src/lib/pagos.js";
import { estadoDe, periodoCubierto, sumarDias, sumarMeses } from "../src/lib/suscripcion.js";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";
import { PLAN_IDS, PLANES, PRECIO_USUARIO_ADICIONAL_USD } from "../src/lib/precios.js";

// Precios actuales: las cuentas se hacen con ellos, así cambiar los precios no rompe las pruebas
const PRO = PLANES.profesional.precioUsd;
const USU = PRECIO_USUARIO_ADICIONAL_USD;

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

describe("fechas y estados de la suscripción", () => {
  it("sumar meses respeta el fin de mes y los bisiestos", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(sumarMeses("2026-03-15", 12)).toBe("2027-03-15");
    expect(sumarMeses("2026-12-10", 1)).toBe("2027-01-10");
  });

  it("prueba, activa, gracia y solo lectura según las fechas", () => {
    const h = "2026-09-26";
    expect(estadoDe({ pruebaHasta: "2026-10-10", pagoHasta: null }, h)).toMatchObject({ estado: "Prueba", vence: "2026-10-10", diasRestantes: 14, avisar: true });
    expect(estadoDe({ pruebaHasta: "2026-09-01", pagoHasta: "2026-11-30" }, h)).toMatchObject({ estado: "Activa", diasRestantes: 65, avisar: false });
    expect(estadoDe({ pruebaHasta: "2026-09-01", pagoHasta: "2026-09-30" }, h)).toMatchObject({ estado: "Activa", avisar: true }); // vence en 4 días
    expect(estadoDe({ pruebaHasta: "2026-09-20", pagoHasta: null }, h)).toMatchObject({ estado: "Gracia", graciaHasta: "2026-09-27" });
    expect(estadoDe({ pruebaHasta: "2026-09-19", pagoHasta: null }, h)).toMatchObject({ estado: "Gracia" }); // último día de gracia
    expect(estadoDe({ pruebaHasta: "2026-09-18", pagoHasta: null }, h)).toMatchObject({ estado: "SoloLectura" });
  });

  it("un pago sigue desde el vencimiento: no se pierden días de prueba ni de lo ya pagado", () => {
    const h = "2026-09-26";
    expect(periodoCubierto({ pruebaHasta: "2026-10-10", pagoHasta: null }, "mensual", h)).toEqual({ desde: "2026-10-11", hasta: "2026-11-10" });
    expect(periodoCubierto({ pruebaHasta: "2026-08-01", pagoHasta: "2026-10-31" }, "anual", h)).toEqual({ desde: "2026-11-01", hasta: "2027-10-31" });
    // Ya vencida: arranca hoy
    expect(periodoCubierto({ pruebaHasta: "2026-08-01", pagoHasta: "2026-09-10" }, "mensual", h)).toEqual({ desde: "2026-09-26", hasta: "2026-10-25" });
  });
});

describe("pagos y cotización", () => {
  it("firma de las notificaciones de Mercado Pago", () => {
    const secreto = "clave-webhook";
    const ts = "1704908010";
    const v1 = createHmac("sha256", secreto).update(`id:123456;request-id:req-1;ts:${ts};`).digest("hex");
    expect(firmaMercadoPagoValida({ firma: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456", secreto })).toBe(true);
    expect(firmaMercadoPagoValida({ firma: `ts=${ts},v1=${v1}`, requestId: "req-2", dataId: "123456", secreto })).toBe(false);
    expect(firmaMercadoPagoValida({ firma: `ts=${ts},v1=${"0".repeat(64)}`, requestId: "req-1", dataId: "123456", secreto })).toBe(false);
    expect(firmaMercadoPagoValida({ firma: undefined, requestId: "req-1", dataId: "123456", secreto })).toBe(false);
  });

  it("cotización: fija, o la del BCRA con caché; si el BCRA no responde, el oficial de venta; sin red, error claro", async () => {
    expect(await cotizacionDolar(1250)()).toBe(1250);
    const pedidos: string[] = [];
    let bcraCaido = false;
    let sinRed = false;
    const http: HttpJson = async (url) => {
      pedidos.push(url);
      if (sinRed) throw new Error("sin red");
      if (url.includes("bcra")) {
        if (bcraCaido) return { status: 503, json: null };
        return { status: 200, json: { results: [{ fecha: "2026-09-25", detalle: [{ codigoMoneda: "USD", tipoCotizacion: 1525.5 }] }] } };
      }
      return { status: 200, json: { compra: 1495, venta: 1545 } };
    };
    const c = cotizacionDolar(undefined, http);
    expect(await c()).toBe(1525.5);
    expect(await c()).toBe(1525.5);
    expect(pedidos).toHaveLength(1); // la segunda vez, de la caché
    bcraCaido = true;
    expect(await cotizacionDolar(undefined, http)()).toBe(1545);
    sinRed = true;
    await expect(cotizacionDolar(undefined, http)()).rejects.toThrow("cotización del dólar");
  });
});

/** Mercado Pago falso: preferencias y pagos */
function mercadoPagoFalso() {
  const preferencias: Record<string, unknown>[] = [];
  const pagos = new Map<string, { status: string; external_reference: string; transaction_amount: number }>();
  const http: HttpJson = async (url, init) => {
    if (init.headers.Authorization !== "Bearer TEST-TOKEN") return { status: 401, json: { message: "invalid token" } };
    if (url.endsWith("/checkout/preferences") && init.method === "POST") {
      preferencias.push(init.body as Record<string, unknown>);
      const id = `pref-${preferencias.length}`;
      return { status: 201, json: { id, init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}` } };
    }
    const m = url.match(/\/v1\/payments\/(.+)$/);
    if (m && pagos.has(decodeURIComponent(m[1]!))) return { status: 200, json: pagos.get(decodeURIComponent(m[1]!)) };
    return { status: 404, json: { message: "not found" } };
  };
  return { http, preferencias, pagos };
}

describe("suscripción por la API", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  const mp = mercadoPagoFalso();
  let appMp: TestApp;
  let cerrarMp: () => Promise<void>;

  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ cotizacion: async () => 1000 }));
    ({ app: appMp, cerrar: cerrarMp } = await crearApp({ cotizacion: async () => 1000, pagos: mercadoPago("TEST-TOKEN", mp.http), mpWebhookSecret: "secreto-webhook", appUrl: "https://app.prexacode.test", urlApi: "https://api.prexacode.test" }));
  });
  afterAll(async () => {
    await cerrar();
    await cerrarMp();
  });

  const api = (t: string, a: TestApp = app) => ({
    get: (url: string) => a.inject({ method: "GET", url: `/api${url}`, headers: auth(t) }),
    post: (url: string, payload: object = {}) => a.inject({ method: "POST", url: `/api${url}`, headers: auth(t), payload }),
    put: (url: string, payload: object) => a.inject({ method: "PUT", url: `/api${url}`, headers: auth(t), payload }),
    patch: (url: string, payload: object) => a.inject({ method: "PATCH", url: `/api${url}`, headers: auth(t), payload }),
  });
  const nuevoUsuario = (a: ReturnType<typeof api>, rol = "ventas") => a.post("/usuarios", { nombre: "Usuario", email: emailUnico(rol), rol, password: "clave-segura-123" });

  const fijar = async (a: TestApp, token: string, datos: { pruebaHasta?: string; pagoHasta?: string | null }) => {
    const { empresaId } = a.jwt.decode(token) as { empresaId: string };
    await api(token, a).get("/suscripcion"); // la crea si no existe
    await a.db.update(suscripciones).set(datos).where(eq(suscripciones.empresaId, empresaId));
  };

  it("la ruta para mover fechas solo existe en el servidor de pruebas", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await api(token).post("/suscripcion/pruebas/fechas", { pruebaHasta: "2020-01-01" })).statusCode).toBe(404);
    const conPruebas = await crearApp({ modoPruebas: true });
    try {
      const t = (await registrarEmpresa(conPruebas.app)).token;
      const r = await api(t, conPruebas.app).post("/suscripcion/pruebas/fechas", { pruebaHasta: "2020-01-01" });
      expect(r.json()).toMatchObject({ estado: "SoloLectura" });
    } finally {
      await conPruebas.cerrar();
    }
  });

  it("una empresa nueva arranca con 14 días de prueba del plan Profesional", async () => {
    const { token } = await registrarEmpresa(app);
    const s = (await api(token).get("/suscripcion")).json();
    expect(s).toMatchObject({ plan: "profesional", planNombre: "Profesional", estado: "Prueba", vence: sumarDias(hoy(), 14), diasRestantes: 14, pagoHasta: null, limites: { usuarios: 5, puntosVenta: 3 }, usos: { usuarios: 1, puntosVenta: 0 }, proveedor: "simulado", pagos: [] });
    const planes = (await api(token).get("/suscripcion/planes")).json();
    expect(planes.planes.map((p: { id: string; precioUsd: number }) => [p.id, p.precioUsd])).toEqual(PLAN_IDS.map((id) => [id, PLANES[id].precioUsd]));
    expect(planes).toMatchObject({ precioUsuarioAdicionalUsd: USU, mesesCobradosAnual: 10, dolar: 1000 });

    // Un vendedor ve el estado (para el aviso) pero no los pagos ni puede cambiar el plan
    const v = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: (await nuevoUsuario(api(token))).json().email, password: "clave-segura-123" } })).json().token;
    const sv = (await api(v).get("/suscripcion")).json();
    expect(sv).toMatchObject({ estado: "Prueba" });
    expect(sv).not.toHaveProperty("pagos");
    expect((await api(v).put("/suscripcion", { plan: "empresa", usuariosAdicionales: 0 })).statusCode).toBe(403);
    expect((await api(v).post("/suscripcion/pagar")).statusCode).toBe(403);
  });

  it("límite de usuarios: no deja pasarse; con adicionales sí; no deja bajar si no entran", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    expect((await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 })).json()).toMatchObject({ plan: "basico" });
    const u2 = await nuevoUsuario(a);
    expect(u2.statusCode).toBe(201);
    const u3 = await nuevoUsuario(a);
    expect(u3.statusCode).toBe(409);
    expect(u3.json()).toMatchObject({ code: "LIMITE_PLAN" });
    expect(u3.json().error).toContain("permite 2 usuarios");

    await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 1 });
    const u3b = await nuevoUsuario(a);
    expect(u3b.statusCode).toBe(201);
    const bajar = await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 });
    expect(bajar.statusCode).toBe(400);
    expect(bajar.json().error).toContain("Tenés 3 usuarios activos");

    // Suspender uno libera el lugar; reactivarlo sin lugar no se puede
    await a.patch(`/usuarios/${u3b.json().id}`, { estado: "Suspendido" });
    expect((await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 })).statusCode).toBe(200);
    const reactivar = await a.patch(`/usuarios/${u3b.json().id}`, { estado: "Activo" });
    expect(reactivar.statusCode).toBe(409);
    // Cambiarle el rol a uno activo sí se puede (no suma)
    expect((await a.patch(`/usuarios/${u2.json().id}`, { rol: "operaciones" })).statusCode).toBe(200);
    expect((await a.get("/suscripcion")).json()).toMatchObject({ limites: { usuarios: 2 }, usos: { usuarios: 2 } });
  });

  it("límite de puntos de venta según el plan", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    await a.get("/comprobantes/config"); // crea el punto de venta 1
    await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 });
    const pv2 = await a.post("/comprobantes/puntos-venta", { numero: 2, nombre: "Sucursal" });
    expect(pv2.statusCode).toBe(409);
    expect(pv2.json().error).toContain("1 punto de venta activo");
    await a.put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 });
    expect((await a.post("/comprobantes/puntos-venta", { numero: 2, nombre: "Sucursal" })).statusCode).toBe(201);
    expect((await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 })).json().error).toContain("2 puntos de venta activos");
    await a.put("/suscripcion", { plan: "empresa", usuariosAdicionales: 0 });
    for (const n of [3, 4, 5]) expect((await a.post("/comprobantes/puntos-venta", { numero: n, nombre: `PV ${n}` })).statusCode).toBe(201);
  });

  it("pago simulado: en pesos al dólar del día; aprobarlo extiende sin perder la prueba; es idempotente", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    await a.put("/suscripcion", { plan: "profesional", usuariosAdicionales: 2 });
    const p = (await a.post("/suscripcion/pagar", { periodo: "mensual" })).json();
    expect(p).toMatchObject({ importeUsd: PRO + 2 * USU, dolar: 1000, importeArs: (PRO + 2 * USU) * 1000, titulo: "Prexacode plan Profesional (1 mes) + 2 usuarios" });
    expect(p.url).toBe(`http://localhost:5173/suscripcion/pago/${p.referencia}`);
    expect((await a.get(`/suscripcion/pagos/${p.referencia}`)).json()).toMatchObject({ estado: "Pendiente", importeArs: (PRO + 2 * USU) * 1000, proveedor: "simulado" });

    const ok = (await a.post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" })).json();
    const desde = sumarDias(hoy(), 15);
    expect(ok).toMatchObject({ estado: "Aprobado", desde, hasta: sumarDias(sumarMeses(desde, 1), -1) });
    const s = (await a.get("/suscripcion")).json();
    expect(s).toMatchObject({ estado: "Activa", pagoHasta: ok.hasta, usuariosAdicionales: 2, limites: { usuarios: 7 } });
    expect(s.pagos[0]).toMatchObject({ referencia: p.referencia, estado: "Aprobado" });
    expect(s.pagos[0]).not.toHaveProperty("urlPago");
    // Repetir no vuelve a extender
    await a.post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" });
    expect((await a.get("/suscripcion")).json().pagoHasta).toBe(ok.hasta);

    // Anual: 10 meses de precio, 12 de uso, sigue desde lo pagado
    const anual = (await a.post("/suscripcion/pagar", { periodo: "anual" })).json();
    expect(anual.importeUsd).toBe((PRO + 2 * USU) * 10);
    const ap = (await a.post(`/suscripcion/pagos/${anual.referencia}/simular`, { resultado: "Aprobado" })).json();
    expect(ap.desde).toBe(sumarDias(ok.hasta, 1));
    expect((await a.get("/suscripcion")).json()).toMatchObject({ periodo: "anual", pagoHasta: ap.hasta });

    // Rechazado: no cambia nada
    const r = (await a.post("/suscripcion/pagar")).json();
    expect((await a.post(`/suscripcion/pagos/${r.referencia}/simular`, { resultado: "Rechazado" })).json().estado).toBe("Rechazado");
    expect((await a.get("/suscripcion")).json().pagoHasta).toBe(ap.hasta);
    // Otra empresa no ve ni toca ese pago
    const b = api((await registrarEmpresa(app)).token);
    expect((await b.get(`/suscripcion/pagos/${r.referencia}`)).statusCode).toBe(404);
    expect((await b.post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" })).statusCode).toBe(404);
  });

  it("vencida: con gracia se sigue usando; pasada la gracia, solo lectura hasta pagar", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const cliente = () => a.post("/clientes", { razonSocial: "Cliente Vencido", cuit: cuitValido("30"), condicionIva: "Monotributista" });

    await fijar(app, token, { pruebaHasta: sumarDias(hoy(), -3) });
    expect((await a.get("/suscripcion")).json()).toMatchObject({ estado: "Gracia", graciaHasta: sumarDias(hoy(), 4) });
    expect((await cliente()).statusCode).toBe(201);

    await fijar(app, token, { pruebaHasta: sumarDias(hoy(), -30) });
    expect((await a.get("/suscripcion")).json().estado).toBe("SoloLectura");
    const bloqueado = await cliente();
    expect(bloqueado.statusCode).toBe(402);
    expect(bloqueado.json()).toMatchObject({ code: "SUSCRIPCION_VENCIDA" });
    // Leer y exportar sí
    expect((await a.get("/clientes")).statusCode).toBe(200);
    expect((await a.get("/reportes/ventas")).statusCode).toBe(200);
    // Pagar sí, y al aprobarse vuelve todo (el período arranca hoy)
    const p = (await a.post("/suscripcion/pagar")).json();
    const ok = (await a.post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" })).json();
    expect(ok.desde).toBe(hoy());
    expect((await a.get("/suscripcion")).json().estado).toBe("Activa");
    expect((await cliente()).statusCode).toBe(201);
    // Otra empresa, al día, no se ve afectada
    const b = api((await registrarEmpresa(app)).token);
    expect((await b.post("/clientes", { razonSocial: "Otro", cuit: cuitValido("30"), condicionIva: "Monotributista" })).statusCode).toBe(201);
  });

  it("Mercado Pago: arma el cobro, el aviso firmado confirma el pago consultándolo, y resiste avisos falsos o repetidos", async () => {
    const { token } = await registrarEmpresa(appMp);
    const a = api(token, appMp);
    const p = (await a.post("/suscripcion/pagar", { periodo: "mensual" })).json();
    expect(p.url).toContain("mercadopago.com.ar/checkout");
    const pref = mp.preferencias.at(-1)!;
    expect(pref).toMatchObject({
      external_reference: p.referencia,
      items: [{ unit_price: PRO * 1000, currency_id: "ARS", quantity: 1, title: "Prexacode plan Profesional (1 mes)" }],
      notification_url: "https://api.prexacode.test/api/suscripcion/webhook/mercadopago",
      back_urls: { success: `https://app.prexacode.test/configuracion?tab=plan&pago=${p.referencia}` },
      auto_return: "approved",
    });

    const aviso = (id: string, firma?: string) =>
      appMp.inject({
        method: "POST",
        url: `/api/suscripcion/webhook/mercadopago?data.id=${id}&type=payment`,
        headers: { "x-request-id": "req-9", ...(firma ? { "x-signature": firma } : {}) },
        payload: { type: "payment", action: "payment.created", data: { id } },
      });
    const firmar = (id: string) => {
      const ts = String(Math.floor(Date.now() / 1000));
      return `ts=${ts},v1=${createHmac("sha256", "secreto-webhook").update(`id:${id};request-id:req-9;ts:${ts};`).digest("hex")}`;
    };

    // Sin firma o con firma falsa: se rechaza
    mp.pagos.set("9001", { status: "approved", external_reference: p.referencia, transaction_amount: PRO * 1000 });
    expect((await aviso("9001")).statusCode).toBe(401);
    expect((await aviso("9001", "ts=1,v1=abc")).statusCode).toBe(401);
    expect((await a.get("/suscripcion")).json().estado).toBe("Prueba");

    // Importe adulterado: no se aplica
    mp.pagos.set("9002", { status: "approved", external_reference: p.referencia, transaction_amount: 10 });
    expect((await aviso("9002", firmar("9002"))).json()).toMatchObject({ ok: false, motivo: "importe" });
    expect((await a.get(`/suscripcion/pagos/${p.referencia}`)).json().estado).toBe("Pendiente");

    // Pendiente y después aprobado
    mp.pagos.set("9003", { status: "in_process", external_reference: p.referencia, transaction_amount: PRO * 1000 });
    expect((await aviso("9003", firmar("9003"))).statusCode).toBe(200);
    expect((await a.get(`/suscripcion/pagos/${p.referencia}`)).json().estado).toBe("Pendiente");
    mp.pagos.set("9003", { status: "approved", external_reference: p.referencia, transaction_amount: PRO * 1000 });
    expect((await aviso("9003", firmar("9003"))).json()).toMatchObject({ ok: true });
    const s = (await a.get("/suscripcion")).json();
    expect(s).toMatchObject({ estado: "Activa" });
    const pagoHasta = s.pagoHasta;
    // Aviso repetido: no extiende de nuevo
    await aviso("9003", firmar("9003"));
    expect((await a.get("/suscripcion")).json().pagoHasta).toBe(pagoHasta);
    // Pago de otra cosa: se ignora sin error
    mp.pagos.set("9004", { status: "approved", external_reference: "OTRA-COSA", transaction_amount: 1 });
    expect((await aviso("9004", firmar("9004"))).json()).toMatchObject({ ignorado: true });
    // Avisos que no son de pagos: se ignoran
    expect((await appMp.inject({ method: "POST", url: "/api/suscripcion/webhook/mercadopago", payload: { type: "plan", data: { id: "1" } } })).json()).toMatchObject({ ignorado: true });
  });

  it("Mercado Pago: al volver del checkout se confirma consultando el pago; el simulador no aplica", async () => {
    const { token } = await registrarEmpresa(appMp);
    const a = api(token, appMp);
    const p = (await a.post("/suscripcion/pagar", { periodo: "anual" })).json();
    expect(p.importeArs).toBe(PRO * 10 * 1000);
    mp.pagos.set("9101", { status: "approved", external_reference: p.referencia, transaction_amount: PRO * 10 * 1000 });
    const v = (await a.post(`/suscripcion/pagos/${p.referencia}/verificar`, { pagoId: "9101" })).json();
    expect(v).toMatchObject({ estado: "Aprobado", proveedorPagoId: "9101" });
    expect((await a.get("/suscripcion")).json()).toMatchObject({ estado: "Activa", periodo: "anual" });
    // Un pago de otra referencia no se puede usar para confirmar este
    const p2 = (await a.post("/suscripcion/pagar")).json();
    expect((await a.post(`/suscripcion/pagos/${p2.referencia}/verificar`, { pagoId: "9101" })).statusCode).toBe(400);
    // Con Mercado Pago configurado, no se puede "simular"
    expect((await a.post(`/suscripcion/pagos/${p2.referencia}/simular`, { resultado: "Aprobado" })).statusCode).toBe(400);
  });
});

describe("producción sin Mercado Pago", () => {
  it("no se puede pagar en línea ni aprobarse un pago simulado: se coordina por transferencia", async () => {
    const { pagosDeshabilitados } = await import("../src/lib/pagos.js");
    const { app, cerrar } = await crearApp({ pagos: pagosDeshabilitados(), cotizacion: async () => 1000 });
    try {
      const { token } = await registrarEmpresa(app);
      const r = await app.inject({ method: "POST", url: "/api/suscripcion/pagar", headers: auth(token), payload: { periodo: "mensual" } });
      expect(r.statusCode).toBe(502);
      expect(r.json().error).toContain("transferencia");
      const s = (await app.inject({ method: "GET", url: "/api/suscripcion", headers: auth(token) })).json();
      expect(s).toMatchObject({ proveedor: "deshabilitado", estado: "Prueba" });
      expect(s.pagos).toHaveLength(0);
    } finally {
      await cerrar();
    }
  });
});
