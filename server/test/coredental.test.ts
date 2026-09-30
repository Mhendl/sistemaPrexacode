import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const CLAVE = "clave-segura-123";
/** PNG de 1×1 */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type Metodo = "GET" | "POST" | "PUT" | "DELETE";
const pedir = (token: string) => (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });

async function consultorio(nombre = "Consultorio Sonrisas") {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: nombre, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email: emailUnico("dra"), password: CLAVE }, aceptaTerminos: true, producto: "dental" },
  });
  expect(r.statusCode, r.body).toBe(201);
  const { token, empresa } = r.json();
  const api = pedir(token);
  /** Suma a alguien del equipo con un rol del consultorio y entra con su usuario */
  const miembro = async (rol: "profesional" | "recepcion", nombreMiembro: string) => {
    const email = emailUnico(rol);
    const alta = await api("POST", "/usuarios", { nombre: nombreMiembro, email, password: CLAVE, rol });
    expect(alta.statusCode, alta.body).toBe(201);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: CLAVE } });
    return pedir(login.json().token);
  };
  return { api, empresa, miembro };
}

const datosPaciente = (extra: object = {}) => ({ nombre: "María", apellido: "González", dni: "28.456.789", fechaNacimiento: "1985-03-15", sexo: "F", telefono: "11 5555-1234", alergias: "Penicilina", ...extra });

describe("un consultorio nuevo", () => {
  it("arranca con su nomenclador, obras sociales, roles de consultorio y la agenda de turnos", async () => {
    const { api } = await consultorio();
    const prest = (await api("GET", "/prestaciones")).json() as { codigo: string; alcance: string }[];
    expect(prest.length).toBeGreaterThanOrEqual(10);
    expect(prest.find((p) => p.codigo === "10.01")).toMatchObject({ alcance: "pieza" });
    const os = (await api("GET", "/pacientes/obras-sociales")).json() as { nombre: string }[];
    expect(os.map((o) => o.nombre)).toContain("OSDE");
    const roles = (await api("GET", "/roles")).json() as { nombre: string }[];
    expect(roles.map((r) => r.nombre).sort()).toEqual(["Administrador", "Profesional", "Recepción"]);
    const agenda = (await api("GET", "/agenda/config")).json();
    expect(agenda).toMatchObject({ nombreEvento: "Turno", nombreRecurso: "Profesional" });
    // Los permisos que se pueden dar son los de un consultorio
    const secciones = ((await api("GET", "/roles/permisos")).json() as { seccion: string }[]).map((s) => s.seccion);
    expect(secciones).toEqual(expect.arrayContaining(["Pacientes", "Historia clínica", "Facturación"]));
    expect(secciones).not.toContain("Remitos");
  });

  it("una empresa de gestión no tiene pacientes, ni los ve en sus permisos", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await pedir(token)("GET", "/pacientes")).statusCode).toBe(404);
    const secciones = ((await pedir(token)("GET", "/roles/permisos")).json() as { seccion: string }[]).map((s) => s.seccion);
    expect(secciones).not.toContain("Pacientes");
    expect(secciones).toContain("Remitos");
  });
});

