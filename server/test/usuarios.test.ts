import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

async function crearUsuario(token: string, rol: "admin" | "ventas" | "operaciones") {
  const email = emailUnico(rol);
  const res = await app.inject({
    method: "POST",
    url: "/api/usuarios",
    headers: auth(token),
    payload: { nombre: `Usuario ${rol}`, email, rol, password: "clave-segura-123" },
  });
  return { res, email };
}

const login = (email: string) => app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } });

describe("usuarios de la empresa", () => {
  it("el administrador crea un usuario de ventas que después puede iniciar sesión", async () => {
    const { token } = await registrarEmpresa(app);
    const { res, email } = await crearUsuario(token, "ventas");
    expect(res.statusCode).toBe(201);
    expect(res.json()).not.toHaveProperty("passwordHash");

    const l = await login(email);
    expect(l.statusCode).toBe(200);
    expect(l.json().usuario.rol).toBe("ventas");

    const lista = await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(token) });
    expect(lista.json()).toHaveLength(2);
  });

  it("un usuario que no es administrador no puede gestionar usuarios", async () => {
    const { token } = await registrarEmpresa(app);
    const { email } = await crearUsuario(token, "ventas");
    const tokenVentas = (await login(email)).json().token;
    expect((await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(tokenVentas) })).statusCode).toBe(403);
    expect((await crearUsuario(tokenVentas, "admin")).res.statusCode).toBe(403);
  });

  it("un usuario suspendido no puede iniciar sesión", async () => {
    const { token } = await registrarEmpresa(app);
    const { res, email } = await crearUsuario(token, "operaciones");
    const patch = await app.inject({ method: "PATCH", url: `/api/usuarios/${res.json().id}`, headers: auth(token), payload: { estado: "Suspendido" } });
    expect(patch.statusCode).toBe(200);
    expect((await login(email)).statusCode).toBe(401);
  });

  it("el administrador no puede suspenderse ni quitarse el rol a sí mismo", async () => {
    const { token, usuario } = await registrarEmpresa(app);
    const r1 = await app.inject({ method: "PATCH", url: `/api/usuarios/${usuario.id}`, headers: auth(token), payload: { estado: "Suspendido" } });
    const r2 = await app.inject({ method: "PATCH", url: `/api/usuarios/${usuario.id}`, headers: auth(token), payload: { rol: "ventas" } });
    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(400);
  });

  it("una empresa no puede ver ni modificar usuarios de otra", async () => {
    const a = await registrarEmpresa(app, "Empresa A");
    const b = await registrarEmpresa(app, "Empresa B");
    const listaB = (await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(b.token) })).json();
    expect(listaB.map((u: { id: string }) => u.id)).not.toContain(a.usuario.id);

    const patch = await app.inject({ method: "PATCH", url: `/api/usuarios/${a.usuario.id}`, headers: auth(b.token), payload: { estado: "Suspendido" } });
    expect(patch.statusCode).toBe(404);
  });
});
