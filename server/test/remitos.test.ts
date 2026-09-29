import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

let n = 0;
async function preparar(token: string) {
  const cliente = (
    await app.inject({
      method: "POST",
      url: "/api/clientes",
      headers: auth(token),
      payload: { razonSocial: "Constructora Del Plata S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto", domicilio: "Calle 7 N° 1234", localidad: "La Plata" },
    })
  ).json();
  const producto = async (stockInicial: number, extra: Record<string, unknown> = {}) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/productos",
        headers: auth(token),
        payload: { codigo: `R-${++n}`, descripcion: `Producto ${n}`, precio: 100, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial, ...extra },
      })
    ).json();
  return { cliente, producto };
}

const emitir = (token: string, body: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/remitos", headers: auth(token), payload: body });
const stock = async (token: string, id: string) => (await app.inject({ method: "GET", url: `/api/productos/${id}`, headers: auth(token) })).json().stock;

describe("remitos", () => {
  it("emitir descuenta el stock, guarda copia de los ítems y numera correlativo", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const notebook = await producto(10, { descripcion: "Notebook 15,6\"" });
    const servicio = await producto(0, { descripcion: "Instalación", controlaStock: false });

    const r1 = await emitir(token, { clienteId: cliente.id, fecha: "2026-09-25", items: [{ productoId: notebook.id, cantidad: 4 }, { productoId: servicio.id, cantidad: 2 }] });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ numero: 1, puntoVenta: 1, estado: "Emitido", domicilioEntrega: "Calle 7 N° 1234, La Plata" });
    expect(await stock(token, notebook.id)).toBe(6);

    const r2 = (await emitir(token, { clienteId: cliente.id, items: [{ productoId: notebook.id, cantidad: 1 }] })).json();
    expect(r2.numero).toBe(2);

    const detalle = (await app.inject({ method: "GET", url: `/api/remitos/${r1.json().id}`, headers: auth(token) })).json();
    expect(detalle.cliente.razonSocial).toBe("Constructora Del Plata S.A.");
    expect(detalle.items.map((i: { descripcion: string; cantidad: number }) => [i.descripcion, i.cantidad])).toEqual([
      ['Notebook 15,6"', 4],
      ["Instalación", 2],
    ]);

    // Si después cambia la descripción del producto, el remito conserva la original
    await app.inject({ method: "PUT", url: `/api/productos/${notebook.id}`, headers: auth(token), payload: { codigo: notebook.codigo, descripcion: "Otro nombre", precio: 100, alicuotaIva: 21, controlaStock: true, stockMinimo: 0 } });
    const otraVez = (await app.inject({ method: "GET", url: `/api/remitos/${r1.json().id}`, headers: auth(token) })).json();
    expect(otraVez.items[0].descripcion).toBe('Notebook 15,6"');

    const movs = (await app.inject({ method: "GET", url: `/api/productos/${notebook.id}/movimientos`, headers: auth(token) })).json();
    expect(movs.map((m: { motivo: string }) => m.motivo)).toContain("Remito 0001-00000001 · Constructora Del Plata S.A.");
  });

  it("sin stock suficiente no emite nada e indica qué renglón falla", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const hay = await producto(10);
    const falta = await producto(2);
    const res = await emitir(token, { clienteId: cliente.id, items: [{ productoId: hay.id, cantidad: 5 }, { productoId: falta.id, cantidad: 3 }] });
    expect(res.statusCode).toBe(409);
    expect(res.json().details).toEqual({ "items.1.cantidad": "Stock insuficiente: hay 2 u." });
    // Nada cambió: ni stock ni numeración
    expect(await stock(token, hay.id)).toBe(10);
    const ok = (await emitir(token, { clienteId: cliente.id, items: [{ productoId: hay.id, cantidad: 1 }] })).json();
    expect(ok.numero).toBe(1);
  });

  it("valida cliente, ítems vacíos, cantidades y productos repetidos o inactivos", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const p = await producto(5);
    expect((await emitir(token, { items: [{ productoId: p.id, cantidad: 1 }] })).json().details.clienteId).toBe("Elegí un cliente");
    expect((await emitir(token, { clienteId: cliente.id, items: [] })).json().details.items).toBe("Agregá al menos un producto");
    expect((await emitir(token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 0 }] })).json().details["items.0.cantidad"]).toMatch(/mayor a cero/);
    expect((await emitir(token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 1 }, { productoId: p.id, cantidad: 1 }] })).statusCode).toBe(400);

    await app.inject({ method: "PUT", url: `/api/productos/${p.id}`, headers: auth(token), payload: { codigo: p.codigo, descripcion: p.descripcion, precio: 100, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, activo: false } });
    const inactivo = await emitir(token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 1 }] });
    expect(inactivo.json().details["items.0.productoId"]).toMatch(/inactivo/);
  });

  it("dos remitos emitidos al mismo tiempo reciben números distintos y el stock no se pierde", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const p = await producto(20);
    const resultados = await Promise.all(Array.from({ length: 8 }, () => emitir(token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 2 }] })));
    expect(resultados.every((r) => r.statusCode === 201)).toBe(true);
    const numeros = resultados.map((r) => r.json().numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await stock(token, p.id)).toBe(4);
  });

  it("anular devuelve el stock, pide motivo y no se puede anular dos veces", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const p = await producto(10);
    const r = (await emitir(token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 7 }] })).json();
    expect(await stock(token, p.id)).toBe(3);

    expect((await app.inject({ method: "POST", url: `/api/remitos/${r.id}/anular`, headers: auth(token), payload: { motivo: "" } })).statusCode).toBe(400);
    const an = await app.inject({ method: "POST", url: `/api/remitos/${r.id}/anular`, headers: auth(token), payload: { motivo: "Cliente rechazó la entrega" } });
    expect(an.statusCode).toBe(200);
    expect(an.json()).toMatchObject({ estado: "Anulado", motivoAnulacion: "Cliente rechazó la entrega" });
    expect(await stock(token, p.id)).toBe(10);
    expect((await app.inject({ method: "POST", url: `/api/remitos/${r.id}/anular`, headers: auth(token), payload: { motivo: "otra vez" } })).statusCode).toBe(409);
    expect(await stock(token, p.id)).toBe(10);
  });

  it("un cliente o un servicio con remitos no se pueden eliminar (se desactivan)", async () => {
    const { token } = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(token);
    const servicio = await producto(0, { controlaStock: false });
    await emitir(token, { clienteId: cliente.id, items: [{ productoId: servicio.id, cantidad: 1 }] });
    const delCliente = await app.inject({ method: "DELETE", url: `/api/clientes/${cliente.id}`, headers: auth(token) });
    expect(delCliente.statusCode).toBe(409);
    expect(delCliente.json().error).toMatch(/Inactivo/);
    expect((await app.inject({ method: "DELETE", url: `/api/productos/${servicio.id}`, headers: auth(token) })).statusCode).toBe(409);
  });

  it("permisos: ventas emite pero no anula; y cada empresa ve solo sus remitos", async () => {
    const a = await registrarEmpresa(app);
    const { cliente, producto } = await preparar(a.token);
    const p = await producto(5);
    const email = emailUnico("ventas");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(a.token), payload: { nombre: "Vendedor", email, rol: "ventas", password: "clave-segura-123" } });
    const ventas = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;

    const r = await emitir(ventas, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 1 }] });
    expect(r.statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/remitos/${r.json().id}/anular`, headers: auth(ventas), payload: { motivo: "error" } })).statusCode).toBe(403);

    const b = await registrarEmpresa(app);
    expect((await app.inject({ method: "GET", url: "/api/remitos", headers: auth(b.token) })).json()).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/remitos/${r.json().id}`, headers: auth(b.token) })).statusCode).toBe(404);
    // B no puede usar un cliente ni un producto de A
    const res = await emitir(b.token, { clienteId: cliente.id, items: [{ productoId: p.id, cantidad: 1 }] });
    expect(res.statusCode).toBe(400);
    expect(await stock(a.token, p.id)).toBe(4);
  });
});