describe("pacientes", () => {
  it("alta con DNI (sin puntos), edad, búsqueda y DNI repetido", async () => {
    const { api } = await consultorio();
    const r = await api("POST", "/pacientes", datosPaciente());
    expect(r.statusCode, r.body).toBe(201);
    const p = r.json();
    expect(p).toMatchObject({ dni: "28456789", datosPendientes: false, alergias: "Penicilina", veAntecedentes: true });
    expect(p.edad).toBeGreaterThanOrEqual(40);
    expect((await api("POST", "/pacientes", datosPaciente({ nombre: "Otra" }))).statusCode).toBe(409);
    expect((await api("POST", "/pacientes", datosPaciente({ dni: "123" }))).json().details).toMatchObject({ dni: expect.stringContaining("7 u 8") });
    expect((await api("POST", "/pacientes", datosPaciente({ dni: null, fechaNacimiento: "2999-01-01" }))).statusCode).toBe(400);

    for (const q of ["gonz", "maría gonzález", "González María", "456789"]) {
      const lista = (await api("GET", `/pacientes?q=${encodeURIComponent(q)}`)).json() as { id: string }[];
      expect(lista.map((x) => x.id), q).toContain(p.id);
    }
  });

  it("alta rápida desde un turno: sin DNI queda con datos pendientes, y se completa después", async () => {
    const { api } = await consultorio();
    const p = (await api("POST", "/pacientes", { nombre: "Carlos", apellido: "Rodríguez", telefono: "11 4444-0000" })).json();
    expect(p.datosPendientes).toBe(true);
    const c = (await api("PUT", `/pacientes/${p.id}`, { ...p, dni: "30111222", version: p.version })).json();
    expect(c.datosPendientes).toBe(false);
    // Dos personas editando: la segunda recibe el aviso
    expect((await api("PUT", `/pacientes/${p.id}`, { ...p, dni: "30111223", version: p.version })).statusCode).toBe(409);
  });

  it("la obra social se elige de la lista o se agrega en el momento, sin duplicar", async () => {
    const { api } = await consultorio();
    const nueva = (await api("POST", "/pacientes/obras-sociales", { nombre: "Obra Social Bancaria" })).json();
    expect((await api("POST", "/pacientes/obras-sociales", { nombre: "obra social bancaria" })).json().id).toBe(nueva.id);
    const p = (await api("POST", "/pacientes", datosPaciente({ obraSocialId: nueva.id, plan: "Plata", numeroAfiliado: "123-45" }))).json();
    expect(p).toMatchObject({ obraSocial: "Obra Social Bancaria", plan: "Plata" });
  });

  it("un consultorio no ve los pacientes de otro", async () => {
    const a = await consultorio("Consultorio A");
    const b = await consultorio("Consultorio B");
    const p = (await a.api("POST", "/pacientes", datosPaciente())).json();
    expect((await b.api("GET", `/pacientes/${p.id}`)).statusCode).toBe(404);
    expect((await b.api("GET", `/pacientes/${p.id}/evoluciones`)).statusCode).toBe(404);
    // Y el mismo DNI puede estar en los dos
    expect((await b.api("POST", "/pacientes", datosPaciente())).statusCode).toBe(201);
    // Una obra social de otro consultorio no se puede usar
    const osA = ((await a.api("GET", "/pacientes/obras-sociales")).json() as { id: string }[])[0]!;
    expect((await b.api("POST", "/pacientes", datosPaciente({ dni: "40111222", obraSocialId: osA.id }))).statusCode).toBe(400);
  });
});

describe("historia clínica: datos de salud", () => {
  it("la recepción da de alta pacientes y turnos, pero no ve ni carga antecedentes, historia, odontograma ni imágenes", async () => {
    const { api, miembro } = await consultorio();
    const recepcion = await miembro("recepcion", "Ana Recepción");
    const r = await recepcion("POST", "/pacientes", datosPaciente());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ alergias: null, veAntecedentes: false });
    const id = r.json().id;
    // La alergia no se guardó (no tiene permiso de historia): la profesional la ve vacía
    expect((await api("GET", `/pacientes/${id}`)).json().alergias).toBeNull();
    await api("PUT", `/pacientes/${id}`, { ...datosPaciente(), alergias: "Látex" });
    // Si la recepción edita el teléfono, no borra la alergia que cargó la profesional
    await recepcion("PUT", `/pacientes/${id}`, { ...datosPaciente(), telefono: "11 0000-0000", alergias: null });
    expect((await api("GET", `/pacientes/${id}`)).json()).toMatchObject({ alergias: "Látex", telefono: "11 0000-0000" });
    expect((await recepcion("GET", `/pacientes/${id}`)).json().alergias).toBeNull();

    for (const url of [`/pacientes/${id}/evoluciones`, `/pacientes/${id}/odontograma`, `/pacientes/${id}/archivos`]) {
      expect((await recepcion("GET", url)).statusCode, url).toBe(403);
    }
    expect((await recepcion("POST", `/pacientes/${id}/evoluciones`, { texto: "Intento" })).statusCode).toBe(403);
    // Pero sí ve sus turnos
    expect((await recepcion("GET", `/pacientes/${id}/turnos`)).statusCode).toBe(200);
  });

  it("las evoluciones quedan con autor y fecha, y no se pueden modificar ni borrar", async () => {
    const { api, miembro } = await consultorio();
    const profesional = await miembro("profesional", "Dr. Juan Gómez");
    const p = (await api("POST", "/pacientes", datosPaciente())).json();
    const e1 = await profesional("POST", `/pacientes/${p.id}/evoluciones`, { texto: "Control. Se indica radiografía de 36.", fecha: "2026-01-10" });
    expect(e1.statusCode, e1.body).toBe(201);
    expect(e1.json()).toMatchObject({ autor: "Dr. Juan Gómez", fecha: "2026-01-10" });
    await profesional("POST", `/pacientes/${p.id}/evoluciones`, { texto: "Obturación 36 con resina." });
    const lista = (await api("GET", `/pacientes/${p.id}/evoluciones`)).json() as { texto: string; fecha: string }[];
    expect(lista.map((e) => e.fecha)).toEqual([hoyAr(), "2026-01-10"]);
    expect((await profesional("PUT", `/pacientes/${p.id}/evoluciones/${e1.json().id}`, { texto: "cambio" })).statusCode).toBe(404);
    expect((await profesional("DELETE", `/pacientes/${p.id}/evoluciones/${e1.json().id}`)).statusCode).toBe(404);
    expect((await profesional("POST", `/pacientes/${p.id}/evoluciones`, { texto: "x" })).statusCode).toBe(400);
    expect((await profesional("POST", `/pacientes/${p.id}/evoluciones`, { texto: "Del futuro", fecha: "2999-01-01" })).statusCode).toBe(400);
    // Un paciente con historia no se puede borrar
    expect((await api("DELETE", `/pacientes/${p.id}`)).statusCode).toBe(409);
  });

  it("radiografías e imágenes: solo formatos reales, con tope, y el contenido no queda en caché", async () => {
    const { api } = await consultorio();
    const p = (await api("POST", "/pacientes", datosPaciente())).json();
    const sube = (extra: object) => api("POST", `/pacientes/${p.id}/archivos`, { datos: PNG, nombreArchivo: "rx-36.png", tipo: "Radiografía", descripcion: "Periapical 36", ...extra });
    const a = await sube({});
    expect(a.statusCode, a.body).toBe(201);
    expect(a.json()).toMatchObject({ mime: "image/png", tipo: "Radiografía", tamano: 70 });
    expect((await sube({ datos: Buffer.from("no soy una imagen").toString("base64") })).statusCode).toBe(400);
    expect((await sube({ tipo: "Otra cosa" })).statusCode).toBe(400);
    const lista = (await api("GET", `/pacientes/${p.id}/archivos`)).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].datos).toBeUndefined();
    const contenido = await api("GET", `/pacientes/${p.id}/archivos/${a.json().id}`);
    expect(contenido.headers["content-type"]).toBe("image/png");
    expect(contenido.headers["cache-control"]).toContain("no-store");
    expect(contenido.rawPayload.toString("base64")).toBe(PNG);
    expect((await api("DELETE", `/pacientes/${p.id}/archivos/${a.json().id}`)).statusCode).toBe(204);
    expect((await api("GET", `/pacientes/${p.id}/archivos`)).json()).toHaveLength(0);
  });
});

