import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suscripciones } from "../src/db/schema.js";
import { aplicarCambioPagado, cotizarCambio, sumarDias } from "../src/lib/suscripcion.js";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

describe("cuánto cuesta cambiar de plan", () => {
  const h = "2026-09-27";
  const pago = { plan: "basico", usuariosAdicionales: 0, periodo: "mensual", pruebaHasta: "2026-09-01", pagoHasta: "2026-10-16" };

  it("en prueba o sin período pago: se aplica ya", () => {
    expect(cotizarCambio({ ...pago, pagoHasta: null, pruebaHasta: "2026-10-05" }, "empresa", 3, h)).toEqual({ tipo: "inmediato" });
    expect(cotizarCambio({ ...pago, pagoHasta: "2026-09-20" }, "empresa", 0, h)).toEqual({ tipo: "inmediato" }); // vencida
  });

  it("subir con período pago: la diferencia por los días que faltan (incluido hoy)", () => {
    // Básico USD 35 → Profesional USD 75: USD 40 por mes; faltan 20 días (27/09 al 16/10)
    expect(cotizarCambio(pago, "profesional", 0, h)).toEqual({ tipo: "pagar", importeUsd: 26.67, dias: 20, hasta: "2026-10-16" });
    // Un usuario adicional (USD 12 por mes) por 20 días
    expect(cotizarCambio(pago, "basico", 1, h)).toMatchObject({ tipo: "pagar", importeUsd: 8 });
    // Pagando anual, cada mes sale 10/12
    expect(cotizarCambio({ ...pago, periodo: "anual" }, "profesional", 0, h)).toMatchObject({ tipo: "pagar", importeUsd: 22.22 });
  });

  it("si pagó durante la prueba, los días que todavía son gratis no se cobran", () => {
    // Prueba hasta el 05/10, pagó hasta el 04/11: se cobran los días del 06/10 al 04/11 (30)
    expect(cotizarCambio({ ...pago, pruebaHasta: "2026-10-05", pagoHasta: "2026-11-04" }, "profesional", 0, h)).toMatchObject({ tipo: "pagar", importeUsd: 40, dias: 30 });
  });

  it("bajar con período pago: queda para la próxima renovación", () => {
    expect(cotizarCambio({ ...pago, plan: "empresa" }, "basico", 0, h)).toEqual({ tipo: "proximo", desde: "2026-10-17" });
    expect(cotizarCambio({ ...pago, usuariosAdicionales: 2 }, "basico", 1, h)).toEqual({ tipo: "proximo", desde: "2026-10-17" });
  });
});

describe("qué compra un pago de cambio al acreditarse", () => {
  const h = "2026-09-27";
  const s = { plan: "basico", usuariosAdicionales: 0, periodo: "mensual", pruebaHasta: "2026-09-01", pagoHasta: "2026-10-16" };

  it("lo normal: sube y el vencimiento no se mueve", () => {
    const q = cotizarCambio(s, "profesional", 0, h);
    expect(aplicarCambioPagado(s, { plan: "profesional", usuariosAdicionales: 0, importeUsd: (q as { importeUsd: number }).importeUsd }, h)).toEqual({ plan: "profesional", usuariosAdicionales: 0, pagoHasta: "2026-10-16", aplicado: true });
  });

  it("meses de 31 días: se cobra el día 31 y el vencimiento tampoco se mueve", () => {
    const largo = { ...s, pagoHasta: "2026-10-27" }; // 31 días desde hoy
    const q = cotizarCambio(largo, "profesional", 0, h) as { importeUsd: number; dias: number };
    expect(q).toMatchObject({ dias: 31, importeUsd: 41.33 });
    expect(aplicarCambioPagado(largo, { plan: "profesional", usuariosAdicionales: 0, importeUsd: q.importeUsd }, h).pagoHasta).toBe("2026-10-27");
  });

  it("pagó dos veces lo mismo: el segundo no cambia el plan y se acredita como días", () => {
    const yaAplicado = { ...s, usuariosAdicionales: 1 }; // USD 47/mes = 1,57 por día
    const r = aplicarCambioPagado(yaAplicado, { plan: "basico", usuariosAdicionales: 1, importeUsd: 8 }, h);
    expect(r).toMatchObject({ plan: "basico", usuariosAdicionales: 1, aplicado: false });
    expect(r.pagoHasta).toBe("2026-10-21"); // 20 días + 8/1,57 ≈ 5 días más
  });

  it("renovó al precio viejo antes de pagar la diferencia: los días de más se recalculan al precio nuevo", () => {
    const renovado = { ...s, pagoHasta: "2026-11-15" }; // 20 días + 30 de la renovación, a USD 35
    const r = aplicarCambioPagado(renovado, { plan: "profesional", usuariosAdicionales: 0, importeUsd: 26.67 }, h);
    // 50 días a 35 + 26,67 USD = 85 USD → a 75 por mes son 34 días
    expect(r).toMatchObject({ plan: "profesional", pagoHasta: "2026-10-30", aplicado: true });
  });

  it("lo paga con el período vencido: el plan nuevo y los días que alcance, desde hoy", () => {
    const vencido = { ...s, pagoHasta: "2026-09-20" };
    const r = aplicarCambioPagado(vencido, { plan: "profesional", usuariosAdicionales: 0, importeUsd: 26.67 }, h);
    expect(r).toMatchObject({ plan: "profesional", pagoHasta: "2026-10-07", aplicado: true }); // 26,67 / (75/30) ≈ 11 días
  });
});

