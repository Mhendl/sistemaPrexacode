import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
let panel = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ adminInicial: ADMIN }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
});
afterAll(() => cerrar());

describe("actividad de los usuarios (para el panel)", () => {
  it("cuenta por usuario y por día lo que usa el sistema y lo que carga; lo automático y los errores no cuentan como cambios", async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const api = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
    const quieta = await registrarEmpresa(app);

    await api("GET", "/clientes");
    expect((await api("POST", "/clientes", { razonSocial: "Ferretería El Tornillo", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).statusCode).toBe(201);
    expect((await api("POST", "/clientes", { razonSocial: "" })).statusCode).toBe(400); // con error: no es un cambio
    for (let i = 0; i < 5; i++) await api("GET", "/notificaciones"); // la pantalla revisando avisos sola: no cuenta

    const lista = (await app.inject({ method: "GET", url: "/api/plataforma/empresas", headers: auth(panel) })).json() as { id: string; diasActivos7: number; cambios7: number; ultimaActividad: string | null }[];
    const esta = lista.find((e) => e.id === empresa.id)!;
    expect(esta).toMatchObject({ diasActivos7: 1, cambios7: 1 });
    expect(esta.ultimaActividad).toBeTruthy();
    expect(lista.find((e) => e.id === quieta.empresa.id)).toMatchObject({ diasActivos7: 0, cambios7: 0 });

    const ficha = (await app.inject({ method: "GET", url: `/api/plataforma/empresas/${empresa.id}`, headers: auth(panel) })).json();
    expect(ficha.usuarios[0]).toMatchObject({ dias7: 1, dias30: 1, cambios7: 1, cambios30: 1 });
    expect(ficha.actividadUso.dias).toHaveLength(30);
    expect(ficha.actividadUso.dias.at(-1)).toMatchObject({ usuarios: 1, pedidos: 3, cambios: 1 });
    expect(ficha.actividadUso.cargado30.find((c: { que: string }) => c.que === "Clientes")).toMatchObject({ n: 1 });

    // Al otro pedido se suma (no se pisa)
    await api("GET", "/productos");
    const otra = (await app.inject({ method: "GET", url: `/api/plataforma/empresas/${empresa.id}`, headers: auth(panel) })).json();
    expect(otra.actividadUso.dias.at(-1)).toMatchObject({ pedidos: 4, cambios: 1 });
  });

  it("en CoreDental cuenta pacientes y turnos", async () => {
    const alta = await app.inject({
      method: "POST",
      url: "/api/auth/registro",
      payload: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura", email: `laura.${Date.now()}@prueba.com`, password: "clave-segura-123" }, aceptaTerminos: true, producto: "dental" },
    });
    const ficha = (await app.inject({ method: "GET", url: `/api/plataforma/empresas/${alta.json().usuario.empresaId}`, headers: auth(panel) })).json();
    expect(ficha.actividadUso.cargado30.map((c: { que: string }) => c.que)).toContain("Pacientes");
    expect(ficha.usuarios[0]).toMatchObject({ dias7: 0, cambios30: 0 });
  });
});