describe("odontograma", () => {
  it("marcas por pieza y cara, a realizar → realizado, y anular sin borrar", async () => {
    const { api } = await consultorio();
    const p = (await api("POST", "/pacientes", datosPaciente())).json();
    const prest = (await api("GET", "/prestaciones")).json() as { id: string; codigo: string }[];
    const id = (codigo: string) => prest.find((x) => x.codigo === codigo)!.id;

    // La misma caries en dos piezas, en vestibular y oclusal
    const caries = await api("POST", `/pacientes/${p.id}/odontograma`, { prestacionId: id("CAR"), piezas: [16, 26], caras: ["V", "O", "O"], estado: "a_realizar" });
    expect(caries.statusCode, caries.body).toBe(201);
    expect(caries.json()).toHaveLength(2);
    expect(caries.json()[0].caras).toEqual(["V", "O"]);
    // Por pieza: las caras no se guardan
    const ext = (await api("POST", `/pacientes/${p.id}/odontograma`, { prestacionId: id("10.01"), piezas: [48], caras: ["V"], estado: "existente" })).json();
    expect(ext[0].caras).toEqual([]);

    // Validaciones
    const mal = (body: object) => api("POST", `/pacientes/${p.id}/odontograma`, { prestacionId: id("CAR"), piezas: [16], caras: ["O"], estado: "a_realizar", ...body });
    expect((await mal({ caras: [] })).json().details).toMatchObject({ caras: "Obligatorio" });
    expect((await mal({ piezas: [19] })).statusCode).toBe(400);
    expect((await mal({ piezas: [55] })).statusCode).toBe(201); // temporaria
    expect((await mal({ prestacionId: id("01.01") })).statusCode).toBe(400); // la consulta no va al odontograma
    expect((await mal({ estado: "roto" })).statusCode).toBe(400);

    // Se hizo
    const m = caries.json()[0];
    const hecho = await api("POST", `/pacientes/${p.id}/odontograma/${m.id}/realizar`, {});
    expect(hecho.json()).toMatchObject({ estado: "realizado", realizadoEn: hoyAr(), realizadoPor: "Dra. Laura Pérez" });
    expect((await api("POST", `/pacientes/${p.id}/odontograma/${m.id}/realizar`, {})).statusCode).toBe(409);

    // Cargada por error: se anula con motivo y queda en el historial
    const otra = caries.json()[1];
    expect((await api("POST", `/pacientes/${p.id}/odontograma/${otra.id}/anular`, {})).statusCode).toBe(400);
    const anulada = await api("POST", `/pacientes/${p.id}/odontograma/${otra.id}/anular`, { motivo: "Era la 27, no la 26" });
    expect(anulada.json()).toMatchObject({ anuladoPor: "Dra. Laura Pérez", motivoAnulacion: "Era la 27, no la 26" });
    expect((await api("POST", `/pacientes/${p.id}/odontograma/${otra.id}/realizar`, {})).statusCode).toBe(409);
    const todo = (await api("GET", `/pacientes/${p.id}/odontograma`)).json() as { id: string; anuladoEn: string | null; prestacion: { nombre: string } }[];
    expect(todo).toHaveLength(4);
    expect(todo.find((x) => x.id === otra.id)!.anuladoEn).not.toBeNull();
    expect(todo[0]!.prestacion.nombre).toBe("Caries");
  });
});

