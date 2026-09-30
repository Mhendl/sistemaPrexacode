import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { empresas, suscripciones } from "../src/db/schema.js";
import { emailsDePrueba } from "../src/lib/acompanamiento.js";
import { hoyAr } from "../src/lib/cuentas.js";
import { sumarDias } from "../src/lib/suscripcion.js";
import { recordatoriosDeTurnos } from "../src/lib/turnos.js";
import { auth, carteroDePrueba, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero, appUrl: "https://sistema.prexacode.com", appUrlDental: "https://coredental.prexacode.com", cotizacion: async () => 1000 }));
});
afterAll(() => cerrar());

const CLAVE = "clave-segura-123";
type Metodo = "GET" | "POST" | "PUT" | "DELETE";
const pedir = (token: string) => (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
const publico = (method: Metodo, url: string) => app.inject({ method, url: `/api/publico${url}` });
const esperar = () => new Promise((ok) => setTimeout(ok, 40));
const mandadosA = (para: string) => correo.enviados.filter((e) => e.mensaje.para === para);

async function registrar(producto: "dental" | "gestion", extra: { ref?: string; condicionIva?: string; nombre?: string } = {}) {
  const email = emailUnico("admin");
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: extra.nombre ?? "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: extra.condicionIva ?? "Monotributista" }, usuario: { nombre: "Laura Pérez", email, password: CLAVE }, aceptaTerminos: true, producto, ...(extra.ref ? { ref: extra.ref } : {}) },
  });
  expect(r.statusCode, r.body).toBe(201);
  return { api: pedir(r.json().token), empresaId: r.json().empresa.id as string, email };
}

/** Turno con paciente a una fecha y hora */
async function turno(api: ReturnType<typeof pedir>, paciente: { id: string }, fecha: string, inicio: string) {
  const cfg = (await api("GET", "/agenda/config")).json();
  const [h, m] = inicio.split(":").map(Number) as [number, number];
  const total = h * 60 + m + 30;
  const fin = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  const r = await api("POST", "/agenda/eventos", { recursoId: cfg.recursos[0].id, pacienteId: paciente.id, fecha, inicio, fin, tipo: "Control" });
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
}

