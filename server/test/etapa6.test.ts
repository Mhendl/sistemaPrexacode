import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { dentroDeHorario, diaDeSemana, errorEnFranjas, textoHorario, turnosLibres } from "../src/lib/horarios.js";
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

/** Una fecha futura que cae en el día de la semana pedido (0 domingo … 6 sábado) */
function proximo(dia: number) {
  const d = new Date(`${hoyAr()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== dia) d.setUTCDate(d.getUTCDate() + 1);
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
  const miembro = async (rol: "profesional" | "recepcion", nombre = `Usuario ${rol}`) => {
    const email = emailUnico(rol);
    const u = await api("POST", "/usuarios", { nombre, email, password: CLAVE, rol });
    expect(u.statusCode, u.body).toBe(201);
    return { id: u.json().id as string, api: pedir((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: CLAVE } })).json().token) };
  };
  return { api, miembro };
}

describe("horarios: lógica", () => {
  const lunes = proximo(1);
  const horarios = [
    { dia: 1, desde: "09:00", hasta: "13:00" },
    { dia: 1, desde: "16:00", hasta: "20:00" },
    { dia: 3, desde: "14:00", hasta: "18:00" },
  ];
  it("franjas, textos y validación", () => {
    expect(diaDeSemana(lunes)).toBe(1);
    expect(dentroDeHorario(horarios, lunes, "09:00", "09:30")).toBe(true);
    expect(dentroDeHorario(horarios, lunes, "12:30", "13:30")).toBe(false);
    expect(dentroDeHorario(horarios, lunes, "14:00", "14:30")).toBe(false);
    expect(dentroDeHorario([], lunes, "03:00", "04:00")).toBe(true);
    expect(textoHorario(horarios, lunes)).toBe("los lunes atiende de 09:00 a 13:00 y de 16:00 a 20:00");
    expect(textoHorario(horarios, proximo(6))).toBe("los sábados no atiende");
    expect(errorEnFranjas([{ dia: 2, desde: "10:00", hasta: "09:00" }])).toMatch(/terminar después/);
    expect(errorEnFranjas([{ dia: 2, desde: "09:00", hasta: "13:00" }, { dia: 2, desde: "12:00", hasta: "15:00" }])).toMatch(/se pisan/);
  });
  it("turnos libres: sin pisar turnos ni bloqueos, y desde ahora si es hoy", () => {
    const base = { horarios, franjaGeneral: { desde: "08:00", hasta: "19:00" }, duracion: 60, fecha: lunes, recursoId: "r1", ocupados: [{ inicio: "10:00", fin: "10:30" }], bloqueos: [] };
    expect(turnosLibres(base)).toEqual(["09:00", "11:00", "12:00", "16:00", "17:00", "18:00", "19:00"]);
    const conBloqueo = { ...base, bloqueos: [{ recursoId: null, desde: lunes, hasta: lunes, horaDesde: "16:00", horaHasta: "18:00", motivo: "Reunión" }] };
    expect(turnosLibres(conBloqueo)).toEqual(["09:00", "11:00", "12:00", "18:00", "19:00"]);
    expect(turnosLibres({ ...base, desdeMin: 11 * 60 + 5 })).toEqual(["12:00", "16:00", "17:00", "18:00", "19:00"]);
    // Sin horarios cargados: la franja general de la agenda
    expect(turnosLibres({ ...base, horarios: [], duracion: 120, ocupados: [] })).toEqual(["08:00", "10:00", "12:00", "14:00", "16:00"]);
  });
});

describe("agenda: horarios de atención y bloqueos", () => {
  it("fuera de horario o bloqueado avisa (y se puede agendar igual); los libres salen de su horario", async () => {
    const { api, miembro } = await consultorio();
    const cfg0 = (await api("GET", "/agenda/config")).json();
    const dra = cfg0.recursos[0];
    const lunes = proximo(1);
    const mas = (n: number) => new Date(Date.parse(`${lunes}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const martes = mas(1);

    const mal = await api("PUT", `/agenda/recursos/${dra.id}/horarios`, { horarios: [{ dia: 1, desde: "09:00", hasta: "13:00" }, { dia: 1, desde: "12:00", hasta: "14:00" }], duracionTurno: 30 });
    expect(mal.statusCode).toBe(400);
    expect(mal.json().error).toMatch(/se pisan/);
    const ok = await api("PUT", `/agenda/recursos/${dra.id}/horarios`, { horarios: [{ dia: 1, desde: "16:00", hasta: "20:00" }, { dia: 1, desde: "09:00", hasta: "13:00" }], duracionTurno: 40 });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().horarios[0]).toEqual({ dia: 1, desde: "09:00", hasta: "13:00" });

    // La recepción no configura horarios
    const rec = await miembro("recepcion");
    expect((await rec.api("PUT", `/agenda/recursos/${dra.id}/horarios`, { horarios: [], duracionTurno: 30 })).statusCode).toBe(403);

    const turno = (fecha: string, inicio: string, fin: string, extra: object = {}) => api("POST", "/agenda/eventos", { titulo: "Consulta", recursoId: dra.id, fecha, inicio, fin, ...extra });
    expect((await turno(lunes, "09:00", "09:40")).statusCode).toBe(201);
    const fuera = await turno(martes, "10:00", "10:30");
    expect(fuera.statusCode).toBe(409);
    expect(fuera.json()).toMatchObject({ code: "FUERA_DE_HORARIO" });
    expect(fuera.json().error).toContain("los martes no atiende");
    expect((await turno(lunes, "12:40", "13:20")).json().error).toContain("de 09:00 a 13:00 y de 16:00 a 20:00");
    expect((await turno(martes, "10:00", "10:30", { permitirSuperposicion: true })).statusCode).toBe(201);

    // Libres del lunes: cada 40 minutos, sin el de las 09:00
    const libres = (await api("GET", `/agenda/disponibles?recursoId=${dra.id}&fecha=${lunes}`)).json();
    expect(libres).toMatchObject({ duracion: 40, conHorarios: true, bloqueo: null });
    expect(libres.libres.slice(0, 3)).toEqual(["09:40", "10:20", "11:00"]);
    expect(libres.libres).toContain("16:00");
    expect(libres.libres).not.toContain("09:00");

    // Congreso el lunes a la tarde: avisa el turno que ya estaba y bloquea los nuevos
    await turno(lunes, "16:00", "16:40");
    const b = await rec.api("POST", "/agenda/bloqueos", { recursoId: dra.id, desde: lunes, hasta: lunes, horaDesde: "15:00", horaHasta: "20:00", motivo: "Congreso" });
    expect(b.statusCode, b.body).toBe(201);
    expect(b.json().turnosAfectados).toHaveLength(1);
    const bloq = await turno(lunes, "17:00", "17:40");
    expect(bloq.statusCode).toBe(409);
    expect(bloq.json()).toMatchObject({ code: "BLOQUEADO" });
    expect(bloq.json().error).toContain("Congreso");
    expect((await api("GET", `/agenda/disponibles?recursoId=${dra.id}&fecha=${lunes}`)).json().libres).not.toContain("17:20");

    // Vacaciones de todo el consultorio (sin profesional): bloquea el día entero
    const semana = mas(2);
    const vac = await api("POST", "/agenda/bloqueos", { desde: semana, hasta: semana, motivo: "Feriado del consultorio" });
    expect(vac.statusCode, vac.body).toBe(201);
    expect((await api("GET", `/agenda/disponibles?recursoId=${dra.id}&fecha=${semana}`)).json()).toMatchObject({ bloqueo: "Feriado del consultorio", libres: [] });
    const lista = (await api("GET", `/agenda/bloqueos?desde=${lunes}&hasta=${semana}`)).json();
    expect(lista).toHaveLength(2);

    // Validaciones del bloqueo
    expect((await api("POST", "/agenda/bloqueos", { desde: martes, hasta: lunes, motivo: "Mal" })).statusCode).toBe(400);
    expect((await api("POST", "/agenda/bloqueos", { desde: lunes, hasta: lunes, horaDesde: "10:00", motivo: "Solo una hora" })).statusCode).toBe(400);

    // Editar las notas de un turno que quedó dentro del bloqueo no molesta; moverlo adentro, sí
    const previo = (await api("GET", `/agenda/eventos?desde=${lunes}&hasta=${lunes}`)).json().find((e: { inicio: string }) => e.inicio === "16:00");
    const notas = await api("PUT", `/agenda/eventos/${previo.id}`, { ...previo, notas: "Reprogramar", version: previo.version });
    expect(notas.statusCode, notas.body).toBe(200);

    // Se quita el bloqueo y se puede agendar
    expect((await api("DELETE", `/agenda/bloqueos/${b.json().id}`)).statusCode).toBe(204);
    expect((await turno(lunes, "17:00", "17:40")).statusCode).toBe(201);

    // Sin horarios cargados no hay restricción (la agenda de Prexacode sigue igual)
    const otra = await consultorio("gestion");
    const r = (await otra.api("GET", "/agenda/config")).json().recursos[0];
    expect((await otra.api("POST", "/agenda/eventos", { titulo: "Visita", recursoId: r.id, fecha: martes, inicio: "06:00", fin: "07:00" })).statusCode).toBe(201);
    // Y los bloqueos de otra empresa no se ven ni se borran
    expect((await otra.api("DELETE", `/agenda/bloqueos/${vac.json().id}`)).statusCode).toBe(404);
  });
});

