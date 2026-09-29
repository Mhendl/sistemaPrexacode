/**
 * Carga masiva: importar planillas completas o parciales (solo stock, solo precios),
 * aumentar precios por porcentaje y editar muchos productos o clientes de una vez.
 */
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
  post: (url: string, payload: unknown) => app.inject({ method: "POST", url: `/api${url}`, headers: auth(token), payload: payload as object }),
});
const producto = (codigo: string, extra: Record<string, unknown> = {}) => ({ codigo, descripcion: `Producto ${codigo}`, precio: 1000, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial: 10, ...extra });

async function empresaConCatalogo() {
  const { token } = await registrarEmpresa(app);
  const a = api(token);
  const ids: Record<string, string> = {};
  for (const [c, extra] of [
    ["RESMA", { categoria: "Librería", precio: 8950.5 }],
    ["TONER", { categoria: "Insumos", precio: 45000 }],
    ["BIROME", { categoria: "Librería", precio: 350 }],
    ["SOPORTE", { controlaStock: false, stockInicial: 0, precio: 20000 }],
    ["VIEJO", { activo: false, precio: 100 }],
  ] as const) {
    const r = await a.post("/productos", producto(c, extra));
    expect(r.statusCode, r.body).toBe(201);
    ids[c] = r.json().id;
  }
  if (ids.VIEJO) await app.inject({ method: "PUT", url: `/api/productos/${ids.VIEJO}`, headers: auth(token), payload: { ...producto("VIEJO"), stockInicial: undefined, precio: 100, activo: false } });
  return { token, a, ids };
}
const prod = async (a: ReturnType<typeof api>, id: string) => (await a.get(`/productos/${id}`)).json();

describe("planillas parciales: actualizar solo lo que trae el archivo", () => {
  it("un inventario (Código + Stock) corrige el stock, deja el resto igual y queda en el historial", async () => {
    const { a, ids } = await empresaConCatalogo();
    const filas = [
      { codigo: "RESMA", stock: 37 },
      { codigo: "TONER", stock: 10 }, // igual: no genera movimiento
      { codigo: "NUEVO-SIN-DATOS", stock: 5 }, // no existe: faltan datos para crearlo
    ];
    const vista = (await a.post("/importar/productos", { filas, siExiste: "actualizar", simular: true })).json();
    expect(vista).toMatchObject({ crear: 0, actualizar: 2 });
    expect(vista.errores).toEqual([{ fila: 4, errores: expect.objectContaining({ descripcion: expect.stringContaining("Producto nuevo") }) }]);

    const r = (await a.post("/importar/productos", { filas, siExiste: "actualizar", simular: false })).json();
    expect(r).toMatchObject({ aplicado: true, actualizar: 2 });
    expect(await prod(a, ids.RESMA!)).toMatchObject({ stock: 37, precio: 8950.5, categoria: "Librería", descripcion: "Producto RESMA", controlaStock: true });
    const movs = (await a.get(`/productos/${ids.RESMA}/movimientos`)).json();
    expect(movs[0]).toMatchObject({ tipo: "ajuste", cantidad: 27, stockResultante: 37, motivo: "Importación: corrección de stock" });
    expect((await a.get(`/productos/${ids.TONER}/movimientos`)).json().filter((m: { tipo: string }) => m.tipo === "ajuste")).toHaveLength(0);
  });

  it("una lista de precios (Código + Precio) cambia solo el precio; un servicio sigue siendo servicio", async () => {
    const { a, ids } = await empresaConCatalogo();
    const r = (await a.post("/importar/productos", { filas: [{ codigo: "BIROME", precio: 420 }, { codigo: "SOPORTE", precio: 25000 }], siExiste: "actualizar", simular: false })).json();
    expect(r).toMatchObject({ actualizar: 2, errores: [] });
    expect(await prod(a, ids.BIROME!)).toMatchObject({ precio: 420, stock: 10, categoria: "Librería" });
    expect(await prod(a, ids.SOPORTE!)).toMatchObject({ precio: 25000, controlaStock: false, stock: 0 });
  });

  it("con 'dejarlos como están', una planilla parcial no toca nada", async () => {
    const { a, ids } = await empresaConCatalogo();
    const r = (await a.post("/importar/productos", { filas: [{ codigo: "RESMA", stock: 1 }], siExiste: "omitir", simular: false })).json();
    expect(r).toMatchObject({ omitir: 0, crear: 0 });
    expect(r.errores).toHaveLength(1); // sin descripción no se puede crear, y existente no se actualiza
    expect((await prod(a, ids.RESMA!)).stock).toBe(10);
  });

  it("clientes: CUIT + Email actualiza el email y nada más", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const cuit = cuitValido();
    const c = (await a.post("/clientes", { razonSocial: "Ferretería Ñandú S.R.L.", cuit, condicionIva: "Responsable Inscripto", telefono: "11 4444-5555", localidad: "Morón" })).json();
    const r = (await a.post("/importar/clientes", { filas: [{ cuit: `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`, email: "compras@nandu.com.ar" }], siExiste: "actualizar", simular: false })).json();
    expect(r).toMatchObject({ actualizar: 1, errores: [] });
    expect((await a.get(`/clientes/${c.id}`)).json()).toMatchObject({ razonSocial: "Ferretería Ñandú S.R.L.", email: "compras@nandu.com.ar", telefono: "11 4444-5555", localidad: "Morón", condicionIva: "Responsable Inscripto" });
  });

  it("5.000 productos de una vez (el máximo por archivo), y 5.001 se rechaza", async () => {
    const { a } = await empresaConCatalogo();
    const filas = Array.from({ length: 5000 }, (_, i) => ({ codigo: `M-${i}`, descripcion: `Artículo masivo ${i}`, precio: 100 + i, alicuotaIva: 21, controlaStock: true, stock: i % 50 }));
    const t0 = Date.now();
    const r = (await a.post("/importar/productos", { filas, siExiste: "omitir", simular: false })).json();
    expect(r).toMatchObject({ crear: 5000, errores: [], aplicado: true });
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect((await a.get("/productos")).json().length).toBe(5005);
    const demasiadas = await a.post("/importar/productos", { filas: [...filas, filas[0]], siExiste: "omitir", simular: true });
    expect(demasiadas.statusCode).toBe(400);
  }, 120_000);
});

