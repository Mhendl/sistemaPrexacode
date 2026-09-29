import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const api = (token: string) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: auth(token) }),
  post: (url: string, payload: unknown = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload: payload as object }),
  put: (url: string, payload: unknown) => app.inject({ method: "PUT", url: `/api${url}`, headers: auth(token), payload: payload as object }),
  patch: (url: string, payload: unknown) => app.inject({ method: "PATCH", url: `/api${url}`, headers: auth(token), payload: payload as object }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: auth(token) }),
});
const login = async (email: string) => (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
async function usuarioCon(a: ReturnType<typeof api>, rol: { rolId?: string; rol?: string }) {
  const email = emailUnico("u");
  const r = await a.post("/usuarios", { nombre: "Empleado", email, password: "clave-segura-123", ...rol });
  expect(r.statusCode, r.body).toBe(201);
  return { id: r.json().id as string, email, token: await login(email) };
}

describe("roles y permisos", () => {
  it("cada empresa arranca con Administrador, Ventas y Operaciones; el catálogo viene por sección", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const roles = (await a.get("/roles")).json();
    expect(roles.map((r: { nombre: string; usuarios: number }) => [r.nombre, r.usuarios])).toEqual([["Administrador", 1], ["Ventas", 0], ["Operaciones", 0]]);
    expect(roles[0]).toMatchObject({ esAdmin: true, prearmado: "admin" });
    const catalogo = (await a.get("/roles/permisos")).json();
    expect(catalogo.map((s: { seccion: string }) => s.seccion)).toContain("Empleados y sueldos");
    // La sesión trae el perfil para armar el menú
    expect((await a.get("/auth/me")).json().usuario).toMatchObject({ rolNombre: "Administrador", esAdmin: true });
  });

  it("un rol a medida (Cajero: solo cobra) hace exactamente lo que se le tildó", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const cliente = (await a.post("/clientes", { razonSocial: "Cliente Caja", cuit: cuitValido(), condicionIva: "Responsable Inscripto" })).json();
    const factura = (await a.post("/comprobantes", { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] })).json();

    const r = await a.post("/roles", { nombre: "Cajero", descripcion: "Solo cobra", permisos: ["cobranzas.cobrar"] });
    expect(r.statusCode).toBe(201);
    expect(r.json().permisos).toEqual(["cobranzas.ver", "cobranzas.cobrar"]); // "ver" se agrega solo
    const cajero = await usuarioCon(a, { rolId: r.json().id });
    const c = api(cajero.token);
    expect((await c.get("/auth/me")).json().usuario).toMatchObject({ rolNombre: "Cajero", esAdmin: false, permisos: ["cobranzas.ver", "cobranzas.cobrar"] });

    expect((await c.get("/cobranzas/resumen")).statusCode).toBe(200);
    expect((await c.post("/recibos", { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 500 }], imputaciones: [{ comprobanteId: factura.id, importe: 500 }] })).statusCode).toBe(201);
    // Lo que no tiene tildado
    expect((await c.post("/comprobantes", { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "X", cantidad: 1, precioUnitario: 1, alicuotaIva: 21 }] })).statusCode).toBe(403);
    expect((await c.get("/reportes/ventas")).statusCode).toBe(403);
    expect((await c.post("/clientes", { razonSocial: "No", cuit: cuitValido(), condicionIva: "Consumidor Final" })).statusCode).toBe(403);
    expect((await c.get("/usuarios")).statusCode).toBe(403);
    const recibo = (await a.get("/recibos")).json()[0];
    expect((await c.post(`/recibos/${recibo.id}/anular`, { motivo: "x" })).statusCode).toBe(403);

    // Cambiar el rol vale en el momento, sin volver a entrar
    await a.put(`/roles/${r.json().id}`, { nombre: "Cajero", permisos: ["cobranzas.cobrar", "cobranzas.anular", "reportes.ver"] });
    expect((await c.get("/reportes/ventas")).statusCode).toBe(200);
    expect((await c.post(`/recibos/${recibo.id}/anular`, { motivo: "Cheque rechazado" })).statusCode).toBe(200);
  });

  it("los permisos también deciden quién recibe cada aviso y quién puede ser responsable de ventas", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const deposito = (await a.post("/roles", { nombre: "Depósito", permisos: ["stock.movimientos"] })).json();
    const mirador = (await a.post("/roles", { nombre: "Solo mira", permisos: ["productos.ver"] })).json();
    const d = await usuarioCon(a, { rolId: deposito.id });
    const m = await usuarioCon(a, { rolId: mirador.id });
    const p = (await a.post("/productos", { codigo: "T1", descripcion: "Tornillo", precio: 10, alicuotaIva: 21, controlaStock: true, stockMinimo: 5, stockInicial: 6 })).json();
    await api(d.token).post(`/productos/${p.id}/movimientos`, { tipo: "egreso", cantidad: 2, motivo: "Venta" });
    const avisos = async (t: string) => ((await api(t).get("/notificaciones")).json().items as { tipo: string }[]).map((x) => x.tipo);
    expect(await avisos(d.token)).toContain("stock_bajo");
    expect(await avisos(m.token)).not.toContain("stock_bajo");

    const vendedor = await usuarioCon(a, { rol: "ventas" });
    const responsables = (await a.get("/oportunidades/responsables")).json().map((r: { id: string }) => r.id);
    expect(responsables).toContain(vendedor.id);
    expect(responsables).not.toContain(d.id);
    expect((await a.post("/oportunidades", { titulo: "Venta", prospecto: "X", responsableId: d.id })).statusCode).toBe(400);
  });

  it("siempre queda un administrador: no se puede suspender ni pasar a otro rol al último; con dos, sí", async () => {
    const { token, usuario } = await registrarEmpresa(app);
    const a = api(token);
    const roles = (await a.get("/roles")).json();
    const ventas = roles.find((r: { prearmado: string }) => r.prearmado === "ventas");
    // A sí mismo no (y es el único)
    expect((await a.patch(`/usuarios/${usuario.id}`, { rolId: ventas.id })).json().error).toContain("No podés quitarte el rol de administrador");

    // Otro administrador: el primero ya no es el único, pero él tampoco puede sacarse; el otro sí puede
    const otro = await usuarioCon(a, { rol: "admin" });
    const b = api(otro.token);
    expect((await b.get("/usuarios")).statusCode).toBe(200); // puede administrar
    expect((await b.patch(`/usuarios/${usuario.id}`, { rolId: ventas.id })).statusCode).toBe(200);
    // Ahora `otro` es el único administrador activo: nadie puede dejarlo sin
    const volver = await b.patch(`/usuarios/${usuario.id}`, { rol: "admin" });
    expect(volver.statusCode).toBe(200);
    expect((await a.patch(`/usuarios/${otro.id}`, { estado: "Suspendido" })).statusCode).toBe(200);
    // Con `otro` suspendido, el primero es el último: no puede pasarse a Ventas ni suspenderse
    expect((await a.patch(`/usuarios/${usuario.id}`, { rolId: ventas.id })).statusCode).toBe(400);
  });

  it("el rol Administrador no se edita ni se borra; un rol con usuarios no se borra; uno vacío sí", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const roles = (await a.get("/roles")).json();
    const admin = roles.find((r: { esAdmin: boolean }) => r.esAdmin);
    expect((await a.put(`/roles/${admin.id}`, { nombre: "Jefe", permisos: [] })).statusCode).toBe(400);
    expect((await a.del(`/roles/${admin.id}`)).statusCode).toBe(400);

    const vend = await a.post("/roles", { nombre: "Vendedor calle", permisos: ["clientes.editar", "presupuestos.editar"] });
    await usuarioCon(a, { rolId: vend.json().id });
    expect((await a.del(`/roles/${vend.json().id}`)).statusCode).toBe(409);
    const vacio = (await a.post("/roles", { nombre: "Temporal", permisos: [] })).json();
    expect((await a.del(`/roles/${vacio.id}`)).statusCode).toBe(204);

    // Nombre repetido, permiso inventado, y roles de otra empresa
    expect((await a.post("/roles", { nombre: "Ventas", permisos: [] })).statusCode).toBe(409);
    expect((await a.post("/roles", { nombre: "Raro", permisos: ["borrar.todo"] })).statusCode).toBe(400);
    const otra = api((await registrarEmpresa(app)).token);
    expect((await otra.post("/usuarios", { nombre: "X", email: emailUnico("x"), password: "clave-segura-123", rolId: vend.json().id })).statusCode).toBe(400);
    expect((await otra.put(`/roles/${vend.json().id}`, { nombre: "Mío", permisos: [] })).statusCode).toBe(404);
  });

  it("solo el administrador ve y maneja los roles, aunque otro tenga 'configuración'", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const conf = (await a.post("/roles", { nombre: "Encargado", permisos: ["configuracion"] })).json();
    const e = await usuarioCon(a, { rolId: conf.id });
    expect((await api(e.token).get("/roles")).statusCode).toBe(403);
    expect((await api(e.token).get("/usuarios")).statusCode).toBe(403);
    expect((await api(e.token).put("/empresa", { razonSocial: "Nueva Razón S.A.", condicionIva: "Responsable Inscripto" })).statusCode).toBe(200);
    expect((await api(e.token).post("/suscripcion/pagar", { periodo: "mensual" })).statusCode).toBe(403);
  });
});
