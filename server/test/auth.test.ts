import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const registro = (over: { cuit?: string; email?: string; password?: string; acepta?: boolean } = {}) =>
  app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: {
      empresa: { razonSocial: "Ferretería Prueba S.R.L.", cuit: over.cuit ?? cuitValido(), condicionIva: "Responsable Inscripto" },
      usuario: { nombre: "Ana Pérez", email: over.email ?? emailUnico(), password: over.password ?? "clave-segura-123" },
      aceptaTerminos: over.acepta ?? true,
    },
  });

describe("registro de empresa", () => {
  it("crea la empresa y su administrador, y devuelve una sesión", async () => {
    const res = await registro();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.usuario.rol).toBe("admin");
    expect(body.usuario).not.toHaveProperty("passwordHash");
    expect(body.empresa.razonSocial).toBe("Ferretería Prueba S.R.L.");
  });

  it("guarda el CUIT sin guiones", async () => {
    const cuit = cuitValido();
    const conGuiones = `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
    const res = await registro({ cuit: conGuiones });
    expect(res.json().empresa.cuit).toBe(cuit);
  });

  it("rechaza un CUIT con dígito verificador inválido", async () => {
    const res = await registro({ cuit: "30500010913" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details["empresa.cuit"]).toBe("El CUIT no es válido");
  });

  it("rechaza una contraseña corta", async () => {
    const res = await registro({ password: "1234" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details["usuario.password"]).toMatch(/al menos 8/);
  });

  it("no permite dos cuentas con el mismo CUIT ni el mismo email", async () => {
    const cuit = cuitValido();
    const email = emailUnico();
    expect((await registro({ cuit })).statusCode).toBe(201);
    expect((await registro({ cuit })).statusCode).toBe(409);
    expect((await registro({ email })).statusCode).toBe(201);
    const dup = await registro({ email: email.toUpperCase() });
    expect(dup.statusCode).toBe(409);
  });
});

describe("login y sesión", () => {
  it("inicia sesión con email y contraseña correctos", async () => {
    const { email } = await registrarEmpresa(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().usuario.email).toBe(email);
  });

  it("rechaza contraseña incorrecta y email inexistente con el mismo mensaje", async () => {
    const { email } = await registrarEmpresa(app);
    const mal = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "otra-clave-999" } });
    const noExiste = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "nadie@prueba.com", password: "x" } });
    expect(mal.statusCode).toBe(401);
    expect(noExiste.statusCode).toBe(401);
    expect(mal.json().error).toBe(noExiste.json().error);
  });

  it("/me devuelve el usuario y la empresa de la sesión", async () => {
    const { token, empresa } = await registrarEmpresa(app, "Mi Empresa S.A.");
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().empresa.id).toBe(empresa.id);
  });

  it("/me sin token o con token falso responde 401", async () => {
    expect((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: auth("token.falso.x") })).statusCode).toBe(401);
  });
});

describe("términos y condiciones", () => {
  it("no se puede crear la cuenta sin aceptarlos", async () => {
    const res = await registro({ acepta: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.aceptaTerminos).toMatch(/Términos y Condiciones/);
  });

  it("queda constancia de quién aceptó, cuándo y qué versión", async () => {
    const res = await registro();
    const { usuario, empresa } = res.json();
    const { aceptacionesTerminos } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const filas = await app.db.select().from(aceptacionesTerminos).where(eq(aceptacionesTerminos.empresaId, empresa.id));
    expect(filas).toHaveLength(1);
    const { version } = (await app.inject({ method: "GET", url: "/api/legal" })).json();
    expect(filas[0]).toMatchObject({ usuarioId: usuario.id, version });
    expect(filas[0].aceptadoEn).toBeInstanceOf(Date);
    expect(filas[0].ip).toBeTruthy();
  });
});
