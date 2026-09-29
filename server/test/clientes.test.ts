import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const nuevoCliente = (over: Record<string, unknown> = {}) => ({
  razonSocial: "Panadería La Espiga",
  cuit: cuitValido("20"),
  condicionIva: "Monotributista",
  contacto: "Rosa Benítez",
  email: "laespiga@gmail.com",
  telefono: "+54 11 4241-7789",
  localidad: "Lanús",
  ...over,
});

const crear = (token: string, body = nuevoCliente()) => app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: body });

describe("clientes", () => {
  it("alta, consulta, edición y baja", async () => {
    const { token } = await registrarEmpresa(app);

    const alta = await crear(token);
    expect(alta.statusCode).toBe(201);
    const id = alta.json().id;
    expect(alta.json().estado).toBe("Activo");

    const get = await app.inject({ method: "GET", url: `/api/clientes/${id}`, headers: auth(token) });
    expect(get.json().razonSocial).toBe("Panadería La Espiga");

    const put = await app.inject({
      method: "PUT",
      url: `/api/clientes/${id}`,
      headers: auth(token),
      payload: { ...(get.json() as object), razonSocial: "Panadería La Espiga S.R.L.", condicionIva: "Responsable Inscripto" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().razonSocial).toBe("Panadería La Espiga S.R.L.");

    const del = await app.inject({ method: "DELETE", url: `/api/clientes/${id}`, headers: auth(token) });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/clientes/${id}`, headers: auth(token) })).statusCode).toBe(404);
  });

  it("valida los datos con mensajes por campo", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await crear(token, nuevoCliente({ razonSocial: "", cuit: "20123", condicionIva: "Otra", email: "no-es-email" }));
    expect(res.statusCode).toBe(400);
    const d = res.json().details;
    expect(Object.keys(d).sort()).toEqual(["condicionIva", "cuit", "email", "razonSocial"]);
  });

  it("acepta email y campos opcionales vacíos", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await crear(token, nuevoCliente({ email: "", contacto: "", telefono: null }));
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBeNull();
  });

  it("no permite dos clientes con el mismo CUIT en la misma empresa, pero sí en empresas distintas", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const cuit = cuitValido("30");
    expect((await crear(a.token, nuevoCliente({ cuit }))).statusCode).toBe(201);
    const dup = await crear(a.token, nuevoCliente({ cuit }));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toMatch(/mismo CUIT|ese CUIT/);
    expect((await crear(b.token, nuevoCliente({ cuit }))).statusCode).toBe(201);
  });

  it("busca por nombre, contacto y CUIT (con o sin guiones)", async () => {
    const { token } = await registrarEmpresa(app);
    const cuit = cuitValido("30");
    await crear(token, nuevoCliente({ razonSocial: "Hotel Costa Azul S.A.", contacto: "Marcela Duarte", cuit }));
    await crear(token, nuevoCliente({ razonSocial: "Taller Los Hermanos" }));

    const buscar = async (q: string) =>
      (await app.inject({ method: "GET", url: `/api/clientes?q=${encodeURIComponent(q)}`, headers: auth(token) })).json().map((c: { razonSocial: string }) => c.razonSocial);

    expect(await buscar("costa")).toEqual(["Hotel Costa Azul S.A."]);
    expect(await buscar("marcela")).toEqual(["Hotel Costa Azul S.A."]);
    expect(await buscar(`${cuit.slice(0, 2)}-${cuit.slice(2, 10)}`)).toEqual(["Hotel Costa Azul S.A."]);
    expect(await buscar("")).toHaveLength(2);
  });

  it("una empresa no puede ver, editar ni borrar clientes de otra", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const id = (await crear(a.token)).json().id;

    const listaB = (await app.inject({ method: "GET", url: "/api/clientes", headers: auth(b.token) })).json();
    expect(listaB).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/clientes/${id}`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/clientes/${id}`, headers: auth(b.token), payload: nuevoCliente() })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/api/clientes/${id}`, headers: auth(b.token) })).statusCode).toBe(404);
    // Sigue existiendo para su dueño
    expect((await app.inject({ method: "GET", url: `/api/clientes/${id}`, headers: auth(a.token) })).statusCode).toBe(200);
  });

  it("el rol Operaciones consulta clientes (para remitos) pero no los modifica", async () => {
    const { token } = await registrarEmpresa(app);
    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Ops", email, rol: "operaciones", password: "clave-segura-123" } });
    const tokenOps = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/clientes", headers: auth(tokenOps) })).statusCode).toBe(200);
    const nuevo = await app.inject({ method: "POST", url: "/api/clientes", headers: auth(tokenOps), payload: nuevoCliente() });
    expect(nuevo.statusCode).toBe(403);
  });

  it("un id mal formado responde 400, no 500", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await app.inject({ method: "GET", url: "/api/clientes/123", headers: auth(token) })).statusCode).toBe(400);
  });
});