describe("aumento de precios por porcentaje", () => {
  it("vista previa sin cambiar nada, después aplica a todos los activos con redondeo", async () => {
    const { a, ids } = await empresaConCatalogo();
    const vista = (await a.post("/productos/actualizar-precios", { porcentaje: 10, redondeo: 10, simular: true })).json();
    expect(vista).toMatchObject({ productos: 4, cambian: 4, aplicado: false }); // el inactivo no
    expect(vista.ejemplos.find((e: { codigo: string }) => e.codigo === "RESMA")).toMatchObject({ antes: 8950.5, despues: 9850 });
    expect((await prod(a, ids.RESMA!)).precio).toBe(8950.5);

    expect((await a.post("/productos/actualizar-precios", { porcentaje: 10, redondeo: 10 })).json()).toMatchObject({ cambian: 4, aplicado: true });
    expect((await prod(a, ids.RESMA!)).precio).toBe(9850); // 9845,55 → de a $ 10
    expect((await prod(a, ids.BIROME!)).precio).toBe(390); // 385 → 390
    expect((await prod(a, ids.VIEJO!)).precio).toBe(100);
  });

  it("solo una categoría, o solo los elegidos; bajar también; con centavos", async () => {
    const { a, ids } = await empresaConCatalogo();
    await a.post("/productos/actualizar-precios", { porcentaje: 8, categoria: "Librería" });
    expect((await prod(a, ids.RESMA!)).precio).toBe(9666.54);
    expect((await prod(a, ids.TONER!)).precio).toBe(45000);
    await a.post("/productos/actualizar-precios", { porcentaje: -5, ids: [ids.TONER, ids.VIEJO] });
    expect((await prod(a, ids.TONER!)).precio).toBe(42750);
    expect((await prod(a, ids.VIEJO!)).precio).toBe(95); // elegido a mano: aunque esté inactivo
  });

  it("valida el porcentaje y no toca productos de otra empresa", async () => {
    const { a, ids } = await empresaConCatalogo();
    for (const porcentaje of [0, -95, 2000, "abc", null]) {
      expect((await a.post("/productos/actualizar-precios", { porcentaje })).statusCode, String(porcentaje)).toBe(400);
    }
    const otra = api((await registrarEmpresa(app)).token);
    const r = (await otra.post("/productos/actualizar-precios", { porcentaje: 50, ids: [ids.RESMA] })).json();
    expect(r).toMatchObject({ productos: 0, cambian: 0 });
    expect((await prod(a, ids.RESMA!)).precio).toBe(8950.5);
  });
});

