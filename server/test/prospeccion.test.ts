import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enHorario, personalizar, sumarDiasHabiles, tickProspeccion, topeDelDia, type Respuesta } from "../src/lib/prospeccion.js";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
/** Casilla falsa: lo que "llegó" a la bandeja de entrada */
const bandeja: Respuesta[] = [];
const buzon = { estado: { falla: false }, leer: async () => { if (buzon.estado.falla) throw new Error("Login failed"); return [...bandeja]; } };
const ADMIN = "duenio@prexacode.com.ar";
const CLAVE = "clave-del-panel-2026";
let token = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, buzon, adminInicial: { email: ADMIN, password: CLAVE }, appUrl: "https://sistema.prexacode.com", appUrlDental: "https://app.coredental.com.ar" }));
  token = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE } })).json().token;
});
afterAll(() => cerrar());

const api = (method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url: `/api/plataforma/prospeccion${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
/** Lunes 5 de octubre de 2026, 10 de la mañana en Argentina */
const LUNES_10 = new Date("2026-10-05T13:00:00Z");
const mas = (d: Date, minutos: number) => new Date(d.getTime() + minutos * 60_000);

describe("prospección: reglas", () => {
  it("personaliza sin que falten datos se note", () => {
    const extra = { link: "https://coredental.com.ar/?r=abc", firma: "Martín", producto: "dental" };
    expect(personalizar("Hola {nombre},\nVi {empresa} en {ciudad}. {link}\n{firma}", { nombre: "Ana María López", empresa: "Sonrisas", ciudad: "Rosario", rubro: null }, extra)).toBe("Hola Ana,\nVi Sonrisas en Rosario. https://coredental.com.ar/?r=abc\nMartín");
    expect(personalizar("Hola {nombre},\nVi {empresa} en {ciudad}.", { nombre: null, empresa: null, ciudad: null, rubro: null }, extra)).toBe("Hola,\nVi tu consultorio.");
  });
  it("calentamiento, horario y días hábiles", () => {
    expect(topeDelDia(30, null)).toBe(10);
    expect(topeDelDia(30, new Date(Date.now() - 5 * 86_400_000))).toBe(20);
    expect(topeDelDia(30, new Date(Date.now() - 40 * 86_400_000))).toBe(30);
    expect(enHorario(9, 18, LUNES_10)).toBe(true);
    expect(enHorario(9, 18, new Date("2026-10-05T22:00:00Z"))).toBe(false); // 19 hs
    expect(enHorario(9, 18, new Date("2026-10-03T13:00:00Z"))).toBe(false); // sábado
    expect(sumarDiasHabiles(new Date("2026-10-09T13:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-10-12"); // viernes + 1 = lunes
  });
});

describe("prospección de punta a punta", () => {
  it("configura la casilla, importa, manda de a uno, corta con las respuestas, las bajas y los rebotes", async () => {
    expect((await app.inject({ method: "GET", url: "/api/plataforma/prospeccion/config" })).statusCode).toBe(401);

    // Casilla: el alias de prexacode.com en Hostinger. La contraseña se guarda cifrada y no se devuelve
    const cfg = await api("POST", "/config", { remitenteEmail: "martin@prexacode.com", remitenteNombre: "Martín de Prexacode", usuario: "hola@prexacode.com", password: "clave-casilla", smtpHost: "smtp.hostinger.com", smtpPuerto: 465, imapHost: "imap.hostinger.com", imapPuerto: 993, maxPorDia: 30, horaDesde: 9, horaHasta: 18 });
    expect(cfg.statusCode, cfg.body).toBe(200);
    expect(cfg.json()).toMatchObject({ tienePassword: true, activa: false, topeHoy: 10 });
    expect(cfg.body).not.toContain("clave-casilla");
    expect((await api("POST", "/config", { ...cfg.json(), maxPorDia: 500 })).statusCode).toBe(400);
    const prueba = (await api("POST", "/config/probar")).json();
    expect(prueba).toEqual({ smtp: "Bien", imap: "Bien" });
    const aSiMisma = correo.enviados.at(-1)!;
    expect(aSiMisma.transporte).toMatchObject({ tipo: "smtp", host: "smtp.hostinger.com", puerto: 465, usuario: "hola@prexacode.com", password: "clave-casilla" });
    expect(aSiMisma.mensaje.de).toBe('"Martín de Prexacode" <martin@prexacode.com>');

    // Sin lista no arranca
    expect((await api("POST", "/config/activa", { activa: true })).statusCode).toBe(400);

    // Campaña con la secuencia sugerida para consultorios
    const plantillas = (await api("GET", "/plantillas")).json();
    const camp = await api("POST", "/campanas", { nombre: "Consultorios de Rosario", producto: "dental", pasos: plantillas.dental });
    expect(camp.statusCode, camp.body).toBe(201);
    const id = camp.json().id;

    // Un cliente que ya existe no se toca
    const cliente = emailUnico("cliente");
    await app.inject({ method: "POST", url: "/api/auth/registro", payload: { empresa: { razonSocial: "Ya es cliente", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Cliente", email: cliente, password: "clave-segura-123" }, aceptaTerminos: true } });
    const filas = [
      { email: "Ana@Sonrisas.com", nombre: "Ana López", empresa: "Consultorio Sonrisas", ciudad: "Rosario" },
      { email: "info@dentalnorte.com", empresa: "Dental Norte", ciudad: "Rosario" },
      { email: "rebota@noexiste.com", empresa: "Clínica Fantasma" },
      { email: "ana@sonrisas.com", nombre: "Repetida" },
      { email: "no-es-email" },
      { email: "noreply@algo.com" },
      { email: cliente },
    ];
    const previa = (await api("POST", `/campanas/${id}/importar`, { filas })).json();
    expect(previa).toMatchObject({ nuevos: 3, repetidos: 1, excluidos: 1, invalidos: 2, guardados: 0 });
    expect((await api("POST", `/campanas/${id}/importar`, { filas, confirmar: true })).json().guardados).toBe(3);
    // Volver a importar no duplica
    expect((await api("POST", `/campanas/${id}/importar`, { filas })).json()).toMatchObject({ nuevos: 0, repetidos: 4 });

    expect((await api("POST", "/config/activa", { activa: true })).json().activa).toBe(true);
    const antes = correo.enviados.length;

    // Sábado no se manda
    expect(await tickProspeccion(app, new Date("2026-10-03T13:00:00Z"))).toBe("fuera-de-horario");
    // Lunes 10 hs: sale el primero
    expect(await tickProspeccion(app, LUNES_10)).toBe("enviado");
    const primero = correo.enviados.at(-1)!.mensaje;
    expect(correo.enviados.length).toBe(antes + 1);
    expect(primero.de).toBe('"Martín de Prexacode" <martin@prexacode.com>');
    expect(primero.responderA).toBe("martin@prexacode.com");
    const aAna = primero.para === "ana@sonrisas.com";
    expect(primero.texto).toMatch(/https:\/\/coredental\.com\.ar\/\?utm_source=prospeccion&utm_medium=email&utm_campaign=consultorios-de-rosario&r=[A-Za-z0-9_-]+/);
    expect(primero.texto).toMatch(/respondé BAJA o entrá a https:\/\/app\.coredental\.com\.ar\/baja-prospecto\/[A-Za-z0-9_-]+/);
    expect(primero.texto).toContain("Martín de Prexacode");
    if (aAna) expect(primero.texto.startsWith("Hola Ana,")).toBe(true);
    // Enseguida no manda otro: se espacian a lo largo del día
    expect(await tickProspeccion(app, mas(LUNES_10, 5))).toBe("espaciando");
    expect(await tickProspeccion(app, mas(LUNES_10, 50))).toBe("enviado");
    expect(await tickProspeccion(app, mas(LUNES_10, 100))).toBe("enviado");
    // Los tres recibieron el primero; el segundo email sale a los 3 días hábiles
    expect(await tickProspeccion(app, mas(LUNES_10, 150))).toBe("sin-pendientes");
    const enviadosDia1 = correo.enviados.slice(antes).map((e) => e.mensaje.para).sort();
    expect(enviadosDia1).toEqual(["ana@sonrisas.com", "info@dentalnorte.com", "rebota@noexiste.com"]);
    expect(correo.enviados.slice(antes).every((e) => e.mensaje.asunto.startsWith("Turnos online para "))).toBe(true);

    // Llegan respuestas: Ana quiere saber más, Dental Norte pide la baja y el otro rebota
    bandeja.push({ de: "ana@sonrisas.com", asunto: "Re: Turnos online para Consultorio Sonrisas", texto: "Hola Martín, me interesa, ¿me llamás el jueves?\n\nEl lun, 5 oct 2026 a las 10:00, Martín escribió:\n> Hola Ana, si no te interesa respondé BAJA" });
    bandeja.push({ de: "info@dentalnorte.com", asunto: "Re: Turnos online", texto: "BAJA por favor" });
    bandeja.push({ de: "MAILER-DAEMON@hostinger.com", asunto: "Undelivered Mail Returned to Sender", texto: "Could not deliver to <rebota@noexiste.com>: user unknown" });
    const jueves = new Date("2026-10-08T14:00:00Z");
    expect(await tickProspeccion(app, jueves)).toBe("sin-pendientes");
    const lista = (await api("GET", `/prospectos?campanaId=${id}`)).json() as { email: string; estado: string; nota: string | null }[];
    const estado = (e: string) => lista.find((p) => p.email === e)!;
    // La cita de abajo (que dice BAJA) no cuenta: Ana respondió
    expect(estado("ana@sonrisas.com")).toMatchObject({ estado: "Respondió" });
    expect(estado("ana@sonrisas.com").nota).toContain("me interesa");
    expect(estado("info@dentalnorte.com").estado).toBe("Baja");
    expect(estado("rebota@noexiste.com").estado).toBe("Rebotó");
    // Ana quedó en Interesados, para llamarla
    const inter = (await app.inject({ method: "GET", url: "/api/plataforma/interesados", headers: auth(token) })).json();
    expect(inter.find((i: { email: string }) => i.email === "ana@sonrisas.com")).toMatchObject({ producto: "dental", empresa: "Consultorio Sonrisas", origen: "Respondió un email de prospección" });
    // Nadie más recibe emails de esta campaña
    const n = correo.enviados.length;
    for (let i = 0; i < 20; i++) await tickProspeccion(app, mas(jueves, 60 * 24 * 3 + i * 60));
    expect(correo.enviados.length).toBe(n);

    // La campaña muestra los números
    const resumen = (await api("GET", "/campanas")).json()[0];
    expect(resumen).toMatchObject({ total: 3, respondieron: 1, bajas: 1, rebotes: 1, pendientes: 0, emailsEnviados: 3 });
    // A una baja no se le puede volver a escribir
    const baja = lista.find((p) => p.email === "info@dentalnorte.com") as unknown as { id: string };
    expect((await api("PUT", `/prospectos/${baja.id}`, { estado: "Pendiente" })).statusCode).toBe(409);
  });

  it("segundo email, link de baja, demo pedida desde el email, y pausa ante errores", async () => {
    bandeja.length = 0;
    const plantillas = (await api("GET", "/plantillas")).json();
    const id = (await api("POST", "/campanas", { nombre: "PyMEs de Córdoba", producto: "gestion", pasos: plantillas.gestion })).json().id;
    const imp = await api("POST", `/campanas/${id}/importar`, { confirmar: true, filas: [{ email: "juan@ferreteria.com", nombre: "Juan", empresa: "Ferretería Juan" }, { email: "ventas@distri.com", empresa: "Distri SA" }, { email: "compras@corralon.com" }] });
    expect(imp.json(), imp.body).toMatchObject({ guardados: 3 });
    await api("POST", "/config/activa", { activa: true });
    const martes = new Date("2026-10-13T13:00:00Z");
    for (let i = 0; i < 3; i++) expect(await tickProspeccion(app, mas(martes, i * 60)), `vuelta ${i}`).toBe("enviado");
    const tokenDe = (para: string) => /r=([A-Za-z0-9_-]+)/.exec(correo.enviados.filter((e) => e.mensaje.para === para).at(-1)!.mensaje.texto)![1]!;
    const bajaDe = (para: string) => /baja-prospecto\/([A-Za-z0-9_-]+)/.exec(correo.enviados.filter((e) => e.mensaje.para === para).at(-1)!.mensaje.texto)![1]!;
    expect(correo.enviados.find((e) => e.mensaje.para === "juan@ferreteria.com")!.mensaje.texto).toContain("https://productos.prexacode.com/?utm_source=prospeccion");

    // Juan pide una demo desde la landing (con el link del email): sale de la secuencia
    const demo = await app.inject({ method: "POST", url: "/api/publico/interesados", payload: { nombre: "Juan", email: "juan@ferreteria.com", telefono: "11 5555-1234", origen: `https://productos.prexacode.com/?utm_source=prospeccion&r=${tokenDe("juan@ferreteria.com")}` } });
    expect(demo.statusCode).toBe(201);
    // Distri se da de baja con el link
    const t = bajaDe("ventas@distri.com");
    expect((await app.inject({ method: "GET", url: `/api/publico/baja-prospecto/${t}` })).json()).toEqual({ dadoDeBaja: false });
    expect((await app.inject({ method: "POST", url: `/api/publico/baja-prospecto/${t}` })).json()).toEqual({ dadoDeBaja: true });

    // A los 3 días hábiles, el segundo email solo le llega al corralón, como respuesta al primero
    const viernes = new Date("2026-10-16T16:00:00Z");
    expect(await tickProspeccion(app, viernes)).toBe("enviado");
    const segundo = correo.enviados.at(-1)!.mensaje;
    expect(segundo.para).toBe("compras@corralon.com");
    expect(segundo.asunto).toBe("Re: Facturación y stock de tu empresa");
    expect(segundo.texto.startsWith("Hola, te escribo de nuevo")).toBe(true);
    expect(await tickProspeccion(app, mas(viernes, 60))).toBe("sin-pendientes");

    // Si la casilla rechaza la contraseña, se pausa y avisa
    correo.estado.falla = Object.assign(new Error("Invalid login"), { code: "EAUTH" });
    await api("POST", `/campanas/${id}/importar`, { confirmar: true, filas: [{ email: "otro@pyme.com" }] });
    expect(await tickProspeccion(app, mas(viernes, 120))).toBe("error-envio");
    correo.estado.falla = null;
    const c = (await api("GET", "/config")).json();
    expect(c).toMatchObject({ activa: false, ultimoError: "La casilla rechazó el usuario o la contraseña" });
    expect(await tickProspeccion(app, mas(viernes, 180))).toBe("inactiva");
    // Si no se puede leer la casilla tampoco se manda (podría escribirle a alguien que ya respondió)
    await api("POST", "/config/activa", { activa: true });
    buzon.estado.falla = true;
    expect(await tickProspeccion(app, mas(viernes, 240))).toBe("error-imap");
    buzon.estado.falla = false;
    expect((await api("GET", "/config")).json().ultimoError).toMatch(/No se pudo leer la casilla/);
  });

  it("la visita a la página y el registro a la prueba desde el email quedan anotados; el que se registró sale de la secuencia", async () => {
    bandeja.length = 0;
    const plantillas = (await api("GET", "/plantillas")).json();
    // El email lleva a la página para probar gratis; responder es opcional
    expect(plantillas.dental[0].cuerpo).toContain("creás tu cuenta en 2 minutos y ya lo estás usando: 14 días gratis, sin tarjeta y sin tener que hablar con nadie. {link}");
    expect(plantillas.dental[0].cuerpo).toContain("Si te surge alguna duda, respondeme este email.");
    const id = (await api("POST", "/campanas", { nombre: "Consultorios de Palermo", producto: "dental", pasos: plantillas.dental })).json().id;
    await api("POST", `/campanas/${id}/importar`, { confirmar: true, filas: [{ email: "hola@sonrisaspalermo.com", nombre: "Laura", empresa: "Sonrisas Palermo", ciudad: "Palermo" }] });
    await api("POST", "/config/activa", { activa: true });
    const lunes = new Date("2026-10-19T13:00:00Z");
    // (primero puede salir alguno que quedó pendiente de antes)
    for (let i = 0; i < 4 && !correo.enviados.some((e) => e.mensaje.para === "hola@sonrisaspalermo.com"); i++) await tickProspeccion(app, mas(lunes, i * 60));
    const texto = correo.enviados.find((e) => e.mensaje.para === "hola@sonrisaspalermo.com")!.mensaje.texto;
    const t = /r=([A-Za-z0-9_-]+)/.exec(texto)![1]!;

    // Entra dos veces a la página (lo avisa la landing)
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: "POST", url: `/api/publico/baja-prospecto/visita/${t}` })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/api/publico/baja-prospecto/visita/token-que-no-existe" })).statusCode).toBe(204);
    let p = (await api("GET", `/prospectos?campanaId=${id}`)).json()[0];
    expect(p).toMatchObject({ visitas: 2, estado: "En curso" });
    expect(p.visitoEn).toBeTruthy();
    expect((await api("GET", "/campanas")).json().find((c: { id: string }) => c.id === id)).toMatchObject({ visitaron: 1, registrados: 0 });

    // Se registra a la prueba con el link del email
    const alta = await app.inject({
      method: "POST",
      url: "/api/auth/registro",
      payload: { empresa: { razonSocial: "Sonrisas Palermo", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Laura", email: emailUnico("laura"), password: "clave-segura-123" }, aceptaTerminos: true, producto: "dental", prospecto: t },
    });
    expect(alta.statusCode, alta.body).toBe(201);
    p = (await api("GET", `/prospectos?campanaId=${id}`)).json()[0];
    expect(p).toMatchObject({ estado: "Registrado", nota: "Se registró a la prueba gratis desde el email" });
    expect(p.empresaId).toBeTruthy();
    expect((await api("GET", "/campanas")).json().find((c: { id: string }) => c.id === id)).toMatchObject({ registrados: 1 });
    // Ya no le llega el recordatorio
    const aElla = () => correo.enviados.filter((e) => e.mensaje.para === "hola@sonrisaspalermo.com").length;
    for (let i = 0; i < 10; i++) await tickProspeccion(app, mas(new Date("2026-10-26T13:00:00Z"), i * 60));
    expect(aElla()).toBe(1);
  });
});
