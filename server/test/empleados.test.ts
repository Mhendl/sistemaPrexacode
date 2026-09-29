import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vacacionesQueCorresponden } from "../src/routes/empleados.js";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const api = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
  post: (url: string, payload: unknown = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload: payload as object }),
  put: (url: string, payload: unknown) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload: payload as object }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: auth(token) }),
});
const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const mes = () => hoy().slice(0, 7);
const juan = { nombre: "Juan", apellido: "Pérez", cuil: "20-12345678-6", puesto: "Vendedor", fechaIngreso: "2020-03-01", modalidad: "Mensual", sueldo: 850000, cbu: "0110599520000001234567" };

describe("días de vacaciones según la ley", () => {
  it("por antigüedad al 31/12, y proporcional si entró en la segunda mitad del año", () => {
    expect(vacacionesQueCorresponden("2024-02-01", 2026)).toBe(14); // 2 años
    expect(vacacionesQueCorresponden("2020-03-01", 2026)).toBe(21); // 6 años
    expect(vacacionesQueCorresponden("2012-01-10", 2026)).toBe(28); // 14 años
    expect(vacacionesQueCorresponden("2000-05-01", 2026)).toBe(35); // 26 años
    expect(vacacionesQueCorresponden("2026-09-01", 2026)).toBe(6); // 122 días / 20
    expect(vacacionesQueCorresponden("2027-01-01", 2026)).toBe(0);
    // "No excede 5 años": con 5 años justos al 31/12 siguen siendo 14; un día más, 21
    expect(vacacionesQueCorresponden("2021-12-31", 2026)).toBe(14);
    expect(vacacionesQueCorresponden("2021-12-30", 2026)).toBe(21);
  });
});