describe("avisos de turnos al paciente", () => {
  it("email al darle el turno, recordatorio automático una sola vez, y link para confirmar o cancelar", async () => {
    const { api } = await registrar("dental");
    const cfg = (await api("GET", "/agenda/config")).json();
    expect((await api("PUT", "/agenda/config", { ...cfg, recordatorioEmail: true, recordatorioHoras: 24, avisoAlAgendar: true, version: cfg.version })).statusCode).toBe(200);
    const email = emailUnico("pac");
    const p = (await api("POST", "/pacientes", { nombre: "María", apellido: "González", email, telefono: "11 5555-1234" })).json();
    const sinEmail = (await api("POST", "/pacientes", { nombre: "Carlos", apellido: "Rodríguez" })).json();

    const manana = sumarDias(hoyAr(), 1);
    const t = await turno(api, p, manana, "10:00");
    await turno(api, sinEmail, manana, "11:00");
    await esperar();
    const alDarlo = mandadosA(email);
    expect(alDarlo).toHaveLength(1);
    expect(alDarlo[0]!.mensaje.asunto).toMatch(/^Tu turno del .+ a las 10:00 · Consultorio Sonrisas$/);
    const link = alDarlo[0]!.mensaje.texto.match(/https:\/\/coredental\.prexacode\.com\/turno\/([\w-]+)/)!;
    expect(link).toBeTruthy();

    // Recordatorio: el día anterior a las 9 hay 25 h hasta el turno (no entra); mañana a las 9, sí; y una sola vez
    const ahora = (fecha: string, hora: string) => Date.parse(`${fecha}T${hora}:00-03:00`);
    expect(await recordatoriosDeTurnos(app, ahora(hoyAr(), "09:00"))).toBe(0);
    expect(await recordatoriosDeTurnos(app, ahora(manana, "09:00"))).toBe(1);
    expect(await recordatoriosDeTurnos(app, ahora(manana, "09:30"))).toBe(0);
    expect(mandadosA(email).filter((m) => m.mensaje.asunto.startsWith("Recordatorio: tu turno"))).toHaveLength(1);

    // El paciente abre el link, confirma, y después cancela: el turno queda libre y al profesional le llega el aviso
    const token = link[1]!;
    const datos = (await publico("GET", `/turnos/${token}`)).json();
    expect(datos).toMatchObject({ consultorio: "Consultorio Sonrisas", paciente: "María", inicio: "10:00", estado: "Pendiente", pasado: false });
    expect(datos.profesional).toBe("Laura Pérez");
    expect((await publico("POST", `/turnos/${token}/confirmar`)).json()).toEqual({ estado: "Confirmado" });
    expect((await api("GET", `/agenda/eventos/${t.id}`)).json()).toMatchObject({ estado: "Confirmado" });
    expect((await publico("POST", `/turnos/${token}/cancelar`)).json()).toEqual({ estado: "Cancelado" });
    const notis = (await api("GET", "/notificaciones")).json().items as { titulo: string }[];
    expect(notis.map((n) => n.titulo)).toEqual(expect.arrayContaining(["Un paciente confirmó su turno", "Un paciente canceló su turno"]));
    // Cancelado: ya no se puede volver a confirmar desde el link, y el horario quedó libre
    expect((await publico("POST", `/turnos/${token}/confirmar`)).statusCode).toBe(409);
    await turno(api, sinEmail, manana, "10:00");
    expect((await publico("GET", "/turnos/no-existe-este-token")).statusCode).toBe(404);
  });

  it("WhatsApp: mensaje listo con el link, y queda marcado como avisado", async () => {
    const { api } = await registrar("dental");
    const p = (await api("POST", "/pacientes", { nombre: "María", apellido: "González", telefono: "11 5555-1234" })).json();
    const fecha = sumarDias(hoyAr(), 2);
    const t = await turno(api, p, fecha, "15:30");
    const w = (await api("POST", `/agenda/eventos/${t.id}/whatsapp`)).json();
    expect(w.telefono).toBe("5491155551234");
    expect(w.url).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=/);
    expect(w.texto).toContain("a las 15:30 con Laura Pérez");
    expect(w.texto).toMatch(/https:\/\/coredental\.prexacode\.com\/turno\/[\w-]+/);
    const lista = (await api("GET", `/agenda/recordatorios?fecha=${fecha}`)).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].avisadoWhatsappEn).not.toBeNull();
    // Email manual: el paciente no tiene email
    expect((await api("POST", `/agenda/eventos/${t.id}/email`)).json().error).toContain("no tiene email");
  });
});

