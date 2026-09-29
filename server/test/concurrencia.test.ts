import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const cliente = () => ({ razonSocial: "Hotel Costa Azul S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" });
const producto = (codigo: string) => ({ codigo, descripcion: "Resma A4", precio: 100, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial: 10 });

describe("dos usuarios editando lo mismo", () => {
  it("cliente: el segundo que guarda con una versión vieja recibe un aviso y no pisa el cambio", async () => {
    const { token } = await registrarEmpresa(app);
    const c = (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: cliente() })).json();
    expect(c.version).toBe(1);

    // Los dos abrieron la ficha en la versión 1
    const primero = await app.inject({ method: "PUT", url: `/api/clientes/${c.id}`, headers: auth(token), payload: { ...c, contacto: "Ana", version: 1 } });
    expect(primero.statusCode).toBe(200);
    expect(primero.json().version).toBe(2);

    const segundo = await app.inject({ method: "PUT", url: `/api/clientes/${c.id}`, headers: auth(token), payload: { ...c, contacto: "Beto", version: 1 } });
    expect(segundo.statusCode).toBe(409);
    expect(segundo.json().code).toBe("EDICION_CONCURRENTE");
    expect(segundo.json().error).toMatch(/Otro usuario modificó este cliente/);

    const actual = (await app.inject({ method: "GET", url: `/api/clientes/${c.id}`, headers: auth(token) })).json();
    expect(actual.contacto).toBe("Ana");
  });

  it("producto: igual que con clientes", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: producto("A1") })).json();
    expect((await app.inject({ method: "PUT", url: `/api/productos/${p.id}`, headers: auth(token), payload: { ...producto("A1"), precio: 200, version: 1 } })).statusCode).toBe(200);
    const viejo = await app.inject({ method: "PUT", url: `/api/productos/${p.id}`, headers: auth(token), payload: { ...producto("A1"), precio: 300, version: 1 } });
    expect(viejo.statusCode).toBe(409);
    expect(viejo.json().code).toBe("EDICION_CONCURRENTE");
  });

  it("un movimiento de stock NO cuenta como edición: no genera falsos avisos", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: producto("B1") })).json();
    // Mientras alguien edita el precio, otro registra una venta
    await app.inject({ method: "POST", url: `/api/productos/${p.id}/movimientos`, headers: auth(token), payload: { tipo: "egreso", cantidad: 1, motivo: "Venta" } });
    const res = await app.inject({ method: "PUT", url: `/api/productos/${p.id}`, headers: auth(token), payload: { ...producto("B1"), precio: 150, version: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().stock).toBe(9); // no pisa el stock
  });
});