describe("cambios de plan por la API", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ cotizacion: async () => 1000 }));
  });
  afterAll(() => cerrar());

  const api = (t: string) => ({
    get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(t) }),
    post: (url: string, payload: object = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(t), payload }),
    put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(t), payload }),
  });
  const nuevoUsuario = (a: ReturnType<typeof api>) => a.post("/usuarios", { nombre: "Usuario", email: emailUnico("u"), rol: "ventas", password: "clave-segura-123" });

  /** Empresa en plan Básico con el período pago en curso: vence en 20 días */
  async function basicoPaga() {
    const r = await registrarEmpresa(app);
    const a = api(r.token);
    await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 });
    await app.db.update(suscripciones).set({ pruebaHasta: sumarDias(hoy(), -40), pagoHasta: sumarDias(hoy(), 19) }).where(eq(suscripciones.empresaId, r.empresaId));
    expect((await a.get("/suscripcion")).json()).toMatchObject({ estado: "Activa", plan: "basico" });
    return { ...r, a };
  }

  it("sumar un usuario a mitad de período: se paga proporcional y recién al acreditarse se habilita", async () => {
    const { a } = await basicoPaga();
    expect((await nuevoUsuario(a)).statusCode).toBe(201); // 2 de 2
    expect((await nuevoUsuario(a)).json().code).toBe("LIMITE_PLAN");

    const cambio = (await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 1 })).json();
    // USD 12 × 20/30 = 8 → $ 8.000 a $ 1.000
    expect(cambio).toMatchObject({ aplicado: "pagar", dias: 20, importeUsd: 8, importeArs: 8000 });
    expect(cambio.titulo).toContain("por los 20 días que faltan");
    // Todavía no pagó: sigue el límite de antes
    expect((await a.get("/suscripcion")).json()).toMatchObject({ usuariosAdicionales: 0, limites: { usuarios: 2 } });
    expect((await nuevoUsuario(a)).statusCode).toBe(409);

    const pagado = (await a.post(`/suscripcion/pagos/${cambio.referencia}/simular`, { resultado: "Aprobado" })).json();
    expect(pagado).toMatchObject({ estado: "Aprobado", tipo: "cambio", hasta: sumarDias(hoy(), 19) });
    const s = (await a.get("/suscripcion")).json();
    expect(s).toMatchObject({ usuariosAdicionales: 1, limites: { usuarios: 3 }, pagoHasta: sumarDias(hoy(), 19) }); // el vencimiento no se mueve
    expect((await nuevoUsuario(a)).statusCode).toBe(201);
  });

  it("subir de plan a mitad de período: paga la diferencia; si se rechaza, no cambia nada", async () => {
    const { a } = await basicoPaga();
    const rechazado = (await a.put("/suscripcion", { plan: "empresa", usuariosAdicionales: 0 })).json();
    expect(rechazado).toMatchObject({ aplicado: "pagar", importeUsd: 70 }); // (140 − 35) × 20/30
    await a.post(`/suscripcion/pagos/${rechazado.referencia}/simular`, { resultado: "Rechazado" });
    expect((await a.get("/suscripcion")).json()).toMatchObject({ plan: "basico" });

    const otro = (await a.put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 })).json();
    await a.post(`/suscripcion/pagos/${otro.referencia}/simular`, { resultado: "Aprobado" });
    expect((await a.get("/suscripcion")).json()).toMatchObject({ plan: "profesional", limites: { usuarios: 5, puntosVenta: 3 } });
  });

  it("bajar de plan a mitad de período: se programa para la renovación, que se cobra al precio nuevo", async () => {
    const { a, empresaId } = await basicoPaga();
    await app.db.update(suscripciones).set({ plan: "empresa" }).where(eq(suscripciones.empresaId, empresaId));
    const r = (await a.put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 })).json();
    expect(r).toMatchObject({ aplicado: "proximo", desde: sumarDias(hoy(), 20), plan: "empresa", planProximo: "profesional" });
    // Hasta la renovación sigue con lo que pagó
    expect((await a.get("/suscripcion")).json()).toMatchObject({ plan: "empresa", planProximo: "profesional", limites: { usuarios: 10 } });

    const renov = (await a.post("/suscripcion/pagar", { periodo: "mensual" })).json();
    expect(renov).toMatchObject({ importeUsd: 75, titulo: "Prexacode plan Profesional (1 mes)" });
    const ok = (await a.post(`/suscripcion/pagos/${renov.referencia}/simular`, { resultado: "Aprobado" })).json();
    expect(ok.desde).toBe(sumarDias(hoy(), 20));
    expect((await a.get("/suscripcion")).json()).toMatchObject({ plan: "profesional", planProximo: null, limites: { usuarios: 5 } });
  });

  it("cambiar de idea: volver al plan actual cancela la bajada programada", async () => {
    const { a, empresaId } = await basicoPaga();
    await app.db.update(suscripciones).set({ plan: "profesional" }).where(eq(suscripciones.empresaId, empresaId));
    await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 });
    expect((await a.get("/suscripcion")).json().planProximo).toBe("basico");
    expect((await a.put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 })).json()).toMatchObject({ aplicado: "inmediato", planProximo: null });
  });

  it("no deja programar una bajada en la que no entran los usuarios actuales", async () => {
    const { a, empresaId } = await basicoPaga();
    await app.db.update(suscripciones).set({ plan: "empresa" }).where(eq(suscripciones.empresaId, empresaId));
    for (let i = 0; i < 3; i++) expect((await nuevoUsuario(a)).statusCode).toBe(201); // 4 activos
    const r = await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 0 });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain("Tenés 4 usuarios activos");
  });

  it("tocar dos veces 'sumar usuario' y pagar los dos: no se cobra dos veces el mismo usuario, se acredita como días", async () => {
    const { a } = await basicoPaga();
    const uno = (await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 1 })).json();
    const dos = (await a.put("/suscripcion", { plan: "basico", usuariosAdicionales: 1 })).json();
    expect(uno.referencia).not.toBe(dos.referencia);
    await a.post(`/suscripcion/pagos/${uno.referencia}/simular`, { resultado: "Aprobado" });
    const segundo = (await a.post(`/suscripcion/pagos/${dos.referencia}/simular`, { resultado: "Aprobado" })).json();
    const s = (await a.get("/suscripcion")).json();
    expect(s).toMatchObject({ usuariosAdicionales: 1, limites: { usuarios: 3 } });
    expect(s.pagoHasta).toBe(sumarDias(hoy(), 24)); // 8 USD a 1,57 por día = 5 días más
    expect(segundo.hasta).toBe(s.pagoHasta);
  });
});
