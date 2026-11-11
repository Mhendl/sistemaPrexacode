import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, carteroDePrueba, crearApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
let panel = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, adminInicial: ADMIN }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
});
afterAll(() => cerrar());

const visitante = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api/publico/chat${url}`, ...(payload ? { payload } : {}) });
const equipo = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api/plataforma/chat${url}`, headers: auth(panel), ...(payload ? { payload } : {}) });
const espera = () => new Promise((r) => setTimeout(r, 50));

describe("chat de las páginas", () => {
  it("las preguntas típicas se responden solas al instante, con los precios vigentes, y no molestan al equipo", async () => {
    const preguntas = (await visitante("GET", "/preguntas?producto=dental")).json();
    expect(preguntas.marca).toBe("CoreDental");
    expect(preguntas.preguntas.map((p: { pregunta: string }) => p.pregunta)).toContain("¿Maneja obras sociales?");

    const r = await visitante("POST", "/", { producto: "gestion", texto: "¿Cuánto sale?", origen: "https://productos.prexacode.com/" });
    expect(r.statusCode, r.body).toBe(201);
    const { token, mensajes } = r.json();
    expect(mensajes.map((m: { de: string }) => m.de)).toEqual(["visitante", "auto"]);
    expect(mensajes[1].texto).toContain("USD 45 a USD 169 por mes");
    // Escrita a mano también se reconoce
    const otra = (await visitante("POST", "/", { token, texto: "hola, anda en el celu? o hay que instalar algo" })).json();
    expect(otra.mensajes.at(-1)).toMatchObject({ de: "auto" });
    expect(otra.mensajes.at(-1).texto).toContain("sin instalar nada");
    await espera();
    expect(correo.enviados.filter((e) => /Consulta en el chat/.test(e.mensaje.asunto))).toHaveLength(0);
    expect((await equipo("GET", "/")).json().pendientes).toBe(0);

    // Una consulta larga y puntual: recibe la respuesta automática y además le avisa a una persona
    const larga = (await visitante("POST", "/", { producto: "gestion", texto: "Tengo dos depósitos y necesito llevar el stock separado en cada uno, ¿se puede hacer?" })).json();
    expect(larga.mensajes.map((m: { de: string }) => m.de)).toEqual(["visitante", "auto", "auto"]);
    expect(larga.mensajes[2].texto).toContain("le aviso a una persona");
    await espera();
    expect(correo.enviados.filter((e) => /Consulta en el chat de Prexacode/.test(e.mensaje.asunto))).toHaveLength(1);
    const lista = (await equipo("GET", "/")).json();
    expect(lista.pendientes).toBe(1);
    await equipo("POST", `/${lista.conversaciones[0].id}/pendiente`, { pendiente: false });
  });

  it("una pregunta que necesita una persona: avisa por email, se responde desde el panel, el visitante la ve y le llega por email", async () => {
    const r = (await visitante("POST", "/", { producto: "dental", texto: "Tengo 3 sucursales, ¿puedo ver todo junto?" })).json();
    expect(r.mensajes.at(-1)).toMatchObject({ de: "auto" });
    expect(r.mensajes.at(-1).texto).toContain("dejanos tu email");
    await espera();
    const aviso = correo.enviados.filter((e) => e.mensaje.asunto === "Consulta en el chat de CoreDental");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]!.mensaje).toMatchObject({ para: ADMIN.email });
    expect(aviso[0]!.mensaje.texto).toContain("Tengo 3 sucursales");
    // Otra pregunta enseguida no manda otro email
    await visitante("POST", "/", { token: r.token, texto: "Y otra cosa: ¿se puede con dos consultorios?" });
    await espera();
    expect(correo.enviados.filter((e) => e.mensaje.asunto === "Consulta en el chat de CoreDental")).toHaveLength(1);

    // Deja su email
    expect((await visitante("POST", `/${r.token}/contacto`, { email: "no-es-email" })).statusCode).toBe(400);
    const contacto = (await visitante("POST", `/${r.token}/contacto`, { email: "Dra.Ruiz@Clinica.com", nombre: "Florencia Ruiz" })).json();
    expect(contacto.email).toBe("dra.ruiz@clinica.com");

    // En el panel: está pendiente, con la última pregunta
    const lista = (await equipo("GET", "/")).json();
    expect(lista.pendientes).toBe(1);
    const conv = lista.conversaciones.find((c: { pendiente: boolean }) => c.pendiente);
    expect(conv).toMatchObject({ producto: "dental", email: "dra.ruiz@clinica.com", ultimo: "Y otra cosa: ¿se puede con dos consultorios?" });
    expect((await equipo("GET", "/resumen/pendientes")).json()).toEqual({ pendientes: 1 });
    const detalle = (await equipo("GET", `/${conv.id}`)).json();
    expect(detalle).not.toHaveProperty("token");

    const resp = await equipo("POST", `/${conv.id}/responder`, { texto: "¡Hola! Sí: cada sucursal es un consultorio con su agenda y ves los reportes juntos." });
    expect(resp.statusCode, resp.body).toBe(200);
    expect(resp.json().porEmail).toBe(true);
    const mail = correo.enviados.at(-1)!.mensaje;
    expect(mail).toMatchObject({ para: "dra.ruiz@clinica.com", asunto: "Respuesta a tu consulta sobre CoreDental" });
    expect(mail.texto).toContain("Hola Florencia,");
    expect(mail.texto).toContain("cada sucursal es un consultorio");
    // El visitante la ve en el chat; ya no está pendiente
    const ve = (await visitante("GET", `/${r.token}`)).json();
    expect(ve.mensajes.at(-1)).toMatchObject({ de: "equipo" });
    expect((await equipo("GET", "/")).json().pendientes).toBe(0);
  });

  it("es privado: sin la clave de la conversación no se lee, y el panel pide sesión", async () => {
    expect((await visitante("GET", "/clave-que-no-existe-123456")).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/plataforma/chat" })).statusCode).toBe(401);
    expect((await visitante("POST", "/", { producto: "gestion", texto: "" })).statusCode).toBe(400);
    expect((await visitante("POST", "/", { producto: "gestion", texto: "hola", sitio: "soy un robot" })).statusCode).toBe(400);
  });
});
