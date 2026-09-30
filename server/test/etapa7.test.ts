import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { auth, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const CLAVE = "clave-segura-123";
type Metodo = "GET" | "POST" | "PUT" | "DELETE";
const pedir = (token: string) => (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
const publico = (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api/publico/reservas${url}`, ...(payload ? { payload } : {}) });

/** El próximo lunes, a partir de la semana que viene */
function proximoLunes() {
  const d = new Date(`${hoyAr()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function consultorio(producto: "dental" | "gestion" = "dental") {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email: emailUnico("dra"), password: CLAVE }, aceptaTerminos: true, producto },
  });
  expect(r.statusCode, r.body).toBe(201);
  const api = pedir(r.json().token);
  /** Activa los turnos online y devuelve el código del link */
  const activar = async (extra: object = {}) => {
    const cfg = (await api("GET", "/agenda/config")).json();
    const res = await api("PUT", "/agenda/config", { nombreEvento: cfg.nombreEvento, nombreRecurso: cfg.nombreRecurso, horaInicio: cfg.horaInicio, horaFin: cfg.horaFin, tiposEvento: cfg.tiposEvento, reservaOnline: true, ...extra });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { reservaCodigo: string; reservaDiasMax: number };
  };
  return { api, activar };
}

const datos = (extra: object = {}) => ({ nombre: "Carlos", apellido: "Rodríguez", dni: "30.123.456", telefono: "11 5555-1234", email: "carlos@ejemplo.com", motivo: "Me duele una muela", ...extra });