describe("honorarios por porcentaje", () => {
  it("producido del mes, descuento de laboratorio, pagos que van a gastos y a la caja", async () => {
    const { api, miembro } = await consultorio();
    const odo = await miembro("profesional", "Dr. Juan Gómez");
    const p = (await odo.api("POST", "/pacientes", { nombre: "María", apellido: "González" })).json();
    const prest = (await api("GET", "/prestaciones")).json() as { id: string; codigo: string }[];
    const id = (c: string) => prest.find((x) => x.codigo === c)!.id;
    const mes = hoyAr().slice(0, 7);

    // El Dr. Gómez hace dos prestaciones y encarga una corona; la Dra. Pérez hace una
    expect((await odo.api("POST", `/pacientes/${p.id}/cargos`, { prestacionId: id("01.01"), importePaciente: 20000 })).statusCode).toBe(201);
    expect((await odo.api("POST", `/pacientes/${p.id}/cargos`, { prestacionId: id("02.08"), importePaciente: 80000 })).statusCode).toBe(201);
    await api("POST", `/pacientes/${p.id}/cargos`, { prestacionId: id("01.01"), importePaciente: 20000 });
    const lab = (await api("POST", "/laboratorios", { nombre: "Lab Sur" })).json();
    expect((await odo.api("POST", `/laboratorios/${lab.id}/trabajos`, { descripcion: "Corona", importe: 30000 })).statusCode).toBe(201);

    // Sin porcentaje: aparece con lo producido, pero no se le puede pagar
    let liq = (await api("GET", `/honorarios?mes=${mes}`)).json();
    let gomez = liq.profesionales.find((x: { nombre: string }) => x.nombre === "Dr. Juan Gómez");
    expect(gomez).toMatchObject({ porcentaje: null, prestaciones: 2, producido: 100000, laboratorio: 30000, corresponde: 0 });
    expect((await api("POST", `/honorarios/${odo.id}/pagos`, { mes, importe: 1000, medio: "Transferencia" })).statusCode).toBe(400);

    // 40 % descontando el laboratorio: (100.000 − 30.000) × 40 % = 28.000
    expect((await api("PUT", `/honorarios/${odo.id}/config`, { porcentaje: 40, descontarLaboratorio: true })).statusCode).toBe(200);
    expect((await api("PUT", `/honorarios/${odo.id}/config`, { porcentaje: 140 })).statusCode).toBe(400);
    liq = (await api("GET", `/honorarios?mes=${mes}`)).json();
    gomez = liq.profesionales.find((x: { nombre: string }) => x.nombre === "Dr. Juan Gómez");
    expect(gomez).toMatchObject({ porcentaje: 40, base: 70000, corresponde: 28000, pagado: 0, saldo: 28000 });

    // Sin descontar el laboratorio: 40.000
    const sinLab = await api("PUT", `/honorarios/${odo.id}/config`, { porcentaje: 40, descontarLaboratorio: false, version: gomez.version });
    expect(sinLab.statusCode, sinLab.body).toBe(200);
    expect((await api("PUT", `/honorarios/${odo.id}/config`, { porcentaje: 40, version: gomez.version })).statusCode).toBe(409);
    await api("PUT", `/honorarios/${odo.id}/config`, { porcentaje: 40, descontarLaboratorio: true });

    // Pago en efectivo: sale de la caja del día
    await api("POST", "/consultorio/caja/abrir", { aperturaEfectivo: 50000 });
    const pago = await api("POST", `/honorarios/${odo.id}/pagos`, { mes, importe: 10000, medio: "Efectivo" });
    expect(pago.statusCode, pago.body).toBe(201);
    expect(pago.json()).toMatchObject({ categoria: "Sueldos y honorarios", proveedor: "Dr. Juan Gómez" });
    expect(pago.json().descripcion).toMatch(/^Honorarios de Dr\. Juan Gómez · /);
    expect((await api("GET", "/consultorio/caja")).json().esperadoEfectivo).toBe(40000);
    // No se paga más de lo que le queda
    const demas = await api("POST", `/honorarios/${odo.id}/pagos`, { mes, importe: 18000.01, medio: "Transferencia" });
    expect(demas.statusCode).toBe(409);
    expect(demas.json().error).toMatch(/18\.000,00/);
    expect((await api("POST", `/honorarios/${odo.id}/pagos`, { mes, importe: 18000, medio: "Transferencia" })).statusCode).toBe(201);

    // Detalle del profesional
    const det = (await api("GET", `/honorarios/${odo.id}?mes=${mes}`)).json();
    expect(det.profesional).toMatchObject({ corresponde: 28000, pagado: 28000, saldo: 0 });
    expect(det.detalle).toHaveLength(2);
    expect(det.detalle[0]).toMatchObject({ paciente: "González, María", importe: 20000 });
    expect(det.trabajos).toHaveLength(1);
    expect(det.pagos).toHaveLength(2);

    // Se anula un pago desde Gastos: vuelve a deberse
    const anular = await api("POST", `/consultorio/gastos/${pago.json().id}/anular`, { motivo: "Se cargó mal" });
    expect(anular.statusCode, anular.body).toBe(200);
    expect((await api("GET", `/honorarios/${odo.id}?mes=${mes}`)).json().profesional.saldo).toBe(10000);

    // Permisos: el profesional no ve los honorarios de los demás (no tiene "empleados"); un mes inválido, 400
    expect((await odo.api("GET", `/honorarios?mes=${mes}`)).statusCode).toBe(403);
    expect((await api("GET", "/honorarios?mes=2026-13")).statusCode).toBe(400);
    expect((await api("POST", `/honorarios/${odo.id}/pagos`, { mes: "2099-01", importe: 1, medio: "Transferencia" })).statusCode).toBe(400);

    // Prexacode (gestión) no tiene esta sección
    const g = await consultorio("gestion");
    expect((await g.api("GET", "/honorarios")).statusCode).toBe(404);
  });
});
