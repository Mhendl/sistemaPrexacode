import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prospeccionBusquedas } from "../src/db/schema.js";
import { buscarDesdeConsola, emailsDelHtml, mejorEmail, rastreadorDePrueba } from "../src/lib/buscador.js";
import { auth, crearApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
let panel = "";
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ rastreador: rastreadorDePrueba(), adminInicial: ADMIN }));
  panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
});
afterAll(() => cerrar());

const api = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api/plataforma/prospeccion${url}`, headers: auth(panel), ...(payload ? { payload } : {}) });

async function esperarBusqueda() {
  for (let i = 0; i < 100; i++) {
    const b = (await api("GET", "/busquedas")).json().busquedas[0];
    if (b.estado !== "En curso") return b;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("La búsqueda no terminó");
}

describe("buscador de contactos", () => {
  it("saca el email de la web del negocio: el suyo (o uno gratuito), no el de quien hizo la web ni imágenes", () => {
    const html = `<a href="mailto:Info@ConsultorioPerez.com.ar">Escribinos</a> hecho por hola@agenciaweb.com
      <img src="logo@2x.png"> rrhh@consultorioperez.com.ar <span data-cfemail="54373b3a27213820352714373b3a272138203b263d3b243126312e7a373b397a3526">[email protected]</span>
      turnos&#64;consultorioperez.com.ar`;
    const todos = emailsDelHtml(html);
    expect(todos).toContain("info@consultorioperez.com.ar");
    expect(todos).toContain("turnos@consultorioperez.com.ar");
    expect(todos).toContain("consultas@consultorioperez.com.ar"); // el que esconde Cloudflare
    expect(mejorEmail(todos, "https://www.consultorioperez.com.ar/")).toBe("info@consultorioperez.com.ar");
    expect(mejorEmail(["hola@agenciaweb.com", "rrhh@consultorioperez.com.ar"], "https://consultorioperez.com.ar")).toBeNull();
    expect(mejorEmail(["dra.perez@gmail.com"], "https://consultorioperez.com.ar")).toBe("dra.perez@gmail.com");
  });

  it("busca en Google, entra a cada web (y a Contacto), y lo encontrado entra a la campaña sin repetidos ni organismos", async () => {
    expect((await app.inject({ method: "GET", url: "/api/plataforma/prospeccion/busquedas" })).statusCode).toBe(401);
    const plantillas = (await api("GET", "/plantillas")).json();
    const id = (await api("POST", "/campanas", { nombre: "Consultorios del sur", producto: "dental", pasos: plantillas.dental })).json().id;

    expect((await api("POST", `/campanas/${id}/buscar`, { consultas: [] })).statusCode).toBe(400);
    expect((await api("POST", `/campanas/${id}/buscar`, { consultas: Array.from({ length: 11 }, (_, i) => `consultorio en zona ${i}`) })).statusCode).toBe(400);
    const r = await api("POST", `/campanas/${id}/buscar`, { consultas: ["consultorio odontológico en Quilmes", "consultorio odontológico en Lanús"] });
    expect(r.statusCode, r.body).toBe(202);
    const b = await esperarBusqueda();
    // Por zona: 4 lugares; el hospital no cuenta; 2 con web y email (uno en la página de Contacto)
    expect(b).toMatchObject({ estado: "Terminada", campana: "Consultorios del sur", pedidos: 2, lugares: 6, conWeb: 4, conEmail: 4, nuevos: 4 });

    const contactos = (await api("GET", `/prospectos?campanaId=${id}`)).json() as { email: string; empresa: string; ciudad: string; rubro: string; telefono: string; web: string; estado: string }[];
    expect(contactos.map((c) => c.email).sort()).toEqual(["info@sonrisalans.test", "info@sonrisaquilmes.test", "turnos@nortelans.test", "turnos@nortequilmes.test"]);
    expect(contactos.find((c) => c.email === "info@sonrisaquilmes.test")).toMatchObject({ empresa: "Consultorio Sonrisa Quilmes", ciudad: "Quilmes", rubro: "consultorio odontológico", telefono: "011 4000-0001", web: "sonrisaquilmes.test", estado: "Pendiente" });

    // La misma búsqueda otra vez: no repite a nadie
    expect((await api("POST", `/campanas/${id}/buscar`, { consultas: ["consultorio odontológico en Quilmes"] })).statusCode).toBe(202);
    expect(await esperarBusqueda()).toMatchObject({ estado: "Terminada", conEmail: 2, nuevos: 0 });

    // El tope del mes
    const datos = (await api("GET", "/busquedas")).json();
    expect(datos).toMatchObject({ disponible: true, pedidosDelMes: 3, pedidosPorMes: 900, maxConsultas: 10 });
    await app.db.update(prospeccionBusquedas).set({ pedidos: 900 });
    const tope = await api("POST", `/campanas/${id}/buscar`, { consultas: ["consultorio odontológico en Bernal"] });
    expect(tope.statusCode).toBe(400);
    expect(tope.json().error).toMatch(/tope de 900/);
  });

  it("desde la consola del servidor: rubros × zonas en la campaña nombrada (o parte del nombre), con los mismos topes", async () => {
    await app.db.update(prospeccionBusquedas).set({ pedidos: 0 });
    const plantillas = (await api("GET", "/plantillas")).json();
    await api("POST", "/campanas", { nombre: "Distribuidoras del oeste", producto: "gestion", pasos: plantillas.gestion });
    await expect(buscarDesdeConsola(app, { campana: "no existe", que: ["x"], donde: ["y"] })).rejects.toThrow(/No hay ninguna campaña/);
    await expect(buscarDesdeConsola(app, { campana: "oeste", que: ["a", "b", "c", "d"], donde: ["1", "2", "3"] })).rejects.toThrow(/Son 12 búsquedas/);
    const avisos: string[] = [];
    const r = await buscarDesdeConsola(app, { campana: "oeste", que: ["distribuidora ", ""], donde: ["Morón", "Haedo", "Morón"] }, (t) => avisos.push(t));
    expect(avisos[0]).toBe("Buscando en «Distribuidoras del oeste»: distribuidora en Morón · distribuidora en Haedo");
    expect(r).toMatchObject({ estado: "Terminada", campana: "Distribuidoras del oeste", pedidos: 2, conEmail: 4, nuevos: 4 });
    // Aparece en el panel como cualquier búsqueda
    expect((await api("GET", "/busquedas")).json().busquedas[0]).toMatchObject({ campana: "Distribuidoras del oeste", estado: "Terminada" });
  });

  it("sin la clave de Google, el buscador avisa que falta", async () => {
    const otra = await crearApp({ adminInicial: ADMIN });
    try {
      const t = (await otra.app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
      const datos = (await otra.app.inject({ method: "GET", url: "/api/plataforma/prospeccion/busquedas", headers: auth(t) })).json();
      expect(datos.disponible).toBe(false);
      const plantillas = (await otra.app.inject({ method: "GET", url: "/api/plataforma/prospeccion/plantillas", headers: auth(t) })).json();
      const id = (await otra.app.inject({ method: "POST", url: "/api/plataforma/prospeccion/campanas", headers: auth(t), payload: { nombre: "Sin clave", producto: "gestion", pasos: plantillas.gestion } })).json().id;
      const r = await otra.app.inject({ method: "POST", url: `/api/plataforma/prospeccion/campanas/${id}/buscar`, headers: auth(t), payload: { consultas: ["ferretería en Quilmes"] } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/clave de Google/);
    } finally {
      await otra.cerrar();
    }
  });
});
