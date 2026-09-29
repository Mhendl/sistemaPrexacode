import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const importar = (token: string, entidad: string, filas: unknown[], opciones: { siExiste?: string; simular?: boolean } = {}) =>
  app.inject({
    method: "POST",
    url: `/api/importar/${entidad}`,
    headers: auth(token),
    payload: { filas, siExiste: opciones.siExiste ?? "omitir", simular: opciones.simular ?? false },
  });

const listar = async (token: string, entidad: string) => (await app.inject({ method: "GET", url: `/api/${entidad}`, headers: auth(token) })).json();

const cli = (razonSocial: string, cuit = cuitValido("30")) => ({ razonSocial, cuit, condicionIva: "Responsable Inscripto", email: "", localidad: "CABA" });
const prod = (codigo: string, extra: Record<string, unknown> = {}) => ({ codigo, descripcion: `Producto ${codigo}`, precio: 1000, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, ...extra });

describe("importar clientes", () => {
  it("la simulación valida y cuenta, pero no guarda nada", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await importar(token, "clientes", [cli("Uno S.A."), cli("Dos S.A.")], { simular: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 2, crear: 2, actualizar: 0, omitir: 0, errores: [], aplicado: false });
    expect(await listar(token, "clientes")).toHaveLength(0);
  });

  it("importa las filas válidas e informa los errores con el número de fila de Excel", async () => {
    const { token } = await registrarEmpresa(app);
    const cuitRepetido = cuitValido("30");
    const filas = [
      cli("Válido Uno S.A."),
      { ...cli("CUIT malo S.A."), cuit: "30-11111111-1" },
      cli("Válido Dos S.A.", cuitRepetido),
      cli("Repetido en el archivo", cuitRepetido),
      { razonSocial: "", cuit: cuitValido(), condicionIva: "Otra" },
    ];
    const res = await importar(token, "clientes", filas);
    const r = res.json();
    expect(r).toMatchObject({ total: 5, crear: 2, aplicado: true });
    expect(r.errores).toEqual([
      { fila: 3, errores: { cuit: "El CUIT no es válido" } },
      { fila: 5, errores: { cuit: "Repetido en el archivo (ya está en la fila 4)" } },
      { fila: 6, errores: expect.objectContaining({ razonSocial: expect.any(String), condicionIva: expect.any(String) }) },
    ]);
    const nombres = (await listar(token, "clientes")).map((c: { razonSocial: string }) => c.razonSocial);
    expect(nombres).toEqual(["Válido Dos S.A.", "Válido Uno S.A."]);
  });

  it("si el CUIT ya existe: omitir lo deja igual, actualizar lo pisa", async () => {
    const { token } = await registrarEmpresa(app);
    const cuit = cuitValido("30");
    await importar(token, "clientes", [cli("Nombre viejo", cuit)]);

    const omitir = (await importar(token, "clientes", [cli("Nombre nuevo", cuit)], { siExiste: "omitir" })).json();
    expect(omitir).toMatchObject({ crear: 0, omitir: 1 });
    expect((await listar(token, "clientes"))[0].razonSocial).toBe("Nombre viejo");

    const actualizar = (await importar(token, "clientes", [cli("Nombre nuevo", cuit)], { siExiste: "actualizar" })).json();
    expect(actualizar).toMatchObject({ crear: 0, actualizar: 1 });
    const [c] = await listar(token, "clientes");
    expect(c.razonSocial).toBe("Nombre nuevo");
    expect(c.version).toBe(2); // cuenta como una edición
  });

  it("no mezcla empresas: el mismo CUIT en otra empresa se crea aparte", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const cuit = cuitValido("30");
    await importar(a.token, "clientes", [cli("De A", cuit)]);
    const r = (await importar(b.token, "clientes", [cli("De B", cuit)], { siExiste: "actualizar" })).json();
    expect(r).toMatchObject({ crear: 1, actualizar: 0 });
    expect((await listar(a.token, "clientes"))[0].razonSocial).toBe("De A");
  });

  it("límites: archivo vacío, demasiadas filas y rol sin permiso", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await importar(token, "clientes", [])).statusCode).toBe(400);
    const muchas = Array.from({ length: 5001 }, () => cli("x"));
    const res = await importar(token, "clientes", muchas);
    expect(res.statusCode).toBe(400);
    expect(res.json().details.filas).toMatch(/hasta 5000/);

    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await importar(ops, "clientes", [cli("x")])).statusCode).toBe(403);
    expect((await importar(ops, "productos", [prod("X1")])).statusCode).toBe(200);
  });

  it("una entidad desconocida responde 400", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await importar(token, "facturas", [{}])).statusCode).toBe(400);
  });
});

