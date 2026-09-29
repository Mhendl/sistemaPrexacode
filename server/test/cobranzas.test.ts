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

async function preparar() {
  const { token, empresa } = await registrarEmpresa(app);
  const cliente = (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: { razonSocial: "Constructora Del Plata S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();
  /** Factura de un servicio por `neto` + 21 % (total = neto × 1,21) */
  const factura = async (neto: number, extra: Record<string, unknown> = {}) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comprobantes",
      headers: auth(token),
      payload: { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: neto, alicuotaIva: 21 }], ...extra },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  };
  return { token, empresa, cliente, factura };
}

const cobrar = (token: string, body: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/recibos", headers: auth(token), payload: body });
const comprobante = async (token: string, id: string) => (await app.inject({ method: "GET", url: `/api/comprobantes/${id}`, headers: auth(token) })).json();

describe("recibos", () => {
  it("cobro parcial con dos medios: la factura queda con saldo y en estado Parcial", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000); // 1.210
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 1210, estadoCobro: "Impaga" });

    const r = await cobrar(token, {
      clienteId: cliente.id,
      medios: [
        { medio: "Transferencia", importe: 500, referencia: "Op. 88123" },
        { medio: "Efectivo", importe: 200 },
      ],
      imputaciones: [{ comprobanteId: f.id, importe: 700 }],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ numero: 1, total: 700, estado: "Emitido" });
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 510, estadoCobro: "Parcial", cobrado: 700 });

    const det = (await app.inject({ method: "GET", url: `/api/recibos/${r.json().id}`, headers: auth(token) })).json();
    expect(det.medios).toHaveLength(2);
    expect(det.imputaciones[0]).toMatchObject({ comprobante: "Factura A 0001-00000001", importe: 700 });
    expect(det).toMatchObject({ aplicado: 700, aCuenta: 0 });

    // Segundo cobro por el resto: queda pagada y el número de recibo sigue
    const r2 = (await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Cheque", importe: 510, referencia: "Galicia 00012345" }], imputaciones: [{ comprobanteId: f.id, importe: 510 }] })).json();
    expect(r2.numero).toBe(2);
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 0, estadoCobro: "Pagada" });
  });

  it("lo que no se aplica a facturas queda a cuenta (saldo a favor)", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe: 1500 }], imputaciones: [{ comprobanteId: f.id, importe: 1210 }] });
    const cc = (await app.inject({ method: "GET", url: `/api/cobranzas/cuenta-corriente/${cliente.id}`, headers: auth(token) })).json();
    expect(cc).toMatchObject({ saldo: -290, aCuenta: 290 });
  });

  it("nota de crédito sobre una factura ya cobrada: queda como saldo a favor del cliente (no se pierde)", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000); // 1.210
    expect((await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe: 1210 }], imputaciones: [{ comprobanteId: f.id, importe: 1210 }] })).statusCode).toBe(201);
    // El cliente devuelve parte de lo que ya pagó: NC por 400 + IVA = 484
    const nc = await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clase: "nota_credito", asociadoId: f.id, clienteId: cliente.id, moverStock: false, items: [{ descripcion: "Devolución", cantidad: 1, precioUnitario: 400, alicuotaIva: 21 }] } });
    expect(nc.statusCode).toBe(201);
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 0, estadoCobro: "Pagada" });

    const cc = (await app.inject({ method: "GET", url: `/api/cobranzas/cuenta-corriente/${cliente.id}`, headers: auth(token) })).json();
    expect(cc).toMatchObject({ saldo: -484, aCuenta: 484 });
    const resumen = (await app.inject({ method: "GET", url: "/api/cobranzas/resumen", headers: auth(token) })).json();
    expect(resumen.clientes.find((c: { clienteId: string }) => c.clienteId === cliente.id)).toMatchObject({ deuda: 0, aCuenta: 484, saldo: -484 });
    expect(resumen.totales.aCuenta).toBe(484);
  });

  it("no deja aplicar más que el saldo de la factura, ni más de lo cobrado", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    const excede = await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 2000 }], imputaciones: [{ comprobanteId: f.id, importe: 1500 }] });
    expect(excede.statusCode).toBe(409);
    expect(excede.json().details["imputaciones.0.importe"]).toMatch(/Supera el saldo/);
    const masQueCobrado = await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 100 }], imputaciones: [{ comprobanteId: f.id, importe: 200 }] });
    expect(masQueCobrado.statusCode).toBe(400);
    expect((await cobrar(token, { clienteId: cliente.id, medios: [] })).json().details.medios).toMatch(/al menos un medio/);
    expect((await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Bitcoin", importe: 1 }] })).json().details["medios.0.medio"]).toBe("Medio de pago inválido");
  });

  it("dos cobros simultáneos de la misma factura: uno pasa, el otro se rechaza", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    const cuerpo = { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 1210 }], imputaciones: [{ comprobanteId: f.id, importe: 1210 }] };
    const [a, b] = await Promise.all([cobrar(token, cuerpo), cobrar(token, cuerpo)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 0, cobrado: 1210 });
  });

  it("anular un recibo vuelve a dejar la factura con saldo; solo el administrador puede", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    const r = (await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 1210 }], imputaciones: [{ comprobanteId: f.id, importe: 1210 }] })).json();

    const email = emailUnico("ventas");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Vendedor", email, rol: "ventas", password: "clave-segura-123" } });
    const ventas = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "POST", url: `/api/recibos/${r.id}/anular`, headers: auth(ventas), payload: { motivo: "error" } })).statusCode).toBe(403);

    const an = await app.inject({ method: "POST", url: `/api/recibos/${r.id}/anular`, headers: auth(token), payload: { motivo: "Cheque rechazado" } });
    expect(an.json()).toMatchObject({ estado: "Anulado", motivoAnulacion: "Cheque rechazado" });
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 1210, estadoCobro: "Impaga" });
    expect((await app.inject({ method: "POST", url: `/api/recibos/${r.id}/anular`, headers: auth(token), payload: { motivo: "otra vez" } })).statusCode).toBe(409);
  });

  it("la nota de crédito también baja el saldo de la factura", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clase: "nota_credito", asociadoId: f.id, clienteId: cliente.id, items: [{ descripcion: "Descuento", cantidad: 1, precioUnitario: 200, alicuotaIva: 21 }] } });
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 968, notasCredito: 242, estadoCobro: "Parcial" });
  });
});