describe("factura electrónica al paciente", () => {
  it("monotributista: Factura C a nombre del paciente con su DNI; no se factura dos veces; el pago se anula recién con la nota de crédito", async () => {
    const { api } = await registrar("dental");
    const p = (await api("POST", "/pacientes", { nombre: "María", apellido: "González", dni: "28456789" })).json();
    const pago = (await api("POST", `/pacientes/${p.id}/pagos`, { importe: 20000, medio: "Transferencia" })).json();
    const f = await api("POST", `/pacientes/${p.id}/pagos/${pago.id}/facturar`, {});
    expect(f.statusCode, f.body).toBe(201);
    expect(f.json()).toMatchObject({ tipo: "Factura C", estado: "Autorizado", total: 20000, receptor: { razonSocial: "González, María", dni: "28456789", cuit: "" } });
    const det = (await api("GET", `/comprobantes/${f.json().id}`)).json();
    const qr = JSON.parse(Buffer.from(det.qr.split("?p=")[1], "base64").toString());
    expect(qr).toMatchObject({ tipoDocRec: 96, nroDocRec: 28456789 });
    expect((await api("POST", `/pacientes/${p.id}/pagos/${pago.id}/facturar`, {})).statusCode).toBe(409);
    const cuenta = (await api("GET", `/pacientes/${p.id}/cuenta`)).json();
    expect(cuenta.pagos[0].comprobanteId).toBe(f.json().id);

    expect((await api("POST", `/pacientes/${p.id}/pagos/${pago.id}/anular`, { motivo: "Error" })).statusCode).toBe(409);
    const nc = await api("POST", "/comprobantes", { clase: "nota_credito", asociadoId: f.json().id, consumidorFinal: true, paciente: { nombre: "González, María", dni: "28456789" }, items: [{ descripcion: "Prestaciones odontológicas", cantidad: 1, precioUnitario: 20000, alicuotaIva: 0 }] });
    expect(nc.statusCode, nc.body).toBe(201);
    expect((await api("POST", `/pacientes/${p.id}/pagos/${pago.id}/anular`, { motivo: "Se devolvió" })).statusCode).toBe(200);
  });

  it("responsable inscripto: Factura B exenta (las prestaciones de salud no llevan IVA); sin DNI va como consumidor final", async () => {
    const { api } = await registrar("dental", { condicionIva: "Responsable Inscripto" });
    const p = (await api("POST", "/pacientes", { nombre: "Pedro", apellido: "López" })).json();
    const pago = (await api("POST", `/pacientes/${p.id}/pagos`, { importe: 15000, medio: "Efectivo" })).json();
    const f = (await api("POST", `/pacientes/${p.id}/pagos/${pago.id}/facturar`, {})).json();
    expect(f).toMatchObject({ tipo: "Factura B", exento: 15000, totalIva: 0, total: 15000, receptor: { razonSocial: "López, Pedro", dni: null } });
  });
});

describe("programa de referidos", () => {
  it("quien se registra con el link y paga suma un mes gratis a quien lo recomendó, una sola vez", async () => {
    const a = await registrar("gestion", { nombre: "Ferretería Recomienda" });
    const ref = (await a.api("GET", "/suscripcion/referidos")).json();
    expect(ref.codigo).toMatch(/^[2-9A-Z]{7}$/);
    expect(ref.link).toBe(`https://sistema.prexacode.com/registro?ref=${ref.codigo}`);
    const antes = (await a.api("GET", "/suscripcion")).json().pruebaHasta;

    const b = await registrar("dental", { nombre: "Consultorio Recomendado", ref: ref.codigo.toLowerCase() });
    // Registrarse no alcanza: tiene que pagar
    expect((await a.api("GET", "/suscripcion")).json().pruebaHasta).toBe(antes);
    const pagar = async () => {
      const cobro = (await b.api("POST", "/suscripcion/pagar", { periodo: "mensual" })).json();
      await b.api("POST", `/suscripcion/pagos/${cobro.referencia}/simular`, { resultado: "Aprobado" });
    };
    await pagar();
    expect((await a.api("GET", "/suscripcion")).json().pruebaHasta).toBe(sumarDias(antes, 30));
    await pagar(); // el segundo pago no suma otro mes
    expect((await a.api("GET", "/suscripcion")).json().pruebaHasta).toBe(sumarDias(antes, 30));
    const lista = (await a.api("GET", "/suscripcion/referidos")).json();
    expect(lista).toMatchObject({ mesesGanados: 1, referidos: [{ razonSocial: "Consultorio Recomendado", pago: true }] });
    await esperar();
    expect(mandadosA(a.email).some((m) => m.mensaje.asunto.startsWith("¡Ganaste un mes gratis"))).toBe(true);
    // Un código que no existe no rompe el registro
    await registrar("gestion", { ref: "NOEXISTE" });
  });

  it("si quien recomendó ya pagaba, el mes se suma al final de lo pago", async () => {
    const a = await registrar("gestion", { nombre: "Estudio Contable" });
    await app.db.update(suscripciones).set({ pagoHasta: sumarDias(hoyAr(), 10) }).where(eq(suscripciones.empresaId, a.empresaId));
    const { codigo } = (await a.api("GET", "/suscripcion/referidos")).json();
    const b = await registrar("gestion", { ref: codigo, nombre: "Comercio Nuevo" });
    const cobro = (await b.api("POST", "/suscripcion/pagar", { periodo: "mensual" })).json();
    await b.api("POST", `/suscripcion/pagos/${cobro.referencia}/simular`, { resultado: "Aprobado" });
    expect((await a.api("GET", "/suscripcion")).json().pagoHasta).toBe(sumarDias(hoyAr(), 40));
  });
});

