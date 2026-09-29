import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

let n = 0;
const crearProducto = async (token: string, stockInicial: number, stockMinimo: number) =>
  (
    await app.inject({
      method: "POST",
      url: "/api/productos",
      headers: auth(token),
      payload: { codigo: `N-${++n}`, descripcion: "Tóner 85A", precio: 100, alicuotaIva: 21, controlaStock: true, stockInicial, stockMinimo },
    })
  ).json();

const egreso = (token: string, id: string, cantidad: number) =>
  app.inject({ method: "POST", url: `/api/productos/${id}/movimientos`, headers: auth(token), payload: { tipo: "egreso", cantidad, motivo: "Venta" } });

const bandeja = async (token: string) => (await app.inject({ method: "GET", url: "/api/notificaciones", headers: auth(token) })).json();

async function usuario(adminToken: string, rol: "ventas" | "operaciones") {
  const email = emailUnico(rol);
  await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(adminToken), payload: { nombre: `Usuario ${rol}`, email, rol, password: "clave-segura-123" } });
  return (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
}

describe("avisos de stock", () => {
  it("avisa una sola vez cuando el producto cruza el mínimo, y otra cuando se queda sin stock", async () => {
    const { token } = await registrarEmpresa(app);
    const p = await crearProducto(token, 10, 5);

    await egreso(token, p.id, 3); // 7: sigue arriba del mínimo
    expect((await bandeja(token)).noLeidas).toBe(0);

    await egreso(token, p.id, 3); // 4: cruza el mínimo
    let b = await bandeja(token);
    expect(b.noLeidas).toBe(1);
    expect(b.items[0]).toMatchObject({ tipo: "stock_bajo", titulo: "Stock bajo el mínimo", link: `/productos/${p.id}`, leida: false });
    expect(b.items[0].detalle).toContain("quedan 4 u.");

    await egreso(token, p.id, 1); // 3: ya estaba bajo → no repite
    expect((await bandeja(token)).noLeidas).toBe(1);

    await egreso(token, p.id, 3); // 0: sin stock
    b = await bandeja(token);
    expect(b.noLeidas).toBe(2);
    expect(b.items[0].tipo).toBe("sin_stock");
  });

  it("subir el mínimo por encima del stock actual también avisa", async () => {
    const { token } = await registrarEmpresa(app);
    const p = await crearProducto(token, 8, 2);
    await app.inject({
      method: "PUT",
      url: `/api/productos/${p.id}`,
      headers: auth(token),
      payload: { codigo: p.codigo, descripcion: p.descripcion, precio: 100, alicuotaIva: 21, controlaStock: true, stockMinimo: 20 },
    });
    expect((await bandeja(token)).items[0].tipo).toBe("stock_bajo");
  });

  it("le llega a administradores y a operaciones, no a ventas", async () => {
    const { token } = await registrarEmpresa(app);
    const ops = await usuario(token, "operaciones");
    const ventas = await usuario(token, "ventas");
    const p = await crearProducto(token, 5, 5);
    await egreso(ops, p.id, 1);
    expect((await bandeja(token)).noLeidas).toBe(1);
    expect((await bandeja(ops)).noLeidas).toBe(1);
    expect((await bandeja(ventas)).noLeidas).toBe(0);
  });

  it("no le llegan avisos de otra empresa", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const p = await crearProducto(a.token, 5, 5);
    await egreso(a.token, p.id, 1);
    expect((await bandeja(a.token)).noLeidas).toBe(1);
    expect((await bandeja(b.token)).noLeidas).toBe(0);
  });
});

describe("leer y configurar", () => {
  it("marca como leída una o todas", async () => {
    const { token } = await registrarEmpresa(app);
    const p1 = await crearProducto(token, 5, 5);
    const p2 = await crearProducto(token, 5, 5);
    await egreso(token, p1.id, 1);
    await egreso(token, p2.id, 1);
    const b = await bandeja(token);
    expect(b.noLeidas).toBe(2);
    await app.inject({ method: "POST", url: `/api/notificaciones/${b.items[0].id}/leer`, headers: auth(token) });
    expect((await bandeja(token)).noLeidas).toBe(1);
    await app.inject({ method: "POST", url: "/api/notificaciones/leer-todas", headers: auth(token) });
    expect((await bandeja(token)).noLeidas).toBe(0);
  });

  it("cada usuario elige qué avisos recibe", async () => {
    const { token } = await registrarEmpresa(app);
    const prefs = (await app.inject({ method: "GET", url: "/api/notificaciones/preferencias", headers: auth(token) })).json();
    expect(prefs.map((p: { tipo: string }) => p.tipo)).toEqual(["stock_bajo", "sin_stock", "vencimiento_factura", "agenda_asignacion", "soporte_respuesta", "oportunidad_asignada"]);
    expect(prefs.every((p: { enSistema: boolean }) => p.enSistema)).toBe(true);

    const put = await app.inject({ method: "PUT", url: "/api/notificaciones/preferencias", headers: auth(token), payload: [{ tipo: "stock_bajo", enSistema: false }] });
    expect(put.statusCode).toBe(204);

    const p = await crearProducto(token, 5, 5);
    await egreso(token, p.id, 1); // cruza el mínimo, pero lo desactivó
    expect((await bandeja(token)).noLeidas).toBe(0);
    await egreso(token, p.id, 4); // sin stock sigue activo
    expect((await bandeja(token)).items[0].tipo).toBe("sin_stock");
  });

  it("no deja configurar avisos que no corresponden al rol", async () => {
    const { token } = await registrarEmpresa(app);
    const ventas = await usuario(token, "ventas");
    const prefs = (await app.inject({ method: "GET", url: "/api/notificaciones/preferencias", headers: auth(ventas) })).json();
    expect(prefs.map((p: { tipo: string }) => p.tipo)).toEqual(["vencimiento_factura", "agenda_asignacion", "soporte_respuesta", "oportunidad_asignada"]);
    const res = await app.inject({ method: "PUT", url: "/api/notificaciones/preferencias", headers: auth(ventas), payload: [{ tipo: "stock_bajo", enSistema: true }] });
    expect(res.statusCode).toBe(400);
  });
});
