import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suscripciones } from "../src/db/schema.js";
import { auth, carteroDePrueba, crearApp, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

describe("soporte: la empresa pide ayuda y el panel responde", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  const correo = carteroDePrueba();
  const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
  let panel = "";
  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ adminInicial: ADMIN, cartero: correo.cartero }));
    panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
  });
  afterAll(() => cerrar());

  const pedir = (token: string, method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
  const nuevo = (token: string, asunto = "No me anda la factura") =>
    pedir(token, "POST", "/soporte", { asunto, categoria: "Problema", mensaje: "Cuando emito una factura B me da error de ARCA", pantalla: "/facturacion/nueva" });

  it("se crea con número, me llega el aviso, respondo, y a la persona le llega en la campanita", async () => {
    const { token, empresa } = await registrarEmpresa(app, "Ferretería Ayuda S.A.");
    const r = await nuevo(token);
    expect(r.statusCode).toBe(201);
    const t = r.json();
    expect(t).toMatchObject({ estado: "Abierto", categoria: "Problema", pantalla: "/facturacion/nueva" });
    expect(t.numero).toBeGreaterThan(0);
    expect(t.mensajes).toHaveLength(1);
    // Aviso por email a quien administra Prexacode
    await new Promise((ok) => setTimeout(ok, 50));
    expect(correo.enviados.some((e) => e.mensaje.para === ADMIN.email && e.mensaje.asunto.includes(`#${t.numero}`))).toBe(true);

    // En el panel: aparece abierto, en el resumen y en la empresa
    const lista = (await pedir(panel, "GET", "/plataforma/tickets?estado=Abierto")).json();
    expect(lista.find((x: { id: string }) => x.id === t.id)).toMatchObject({ empresa: "Ferretería Ayuda S.A.", sinLeerSoporte: true });
    expect((await pedir(panel, "GET", "/plataforma/resumen")).json().ticketsAbiertos).toBeGreaterThan(0);
    expect((await pedir(panel, "GET", `/plataforma/empresas/${empresa.id}`)).json().tickets).toHaveLength(1);

    // Respondo
    const resp = await pedir(panel, "POST", `/plataforma/tickets/${t.id}/responder`, { texto: "Hola, revisá que el punto de venta esté dado de alta como web service." });
    expect(resp.statusCode).toBe(201);
    expect(resp.json()).toMatchObject({ estado: "Respondido", sinLeerCliente: true });
    expect(resp.json().mensajes.map((m: { autor: string }) => m.autor)).toEqual(["cliente", "soporte"]);

    // La persona lo ve en la campanita
    const avisos = (await pedir(token, "GET", "/notificaciones")).json();
    const lista2 = Array.isArray(avisos) ? avisos : avisos.items ?? avisos.notificaciones;
    expect(JSON.stringify(lista2)).toContain(`Respondimos tu pedido #${t.numero}`);
    // Lo abre: deja de estar sin leer
    expect((await pedir(token, "GET", `/soporte/${t.id}`)).json().sinLeerCliente).toBe(false);
    expect((await pedir(token, "GET", "/soporte")).json()[0].sinLeerCliente).toBe(false);

    // Contesta: vuelve a quedar esperando a soporte
    const otra = await pedir(token, "POST", `/soporte/${t.id}/mensajes`, { texto: "Listo, ya funciona. Gracias!" });
    expect(otra.json().estado).toBe("Abierto");
    const cerrado = await pedir(token, "POST", `/soporte/${t.id}/cerrar`);
    expect(cerrado.json().estado).toBe("Cerrado");

    // Queda en la auditoría del panel
    const aud = (await pedir(panel, "GET", "/plataforma/auditoria")).json();
    expect(aud.some((a: { accion: string }) => a.accion === "responder-ticket")).toBe(true);
  });

  it("cada uno ve lo suyo: el administrador de la empresa ve todos los de su empresa, nadie ve los de otra", async () => {
    const { token: admin } = await registrarEmpresa(app);
    const email = emailUnico("vend");
    await pedir(admin, "POST", "/usuarios", { nombre: "Diego", email, rol: "ventas", password: "clave-segura-123" });
    const vendedor = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    const deAdmin = (await nuevo(admin, "Consulta del admin")).json();
    const deVendedor = (await nuevo(vendedor, "Consulta del vendedor")).json();

    expect((await pedir(admin, "GET", "/soporte")).json()).toHaveLength(2);
    const suyos = (await pedir(vendedor, "GET", "/soporte")).json();
    expect(suyos.map((t: { id: string }) => t.id)).toEqual([deVendedor.id]);
    expect((await pedir(vendedor, "GET", `/soporte/${deAdmin.id}`)).statusCode).toBe(404);

    const { token: otraEmpresa } = await registrarEmpresa(app);
    expect((await pedir(otraEmpresa, "GET", `/soporte/${deAdmin.id}`)).statusCode).toBe(404);
    expect((await pedir(otraEmpresa, "POST", `/soporte/${deAdmin.id}/mensajes`, { texto: "hola" })).statusCode).toBe(404);
    expect((await pedir(otraEmpresa, "GET", "/soporte")).json()).toHaveLength(0);
  });

  it("con la suscripción vencida (solo lectura) igual puede pedir ayuda", async () => {
    const { token, empresaId } = await registrarEmpresa(app);
    await app.db.update(suscripciones).set({ pruebaHasta: "2020-01-01", pagoHasta: null }).where(eq(suscripciones.empresaId, empresaId));
    expect((await pedir(token, "POST", "/clientes", { razonSocial: "X", cuit: "20123456786", condicionIva: "Consumidor Final" })).statusCode).toBe(402);
    expect((await nuevo(token, "No puedo pagar")).statusCode).toBe(201);
  });

  it("valida lo que se carga, y un token de empresa no entra al soporte del panel", async () => {
    const { token } = await registrarEmpresa(app);
    const r = await pedir(token, "POST", "/soporte", { asunto: "x", categoria: "Otra", mensaje: "" });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().details)).toEqual(expect.arrayContaining(["asunto", "categoria", "mensaje"]));
    expect((await pedir(token, "GET", "/plataforma/tickets")).statusCode).toBe(401);
  });
});