describe("emails de acompañamiento durante la prueba", () => {
  it("al tercer día llega el consejo de su producto, una sola vez; si ya pagó, no", async () => {
    const dental = await registrar("dental");
    const gestion = await registrar("gestion", { nombre: "Comercio Prueba" });
    const hace3 = new Date(Date.now() - 3 * 86_400_000);
    await app.db.update(empresas).set({ createdAt: hace3 }).where(eq(empresas.id, dental.empresaId));
    await app.db.update(empresas).set({ createdAt: hace3 }).where(eq(empresas.id, gestion.empresaId));
    await emailsDePrueba(app);
    await emailsDePrueba(app);
    const d = mandadosA(dental.email).filter((m) => m.mensaje.asunto === "Menos ausencias: recordatorios de turnos");
    expect(d).toHaveLength(1);
    expect(d[0]!.mensaje.texto).toContain("https://coredental.prexacode.com/configuracion?tab=agenda");
    expect(mandadosA(gestion.email).filter((m) => m.mensaje.asunto === "Facturá con ARCA desde el sistema")).toHaveLength(1);

    const pago = await registrar("gestion", { nombre: "Ya Pagó" });
    await app.db.update(empresas).set({ createdAt: hace3 }).where(eq(empresas.id, pago.empresaId));
    await app.db.update(suscripciones).set({ pagoHasta: sumarDias(hoyAr(), 20), pruebaHasta: sumarDias(hoyAr(), -1) }).where(eq(suscripciones.empresaId, pago.empresaId));
    await emailsDePrueba(app);
    expect(mandadosA(pago.email).filter((m) => m.mensaje.asunto === "Facturá con ARCA desde el sistema")).toHaveLength(0);
  });
});

describe("inicio del consultorio", () => {
  it("lo cobrado sale de los pagos de pacientes, y lo que falta cobrar no se descuenta con el saldo a favor de otro", async () => {
    const { api } = await registrar("dental");
    const prest = (await api("GET", "/prestaciones")).json() as { id: string; codigo: string }[];
    const consulta = prest.find((p) => p.codigo === "01.01")!.id;
    const a = (await api("POST", "/pacientes", { nombre: "Ana", apellido: "Debe" })).json();
    const b = (await api("POST", "/pacientes", { nombre: "Beto", apellido: "AFavor" })).json();
    await api("POST", `/pacientes/${a.id}/cargos`, { prestacionId: consulta, importePaciente: 10000 });
    await api("POST", `/pacientes/${b.id}/pagos`, { importe: 7000, medio: "Efectivo" });
    const inicio = (await api("GET", "/inicio/consultorio")).json();
    expect(inicio.cobros).toEqual({ mes: 7000, porCobrar: 10000 });
  });
});

describe("medición", () => {
  it("sin IDs no se carga nada; con IDs la política de seguridad deja pasar solo a Google y Meta", async () => {
    const sin = await app.inject({ method: "GET", url: "/api/publico/medicion" });
    expect(sin.json()).toEqual({ ga: null, metaPixel: null });
    expect(sin.headers["content-security-policy"]).toContain("script-src 'self';");
    const con = await crearApp({ medicion: { ga: "G-TEST123", metaPixel: "123456" } });
    try {
      const r = await con.app.inject({ method: "GET", url: "/api/publico/medicion" });
      expect(r.json()).toEqual({ ga: "G-TEST123", metaPixel: "123456" });
      const csp = String(r.headers["content-security-policy"]);
      expect(csp).toContain("script-src 'self' https://www.googletagmanager.com https://connect.facebook.net");
      expect(csp).toContain("https://*.google-analytics.com");
    } finally {
      await con.cerrar();
    }
  });
});
