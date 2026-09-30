import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, carteroDePrueba, crearApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const ADMIN = "duenio@prexacode.com.ar";
const CLAVE = "clave-del-panel-2026";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, adminInicial: { email: ADMIN, password: CLAVE } }));
});
afterAll(() => cerrar());

const pedir = (payload: object) => app.inject({ method: "POST", url: "/api/publico/interesados", payload });

describe("interesados desde las landings", () => {
  it("se guarda el pedido de demo, avisa al panel y se le hace el seguimiento", async () => {
    const r = await pedir({ producto: "dental", nombre: "Dra. Ana Gómez", email: "Ana@Consultorio.com", telefono: "11 5555-1234", empresa: "Consultorio Sonrisas", cargo: "Odontólogo/a", tamano: "2-3", origen: "https://coredental.com.ar/?utm_source=email&utm_campaign=lanzamiento" });
    expect(r.statusCode, r.body).toBe(201);
    // Aviso por email al administrador de la plataforma
    await new Promise((res) => setTimeout(res, 50));
    const aviso = correo.enviados.find((e) => e.mensaje.para === ADMIN);
    expect(aviso?.mensaje.asunto).toBe("Nuevo interesado en CoreDental: Dra. Ana Gómez (Consultorio Sonrisas)");
    expect(aviso?.mensaje.texto).toContain("utm_campaign=lanzamiento");

    // Validaciones y robots
    expect((await pedir({ nombre: "A", email: "x@y.com", telefono: "11 5555-1234" })).statusCode).toBe(400);
    expect((await pedir({ nombre: "Juan", email: "no-es-email", telefono: "11 5555-1234" })).statusCode).toBe(400);
    expect((await pedir({ nombre: "Juan", email: "juan@pyme.com", telefono: "123" })).statusCode).toBe(400);
    expect((await pedir({ nombre: "Juan", email: "juan@pyme.com", telefono: "11 5555-1234", sitio: "http://spam" })).statusCode).toBe(400);
    expect((await pedir({ nombre: "Juan Pérez", email: "juan@pyme.com", telefono: "11 4444-5555", empresa: "Ferretería Pérez" })).statusCode).toBe(201);

    // En el panel, solo para el administrador de la plataforma
    expect((await app.inject({ method: "GET", url: "/api/plataforma/interesados" })).statusCode).toBe(401);
    const token = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE } })).json().token;
    const lista = (await app.inject({ method: "GET", url: "/api/plataforma/interesados", headers: auth(token) })).json();
    expect(lista).toHaveLength(2);
    const ana = lista.find((i: { nombre: string }) => i.nombre === "Dra. Ana Gómez");
    expect(ana).toMatchObject({ producto: "dental", email: "ana@consultorio.com", estado: "Nuevo" });
    expect(lista.find((i: { nombre: string }) => i.nombre === "Juan Pérez").producto).toBe("gestion");
    const upd = await app.inject({ method: "PUT", url: `/api/plataforma/interesados/${ana.id}`, headers: auth(token), payload: { estado: "Contactado", nota: "Demo el jueves 10 hs" } });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json()).toMatchObject({ estado: "Contactado", nota: "Demo el jueves 10 hs" });
    expect((await app.inject({ method: "PUT", url: `/api/plataforma/interesados/${ana.id}`, headers: auth(token), payload: { estado: "Otro" } })).statusCode).toBe(400);
  });
});
