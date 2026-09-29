import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aceptacionesTerminos, suscripciones } from "../src/db/schema.js";
import { TERMINOS_VERSION } from "../src/lib/legal.js";
import { sumarDias } from "../src/lib/suscripcion.js";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

let app: TestApp;
let cerrar: () => Promise<void>;
const ADMIN = "duenio@prexacode.com.ar";
const CLAVE_ADMIN = "clave-del-panel-2026";

beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ adminInicial: { email: ADMIN, password: CLAVE_ADMIN }, cotizacion: async () => 1000 }));
});
afterAll(() => cerrar());

const api = (t: string | null) => ({
  get: (url: string) => app.inject({ method: "GET", url: `/api${url}`, headers: t ? auth(t) : {} }),
  post: (url: string, payload: object = {}) => app.inject({ method: "POST", url: `/api${url}`, headers: t ? auth(t) : {}, payload }),
  put: (url: string, payload: object) => app.inject({ method: "PUT", url: `/api${url}`, headers: t ? auth(t) : {}, payload }),
  patch: (url: string, payload: object) => app.inject({ method: "PATCH", url: `/api${url}`, headers: t ? auth(t) : {}, payload }),
  del: (url: string) => app.inject({ method: "DELETE", url: `/api${url}`, headers: t ? auth(t) : {} }),
});

/** Sesión del panel de administración (usuario y contraseña propios, separados de las empresas) */
async function duenio() {
  const r = await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: CLAVE_ADMIN } });
  expect(r.statusCode, r.body).toBe(200);
  return r.json().token as string;
}

describe("términos y condiciones", () => {
  it("al registrarse queda aceptada la versión vigente, con IP y navegador", async () => {
    const { token, empresaId } = await registrarEmpresa(app);
    expect((await api(token).get("/legal/estado")).json()).toMatchObject({ version: TERMINOS_VERSION, aceptada: true });
    const [a] = await app.db.select().from(aceptacionesTerminos).where(eq(aceptacionesTerminos.empresaId, empresaId));
    expect(a).toMatchObject({ version: TERMINOS_VERSION, ip: "127.0.0.1" });
    expect((await api(null).get("/legal")).json()).toEqual({ version: TERMINOS_VERSION });
  });

  it("si cambian los términos, el administrador tiene que aceptarlos de nuevo", async () => {
    const { token, empresaId } = await registrarEmpresa(app);
    await app.db.update(aceptacionesTerminos).set({ version: "2020-01-01" }).where(eq(aceptacionesTerminos.empresaId, empresaId));
    expect((await api(token).get("/legal/estado")).json()).toMatchObject({ aceptada: false, versionAnterior: "2020-01-01" });

    const email = emailUnico("v");
    await api(token).post("/usuarios", { nombre: "Vendedor", email, rol: "ventas", password: "clave-segura-123" });
    const v = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await api(v).post("/legal/aceptar")).statusCode).toBe(403);

    const r = await app.inject({ method: "POST", url: "/api/legal/aceptar", headers: { ...auth(token), "user-agent": "Navegador de prueba", "x-forwarded-for": "200.1.2.3" } });
    expect(r.json()).toMatchObject({ aceptada: true });
    const filas = await app.db.select().from(aceptacionesTerminos).where(eq(aceptacionesTerminos.empresaId, empresaId));
    expect(filas.find((f) => f.version === TERMINOS_VERSION)).toMatchObject({ ip: "200.1.2.3", userAgent: "Navegador de prueba" });
    expect((await api(token).get("/legal/estado")).json().aceptada).toBe(true);
  });

  it("botón de baja y botón de arrepentimiento públicos: devuelven código de constancia", async () => {
    const { token } = await registrarEmpresa(app);
    const cuit = (await api(token).get("/empresa")).json().cuit;
    const baja = await api(null).post("/legal/solicitud", { tipo: "baja", nombre: "Ana Pérez", email: "ana@empresa.com", cuit: `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`, motivo: "Cerramos el local" });
    expect(baja.statusCode).toBe(201);
    expect(baja.json().codigo).toMatch(/^BAJA-[A-Z0-9]{8}$/);
    const arr = await api(null).post("/legal/solicitud", { tipo: "arrepentimiento", nombre: "Juan", email: "juan@x.com" });
    expect(arr.json().codigo).toMatch(/^ARRE-[A-Z0-9]{8}$/);
    const mal = await api(null).post("/legal/solicitud", { tipo: "baja", nombre: "J", email: "no-es-email" });
    expect(mal.statusCode).toBe(400);
    expect(Object.keys(mal.json().details).sort()).toEqual(["email", "nombre"]);
  });

  it("baja desde la app: código, acceso hasta el vencimiento, se puede anular, y pagar la anula", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const b = (await a.post("/suscripcion/baja", { motivo: "Muy caro" })).json();
    expect(b.codigo).toMatch(/^BAJA-/);
    expect(b.accesoHasta).toBe(sumarDias(hoy(), 14));
    // Repetir devuelve el mismo código
    expect((await a.post("/suscripcion/baja")).json().codigo).toBe(b.codigo);
    expect((await a.get("/suscripcion")).json()).toMatchObject({ bajaCodigo: b.codigo, estado: "Prueba" });

    expect((await a.del("/suscripcion/baja")).statusCode).toBe(204);
    expect((await a.get("/suscripcion")).json()).toMatchObject({ bajaCodigo: null, bajaSolicitadaEn: null });

    await a.post("/suscripcion/baja");
    const p = (await a.post("/suscripcion/pagar")).json();
    await a.post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" });
    expect((await a.get("/suscripcion")).json()).toMatchObject({ estado: "Activa", bajaCodigo: null });
  });

  it("límite de intentos en el login y en los formularios públicos", async () => {
    const conLimite = await crearApp({ limitarIntentos: true });
    try {
      const { email } = await registrarEmpresa(conLimite.app);
      const intentar = () => conLimite.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "incorrecta-123" } });
      for (let i = 0; i < 10; i++) expect((await intentar()).statusCode).toBe(401);
      const bloqueado = await intentar();
      expect(bloqueado.statusCode).toBe(429);
      expect(bloqueado.json().error).toContain("Demasiados intentos");
      // Ni con la contraseña correcta, hasta que pase el tiempo
      expect((await conLimite.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).statusCode).toBe(429);

      for (let i = 0; i < 5; i++) await conLimite.app.inject({ method: "POST", url: "/api/legal/solicitud", payload: { tipo: "baja", nombre: "Spam", email: "spam@x.com" } });
      expect((await conLimite.app.inject({ method: "POST", url: "/api/legal/solicitud", payload: { tipo: "baja", nombre: "Spam", email: "spam@x.com" } })).statusCode).toBe(429);
    } finally {
      await conLimite.cerrar();
    }
  });
});

