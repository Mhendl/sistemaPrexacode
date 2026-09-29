import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

let codigos = 0;
const nuevoProducto = (over: Record<string, unknown> = {}) => ({
  codigo: `P-${++codigos}`,
  descripcion: "Resma A4 75 g",
  categoria: "Librería",
  unidad: "u.",
  precio: 8950.5,
  alicuotaIva: 21,
  controlaStock: true,
  stockMinimo: 10,
  stockInicial: 0,
  ...over,
});

const crear = (token: string, body: Record<string, unknown> = nuevoProducto()) =>
  app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: body });

const mover = (token: string, id: string, body: Record<string, unknown>) =>
  app.inject({ method: "POST", url: `/api/productos/${id}/movimientos`, headers: auth(token), payload: body });

const producto = async (token: string, id: string) => (await app.inject({ method: "GET", url: `/api/productos/${id}`, headers: auth(token) })).json();

async function tokenConRol(adminToken: string, rol: "ventas" | "operaciones") {
  const email = emailUnico(rol);
  await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(adminToken), payload: { nombre: rol, email, rol, password: "clave-segura-123" } });
  return (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
}

describe("productos", () => {
  it("alta con stock inicial: guarda montos como número y registra el movimiento", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await crear(token, nuevoProducto({ stockInicial: 25 }));
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p.precio).toBe(8950.5);
    expect(p.stock).toBe(25);

    const movs = (await app.inject({ method: "GET", url: `/api/productos/${p.id}/movimientos`, headers: auth(token) })).json();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "ingreso", cantidad: 25, stockResultante: 25, motivo: "Stock inicial" });
  });

  it("valida código, descripción, precio y alícuota", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await crear(token, nuevoProducto({ codigo: "", descripcion: "", precio: -5, alicuotaIva: 19 }));
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().details).sort()).toEqual(["alicuotaIva", "codigo", "descripcion", "precio"]);
  });

  it("el código es único dentro de la empresa, pero se puede repetir entre empresas", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    expect((await crear(a.token, nuevoProducto({ codigo: "RESMA" }))).statusCode).toBe(201);
    expect((await crear(a.token, nuevoProducto({ codigo: "RESMA" }))).statusCode).toBe(409);
    expect((await crear(b.token, nuevoProducto({ codigo: "RESMA" }))).statusCode).toBe(201);
  });

  it("editar no cambia el stock (solo se mueve con movimientos)", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ stockInicial: 5 }))).json();
    const res = await app.inject({ method: "PUT", url: `/api/productos/${p.id}`, headers: auth(token), payload: { ...nuevoProducto({ codigo: p.codigo }), precio: 9999, stock: 1000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().precio).toBe(9999);
    expect(res.json().stock).toBe(5);
  });

  it("lista categorías sin repetir", async () => {
    const { token } = await registrarEmpresa(app);
    await crear(token, nuevoProducto({ categoria: "Limpieza" }));
    await crear(token, nuevoProducto({ categoria: "Librería" }));
    await crear(token, nuevoProducto({ categoria: "Limpieza" }));
    await crear(token, nuevoProducto({ categoria: null }));
    const cats = (await app.inject({ method: "GET", url: "/api/productos/categorias", headers: auth(token) })).json();
    expect(cats).toEqual(["Librería", "Limpieza"]);
  });
});