describe("turnos online", () => {
  it("el paciente elige profesional, día y horario, y el turno queda en la agenda", async () => {
    const { api, activar } = await consultorio();
    const cfg = await activar({ reservaMensaje: "Traé tu credencial" });
    expect(cfg.reservaCodigo).toMatch(/^[0-9a-f]{12}$/);
    const codigo = cfg.reservaCodigo;
    const dra = (await api("GET", "/agenda/config")).json().recursos[0];

    // Sin horarios cargados no aparece: los turnos online salen de los horarios de atención
    expect((await publico("GET", `/${codigo}`)).json().profesionales).toEqual([]);
    await api("PUT", `/agenda/recursos/${dra.id}/horarios`, { horarios: [{ dia: 1, desde: "09:00", hasta: "12:00" }], duracionTurno: 60 });
    const info = (await publico("GET", `/${codigo}`)).json();
    expect(info).toMatchObject({ consultorio: "Consultorio Sonrisas", mensaje: "Traé tu credencial", diasMax: 30, profesionales: [{ id: dra.id, nombre: "Dra. Laura Pérez", duracion: 60 }] });

    const lunes = proximoLunes();
    const dias = (await publico("GET", `/${codigo}/dias?recursoId=${dra.id}`)).json() as { fecha: string; libres: number }[];
    expect(dias).toHaveLength(31);
    expect(dias.find((d) => d.fecha === lunes)?.libres).toBe(3);
    expect(dias.filter((d) => d.libres > 0).every((d) => new Date(`${d.fecha}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect((await publico("GET", `/${codigo}/horarios?recursoId=${dra.id}&fecha=${lunes}`)).json().libres).toEqual(["09:00", "10:00", "11:00"]);

    // Reserva un paciente nuevo: se lo da de alta con los datos por completar
    const r = await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "10:00", ...datos() });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ profesional: "Dra. Laura Pérez", fecha: lunes, inicio: "10:00", fin: "11:00" });
    const ev = (await api("GET", `/agenda/eventos?desde=${lunes}&hasta=${lunes}`)).json()[0];
    expect(ev).toMatchObject({ titulo: "Rodríguez, Carlos", tipo: "Turno online", estado: "Pendiente", reservadoOnline: true, pacienteDatosPendientes: true });
    expect(ev.notas).toContain("Me duele una muela");
    const pac = (await api("GET", `/pacientes/${ev.pacienteId}`)).json();
    expect(pac).toMatchObject({ dni: "30123456", telefono: "11 5555-1234", email: "carlos@ejemplo.com" });
    // Con el link del turno puede confirmarlo o cancelarlo
    expect((await app.inject({ method: "GET", url: `/api/publico/turnos/${r.json().token}` })).json()).toMatchObject({ estado: "Pendiente", profesional: "Dra. Laura Pérez" });
    // Al consultorio le llega el aviso
    const avisos = (await api("GET", "/notificaciones")).json().items as { titulo: string; detalle: string }[];
    expect(avisos.some((a) => a.titulo === "Nuevo turno online" && a.detalle.includes("Rodríguez, Carlos"))).toBe(true);
    // El horario ya no se ofrece, y reservarlo de nuevo no se puede
    expect((await publico("GET", `/${codigo}/horarios?recursoId=${dra.id}&fecha=${lunes}`)).json().libres).toEqual(["09:00", "11:00"]);
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "10:00", ...datos({ dni: "25111222" }) })).statusCode).toBe(409);
    // Un horario que no es de su agenda tampoco
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "15:00", ...datos({ dni: "25111222" }) })).statusCode).toBe(409);

    // El mismo paciente (por DNI) reserva otro: no se duplica; y hasta dos turnos pendientes
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "09:00", ...datos({ nombre: "Carlitos" }) })).statusCode).toBe(201);
    const pacientes = (await api("GET", "/pacientes")).json();
    expect((Array.isArray(pacientes) ? pacientes : pacientes.pacientes ?? pacientes.items).length).toBe(1);
    const tercero = await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "11:00", ...datos() });
    expect(tercero.statusCode).toBe(409);
    expect(tercero.json().error).toMatch(/Ya tenés turnos reservados/);

    // Validaciones y robots
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "11:00", ...datos({ dni: "123" }) })).statusCode).toBe(400);
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "11:00", ...datos({ dni: "25111222", telefono: "123" }) })).statusCode).toBe(400);
    expect((await publico("POST", `/${codigo}`, { recursoId: dra.id, fecha: lunes, inicio: "11:00", ...datos({ dni: "25111222", sitio: "http://spam" }) })).statusCode).toBe(400);
    expect((await publico("GET", "/no-es-un-codigo")).statusCode).toBe(400);
    expect((await publico("GET", "/000000000000")).statusCode).toBe(404);

    // Vacaciones: ese día no se ofrece nada
    await api("POST", "/agenda/bloqueos", { desde: lunes, hasta: lunes, motivo: "Vacaciones" });
    expect((await publico("GET", `/${codigo}/horarios?recursoId=${dra.id}&fecha=${lunes}`)).json().libres).toEqual([]);

    // El profesional se saca de los turnos online
    expect((await api("PUT", `/agenda/recursos/${dra.id}/reserva`, { reservaOnline: false })).statusCode).toBe(200);
    expect((await publico("GET", `/${codigo}`)).json().profesionales).toEqual([]);
    expect((await publico("GET", `/${codigo}/dias?recursoId=${dra.id}`)).statusCode).toBe(400);
    await api("PUT", `/agenda/recursos/${dra.id}/reserva`, { reservaOnline: true });

    // Link nuevo: el anterior deja de andar
    const nuevo = (await api("POST", "/agenda/config/reserva/nuevo-link")).json();
    expect(nuevo.reservaCodigo).not.toBe(codigo);
    expect((await publico("GET", `/${codigo}`)).statusCode).toBe(404);
    expect((await publico("GET", `/${nuevo.reservaCodigo}`)).statusCode).toBe(200);

    // Desactivado: el link no funciona (y al reactivar vuelve el mismo)
    const cfgAct = (await api("GET", "/agenda/config")).json();
    await api("PUT", "/agenda/config", { nombreEvento: cfgAct.nombreEvento, nombreRecurso: cfgAct.nombreRecurso, horaInicio: cfgAct.horaInicio, horaFin: cfgAct.horaFin, tiposEvento: cfgAct.tiposEvento, reservaOnline: false });
    expect((await publico("GET", `/${nuevo.reservaCodigo}`)).statusCode).toBe(404);
    expect((await activar()).reservaCodigo).toBe(nuevo.reservaCodigo);
  });

  it("validaciones de la configuración y solo en CoreDental", async () => {
    const { api, activar } = await consultorio();
    const cfg = (await api("GET", "/agenda/config")).json();
    const base = { nombreEvento: cfg.nombreEvento, nombreRecurso: cfg.nombreRecurso, horaInicio: cfg.horaInicio, horaFin: cfg.horaFin, tiposEvento: cfg.tiposEvento };
    expect((await api("PUT", "/agenda/config", { ...base, reservaDiasMax: 0 })).statusCode).toBe(400);
    expect((await api("PUT", "/agenda/config", { ...base, reservaAnticipacionHoras: 500 })).statusCode).toBe(400);
    const c = await activar({ reservaDiasMax: 7 });
    expect(c.reservaDiasMax).toBe(7);
    const dra = (await api("GET", "/agenda/config")).json().recursos[0];
    await api("PUT", `/agenda/recursos/${dra.id}/horarios`, { horarios: [{ dia: 1, desde: "09:00", hasta: "12:00" }], duracionTurno: 60 });
    expect((await publico("GET", `/${c.reservaCodigo}/dias?recursoId=${dra.id}`)).json()).toHaveLength(8);
    // Más allá de los días habilitados, no
    expect((await publico("POST", `/${c.reservaCodigo}`, { recursoId: dra.id, fecha: "2099-01-05", inicio: "09:00", ...datos() })).statusCode).toBe(400);

    // En Prexacode (gestión) el link no existe aunque se active
    const g = await consultorio("gestion");
    const cg = await g.activar();
    expect((await publico("GET", `/${cg.reservaCodigo}`)).statusCode).toBe(404);
  });
});