describe("panel de la plataforma", () => {
  it("entrada propia al panel: usuario y contraseña, y los tokens no se cruzan con los de las empresas", async () => {
    // Login del panel
    expect((await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: ADMIN, password: "incorrecta" } })).statusCode).toBe(401);
    const t = await duenio();
    expect((await api(t).get("/admin/me")).json()).toMatchObject({ email: ADMIN, activo: true });
    expect((await api(t).get("/admin/me")).json()).not.toHaveProperty("passwordHash");
    expect((await api(t).get("/plataforma/resumen")).statusCode).toBe(200);

    // Un usuario de una empresa (aunque sea administrador de su empresa) no entra al panel…
    const { token } = await registrarEmpresa(app);
    expect((await api(token).get("/plataforma/resumen")).statusCode).toBe(401);
    expect((await api(token).get("/admin/me")).statusCode).toBe(401);
    // …con su email y contraseña tampoco
    expect((await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "admin@x.com", password: "clave-segura-123" } })).statusCode).toBe(401);
    // …y el token del panel no sirve para operar dentro de una empresa
    expect((await api(t).get("/clientes")).statusCode).toBe(401);
    expect((await api(t).post("/clientes", { razonSocial: "Colado", cuit: cuitValido("30"), condicionIva: "Monotributista" })).statusCode).toBe(401);
    expect((await api(null).get("/plataforma/empresas")).statusCode).toBe(401);
  });

  it("administradores: crear otro, cambiar la contraseña y desactivar", async () => {
    const t = await duenio();
    const nuevo = await api(t).post("/admin/administradores", { nombre: "Socia", email: "socia@prexacode.com.ar", password: "clave-de-la-socia-1" });
    expect(nuevo.statusCode).toBe(201);
    expect((await api(t).post("/admin/administradores", { nombre: "Otra", email: "socia@prexacode.com.ar", password: "clave-de-la-socia-1" })).statusCode).toBe(409);
    const ts = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "socia@prexacode.com.ar", password: "clave-de-la-socia-1" } })).json().token;
    expect((await api(ts).get("/plataforma/empresas")).statusCode).toBe(200);

    // Cambiar contraseña: exige la actual
    expect((await api(ts).post("/admin/password", { actual: "mal", nueva: "otra-clave-larga-2" })).statusCode).toBe(400);
    expect((await api(ts).post("/admin/password", { actual: "clave-de-la-socia-1", nueva: "otra-clave-larga-2" })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "socia@prexacode.com.ar", password: "clave-de-la-socia-1" } })).statusCode).toBe(401);

    // Desactivada: su sesión deja de servir; a uno mismo no se puede
    expect((await api(t).patch(`/admin/administradores/${nuevo.json().id}`, { activo: false })).statusCode).toBe(200);
    expect((await api(ts).get("/plataforma/empresas")).statusCode).toBe(401);
    const yo = (await api(t).get("/admin/me")).json();
    expect((await api(t).patch(`/admin/administradores/${yo.id}`, { activo: false })).statusCode).toBe(403);
  });

  it("el primer administrador se crea solo una vez", async () => {
    const otra = await crearApp({ adminInicial: { email: "uno@x.com", password: "primera-clave-123" } });
    try {
      const { crearAdminInicial } = await import("../src/routes/admin.js");
      expect(await crearAdminInicial(otra.app.db, "dos@x.com", "segunda-clave-123")).toBe(false);
      expect((await otra.app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "dos@x.com", password: "segunda-clave-123" } })).statusCode).toBe(401);
      expect((await otra.app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "uno@x.com", password: "primera-clave-123" } })).statusCode).toBe(200);
    } finally {
      await otra.cerrar();
    }
  });

  it("lista de empresas con estado, uso y actividad; resumen con lo que se cobra por mes", async () => {
    const t = await duenio();
    const cliente = await registrarEmpresa(app, "Ferretería Monitoreada S.A.");
    await api(cliente.token).post("/clientes", { razonSocial: "Cliente X", cuit: cuitValido("30"), condicionIva: "Monotributista" });
    await api(cliente.token).post("/comprobantes", { clienteId: (await api(cliente.token).get("/clientes")).json()[0].id, items: [{ descripcion: "Algo", cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }] });

    const lista = (await api(t).get("/plataforma/empresas")).json();
    const e = lista.find((x: { razonSocial: string }) => x.razonSocial === "Ferretería Monitoreada S.A.");
    expect(e).toMatchObject({ plan: "profesional", estado: "Prueba", diasRestantes: 14, usuariosActivos: 1, comprobantes: 1, suspendida: false, admin: { nombre: "Admin Prueba" } });
    expect(e.ultimoAcceso).toBeTruthy();

    const antes = (await api(t).get("/plataforma/resumen")).json();
    const p = (await api(cliente.token).post("/suscripcion/pagar", { periodo: "anual" })).json();
    await api(cliente.token).post(`/suscripcion/pagos/${p.referencia}/simular`, { resultado: "Aprobado" });
    const despues = (await api(t).get("/plataforma/resumen")).json();
    expect(despues.porEstado.Activa).toBe(antes.porEstado.Activa + 1);
    expect(despues.mrrUsd).toBeCloseTo(antes.mrrUsd + 750 / 12, 2); // anual: 10 meses de USD 75, repartido en 12
    expect(despues.cobrado30Dias.ars).toBe(antes.cobrado30Dias.ars + 750000);
  });

  it("extender, registrar un pago por transferencia y cambiar el plan quedan en la auditoría", async () => {
    const t = await duenio();
    const c = await registrarEmpresa(app);
    const pl = api(t);
    const ext = (await pl.post(`/plataforma/empresas/${c.empresaId}/extender`, { dias: 16, nota: "Demo extendida" })).json();
    expect(ext).toMatchObject({ estado: "Prueba", vence: sumarDias(hoy(), 30) });

    const pago = await pl.post(`/plataforma/empresas/${c.empresaId}/pago-manual`, { periodo: "mensual", importeArs: 60000, nota: "Transferencia Banco Nación" });
    expect(pago.statusCode).toBe(201);
    expect(pago.json()).toMatchObject({ estado: "Aprobado", proveedor: "manual", desde: sumarDias(hoy(), 31), importeArs: 60000 });
    expect((await api(c.token).get("/suscripcion")).json()).toMatchObject({ estado: "Activa" });

    await pl.put(`/plataforma/empresas/${c.empresaId}/plan`, { plan: "empresa", usuariosAdicionales: 3 });
    const d = (await pl.get(`/plataforma/empresas/${c.empresaId}`)).json();
    expect(d.suscripcion).toMatchObject({ plan: "empresa", usuariosAdicionales: 3, estado: "Activa" });
    expect(d.auditoria.map((x: { accion: string }) => x.accion)).toEqual(["cambiar-plan", "pago-manual", "extender"]);
    expect(d.auditoria[2]).toMatchObject({ adminEmail: ADMIN, detalle: { dias: 16, nota: "Demo extendida" } });
    expect(d.aceptaciones[0]).toMatchObject({ version: TERMINOS_VERSION });
    expect(d.usuarios).toHaveLength(1);
    expect(d.usuarios[0]).not.toHaveProperty("passwordHash");
  });

  it("extender una suscripción vencida arranca desde hoy", async () => {
    const t = await duenio();
    const c = await registrarEmpresa(app);
    await api(c.token).get("/suscripcion");
    await app.db.update(suscripciones).set({ pruebaHasta: "2020-01-01" }).where(eq(suscripciones.empresaId, c.empresaId));
    expect((await api(c.token).post("/clientes", { razonSocial: "Cliente Y", cuit: cuitValido("30"), condicionIva: "Monotributista" })).statusCode).toBe(402);
    expect((await api(t).post(`/plataforma/empresas/${c.empresaId}/extender`, { dias: 7 })).json()).toMatchObject({ estado: "Prueba", vence: sumarDias(hoy(), 7) });
    expect((await api(c.token).post("/clientes", { razonSocial: "Cliente Y", cuit: cuitValido("30"), condicionIva: "Monotributista" })).statusCode).toBe(201);
  });

  it("suspender una empresa: nadie de ella puede entrar ni usar la API; reactivar la devuelve", async () => {
    const t = await duenio();
    const c = await registrarEmpresa(app);
    expect((await api(t).post(`/plataforma/empresas/${c.empresaId}/suspender`, { motivo: "x" })).statusCode).toBe(400);
    expect((await api(t).post(`/plataforma/empresas/${c.empresaId}/suspender`, { motivo: "Uso fraudulento de la facturación" })).json()).toEqual({ suspendida: true });

    const me = await api(c.token).get("/auth/me");
    expect(me.statusCode).toBe(403);
    expect(me.json().code).toBe("EMPRESA_SUSPENDIDA");
    expect((await api(c.token).get("/clientes")).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: c.email, password: "clave-segura-123" } })).json().code).toBe("EMPRESA_SUSPENDIDA");
    expect((await api(t).get("/plataforma/empresas")).json().find((e: { id: string }) => e.id === c.empresaId).suspendida).toBe(true);

    await api(t).post(`/plataforma/empresas/${c.empresaId}/reactivar`);
    expect((await api(c.token).get("/clientes")).statusCode).toBe(200);
  });

  it("solicitudes de baja y arrepentimiento: se listan y se resuelven con nota", async () => {
    const t = await duenio();
    const s = (await api(null).post("/legal/solicitud", { tipo: "arrepentimiento", nombre: "Carla", email: "carla@x.com", motivo: "Me equivoqué de plan" })).json();
    const pendientes = (await api(t).get("/plataforma/solicitudes?estado=Pendiente")).json();
    const sol = pendientes.find((x: { codigo: string }) => x.codigo === s.codigo);
    expect(sol).toMatchObject({ tipo: "arrepentimiento", nombre: "Carla", estado: "Pendiente" });
    expect((await api(t).get("/plataforma/resumen")).json().solicitudesPendientes).toBeGreaterThan(0);
    const r = (await api(t).post(`/plataforma/solicitudes/${sol.id}/resolver`, { nota: "Reintegrado por Mercado Pago el mismo día" })).json();
    expect(r).toMatchObject({ estado: "Resuelta", nota: "Reintegrado por Mercado Pago el mismo día" });
    expect((await api(t).get("/plataforma/solicitudes?estado=Pendiente")).json().some((x: { codigo: string }) => x.codigo === s.codigo)).toBe(false);
  });
});
