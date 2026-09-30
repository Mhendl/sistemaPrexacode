import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { personalizar } from "../src/lib/campanas.js";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, modoPruebas: true }));
});
afterAll(() => cerrar());

const CLAVE = "clave-segura-123";
type Metodo = "GET" | "POST" | "PUT" | "DELETE";
const pedir = (token: string) => (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
const haceUnAnio = () => {
  const d = new Date(`${hoyAr()}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
};
const enUnaSemana = () => new Date(Date.parse(`${hoyAr()}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

async function consultorio(producto: "dental" | "gestion" = "dental") {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email: emailUnico("dra"), password: CLAVE }, aceptaTerminos: true, producto },
  });
  expect(r.statusCode, r.body).toBe(201);
  return pedir(r.json().token);
}

/** Espera a que la campaña termine de mandar los emails */
async function terminada(api: ReturnType<typeof pedir>, id: string) {
  for (let i = 0; i < 100; i++) {
    const c = (await api("GET", `/campanas/${id}`)).json();
    if (!c.envios.some((e: { estado: string }) => e.estado === "Pendiente")) return c;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("La campaña no terminó");
}

describe("campañas a pacientes", () => {
  it("texto personalizado", () => {
    expect(personalizar("{nombre}, en {consultorio} tenés un saldo de {saldo}. {link_turnos}", { nombre: "María", apellido: "G", saldo: 12500.5 }, { consultorio: "Sonrisas", linkTurnos: null })).toBe("María, en Sonrisas tenés un saldo de $ 12.500,50.");
  });

  it("segmentos, envío por email con baja, y por WhatsApp", async () => {
    const api = await consultorio();
    const mes = hoyAr().slice(5, 7);
    const os = (await api("POST", "/pacientes/obras-sociales", { nombre: "OSDE" })).json();
    expect(os.id).toBeTruthy();
    const nuevo = async (datos: object) => {
      const r = await api("POST", "/pacientes", datos);
      expect(r.statusCode, r.body).toBe(201);
      return r.json() as { id: string };
    };
    const maria = await nuevo({ nombre: "María", apellido: "González", dni: "28456789", email: "maria@ejemplo.com", telefono: "11 5555-1234", fechaNacimiento: `1990-${mes}-01` });
    const juan = await nuevo({ nombre: "Juan", apellido: "Pérez", dni: "30111222", email: "juan@ejemplo.com" });
    const ana = await nuevo({ nombre: "Ana", apellido: "López", dni: "31222333", telefono: "11 4444-5555", obraSocialId: os.id });
    const pedro = await nuevo({ nombre: "Pedro", apellido: "Sosa", dni: "32333444", email: "pedro@ejemplo.com" });
    // Pedro no quiere recibir campañas
    const pp = (await api("GET", `/pacientes/${pedro.id}`)).json();
    expect((await api("PUT", `/pacientes/${pedro.id}`, { ...pp, recibeCampanas: false, version: pp.version })).statusCode).toBe(200);

    const prest = (await api("GET", "/prestaciones")).json() as { id: string; codigo: string }[];
    const consulta = prest.find((x) => x.codigo === "01.01")!.id;
    // María vino hace un año y debe; Juan vino hoy y pagó; Ana vino hace un año pero ya tiene turno
    await api("POST", `/pacientes/${maria.id}/cargos`, { prestacionId: consulta, importePaciente: 10000, fecha: haceUnAnio() });
    await api("POST", `/pacientes/${juan.id}/cargos`, { prestacionId: consulta, importePaciente: 8000 });
    await api("POST", `/pacientes/${juan.id}/pagos`, { importe: 8000, medio: "Efectivo" });
    await api("POST", `/pacientes/${ana.id}/cargos`, { prestacionId: consulta, importePaciente: 5000, fecha: haceUnAnio() });
    await api("POST", `/pacientes/${ana.id}/pagos`, { importe: 5000, medio: "Transferencia" });
    const dra = (await api("GET", "/agenda/config")).json().recursos[0];
    expect((await api("POST", "/agenda/eventos", { titulo: "", pacienteId: ana.id, recursoId: dra.id, fecha: enUnaSemana(), inicio: "10:00", fin: "10:30" })).statusCode).toBe(201);

    const previa = async (segmento: string, canal: string, parametro?: string) => {
      const r = await api("POST", "/campanas/previa", { segmento, canal, parametro });
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    };
    expect(await previa("sin_visita", "Email", "6")).toMatchObject({ total: 1, conContacto: 1, muestra: ["González, María"] });
    expect(await previa("cumpleanos", "Email")).toMatchObject({ total: 1, muestra: ["González, María"] });
    expect(await previa("deudores", "WhatsApp")).toMatchObject({ total: 1, conContacto: 1 });
    expect(await previa("obra_social", "Email", os.id)).toMatchObject({ total: 1, conContacto: 0, sinContacto: 1 });
    expect(await previa("todos", "Email")).toMatchObject({ total: 3, conContacto: 2 });
    expect((await api("POST", "/campanas/previa", { segmento: "sin_visita", canal: "Email", parametro: "0" })).statusCode).toBe(400);
    expect((await api("POST", "/campanas/previa", { segmento: "obra_social", canal: "Email" })).statusCode).toBe(400);

    // Sin email en el grupo, o sin asunto, o con el link de turnos sin tenerlos activos: no
    expect((await api("POST", "/campanas", { nombre: "OSDE", segmento: "obra_social", parametro: os.id, canal: "Email", asunto: "Hola", mensaje: "Novedades para afiliados de OSDE" })).statusCode).toBe(400);
    expect((await api("POST", "/campanas", { nombre: "Todos", segmento: "todos", canal: "Email", mensaje: "Un mensaje para todos" })).statusCode).toBe(400);
    const sinLink = await api("POST", "/campanas", { nombre: "Todos", segmento: "todos", canal: "Email", asunto: "Turnos", mensaje: "Sacá turno acá: {link_turnos}" });
    expect(sinLink.statusCode).toBe(400);
    expect(sinLink.json().error).toMatch(/turnos online no están activados/);

    // Email a todos: le llega a María y a Juan (Ana no tiene email, Pedro se dio de baja)
    const c = await api("POST", "/campanas", { nombre: "Novedades", segmento: "todos", canal: "Email", asunto: "Novedades de {consultorio}", mensaje: "Este mes renovamos el consultorio. Tu saldo es {saldo}." });
    expect(c.statusCode, c.body).toBe(201);
    const hecha = await terminada(api, c.json().id);
    expect(hecha.envios).toHaveLength(2);
    expect(hecha.envios.every((e: { estado: string }) => e.estado === "Enviado")).toBe(true);
    const aMaria = correo.enviados.find((e) => e.mensaje.para === "maria@ejemplo.com")!;
    expect(aMaria.mensaje.html).toContain("Hola María,");
    expect(aMaria.mensaje.asunto).toBe("Novedades de Consultorio Sonrisas");
    expect(aMaria.mensaje.texto).toContain("Tu saldo es $ 10.000,00.");
    expect(correo.enviados.find((e) => e.mensaje.para === "juan@ejemplo.com")!.mensaje.texto).toContain("Tu saldo es $ 0,00.");
    expect(correo.enviados.some((e) => e.mensaje.para === "pedro@ejemplo.com")).toBe(false);
    const lista = (await api("GET", "/campanas")).json();
    expect(lista[0]).toMatchObject({ nombre: "Novedades", destinatarios: 2, enviados: 2, pendientes: 0, errores: 0 });

    // María se da de baja desde el link del email
    const token = /baja-campanas\/([A-Za-z0-9_-]+)/.exec(aMaria.mensaje.texto)![1]!;
    expect((await app.inject({ method: "GET", url: `/api/publico/baja-campanas/${token}` })).json()).toMatchObject({ nombre: "María", dadoDeBaja: false, consultorio: "Consultorio Sonrisas" });
    expect((await app.inject({ method: "POST", url: `/api/publico/baja-campanas/${token}` })).json()).toEqual({ dadoDeBaja: true });
    expect(await previa("todos", "Email")).toMatchObject({ total: 2, conContacto: 1 });
    expect((await app.inject({ method: "GET", url: "/api/publico/baja-campanas/token-que-no-existe-123456" })).statusCode).toBe(404);

    // Por WhatsApp a los de OSDE: el mensaje queda listo para mandarlo con un toque
    const w = await api("POST", "/campanas", { nombre: "Afiliados OSDE", segmento: "obra_social", parametro: os.id, canal: "WhatsApp", mensaje: "Ya atendemos OSDE sin coseguro en {consultorio}." });
    expect(w.statusCode, w.body).toBe(201);
    const det = (await api("GET", `/campanas/${w.json().id}`)).json();
    expect(det.envios).toHaveLength(1);
    expect(det.envios[0]).toMatchObject({ paciente: "López, Ana", estado: "Pendiente" });
    const wa = (await api("POST", `/campanas/${w.json().id}/envios/${det.envios[0].id}/whatsapp`)).json();
    expect(wa.url).toMatch(/^https:\/\/wa\.me\/5491144445555\?text=/);
    expect(wa.texto).toBe("Hola Ana!\nYa atendemos OSDE sin coseguro en Consultorio Sonrisas.");
    expect((await api("GET", `/campanas/${w.json().id}`)).json().envios[0].estado).toBe("Enviado");
  });

  it("permisos y producto", async () => {
    const api = await consultorio();
    // La recepción (tiene pacientes.editar) puede; sin sesión, no
    expect((await app.inject({ method: "GET", url: "/api/campanas" })).statusCode).toBe(401);
    expect((await api("GET", "/campanas")).json()).toEqual([]);
    const g = await consultorio("gestion");
    expect((await g("GET", "/campanas")).statusCode).toBe(404);
  });
});
