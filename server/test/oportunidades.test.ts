import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const api = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
  post: (url: string, payload: object) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: auth(token) }),
});

async function usuario(token: string, rol: string, nombre: string) {
  const email = emailUnico(rol);
  const u = (await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre, email, rol, password: "clave-segura-123" } })).json();
  const t = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
  return { id: u.id as string, token: t };
}

async function cliente(token: string, razonSocial = "Cliente Embudo S.A.") {
  return (await api(token).post("/clientes", { razonSocial, cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).json() as { id: string };
}

describe("oportunidades", () => {
  it("alta con cliente o prospecto, edición con control de versión y validaciones", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const c = await cliente(token);

    const conCliente = await a.post("/oportunidades", { titulo: "Renovación de equipos", clienteId: c.id, monto: 1500000, cierreEstimado: "2026-12-15" });
    expect(conCliente.statusCode).toBe(201);
    expect(conCliente.json()).toMatchObject({ etapa: "Nuevo", monto: 1500000, clienteRazonSocial: "Cliente Embudo S.A.", fechaCierre: null, presupuesto: null, version: 1 });

    const prospecto = await a.post("/oportunidades", { titulo: "Consulta por web", prospecto: "Panadería La Espiga", contacto: "Rosa · 11 5555-1234" });
    expect(prospecto.statusCode).toBe(201);
    expect(prospecto.json()).toMatchObject({ clienteId: null, prospecto: "Panadería La Espiga", monto: 0 });

    const sinNadie = await a.post("/oportunidades", { titulo: "Sin cliente" });
    expect(sinNadie.statusCode).toBe(400);
    expect(sinNadie.json().details).toHaveProperty("clienteId");
    expect((await a.post("/oportunidades", { titulo: "Monto raro", prospecto: "X", monto: -5 })).statusCode).toBe(400);
    expect((await a.post("/oportunidades", { titulo: "Etapa rara", prospecto: "X", etapa: "Soñada" })).statusCode).toBe(400);

    const o = conCliente.json();
    const put = await a.put(`/oportunidades/${o.id}`, { titulo: "Renovación de 10 equipos", clienteId: c.id, monto: 1800000, etapa: "Contactado", version: o.version });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ titulo: "Renovación de 10 equipos", etapa: "Contactado", version: 2 });
    const vieja = await a.put(`/oportunidades/${o.id}`, { titulo: "Pisando", clienteId: c.id, version: 1 });
    expect(vieja.statusCode).toBe(409);
    expect(vieja.json().code).toBe("EDICION_CONCURRENTE");

    const lista = (await a.get("/oportunidades")).json();
    expect(lista.map((x: { titulo: string }) => x.titulo)).toEqual(["Renovación de 10 equipos", "Consulta por web"]);
    expect((await a.get(`/oportunidades?clienteId=${c.id}`)).json()).toHaveLength(1);
  });

  it("mover de etapa: ganar o perder deja fecha de cierre; reabrir la limpia", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const o = (await a.post("/oportunidades", { titulo: "Abono anual", prospecto: "Estudio Ruiz", monto: 600000 })).json();

    const perdida = (await a.post(`/oportunidades/${o.id}/etapa`, { etapa: "Perdida", motivoPerdida: "Eligió otro proveedor por precio" })).json();
    expect(perdida).toMatchObject({ etapa: "Perdida", fechaCierre: hoy(), motivoPerdida: "Eligió otro proveedor por precio" });

    const reabierta = (await a.post(`/oportunidades/${o.id}/etapa`, { etapa: "Negociación" })).json();
    expect(reabierta).toMatchObject({ etapa: "Negociación", fechaCierre: null, motivoPerdida: null });

    const ganada = (await a.post(`/oportunidades/${o.id}/etapa`, { etapa: "Ganada" })).json();
    expect(ganada).toMatchObject({ etapa: "Ganada", fechaCierre: hoy() });
    expect((await a.post(`/oportunidades/${o.id}/etapa`, { etapa: "Cualquiera" })).statusCode).toBe(400);

    expect((await a.del(`/oportunidades/${o.id}`)).statusCode).toBe(204);
    expect((await a.get(`/oportunidades/${o.id}`)).statusCode).toBe(404);
  });

  it("de prospecto a presupuesto y a factura: avanza a Propuesta y termina Ganada sola", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const o = (await a.post("/oportunidades", { titulo: "Cámaras para el local", prospecto: "Kiosco Don Pepe" })).json();
    // El prospecto se convierte en cliente y se le hace el presupuesto desde la oportunidad
    const c = await cliente(token, "Kiosco Don Pepe S.R.L.");
    const pres = await a.post("/presupuestos", { clienteId: c.id, oportunidadId: o.id, items: [{ descripcion: "Kit 4 cámaras", cantidad: 1, precioUnitario: 400000, alicuotaIva: 21 }] });
    expect(pres.statusCode).toBe(201);

    let ahora = (await a.get(`/oportunidades/${o.id}`)).json();
    expect(ahora).toMatchObject({ etapa: "Propuesta", clienteId: c.id, prospecto: null, monto: 484000, presupuesto: { id: pres.json().id, numero: 1, estado: "Pendiente" } });

    const fac = await a.post("/comprobantes", { clienteId: c.id, presupuestoId: pres.json().id, items: [{ descripcion: "Kit 4 cámaras", cantidad: 1, precioUnitario: 400000, alicuotaIva: 21 }] });
    expect(fac.statusCode).toBe(201);
    ahora = (await a.get(`/oportunidades/${o.id}`)).json();
    expect(ahora).toMatchObject({ etapa: "Ganada", fechaCierre: hoy(), presupuesto: { estado: "Facturado" } });
  });

  it("un presupuesto no se puede vincular a una oportunidad de otro cliente ni de otra empresa", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const c1 = await cliente(token, "Uno S.A.");
    const c2 = await cliente(token, "Dos S.A.");
    const o = (await a.post("/oportunidades", { titulo: "Con Uno", clienteId: c1.id, etapa: "Negociación", monto: 1000 })).json();
    const item = [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }];
    const otroCliente = await a.post("/presupuestos", { clienteId: c2.id, oportunidadId: o.id, items: item });
    expect(otroCliente.statusCode).toBe(400);
    expect(otroCliente.json().details).toHaveProperty("clienteId");

    // En Negociación no retrocede a Propuesta, y el monto cargado se respeta
    expect((await a.post("/presupuestos", { clienteId: c1.id, oportunidadId: o.id, items: item })).statusCode).toBe(201);
    expect((await a.get(`/oportunidades/${o.id}`)).json()).toMatchObject({ etapa: "Negociación", monto: 1000 });

    const b = await registrarEmpresa(app);
    const cb = await cliente(b.token, "De B S.A.");
    expect((await api(b.token).post("/presupuestos", { clienteId: cb.id, oportunidadId: o.id, items: item })).statusCode).toBe(400);
    expect((await api(b.token).get("/oportunidades")).json()).toEqual([]);
    expect((await api(b.token).get(`/oportunidades/${o.id}`)).statusCode).toBe(404);
    expect((await api(b.token).post(`/oportunidades/${o.id}/etapa`, { etapa: "Perdida" })).statusCode).toBe(404);
    expect((await api(b.token).post("/oportunidades", { titulo: "Cliente ajeno", clienteId: c1.id })).statusCode).toBe(400);
  });

  it("responsable: avisa al asignarlo, solo vendedores o admins activos, y Operaciones no entra", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const vendedor = await usuario(token, "ventas", "Diego Vendedor");
    const ops = await usuario(token, "operaciones", "Oscar Depósito");

    const o = (await a.post("/oportunidades", { titulo: "Licitación municipal", prospecto: "Municipalidad", monto: 9000000, responsableId: vendedor.id })).json();
    expect(o.responsableNombre).toBe("Diego Vendedor");
    const bandeja = (await api(vendedor.token).get("/notificaciones")).json();
    expect(bandeja.items[0]).toMatchObject({ tipo: "oportunidad_asignada", titulo: "Te asignaron una oportunidad", link: `/oportunidades?id=${o.id}` });
    expect(bandeja.items[0].detalle).toContain("Licitación municipal");

    // Editar sin cambiar de responsable no vuelve a avisar
    await a.put(`/oportunidades/${o.id}`, { titulo: "Licitación municipal 2027", prospecto: "Municipalidad", responsableId: vendedor.id });
    expect((await api(vendedor.token).get("/notificaciones")).json().items).toHaveLength(1);
    // El vendedor se asigna una a sí mismo: sin aviso
    await api(vendedor.token).post("/oportunidades", { titulo: "Propia", prospecto: "X", responsableId: vendedor.id });
    expect((await api(vendedor.token).get("/notificaciones")).json().items).toHaveLength(1);

    // La lista de responsables la ve también Ventas, y no incluye a Operaciones
    const resp = (await api(vendedor.token).get("/oportunidades/responsables")).json();
    expect(resp.map((r: { nombre: string }) => r.nombre)).toContain("Diego Vendedor");
    expect(resp.map((r: { nombre: string }) => r.nombre)).not.toContain("Oscar Depósito");
    expect(Object.keys(resp[0]).sort()).toEqual(["id", "nombre"]);

    const conOps = await a.post("/oportunidades", { titulo: "Mal asignada", prospecto: "Y", responsableId: ops.id });
    expect(conOps.statusCode).toBe(400);
    expect(conOps.json().details).toHaveProperty("responsableId");
    expect((await api(ops.token).get("/oportunidades")).statusCode).toBe(403);
  });
});
