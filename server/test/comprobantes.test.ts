import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorArca, type ConectorArca } from "../src/lib/arca/cliente.js";
import { crearSimulador } from "../src/lib/arca/simulador.js";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
/** Permite forzar un rechazo o una caída de ARCA en una prueba puntual */
let falla: null | "rechazo" | "caida" = null;

beforeAll(async () => {
  ({ app, cerrar } = await crearApp({
    conectorArca: (empresa) => {
      const sim = crearSimulador(empresa.cuit);
      const conector: ConectorArca = {
        modo: "simulado",
        ultimoAutorizado: (pv, t) => sim.ultimoAutorizado(pv, t),
        solicitarCae: async (s) => {
          if (falla === "caida") throw new ErrorArca("tiempo de espera agotado");
          if (falla === "rechazo") return { resultado: "R", errores: [{ codigo: 10015, mensaje: "El documento del receptor no es válido" }], observaciones: [] };
          return sim.solicitarCae(s);
        },
      };
      return conector;
    },
  }));
});
afterAll(() => cerrar());

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function preparar(condicionEmisor = "Responsable Inscripto") {
  const { token, empresa } = await registrarEmpresa(app, "Emisor S.A.", condicionEmisor);
  const cliente = async (condicionIva: string) =>
    (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: { razonSocial: `Cliente ${condicionIva}`, cuit: cuitValido("30"), condicionIva, domicilio: "Av. Siempre Viva 742", localidad: "CABA" } })).json();
  let n = 0;
  const producto = async (extra: Record<string, unknown>) =>
    (await app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: { codigo: `F-${++n}`, descripcion: `Producto ${n}`, precio: 1000, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial: 10, ...extra } })).json();
  return { token, empresa, cliente, producto };
}

const emitir = (token: string, body: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: body });
const stock = async (token: string, id: string) => (await app.inject({ method: "GET", url: `/api/productos/${id}`, headers: auth(token) })).json().stock;

