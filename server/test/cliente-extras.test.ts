import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const api = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
  post: (url: string, payload: object) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: auth(token) }),
});

async function usuario(token: string, rol: string, nombre: string) {
  const email = emailUnico(rol);
  await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre, email, rol, password: "clave-segura-123" } });
  return (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
}

async function preparar() {
  const { token } = await registrarEmpresa(app);
  const a = api(token);
  const cliente = (await a.post("/clientes", { razonSocial: "Imprenta Sur", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).json();
  return { token, a, cliente };
}

describe("notas del cliente", () => {
  it("bitácora con autor y fecha, fijadas arriba; editar y borrar", async () => {
    const { a, cliente } = await preparar();
    const n1 = await a.post(`/clientes/${cliente.id}/notas`, { texto: "Prefiere que lo llamen a la tarde" });
    expect(n1.statusCode).toBe(201);
    expect(n1.json()).toMatchObject({ texto: "Prefiere que lo llamen a la tarde", fijada: false, autor: "Admin Prueba" });
    await a.post(`/clientes/${cliente.id}/notas`, { texto: "Paga solo por transferencia", fijada: true });
    await a.post(`/clientes/${cliente.id}/notas`, { texto: "Reclamó por la entrega del martes" });

    const lista = (await a.get(`/clientes/${cliente.id}/notas`)).json();
    expect(lista.map((n: { texto: string }) => n.texto)).toEqual(["Paga solo por transferencia", "Reclamó por la entrega del martes", "Prefiere que lo llamen a la tarde"]);

    const ed = await a.put(`/clientes/${cliente.id}/notas/${n1.json().id}`, { texto: "Prefiere que lo llamen a la mañana", fijada: true });
    expect(ed.json()).toMatchObject({ texto: "Prefiere que lo llamen a la mañana", fijada: true, autor: "Admin Prueba" });
    expect((await a.del(`/clientes/${cliente.id}/notas/${n1.json().id}`)).statusCode).toBe(204);
    expect((await a.get(`/clientes/${cliente.id}/notas`)).json()).toHaveLength(2);
    expect((await a.post(`/clientes/${cliente.id}/notas`, { texto: "   " })).statusCode).toBe(400);
  });

  it("un vendedor no puede cambiar la nota de otro; el admin sí; Operaciones solo lee", async () => {
    const { token, a, cliente } = await preparar();
    const vendedor = api(await usuario(token, "ventas", "Diego Vendedor"));
    const ops = api(await usuario(token, "operaciones", "Oscar Depósito"));
    const delAdmin = (await a.post(`/clientes/${cliente.id}/notas`, { texto: "Nota del admin" })).json();
    const delVendedor = (await vendedor.post(`/clientes/${cliente.id}/notas`, { texto: "Nota de Diego" })).json();
    expect(delVendedor.autor).toBe("Diego Vendedor");

    expect((await vendedor.put(`/clientes/${cliente.id}/notas/${delAdmin.id}`, { texto: "pisada" })).statusCode).toBe(403);
    expect((await vendedor.del(`/clientes/${cliente.id}/notas/${delAdmin.id}`)).statusCode).toBe(403);
    expect((await vendedor.put(`/clientes/${cliente.id}/notas/${delVendedor.id}`, { texto: "Nota de Diego (editada)" })).statusCode).toBe(200);
    expect((await a.del(`/clientes/${cliente.id}/notas/${delVendedor.id}`)).statusCode).toBe(204);

    expect((await ops.get(`/clientes/${cliente.id}/notas`)).statusCode).toBe(200);
    expect((await ops.post(`/clientes/${cliente.id}/notas`, { texto: "x" })).statusCode).toBe(403);
  });

  it("cada empresa ve solo sus notas; al borrar el cliente se borran", async () => {
    const { a, cliente } = await preparar();
    const nota = (await a.post(`/clientes/${cliente.id}/notas`, { texto: "Privada" })).json();
    const b = api((await registrarEmpresa(app)).token);
    expect((await b.get(`/clientes/${cliente.id}/notas`)).statusCode).toBe(404);
    expect((await b.post(`/clientes/${cliente.id}/notas`, { texto: "intruso" })).statusCode).toBe(404);
    expect((await b.put(`/clientes/${cliente.id}/notas/${nota.id}`, { texto: "intruso" })).statusCode).toBe(404);
    expect((await a.del(`/clientes/${cliente.id}`)).statusCode).toBe(204);
  });
});

describe("productos que usa el cliente", () => {
  it("asignar productos con cantidad, frecuencia y nota; no se repiten; editar y quitar", async () => {
    const { a, cliente } = await preparar();
    const toner = (await a.post("/productos", { codigo: "TN-85", descripcion: "Tóner HP 85A", precio: 45000, alicuotaIva: 21, controlaStock: true, stockInicial: 10, stockMinimo: 2 })).json();
    const resma = (await a.post("/productos", { codigo: "RES-A4", descripcion: "Resma A4", precio: 8000, alicuotaIva: 21, controlaStock: true, stockInicial: 50 })).json();

    const u1 = await a.post(`/clientes/${cliente.id}/productos`, { productoId: toner.id, cantidad: 2, frecuencia: "por mes", nota: "Para la impresora de recepción" });
    expect(u1.statusCode).toBe(201);
    expect(u1.json()).toMatchObject({ cantidad: 2, frecuencia: "por mes", nota: "Para la impresora de recepción", producto: { codigo: "TN-85", descripcion: "Tóner HP 85A", precio: 45000, stock: 10 } });
    await a.post(`/clientes/${cliente.id}/productos`, { productoId: resma.id });

    const repetido = await a.post(`/clientes/${cliente.id}/productos`, { productoId: toner.id, cantidad: 5 });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().error).toContain("ya está en la lista");
    expect((await a.post(`/clientes/${cliente.id}/productos`, { productoId: toner.id, frecuencia: "a veces" })).statusCode).toBe(400);

    const lista = (await a.get(`/clientes/${cliente.id}/productos`)).json();
    expect(lista.map((u: { producto: { descripcion: string } }) => u.producto.descripcion)).toEqual(["Resma A4", "Tóner HP 85A"]);
    expect(lista[0]).toMatchObject({ cantidad: null, frecuencia: null });

    const ed = await a.put(`/clientes/${cliente.id}/productos/${u1.json().id}`, { cantidad: 3, frecuencia: "cada 15 días", nota: null });
    expect(ed.json()).toMatchObject({ cantidad: 3, frecuencia: "cada 15 días", nota: null });
    expect((await a.put(`/clientes/${cliente.id}/productos/${u1.json().id}`, { cantidad: -1 })).statusCode).toBe(400);
    expect((await a.del(`/clientes/${cliente.id}/productos/${u1.json().id}`)).statusCode).toBe(204);
    expect((await a.get(`/clientes/${cliente.id}/productos`)).json()).toHaveLength(1);
  });

  it("no se pueden asignar productos de otra empresa", async () => {
    const { a, cliente } = await preparar();
    const b = await registrarEmpresa(app);
    const ajeno = (await api(b.token).post("/productos", { codigo: "X", descripcion: "Ajeno", precio: 1, alicuotaIva: 21, controlaStock: false })).json();
    const r = await a.post(`/clientes/${cliente.id}/productos`, { productoId: ajeno.id });
    expect(r.statusCode).toBe(400);
    expect(r.json().details).toHaveProperty("productoId");
    expect((await api(b.token).get(`/clientes/${cliente.id}/productos`)).statusCode).toBe(404);
  });
});