describe("importar productos", () => {
  it("crea productos con su stock inicial registrado como movimiento", async () => {
    const { token } = await registrarEmpresa(app);
    const r = (await importar(token, "productos", [prod("RESMA", { stock: 40 }), prod("HORA", { controlaStock: false, stock: 99 })])).json();
    expect(r).toMatchObject({ crear: 2, errores: [] });
    const lista = await listar(token, "productos");
    const resma = lista.find((p: { codigo: string }) => p.codigo === "RESMA");
    const hora = lista.find((p: { codigo: string }) => p.codigo === "HORA");
    expect(resma.stock).toBe(40);
    expect(hora.stock).toBe(0); // los servicios no llevan stock
    const movs = (await app.inject({ method: "GET", url: `/api/productos/${resma.id}/movimientos`, headers: auth(token) })).json();
    expect(movs[0]).toMatchObject({ cantidad: 40, motivo: "Importación: stock inicial" });
  });

  it("al actualizar, un stock distinto queda registrado como ajuste; sin columna stock, no se toca", async () => {
    const { token } = await registrarEmpresa(app);
    await importar(token, "productos", [prod("TONER", { stock: 10 }), prod("CABLE", { stock: 5 })]);

    const r = (await importar(token, "productos", [prod("TONER", { stock: 7, precio: 2500 }), prod("CABLE", { precio: 900 })], { siExiste: "actualizar" })).json();
    expect(r).toMatchObject({ actualizar: 2, errores: [] });

    const lista = await listar(token, "productos");
    const toner = lista.find((p: { codigo: string }) => p.codigo === "TONER");
    const cable = lista.find((p: { codigo: string }) => p.codigo === "CABLE");
    expect(toner).toMatchObject({ stock: 7, precio: 2500 });
    expect(cable).toMatchObject({ stock: 5, precio: 900 });
    const movs = (await app.inject({ method: "GET", url: `/api/productos/${toner.id}/movimientos`, headers: auth(token) })).json();
    expect(movs[0]).toMatchObject({ tipo: "ajuste", cantidad: -3, stockResultante: 7, motivo: "Importación: corrección de stock" });
  });

  it("valida precio, alícuota y stock; y no deja pasar a servicio un producto con stock", async () => {
    const { token } = await registrarEmpresa(app);
    await importar(token, "productos", [prod("CON-STOCK", { stock: 3 })]);
    const r = (
      await importar(
        token,
        "productos",
        [prod("P1", { precio: -1 }), prod("P2", { alicuotaIva: 19 }), prod("P3", { stock: -2 }), prod("CON-STOCK", { controlaStock: false })],
        { siExiste: "actualizar", simular: true },
      )
    ).json();
    expect(r.errores.map((e: { fila: number; errores: Record<string, string> }) => [e.fila, Object.keys(e.errores)[0]])).toEqual([
      [2, "precio"],
      [3, "alicuotaIva"],
      [4, "stock"],
      [5, "controlaStock"],
    ]);
  });
});

describe("mensajes de error", () => {
  it("están en español aunque el valor venga con el tipo equivocado", async () => {
    const { token } = await registrarEmpresa(app);
    const r = (await importar(token, "productos", [prod("Z1", { controlaStock: "quizás", precio: "caro" })], { simular: true })).json();
    expect(r.errores[0].errores).toEqual({ controlaStock: "Tiene que ser Sí o No", precio: "Precio inválido" });
  });
});