describe("facturas", () => {
  it("Factura A a un Responsable Inscripto: IVA discriminado, CAE, número 1 y descuenta stock", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const notebook = await producto({ precio: 1089000, alicuotaIva: 10.5 });
    const res = await emitir(token, { clienteId: ri.id, condicionVenta: "Cuenta corriente", items: [{ productoId: notebook.id, cantidad: 2 }, { descripcion: "Envío", cantidad: 1, precioUnitario: 12500, alicuotaIva: 21 }] });
    expect(res.statusCode).toBe(201);
    const f = res.json();
    expect(f).toMatchObject({ tipo: "Factura A", letra: "A", tipoCbte: 1, numero: 1, estado: "Autorizado", modo: "simulado", neto: 2190500, totalIva: 231315, total: 2421815, concepto: 3 });
    expect(f.cae).toMatch(/^\d{14}$/);
    expect(f.vencimiento > f.fecha).toBe(true); // cuenta corriente: vence a 30 días
    expect(await stock(token, notebook.id)).toBe(8);
    const movs = (await app.inject({ method: "GET", url: `/api/productos/${notebook.id}/movimientos`, headers: auth(token) })).json();
    expect(movs[0].motivo).toBe("Factura A 0001-00000001 · Cliente Responsable Inscripto");
  });

  it("Factura B a consumidor final y C cuando el emisor es monotributista", async () => {
    const ri = await preparar();
    const cf = await ri.cliente("Consumidor Final");
    const p = await ri.producto({});
    expect((await emitir(ri.token, { clienteId: cf.id, items: [{ productoId: p.id, cantidad: 1 }] })).json()).toMatchObject({ tipo: "Factura B", tipoCbte: 6, total: 1210 });

    const mono = await preparar("Monotributista");
    const cliente = await mono.cliente("Responsable Inscripto");
    const q = await mono.producto({});
    expect((await emitir(mono.token, { clienteId: cliente.id, items: [{ productoId: q.id, cantidad: 1 }] })).json()).toMatchObject({ tipo: "Factura C", tipoCbte: 11, totalIva: 0, total: 1000 });
  });

  it("cada tipo numera por separado y varias facturas simultáneas no repiten número", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const cf = await cliente("Consumidor Final");
    const p = await producto({ stockInicial: 100 });
    const aes = await Promise.all(Array.from({ length: 5 }, () => emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })));
    expect(aes.map((r) => r.json().numero).sort()).toEqual([1, 2, 3, 4, 5]);
    expect((await emitir(token, { clienteId: cf.id, items: [{ productoId: p.id, cantidad: 1 }] })).json()).toMatchObject({ tipo: "Factura B", numero: 1 });
    expect(await stock(token, p.id)).toBe(94);
  });

  it("servicios: concepto 2, con fechas de servicio y sin tocar stock", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const hora = await producto({ controlaStock: false, precio: 32000 });
    const f = (await emitir(token, { clienteId: ri.id, condicionVenta: "Cuenta corriente", items: [{ productoId: hora.id, cantidad: 3 }] })).json();
    expect(f).toMatchObject({ concepto: 2, fechaServicioDesde: hoy(), fechaServicioHasta: hoy(), descontoStock: false });
  });

  it("sin stock no se emite (ni se consume número); sin descontar stock sí", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({ stockInicial: 2 });
    const res = await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 5 }] });
    expect(res.statusCode).toBe(409);
    expect(res.json().details).toEqual({ "items.0.cantidad": "Stock insuficiente: hay 2 u." });

    const ok = (await emitir(token, { clienteId: ri.id, moverStock: false, items: [{ productoId: p.id, cantidad: 5 }] })).json();
    expect(ok).toMatchObject({ numero: 1, descontoStock: false });
    expect(await stock(token, p.id)).toBe(2);
  });

  it("valida fecha, ítems y precios propios", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    const vieja = await emitir(token, { clienteId: ri.id, fecha: "2020-01-01", items: [{ productoId: p.id, cantidad: 1 }] });
    expect(vieja.json().details.fecha).toBe("Fecha fuera de rango");
    expect((await emitir(token, { clienteId: ri.id, items: [{ cantidad: 1 }] })).json().details["items.0.descripcion"]).toMatch(/Elegí un producto/);
    // Precio y bonificación distintos a la lista
    const f = (await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 2, precioUnitario: 800, bonificacion: 10 }] })).json();
    expect(f).toMatchObject({ neto: 1440, totalIva: 302.4, total: 1742.4 });
  });

  it("si ARCA rechaza, queda registrado como Rechazado con el motivo y no toca stock", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    falla = "rechazo";
    try {
      const r = (await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })).json();
      expect(r).toMatchObject({ estado: "Rechazado", numero: null, cae: null, errores: [{ codigo: 10015, mensaje: "El documento del receptor no es válido" }] });
    } finally {
      falla = null;
    }
    expect(await stock(token, p.id)).toBe(10);
    // El siguiente sale con el número 1 (el rechazado no consumió número)
    expect((await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })).json().numero).toBe(1);
  });

  it("si ARCA no responde, no se guarda nada y avisa que se puede reintentar", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    falla = "caida";
    try {
      const res = await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toMatch(/No se pudo conectar con ARCA.*No se emitió ningún comprobante/);
    } finally {
      falla = null;
    }
    expect((await app.inject({ method: "GET", url: "/api/comprobantes", headers: auth(token) })).json()).toHaveLength(0);
    expect(await stock(token, p.id)).toBe(10);
  });

  it("el QR lleva los datos que pide ARCA", async () => {
    const { token, empresa, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    const f = (await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })).json();
    const det = (await app.inject({ method: "GET", url: `/api/comprobantes/${f.id}`, headers: auth(token) })).json();
    expect(det.qr).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
    const datos = JSON.parse(Buffer.from(det.qr.split("?p=")[1], "base64").toString());
    expect(datos).toMatchObject({ ver: 1, cuit: Number(empresa.cuit), ptoVta: 1, tipoCmp: 1, nroCmp: 1, importe: 1210, moneda: "PES", tipoDocRec: 80, nroDocRec: Number(ri.cuit), tipoCodAut: "E", codAut: Number(f.cae) });
    expect(det.items).toHaveLength(1);
  });
});