describe("editar muchos de una vez", () => {
  it("productos: categoría, IVA, stock mínimo y activo a los elegidos", async () => {
    const { a, ids } = await empresaConCatalogo();
    const r = await a.post("/productos/masivo", { ids: [ids.RESMA, ids.BIROME], cambios: { categoria: "Oficina", alicuotaIva: 10.5, stockMinimo: 5 } });
    expect(r.json()).toEqual({ actualizados: 2 });
    expect(await prod(a, ids.RESMA!)).toMatchObject({ categoria: "Oficina", alicuotaIva: 10.5, stockMinimo: 5, precio: 8950.5, stock: 10 });
    expect(await prod(a, ids.TONER!)).toMatchObject({ categoria: "Insumos", alicuotaIva: 21 });
    await a.post("/productos/masivo", { ids: [ids.TONER], cambios: { activo: false, categoria: "" } });
    expect(await prod(a, ids.TONER!)).toMatchObject({ activo: false, categoria: null });
  });

  it("productos: sin cambios, IVA raro o ids de otra empresa no hacen nada", async () => {
    const { a, ids } = await empresaConCatalogo();
    expect((await a.post("/productos/masivo", { ids: [ids.RESMA], cambios: {} })).json().error).toBe("Revisá los datos ingresados");
    expect((await a.post("/productos/masivo", { ids: [ids.RESMA], cambios: { alicuotaIva: 19 } })).statusCode).toBe(400);
    expect((await a.post("/productos/masivo", { ids: [], cambios: { activo: false } })).statusCode).toBe(400);
    const otra = api((await registrarEmpresa(app)).token);
    expect((await otra.post("/productos/masivo", { ids: [ids.RESMA], cambios: { activo: false } })).json()).toEqual({ actualizados: 0 });
    expect((await prod(a, ids.RESMA!)).activo).toBe(true);
  });

  it("clientes: rubro, localidad y estado; el depósito no puede", async () => {
    const { token } = await registrarEmpresa(app);
    const a = api(token);
    const c1 = (await a.post("/clientes", { razonSocial: "Uno", cuit: cuitValido(), condicionIva: "Responsable Inscripto", rubro: "Ferretería" })).json();
    const c2 = (await a.post("/clientes", { razonSocial: "Dos", cuit: cuitValido(), condicionIva: "Monotributista" })).json();
    expect((await a.post("/clientes/masivo", { ids: [c1.id, c2.id], cambios: { localidad: "Rosario", estado: "Inactivo" } })).json()).toEqual({ actualizados: 2 });
    expect((await a.get(`/clientes/${c1.id}`)).json()).toMatchObject({ localidad: "Rosario", estado: "Inactivo", rubro: "Ferretería", razonSocial: "Uno" });

    const email = emailUnico("dep");
    await a.post("/usuarios", { nombre: "Depósito", email, rol: "operaciones", password: "clave-segura-123" });
    const dep = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await api(dep).post("/clientes/masivo", { ids: [c1.id], cambios: { estado: "Activo" } })).statusCode).toBe(403);
    expect((await api(dep).post("/productos/actualizar-precios", { porcentaje: 5 })).statusCode).toBe(200); // operaciones sí maneja productos
  });
});
