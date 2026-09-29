import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

describe("un usuario, una sesión", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ adminInicial: ADMIN }));
  });
  afterAll(() => cerrar());

  const get = (token: string, url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) });
  const login = async (email: string, password = "clave-segura-123") => (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } })).json().token as string;

  it("si entra desde otro dispositivo, la sesión anterior se cierra y queda registrado", async () => {
    const { token: admin } = await registrarEmpresa(app);
    const email = emailUnico("vend");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(admin), payload: { nombre: "Diego", email, rol: "ventas", password: "clave-segura-123" } });

    const compu = await login(email);
    expect((await get(compu, "/clientes")).statusCode).toBe(200);
    const celular = await login(email); // el mismo usuario, en otro lado
    expect((await get(celular, "/clientes")).statusCode).toBe(200);
    const r = await get(compu, "/clientes");
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe("SESION_REEMPLAZADA");
    // Varios pedidos de la sesión vieja cuentan una sola vez
    await get(compu, "/productos");
    const usuarios = (await get(admin, "/usuarios")).json() as { email: string; sesionesPisadas: number; sesionId?: string }[];
    const diego = usuarios.find((u) => u.email === email)!;
    expect(diego.sesionesPisadas).toBe(1);
    expect(diego.sesionId).toBeUndefined(); // no se expone

    // El panel lo ve como posible usuario compartido
    const panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
    const empresas = (await get(panel, "/plataforma/empresas")).json() as { sesionesPisadas: number; admin: { email: string } }[];
    expect(empresas.find((e) => e.sesionesPisadas === 1)).toBeTruthy();
  });

  it("al suspender a un usuario o cambiarle el rol, vale en el momento (no cuando vence el token)", async () => {
    const { token: admin } = await registrarEmpresa(app);
    const email = emailUnico("vend");
    const u = (await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(admin), payload: { nombre: "Ana", email, rol: "admin", password: "clave-segura-123" } })).json();
    const suya = await login(email);
    expect((await get(suya, "/usuarios")).statusCode).toBe(200); // es administradora

    await app.inject({ method: "PATCH", url: `/api/usuarios/${u.id}`, headers: auth(admin), payload: { rol: "ventas" } });
    expect((await get(suya, "/usuarios")).statusCode).toBe(403); // ya no

    await app.inject({ method: "PATCH", url: `/api/usuarios/${u.id}`, headers: auth(admin), payload: { estado: "Suspendido" } });
    const r = await get(suya, "/clientes");
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe("USUARIO_SUSPENDIDO");
  });

  it("cerrar sesión invalida el token también en el servidor", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: auth(token) })).statusCode).toBe(204);
    expect((await get(token, "/clientes")).statusCode).toBe(401);
  });

  it("un token viejo sin sesión (de antes de esta versión) ya no sirve", async () => {
    const { empresaId, usuario } = await registrarEmpresa(app);
    const viejo = app.jwt.sign({ sub: usuario.id, empresaId, rol: "admin" });
    expect((await get(viejo, "/clientes")).statusCode).toBe(401);
  });

  it("el panel del dueño sí se puede tener abierto en la compu y en el celular a la vez", async () => {
    const t1 = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
    const t2 = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
    expect((await get(t1, "/plataforma/resumen")).statusCode).toBe(200);
    expect((await get(t2, "/plataforma/resumen")).statusCode).toBe(200);
  });
});