describe("notas de crédito", () => {
  it("ajusta una factura, devuelve stock y no deja pasarse del total", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    const f = (await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 3 }] })).json();
    expect(await stock(token, p.id)).toBe(7);

    const nc = (await emitir(token, { clase: "nota_credito", asociadoId: f.id, clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })).json();
    expect(nc).toMatchObject({ tipo: "Nota de crédito A", tipoCbte: 3, numero: 1, total: 1210, asociadoId: f.id });
    expect(await stock(token, p.id)).toBe(8);

    // Quedan $ 2.420: una NC por 3 unidades más se pasa
    const pasada = await emitir(token, { clase: "nota_credito", asociadoId: f.id, clienteId: ri.id, items: [{ productoId: p.id, cantidad: 3 }] });
    expect(pasada.statusCode).toBe(400);
    expect(pasada.json().error).toMatch(/supera el saldo de la factura/);

    const det = (await app.inject({ method: "GET", url: `/api/comprobantes/${nc.id}`, headers: auth(token) })).json();
    expect(det.asociado).toMatchObject({ id: f.id, tipo: "Factura A", numero: 1 });
  });

  it("tiene que ser al mismo cliente y sobre una factura autorizada", async () => {
    const { token, cliente, producto } = await preparar();
    const a = await cliente("Responsable Inscripto");
    const b = await cliente("Monotributista");
    const p = await producto({});
    const f = (await emitir(token, { clienteId: a.id, items: [{ productoId: p.id, cantidad: 1 }] })).json();
    expect((await emitir(token, { clase: "nota_credito", asociadoId: f.id, clienteId: b.id, items: [{ productoId: p.id, cantidad: 1 }] })).json().error).toMatch(/mismo cliente/);
    expect((await emitir(token, { clase: "nota_credito", clienteId: a.id, items: [{ productoId: p.id, cantidad: 1 }] })).json().details.asociadoId).toBe("Obligatorio");
  });
});

describe("puntos de venta, permisos y aislamiento", () => {
  it("cada punto de venta numera aparte; no se puede desactivar el último", async () => {
    const { token, cliente, producto } = await preparar();
    const ri = await cliente("Responsable Inscripto");
    const p = await producto({});
    const cfg = (await app.inject({ method: "GET", url: "/api/comprobantes/config", headers: auth(token) })).json();
    expect(cfg).toMatchObject({ modo: "simulado", condicionIvaEmisor: "Responsable Inscripto" });
    expect(cfg.puntosVenta).toMatchObject([{ numero: 1, nombre: "Casa central", activo: true }]);

    const pv2 = (await app.inject({ method: "POST", url: "/api/comprobantes/puntos-venta", headers: auth(token), payload: { numero: 2, nombre: "Sucursal" } })).json();
    await emitir(token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] });
    expect((await emitir(token, { clienteId: ri.id, puntoVenta: 2, items: [{ productoId: p.id, cantidad: 1 }] })).json()).toMatchObject({ puntoVenta: 2, numero: 1 });

    await app.inject({ method: "PATCH", url: `/api/comprobantes/puntos-venta/${pv2.id}`, headers: auth(token), payload: { activo: false } });
    expect((await emitir(token, { clienteId: ri.id, puntoVenta: 2, items: [{ productoId: p.id, cantidad: 1 }] })).json().details.puntoVenta).toBeTruthy();
    const pv1 = cfg.puntosVenta[0];
    expect((await app.inject({ method: "PATCH", url: `/api/comprobantes/puntos-venta/${pv1.id}`, headers: auth(token), payload: { activo: false } })).statusCode).toBe(400);
  });

  it("Operaciones no factura; una empresa no ve ni ajusta comprobantes de otra", async () => {
    const a = await preparar();
    const ri = await a.cliente("Responsable Inscripto");
    const p = await a.producto({});
    const f = (await emitir(a.token, { clienteId: ri.id, items: [{ productoId: p.id, cantidad: 1 }] })).json();

    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(a.token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/comprobantes", headers: auth(ops) })).statusCode).toBe(403);

    const b = await preparar();
    expect((await app.inject({ method: "GET", url: "/api/comprobantes", headers: auth(b.token) })).json()).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/comprobantes/${f.id}`, headers: auth(b.token) })).statusCode).toBe(404);
    const cb = await b.cliente("Responsable Inscripto");
    expect((await emitir(b.token, { clase: "nota_credito", asociadoId: f.id, clienteId: cb.id, items: [{ descripcion: "x", cantidad: 1, precioUnitario: 1, alicuotaIva: 21 }] })).statusCode).toBe(400);
  });
});