describe("movimientos de stock", () => {
  it("ingreso, egreso y ajuste actualizan el stock y quedan en el historial", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ stockInicial: 10 }))).json();

    const ing = await mover(token, p.id, { tipo: "ingreso", cantidad: 5.5, motivo: "Compra a proveedor" });
    expect(ing.statusCode).toBe(201);
    expect(ing.json().producto.stock).toBe(15.5);

    const egr = await mover(token, p.id, { tipo: "egreso", cantidad: 3, motivo: "Venta mostrador" });
    expect(egr.json().producto.stock).toBe(12.5);

    const aj = await mover(token, p.id, { tipo: "ajuste", stockContado: 12, motivo: "Inventario" });
    expect(aj.json().movimiento.cantidad).toBe(-0.5);
    expect(aj.json().producto.stock).toBe(12);

    const movs = (await app.inject({ method: "GET", url: `/api/productos/${p.id}/movimientos`, headers: auth(token) })).json();
    expect(movs).toHaveLength(4);
    // El stock final coincide con la suma de todos los movimientos
    expect(movs.reduce((a: number, m: { cantidad: number }) => a + m.cantidad, 0)).toBe(12);
  });

  it("no permite sacar más stock del que hay", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ stockInicial: 2 }))).json();
    const res = await mover(token, p.id, { tipo: "egreso", cantidad: 3, motivo: "Venta" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Stock insuficiente/);
    expect((await producto(token, p.id)).stock).toBe(2);
  });

  it("movimientos simultáneos no pierden unidades", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ stockInicial: 0 }))).json();
    await Promise.all(Array.from({ length: 10 }, () => mover(token, p.id, { tipo: "ingreso", cantidad: 1, motivo: "Carga" })));
    expect((await producto(token, p.id)).stock).toBe(10);
  });

  it("los servicios no llevan stock", async () => {
    const { token } = await registrarEmpresa(app);
    const s = (await crear(token, nuevoProducto({ descripcion: "Hora de soporte", controlaStock: false, stockInicial: 50 }))).json();
    expect(s.stock).toBe(0);
    expect((await mover(token, s.id, { tipo: "ingreso", cantidad: 1, motivo: "x" })).statusCode).toBe(400);
  });

  it("un producto con movimientos no se elimina (se desactiva); uno sin movimientos sí", async () => {
    const { token } = await registrarEmpresa(app);
    const conMov = (await crear(token, nuevoProducto({ stockInicial: 1 }))).json();
    const sinMov = (await crear(token, nuevoProducto())).json();
    expect((await app.inject({ method: "DELETE", url: `/api/productos/${conMov.id}`, headers: auth(token) })).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: `/api/productos/${sinMov.id}`, headers: auth(token) })).statusCode).toBe(204);
  });

  it("el listado general de movimientos trae producto y usuario", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ codigo: "TONER-85A", stockInicial: 4 }))).json();
    await mover(token, p.id, { tipo: "egreso", cantidad: 1, motivo: "Entrega" });
    const lista = (await app.inject({ method: "GET", url: "/api/movimientos", headers: auth(token) })).json();
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ tipo: "egreso", productoCodigo: "TONER-85A", usuarioNombre: "Admin Prueba" });
  });
});

describe("permisos y aislamiento", () => {
  it("Ventas consulta productos pero no los modifica ni mueve stock", async () => {
    const { token } = await registrarEmpresa(app);
    const p = (await crear(token, nuevoProducto({ stockInicial: 3 }))).json();
    const ventas = await tokenConRol(token, "ventas");
    expect((await app.inject({ method: "GET", url: "/api/productos", headers: auth(ventas) })).statusCode).toBe(200);
    expect((await crear(ventas)).statusCode).toBe(403);
    expect((await mover(ventas, p.id, { tipo: "egreso", cantidad: 1, motivo: "x" })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/movimientos", headers: auth(ventas) })).statusCode).toBe(403);
  });

  it("Operaciones gestiona productos y stock", async () => {
    const { token } = await registrarEmpresa(app);
    const ops = await tokenConRol(token, "operaciones");
    const p = await crear(ops, nuevoProducto({ stockInicial: 1 }));
    expect(p.statusCode).toBe(201);
    expect((await mover(ops, p.json().id, { tipo: "ingreso", cantidad: 1, motivo: "Compra" })).statusCode).toBe(201);
  });

  it("una empresa no ve ni mueve productos de otra", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const p = (await crear(a.token, nuevoProducto({ stockInicial: 5 }))).json();
    expect((await app.inject({ method: "GET", url: "/api/productos", headers: auth(b.token) })).json()).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/productos/${p.id}`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await mover(b.token, p.id, { tipo: "egreso", cantidad: 5, motivo: "robo" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/productos/${p.id}/movimientos`, headers: auth(b.token) })).json()).toHaveLength(0);
    expect((await producto(a.token, p.id)).stock).toBe(5);
  });
});