describe("factura de contado cobrada en el momento", () => {
  it("genera el recibo automáticamente y la factura queda pagada", async () => {
    const { token, cliente } = await preparar();
    const f = (
      await app.inject({
        method: "POST",
        url: "/api/comprobantes",
        headers: auth(token),
        payload: { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Mercado Pago", referencia: "MP 5512" }, items: [{ descripcion: "Venta mostrador", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] },
      })
    ).json();
    expect(await comprobante(token, f.id)).toMatchObject({ saldo: 0, estadoCobro: "Pagada" });
    const recibos = (await app.inject({ method: "GET", url: "/api/recibos", headers: auth(token) })).json();
    expect(recibos).toMatchObject([{ numero: 1, total: 1210, clienteRazonSocial: "Constructora Del Plata S.A." }]);
  });
});

describe("resumen de cobranzas y cuenta corriente", () => {
  it("clasifica la deuda por antigüedad y lista las vencidas", async () => {
    const { token, cliente, factura } = await preparar();
    await factura(1000); // vence en 30 días: al día
    const vencida = await factura(500, { fecha: dias(-5), vencimiento: dias(-3) }); // 605, vencida hace 3 días

    const res = (await app.inject({ method: "GET", url: "/api/cobranzas/resumen", headers: auth(token) })).json();
    expect(res.totales).toMatchObject({ porCobrar: 1815, vencido: 605, clientesConDeuda: 1, facturasVencidas: 1 });
    expect(res.clientes[0]).toMatchObject({ clienteId: cliente.id, deuda: 1815, vencido: 605, diasMaxAtraso: 3, tramos: { alDia: 1210, d1a30: 605, d31a60: 0, d61a90: 0, mas90: 0 } });

    const vencidas = (await app.inject({ method: "GET", url: "/api/cobranzas/pendientes?soloVencidas=true", headers: auth(token) })).json();
    expect(vencidas).toHaveLength(1);
    expect(vencidas[0]).toMatchObject({ id: vencida.id, estadoCobro: "Vencida", diasVencida: 3, saldo: 605, clienteRazonSocial: "Constructora Del Plata S.A." });
  });

  it("la cuenta corriente lista facturas, notas de crédito y recibos con saldo acumulado", async () => {
    const { token, cliente, factura } = await preparar();
    const f = await factura(1000);
    await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clase: "nota_credito", asociadoId: f.id, clienteId: cliente.id, items: [{ descripcion: "Ajuste", cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }] } });
    await cobrar(token, { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 500 }], imputaciones: [{ comprobanteId: f.id, importe: 500 }] });
    const cc = (await app.inject({ method: "GET", url: `/api/cobranzas/cuenta-corriente/${cliente.id}`, headers: auth(token) })).json();
    expect(cc.movimientos.map((m: { tipo: string; debe: number; haber: number; saldo: number }) => [m.tipo, m.debe, m.haber, m.saldo])).toEqual([
      ["Factura", 1210, 0, 1210],
      ["Nota de crédito", 0, 121, 1089],
      ["Recibo", 0, 500, 589],
    ]);
    expect(cc.saldo).toBe(589);
  });

  it("avisa de las facturas vencidas una sola vez", async () => {
    const { token, factura } = await preparar();
    await factura(500, { fecha: dias(-5), vencimiento: dias(-1) });
    const b1 = (await app.inject({ method: "GET", url: "/api/notificaciones", headers: auth(token) })).json();
    expect(b1.items.filter((n: { tipo: string }) => n.tipo === "vencimiento_factura")).toHaveLength(1);
    expect(b1.items[0].detalle).toMatch(/Factura A 0001-00000001 · Constructora Del Plata S\.A\. · saldo \$ 605,00/);
    const { revisarVencimientos } = await import("../src/lib/notificaciones.js");
    const empresaId = (await app.inject({ method: "GET", url: "/api/empresa", headers: auth(token) })).json().id;
    await revisarVencimientos(app.db, empresaId, true); // forzar otra revisión
    const b2 = (await app.inject({ method: "GET", url: "/api/notificaciones", headers: auth(token) })).json();
    expect(b2.items.filter((n: { tipo: string }) => n.tipo === "vencimiento_factura")).toHaveLength(1);
  });

  it("Operaciones no ve cobranzas; cada empresa ve solo lo suyo y no puede cobrar facturas ajenas", async () => {
    const a = await preparar();
    const f = await a.factura(1000);
    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(a.token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/cobranzas/resumen", headers: auth(ops) })).statusCode).toBe(403);

    const b = await preparar();
    expect((await app.inject({ method: "GET", url: "/api/cobranzas/resumen", headers: auth(b.token) })).json().totales.porCobrar).toBe(0);
    const ajeno = await cobrar(b.token, { clienteId: b.cliente.id, medios: [{ medio: "Efectivo", importe: 1210 }], imputaciones: [{ comprobanteId: f.id, importe: 1210 }] });
    expect(ajeno.statusCode).toBe(400);
    expect(await comprobante(a.token, f.id)).toMatchObject({ saldo: 1210 });
  });
});