describe("empleados y sueldos", () => {
  it("legajo, adelanto que se descuenta solo del sueldo, un sueldo por mes, y el resumen", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const e = await a.post("/empleados", juan);
    expect(e.statusCode, e.body).toBe(201);
    const id = e.json().id;
    expect(e.json()).toMatchObject({ cuil: "20123456786", estado: "Activo", sueldo: 850000 });

    // Adelanto a mitad de mes
    const adelanto = await a.post(`/empleados/${id}/pagos`, { tipo: "Adelanto", periodo: mes(), conceptos: [{ concepto: "Adelanto", importe: 150000 }], medio: "Efectivo" });
    expect(adelanto.statusCode, adelanto.body).toBe(201);
    expect(adelanto.json()).toMatchObject({ numero: 1, total: 150000 });

    const liq = (await a.get(`/empleados/${id}/liquidacion?periodo=${mes()}`)).json();
    expect(liq).toMatchObject({ basico: 850000, totalAdelantos: 150000, sueldoYaPagado: null });

    // Sueldo: básico + horas extra − descuento; el adelanto se descuenta solo
    const sueldo = await a.post(`/empleados/${id}/pagos`, {
      tipo: "Sueldo",
      periodo: mes(),
      conceptos: [
        { concepto: "Sueldo básico", importe: 850000 },
        { concepto: "Horas extra", importe: 42000 },
        { concepto: "Faltante de caja", importe: -5000 },
      ],
      medio: "Transferencia",
    });
    expect(sueldo.statusCode, sueldo.body).toBe(201);
    expect(sueldo.json()).toMatchObject({ numero: 2, total: 737000 });
    expect(sueldo.json().conceptos.at(-1)).toEqual({ concepto: "Adelantos del mes", importe: -150000 });

    // Otro sueldo del mismo mes: no; otro adelanto de ese mes: tampoco
    expect((await a.post(`/empleados/${id}/pagos`, { tipo: "Sueldo", periodo: mes(), conceptos: [{ concepto: "Sueldo", importe: 1 }], medio: "Efectivo" })).statusCode).toBe(409);
    const tarde = await a.post(`/empleados/${id}/pagos`, { tipo: "Adelanto", periodo: mes(), conceptos: [{ concepto: "Adelanto", importe: 1000 }], medio: "Efectivo" });
    expect(tarde.json().error).toContain("mes siguiente");
    // El adelanto ya descontado no se anula suelto
    expect((await a.post(`/empleados/pagos/${adelanto.json().id}/anular`, { motivo: "Error" })).json().error).toContain("anulá primero el sueldo");

    // Resumen del mes
    const lista = (await a.get("/empleados")).json();
    expect(lista.resumen).toMatchObject({ activos: 1, sueldosMensuales: 850000, pagadoMes: 887000, sueldosPendientes: 0 });
    expect(lista.empleados[0]).toMatchObject({ sueldoPagado: true, adelantosMes: 150000 });

    // Anular el sueldo (con motivo) lo saca de los totales y permite cargarlo de nuevo
    expect((await a.post(`/empleados/pagos/${sueldo.json().id}/anular`, { motivo: "Faltaba el presentismo" })).json()).toMatchObject({ estado: "Anulado" });
    expect((await a.get("/empleados")).json().resumen).toMatchObject({ pagadoMes: 150000, sueldosPendientes: 1 });
    const otra = await a.post(`/empleados/${id}/pagos`, { tipo: "Sueldo", periodo: mes(), conceptos: [{ concepto: "Sueldo básico", importe: 850000 }, { concepto: "Presentismo", importe: 70000 }], medio: "Transferencia" });
    expect(otra.json()).toMatchObject({ numero: 3, total: 770000 });

    // Comprobante interno
    const comp = (await a.get(`/empleados/pagos/${otra.json().id}`)).json();
    expect(comp.empleado).toMatchObject({ nombre: "Juan", apellido: "Pérez", cuil: "20123456786" });
  });

  it("vacaciones y licencias: no se superponen, y descuentan de los días del año", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const id = (await a.post("/empleados", juan)).json().id;
    const anio = hoy().slice(0, 4);
    const vac = await a.post(`/empleados/${id}/novedades`, { tipo: "Vacaciones", desde: `${anio}-01-05`, hasta: `${anio}-01-14` });
    expect(vac.json()).toMatchObject({ dias: 10 });
    expect((await a.get(`/empleados/${id}`)).json().vacaciones).toMatchObject({ corresponden: 21, tomadas: 10, quedan: 11 });
    const pisa = await a.post(`/empleados/${id}/novedades`, { tipo: "Enfermedad", desde: `${anio}-01-10`, hasta: `${anio}-01-11` });
    expect(pisa.statusCode).toBe(409);
    expect((await a.post(`/empleados/${id}/novedades`, { tipo: "Licencia", desde: `${anio}-02-10`, hasta: `${anio}-02-01` })).statusCode).toBe(400);
    expect((await a.del(`/empleados/${id}/novedades/${vac.json().id}`)).statusCode).toBe(204);
  });

  it("baja: no se borra si tiene pagos, queda en el historial y no se le paga después", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const id = (await a.post("/empleados", juan)).json().id;
    await a.post(`/empleados/${id}/pagos`, { tipo: "Bono", periodo: "2026-01", conceptos: [{ concepto: "Bono fin de año", importe: 50000 }], medio: "Efectivo" });
    expect((await a.del(`/empleados/${id}`)).statusCode).toBe(409);
    expect((await a.post(`/empleados/${id}/baja`, { fecha: "2026-02-28", motivo: "Renuncia" })).json()).toMatchObject({ estado: "Baja", fechaEgreso: "2026-02-28" });
    expect((await a.post(`/empleados/${id}/pagos`, { tipo: "Sueldo", periodo: "2026-03", conceptos: [{ concepto: "Sueldo", importe: 1000 }], medio: "Efectivo" })).statusCode).toBe(400);
    expect((await a.post(`/empleados/${id}/pagos`, { tipo: "Sueldo", periodo: "2026-02", conceptos: [{ concepto: "Liquidación final", importe: 1000 }], medio: "Efectivo" })).statusCode).toBe(201);
  });

  it("valida lo que se carga", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const mal = await a.post("/empleados", { ...juan, cuil: "20-11111111-1", fechaIngreso: "2026-02-30", sueldo: -1, cbu: "123", email: "no" });
    expect(Object.keys(mal.json().details)).toEqual(expect.arrayContaining(["cuil", "fechaIngreso", "sueldo", "cbu", "email"]));
    const id = (await a.post("/empleados", { ...juan, cuil: "" })).json().id;
    for (const cuerpo of [
      { tipo: "Sueldo", periodo: "2026-13", conceptos: [{ concepto: "x1", importe: 1 }], medio: "Efectivo" },
      { tipo: "Sueldo", periodo: mes(), conceptos: [], medio: "Efectivo" },
      { tipo: "Sueldo", periodo: mes(), conceptos: [{ concepto: "Descuento", importe: -100 }], medio: "Efectivo" },
      { tipo: "Adelanto", periodo: mes(), conceptos: [{ concepto: "Adelanto", importe: 100 }, { concepto: "Otro", importe: -10 }], medio: "Efectivo" },
      { tipo: "Premio", periodo: mes(), conceptos: [{ concepto: "x1", importe: 1 }], medio: "Efectivo" },
      { tipo: "Sueldo", periodo: "2019-01", conceptos: [{ concepto: "Viejo", importe: 1 }], medio: "Efectivo" },
    ]) {
      expect((await a.post(`/empleados/${id}/pagos`, cuerpo)).statusCode, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it("permisos: sin 'empleados' no se ve nada; con 'ver' se mira pero no se paga; otra empresa no accede", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const id = (await a.post("/empleados", juan)).json().id;
    const login = async (rol: object) => {
      const email = emailUnico("u");
      await a.post("/usuarios", { nombre: "Alguien", email, password: "clave-segura-123", ...rol });
      return (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
    };
    const vendedor = api(await login({ rol: "ventas" })); // los pre armados no tienen sueldos
    expect((await vendedor.get("/empleados")).statusCode).toBe(403);
    const rrhh = (await a.post("/roles", { nombre: "Consulta RRHH", permisos: ["empleados.ver"] })).json();
    const consulta = api(await login({ rolId: rrhh.id }));
    expect((await consulta.get(`/empleados/${id}`)).statusCode).toBe(200);
    expect((await consulta.post(`/empleados/${id}/pagos`, { tipo: "Bono", periodo: mes(), conceptos: [{ concepto: "Bono", importe: 1 }], medio: "Efectivo" })).statusCode).toBe(403);
    const otra = api((await registrarEmpresa(app)).token);
    expect((await otra.get(`/empleados/${id}`)).statusCode).toBe(404);
    expect((await otra.get("/empleados")).json().empleados).toHaveLength(0);
  });
});
