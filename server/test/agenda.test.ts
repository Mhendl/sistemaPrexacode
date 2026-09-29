import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dias = (n: number) => {
  const d = new Date(`${hoy()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const req = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api/agenda${url}`, headers: auth(token) }),
  post: (url: string, payload: object) => app.inject({ method: "POST", url: `/api/agenda${url}`, headers: auth(token), payload }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api/agenda${url}`, headers: auth(token), payload }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api/agenda${url}`, headers: auth(token) }),
});

async function usuario(token: string, rol: string, nombre: string) {
  const email = emailUnico(rol);
  const u = (await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre, email, rol, password: "clave-segura-123" } })).json();
  const t = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
  return { id: u.id as string, token: t };
}

const bandeja = async (token: string) => (await app.inject({ method: "GET", url: "/api/notificaciones", headers: auth(token) })).json();

describe("agenda", () => {
  it("la primera vez arma la configuración con un recurso por usuario; el admin la personaliza", async () => {
    const { token } = await registrarEmpresa(app);
    const tecnico = await usuario(token, "operaciones", "Tomás Técnico");
    const a = req(token);
    const c = (await a.get("/config")).json();
    expect(c).toMatchObject({ nombreEvento: "Visita", nombreRecurso: "Responsable", horaInicio: "08:00", horaFin: "19:00", tiposEvento: ["Visita", "Reunión", "Llamada", "Tarea interna"] });
    expect(c.recursos).toHaveLength(2);
    expect(c.recursos[1]).toMatchObject({ nombre: "Tomás Técnico", usuarioId: tecnico.id, activo: true });
    expect(c.recursos[0].color).not.toBe(c.recursos[1].color);
    // pedirla de nuevo no duplica recursos
    expect((await a.get("/config")).json().recursos).toHaveLength(2);

    const put = await a.put("/config", { nombreEvento: "Turno", nombreRecurso: "Profesional", horaInicio: "09:00", horaFin: "20:30", tiposEvento: ["Consulta", "Control", "consulta"], version: c.version });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ nombreEvento: "Turno", horaFin: "20:30", tiposEvento: ["Consulta", "Control"] });
    // con la versión vieja: otro lo cambió
    const vieja = await a.put("/config", { nombreEvento: "Visita", nombreRecurso: "Vendedor", horaInicio: "08:00", horaFin: "18:00", tiposEvento: [], version: c.version });
    expect(vieja.statusCode).toBe(409);
    expect(vieja.json().code).toBe("EDICION_CONCURRENTE");
    const mala = await a.put("/config", { nombreEvento: "Turno", nombreRecurso: "Box", horaInicio: "10:00", horaFin: "10:30", tiposEvento: [] });
    expect(mala.statusCode).toBe(400);
    expect(mala.json().details).toHaveProperty("horaFin");

    // Operaciones usa la agenda pero no la configura
    const o = req(tecnico.token);
    expect((await o.get("/config")).statusCode).toBe(200);
    expect((await o.put("/config", { nombreEvento: "X", nombreRecurso: "Y", horaInicio: "08:00", horaFin: "18:00", tiposEvento: [] })).statusCode).toBe(403);
    expect((await o.post("/recursos", { nombre: "Sala 1", color: "#336699" })).statusCode).toBe(403);
  });

  it("quien se suma al equipo después de armada la agenda aparece solo, con un color libre", async () => {
    const { token } = await registrarEmpresa(app);
    const a = req(token);
    expect((await a.get("/config")).json().recursos).toHaveLength(1); // la agenda se arma con el admin solo
    await usuario(token, "operaciones", "Técnico Nuevo");
    const { recursos } = (await a.get("/config")).json();
    expect(recursos.map((r: { nombre: string }) => r.nombre)).toEqual(["Admin Prueba", "Técnico Nuevo"]);
    expect(recursos[1].color).not.toBe(recursos[0].color);
    expect(recursos[1].usuarioId).toBeTruthy();
  });

  it("eventos: alta, período, superposición en el mismo recurso y control de edición", async () => {
    const { token } = await registrarEmpresa(app);
    const a = req(token);
    const { recursos } = (await a.get("/config")).json();
    const sala = (await a.post("/recursos", { nombre: "Sala de reuniones", color: "#336699" })).json();
    const cliente = (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: { razonSocial: "Cliente Agenda S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();

    const base = { titulo: "Relevamiento", tipo: "Visita", recursoId: recursos[0].id, clienteId: cliente.id, fecha: dias(1), inicio: "10:00", fin: "11:30" };
    const e1 = await a.post("/eventos", base);
    expect(e1.statusCode).toBe(201);
    expect(e1.json()).toMatchObject({ estado: "Pendiente", version: 1 });

    // Mismo recurso, horario que se pisa → aviso; se puede forzar
    const pisa = await a.post("/eventos", { ...base, titulo: "Otra visita", inicio: "11:00", fin: "12:00" });
    expect(pisa.statusCode).toBe(409);
    expect(pisa.json()).toMatchObject({ code: "SUPERPOSICION" });
    expect(pisa.json().error).toContain('"Relevamiento" de 10:00 a 11:30');
    expect((await a.post("/eventos", { ...base, titulo: "Sobreturno", inicio: "11:00", fin: "12:00", permitirSuperposicion: true })).statusCode).toBe(201);
    // Justo a continuación no se pisa; en otro recurso tampoco
    expect((await a.post("/eventos", { ...base, titulo: "Siguiente", inicio: "12:00", fin: "13:00" })).statusCode).toBe(201);
    expect((await a.post("/eventos", { ...base, titulo: "En la sala", recursoId: sala.id })).statusCode).toBe(201);

    const lista = (await a.get(`/eventos?desde=${dias(0)}&hasta=${dias(6)}`)).json();
    expect(lista.map((e: { titulo: string }) => e.titulo)).toEqual(["Relevamiento", "En la sala", "Sobreturno", "Siguiente"]);
    expect(lista[0].clienteRazonSocial).toBe("Cliente Agenda S.A.");
    expect((await a.get(`/eventos?desde=${dias(2)}&hasta=${dias(6)}`)).json()).toEqual([]);
    expect((await a.get(`/eventos?clienteId=${cliente.id}`)).json()).toHaveLength(4);
    expect((await a.get("/eventos")).statusCode).toBe(400);

    // Editar: mover de hora controla superposición excluyéndose a sí mismo
    const ev = e1.json();
    const mover = await a.put(`/eventos/${ev.id}`, { ...base, inicio: "09:30", fin: "10:30", version: ev.version });
    expect(mover.statusCode).toBe(200);
    expect(mover.json().version).toBe(2);
    const viejo = await a.put(`/eventos/${ev.id}`, { ...base, titulo: "Cambio viejo", version: 1 });
    expect(viejo.statusCode).toBe(409);
    expect(viejo.json().code).toBe("EDICION_CONCURRENTE");

    // Validaciones
    const mal = await a.post("/eventos", { ...base, inicio: "15:00", fin: "14:00" });
    expect(mal.statusCode).toBe(400);
    expect(mal.json().details).toHaveProperty("fin");
    expect((await a.post("/eventos", { ...base, inicio: "25:00" })).statusCode).toBe(400);
  });

  it("estados: cancelar libera el horario y reactivar controla superposición", async () => {
    const { token } = await registrarEmpresa(app);
    const a = req(token);
    const { recursos } = (await a.get("/config")).json();
    const base = { titulo: "Turno 1", recursoId: recursos[0].id, fecha: dias(2), inicio: "09:00", fin: "10:00" };
    const t1 = (await a.post("/eventos", base)).json();
    expect((await a.post(`/eventos/${t1.id}/estado`, { estado: "Cancelado" })).json().estado).toBe("Cancelado");
    const t2 = await a.post("/eventos", { ...base, titulo: "Turno 2" });
    expect(t2.statusCode).toBe(201);
    const reactivar = await a.post(`/eventos/${t1.id}/estado`, { estado: "Confirmado" });
    expect(reactivar.statusCode).toBe(409);
    expect(reactivar.json().code).toBe("SUPERPOSICION");
    expect((await a.post(`/eventos/${t2.json().id}/estado`, { estado: "Realizado" })).json().estado).toBe("Realizado");
    expect((await a.post(`/eventos/${t2.json().id}/estado`, { estado: "Otro" })).statusCode).toBe(400);
    expect((await a.del(`/eventos/${t1.id}`)).statusCode).toBe(204);
    expect((await a.get(`/eventos/${t1.id}`)).statusCode).toBe(404);
  });

  it("recursos: uno con eventos no se borra, se desactiva y ya no se le asignan eventos nuevos", async () => {
    const { token } = await registrarEmpresa(app);
    const a = req(token);
    const movil = (await a.post("/recursos", { nombre: "Camioneta", color: "oklch(0.7 0.16 60)" })).json();
    const ev = (await a.post("/eventos", { titulo: "Reparto zona norte", recursoId: movil.id, fecha: dias(1), inicio: "08:00", fin: "12:00" })).json();
    const borrar = await a.del(`/recursos/${movil.id}`);
    expect(borrar.statusCode).toBe(409);
    expect(borrar.json().error).toContain("Desactivalo");

    const des = await a.put(`/recursos/${movil.id}`, { nombre: "Camioneta", color: movil.color, activo: false, version: movil.version });
    expect(des.json().activo).toBe(false);
    const nuevo = await a.post("/eventos", { titulo: "Reparto sur", recursoId: movil.id, fecha: dias(1), inicio: "14:00", fin: "16:00" });
    expect(nuevo.statusCode).toBe(400);
    // el evento que ya tenía se puede seguir editando
    expect((await a.put(`/eventos/${ev.id}`, { titulo: "Reparto zona norte (demorado)", recursoId: movil.id, fecha: dias(1), inicio: "09:00", fin: "12:00" })).statusCode).toBe(200);

    const vacio = (await a.post("/recursos", { nombre: "Sala sin uso", color: "#112233" })).json();
    expect((await a.del(`/recursos/${vacio.id}`)).statusCode).toBe(204);
    expect((await a.post("/recursos", { nombre: "Color raro", color: "red; background:url(x)" })).statusCode).toBe(400);
  });

  it("avisa a la persona cuando le agendan, le cambian el horario o le cancelan (no a quien lo hizo)", async () => {
    const { token } = await registrarEmpresa(app);
    const tecnico = await usuario(token, "operaciones", "Técnico Avisado");
    const a = req(token);
    const { recursos } = (await a.get("/config")).json();
    const suyo = recursos.find((r: { usuarioId: string }) => r.usuarioId === tecnico.id);
    const mio = recursos.find((r: { usuarioId: string }) => r.usuarioId !== tecnico.id);

    const ev = (await a.post("/eventos", { titulo: "Instalación en obra", recursoId: suyo.id, fecha: dias(3), inicio: "08:00", fin: "10:00" })).json();
    let b = await bandeja(tecnico.token);
    expect(b.noLeidas).toBe(1);
    expect(b.items[0]).toMatchObject({ tipo: "agenda_asignacion", titulo: "Te agendaron algo nuevo", link: `/agenda?fecha=${dias(3)}&evento=${ev.id}` });
    expect(b.items[0].detalle).toContain("Instalación en obra");

    await a.put(`/eventos/${ev.id}`, { titulo: "Instalación en obra", recursoId: suyo.id, fecha: dias(3), inicio: "11:00", fin: "13:00" });
    await a.post(`/eventos/${ev.id}/estado`, { estado: "Cancelado" });
    b = await bandeja(tecnico.token);
    expect(b.items.map((n: { titulo: string }) => n.titulo)).toEqual(["Se canceló", "Cambió de día u horario", "Te agendaron algo nuevo"]);

    // Lo que el técnico se agenda a sí mismo no le genera aviso; lo que se agenda el admin, tampoco al admin
    await req(tecnico.token).post("/eventos", { titulo: "Pedido de materiales", recursoId: suyo.id, fecha: dias(4), inicio: "08:00", fin: "09:00" });
    await a.post("/eventos", { titulo: "Reunión con contador", recursoId: mio.id, fecha: dias(4), inicio: "08:00", fin: "09:00" });
    expect((await bandeja(tecnico.token)).items).toHaveLength(3);
    expect((await bandeja(token)).items.filter((n: { tipo: string }) => n.tipo === "agenda_asignacion")).toHaveLength(0);

    // Si lo desactiva, no recibe más
    await app.inject({ method: "PUT", url: "/api/notificaciones/preferencias", headers: auth(tecnico.token), payload: [{ tipo: "agenda_asignacion", enSistema: false }] });
    await a.post("/eventos", { titulo: "Otra instalación", recursoId: suyo.id, fecha: dias(5), inicio: "08:00", fin: "09:00" });
    expect((await bandeja(tecnico.token)).items).toHaveLength(3);
  });

  it("cada empresa ve solo su agenda y no puede usar recursos o clientes ajenos", async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const ra = (await req(a.token).get("/config")).json().recursos[0];
    const rb = (await req(b.token).get("/config")).json().recursos[0];
    const ev = (await req(a.token).post("/eventos", { titulo: "Privado", recursoId: ra.id, fecha: dias(1), inicio: "08:00", fin: "09:00" })).json();
    const clienteA = (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(a.token), payload: { razonSocial: "Cliente de A", cuit: cuitValido("30"), condicionIva: "Monotributista" } })).json();

    const B = req(b.token);
    expect((await B.get(`/eventos?desde=${dias(0)}&hasta=${dias(3)}`)).json()).toEqual([]);
    expect((await B.get(`/eventos/${ev.id}`)).statusCode).toBe(404);
    expect((await B.post("/eventos", { titulo: "Con recurso ajeno", recursoId: ra.id, fecha: dias(1), inicio: "08:00", fin: "09:00" })).statusCode).toBe(400);
    expect((await B.post("/eventos", { titulo: "Con cliente ajeno", recursoId: rb.id, clienteId: clienteA.id, fecha: dias(1), inicio: "08:00", fin: "09:00" })).statusCode).toBe(400);
    expect((await B.put(`/eventos/${ev.id}`, { titulo: "Hackeado", recursoId: rb.id, fecha: dias(1), inicio: "08:00", fin: "09:00" })).statusCode).toBe(404);
    expect((await B.del(`/eventos/${ev.id}`)).statusCode).toBe(404);
    expect((await B.put(`/recursos/${ra.id}`, { nombre: "Mío", color: "#000000" })).statusCode).toBe(404);
  });
});
