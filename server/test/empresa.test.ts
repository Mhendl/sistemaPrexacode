import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

/** PNG real de 1x1 píxel */
const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const datosEmpresa = {
  razonSocial: "Distribuidora Andina S.A.",
  nombreFantasia: "Andina Insumos",
  condicionIva: "Responsable Inscripto",
  ingresosBrutos: "901-654321-8",
  inicioActividades: "2014-03-01",
  domicilio: "Av. Corrientes 4521",
  localidad: "CABA",
  codigoPostal: "C1195AAF",
  telefono: "+54 11 4863-2200",
  email: "administracion@andina.com.ar",
};

describe("datos de la empresa", () => {
  it("el administrador actualiza los datos; el CUIT no se puede cambiar", async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const res = await app.inject({ method: "PUT", url: "/api/empresa", headers: auth(token), payload: { ...datosEmpresa, cuit: "30500010912" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ...datosEmpresa, cuit: empresa.cuit });
  });

  it("valida la fecha de inicio de actividades y el email", async () => {
    const { token } = await registrarEmpresa(app);
    const res = await app.inject({ method: "PUT", url: "/api/empresa", headers: auth(token), payload: { ...datosEmpresa, inicioActividades: "01/03/2014", email: "mal" } });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().details).sort()).toEqual(["email", "inicioActividades"]);
  });

  it("un usuario que no es administrador no puede cambiar los datos", async () => {
    const { token } = await registrarEmpresa(app);
    const email = emailUnico();
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Vendedor", email, rol: "ventas", password: "clave-segura-123" } });
    const tv = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/empresa", headers: auth(tv) })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: "/api/empresa", headers: auth(tv), payload: datosEmpresa })).statusCode).toBe(403);
  });
});

describe("logo", () => {
  it("se sube, se sirve públicamente como imagen y se puede quitar", async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const sin = await app.inject({ method: "GET", url: `/api/empresas/${empresa.id}/logo` });
    expect(sin.statusCode).toBe(404);

    const sube = await app.inject({ method: "PUT", url: "/api/empresa/logo", headers: auth(token), payload: { datos: `data:image/png;base64,${PNG_1x1}` } });
    expect(sube.statusCode).toBe(200);
    expect(sube.json().logoActualizado).toBeTruthy();

    const img = await app.inject({ method: "GET", url: `/api/empresas/${empresa.id}/logo` });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.rawPayload.equals(Buffer.from(PNG_1x1, "base64"))).toBe(true);

    const quita = await app.inject({ method: "DELETE", url: "/api/empresa/logo", headers: auth(token) });
    expect(quita.json().logoActualizado).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/empresas/${empresa.id}/logo` })).statusCode).toBe(404);
  });

  it("rechaza archivos que no son imágenes aunque digan serlo (ej. un SVG o un script)", async () => {
    const { token } = await registrarEmpresa(app);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    const res = await app.inject({ method: "PUT", url: "/api/empresa/logo", headers: auth(token), payload: { datos: `data:image/png;base64,${svg}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/PNG, JPG o WEBP/);
  });

  it("rechaza logos de más de 500 KB", async () => {
    const { token } = await registrarEmpresa(app);
    const grande = Buffer.concat([Buffer.from(PNG_1x1, "base64"), Buffer.alloc(520 * 1024)]).toString("base64");
    const res = await app.inject({ method: "PUT", url: "/api/empresa/logo", headers: auth(token), payload: { datos: grande } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/500 KB/);
  });
});