describe("turnos del consultorio", () => {
  it("turno a un paciente con su profesional; ausente libera el horario; aparece en su ficha y en el inicio", async () => {
    const { api, miembro } = await consultorio();
    const recepcion = await miembro("recepcion", "Ana Recepción");
    const p = (await recepcion("POST", "/pacientes", datosPaciente())).json();
    const recursos = (await api("GET", "/agenda/config")).json().recursos as { id: string; nombre: string }[];
    const dra = recursos.find((r) => r.nombre === "Dra. Laura Pérez")!;
    const hoy = hoyAr();
    const turno = (extra: object = {}) => recepcion("POST", "/agenda/eventos", { titulo: "González, María", tipo: "Consulta", recursoId: dra.id, pacienteId: p.id, fecha: hoy, inicio: "10:00", fin: "10:30", ...extra });
    const t = await turno();
    expect(t.statusCode, t.body).toBe(201);
    expect((await turno({ inicio: "10:15", fin: "10:45" })).statusCode).toBe(409);

    // No vino: el horario queda libre para otro paciente
    expect((await recepcion("POST", `/agenda/eventos/${t.json().id}/estado`, { estado: "Ausente" })).statusCode).toBe(200);
    const otro = (await recepcion("POST", "/pacientes", { nombre: "Carlos", apellido: "Rodríguez" })).json();
    expect((await turno({ pacienteId: otro.id, titulo: "Rodríguez, Carlos" })).statusCode).toBe(201);

    const ev = (await recepcion("GET", `/agenda/eventos?desde=${hoy}&hasta=${hoy}`)).json() as { pacienteNombre: string; pacienteDatosPendientes: boolean }[];
    expect(ev.map((e) => e.pacienteNombre).sort()).toEqual(["González, María", "Rodríguez, Carlos"]);
    expect(ev.find((e) => e.pacienteNombre === "Rodríguez, Carlos")!.pacienteDatosPendientes).toBe(true);
    expect((await recepcion("GET", `/pacientes/${p.id}/turnos`)).json()[0]).toMatchObject({ estado: "Ausente", profesional: "Dra. Laura Pérez" });

    const inicio = (await api("GET", "/inicio/consultorio")).json();
    expect(inicio.turnosHoy).toHaveLength(2);
    expect(inicio.turnosHoy.find((x: { paciente: string }) => x.paciente === "Rodríguez, Carlos")).toMatchObject({ esMio: true, datosPendientes: true });
    expect(inicio).toMatchObject({ ausentesMes: 1, pacientes: { activos: 2, nuevosMes: 2, datosPendientes: 1 }, primerosPasos: { pacientes: true, turno: true, equipo: true } });

    // Sin título, el turno se titula con el nombre del paciente
    const sinTitulo = await recepcion("POST", "/agenda/eventos", { recursoId: dra.id, pacienteId: p.id, fecha: hoy, inicio: "15:00", fin: "15:30" });
    expect(sinTitulo.json().titulo).toBe("González, María");
    expect((await recepcion("POST", "/agenda/eventos", { recursoId: dra.id, fecha: hoy, inicio: "16:00", fin: "16:30" })).json().details).toMatchObject({ titulo: "Poné un título" });

    // Un paciente con turnos no se borra
    expect((await api("DELETE", `/pacientes/${otro.id}`)).statusCode).toBe(409);
    // Un paciente sin nada, sí
    const vacio = (await api("POST", "/pacientes", { nombre: "Sin", apellido: "Nada" })).json();
    expect((await api("DELETE", `/pacientes/${vacio.id}`)).statusCode).toBe(204);
  });

  it("no se agenda un paciente de otro consultorio", async () => {
    const a = await consultorio("Consultorio Uno");
    const b = await consultorio("Consultorio Dos");
    const p = (await a.api("POST", "/pacientes", datosPaciente())).json();
    const rb = ((await b.api("GET", "/agenda/config")).json().recursos as { id: string }[])[0]!;
    const r = await b.api("POST", "/agenda/eventos", { titulo: "X turno", recursoId: rb.id, pacienteId: p.id, fecha: hoyAr(), inicio: "09:00", fin: "09:30" });
    expect(r.statusCode).toBe(400);
  });
});
