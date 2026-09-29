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
const periodo = `desde=${dias(-3)}&hasta=${dias(1)}`;

/** Empresa RI con: FA 2 tóner (2420), FA servicio al 10,5 % (5525), FB 1 tóner (1210) y NC A por 1 tóner (−1210) */
async function preparar() {
  const { token } = await registrarEmpresa(app);
  const h = auth(token);
  const post = async (url: string, payload: object) => (await app.inject({ method: "POST", url, headers: h, payload })).json();
  const ri = await post("/api/clientes", { razonSocial: "Inscripto S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" });
  const cf = await post("/api/clientes", { razonSocial: "Consumidor Uno", cuit: cuitValido("20"), condicionIva: "Consumidor Final" });
  const toner = await post("/api/productos", { codigo: "T1", descripcion: "Tóner", precio: 1000, alicuotaIva: 21, controlaStock: false });
  const fa = await post("/api/comprobantes", { clienteId: ri.id, items: [{ productoId: toner.id, cantidad: 2 }] });
  await post("/api/comprobantes", { clienteId: ri.id, items: [{ descripcion: "Soporte técnico", cantidad: 1, precioUnitario: 5000, alicuotaIva: 10.5 }] });
  await post("/api/comprobantes", { clienteId: cf.id, items: [{ productoId: toner.id, cantidad: 1 }] });
  const nc = await post("/api/comprobantes", { clase: "nota_credito", asociadoId: fa.id, clienteId: ri.id, moverStock: false, items: [{ productoId: toner.id, cantidad: 1 }] });
  expect(nc.estado).toBe("Autorizado");
  return { token, ri, cf };
}

describe("reportes", () => {
  it("ventas del período: resumen, serie, por cliente y por producto (las NC restan)", async () => {
    const { token, ri, cf } = await preparar();
    const res = await app.inject({ method: "GET", url: `/api/reportes/ventas?${periodo}`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.resumen).toEqual({ facturado: 9155, notasCredito: 1210, neto: 7000, iva: 945, total: 7945, facturas: 3, notas: 1, ticketPromedio: 3051.67 });
    expect(r.agrupacion).toBe("dia");
    expect(r.serie).toHaveLength(5);
    expect(r.serie.find((s: { clave: string }) => s.clave === hoy()).total).toBe(7945);
    expect(r.serie.reduce((t: number, s: { total: number }) => t + s.total, 0)).toBe(7945);

    expect(r.porCliente).toEqual([
      { clienteId: ri.id, razonSocial: "Inscripto S.A.", cuit: ri.cuit, facturas: 2, neto: 6000, total: 6735 },
      { clienteId: cf.id, razonSocial: "Consumidor Uno", cuit: cf.cuit, facturas: 1, neto: 1000, total: 1210 },
    ]);
    expect(r.porProducto).toMatchObject([
      { productoId: null, descripcion: "Soporte técnico", cantidad: 1, neto: 5000 },
      { codigo: "T1", descripcion: "Tóner", cantidad: 2, neto: 2000 },
    ]);
  });

  it("Libro IVA Ventas: un renglón por comprobante, IVA por alícuota y totales que cierran", async () => {
    const { token } = await preparar();
    const r = (await app.inject({ method: "GET", url: `/api/reportes/libro-iva?${periodo}`, headers: auth(token) })).json();
    expect(r.alicuotas).toEqual([21, 10.5]);
    expect(r.renglones).toHaveLength(4);
    expect(r.conPruebas).toBe(true);
    const nc = r.renglones.find((x: { tipo: string }) => x.tipo.startsWith("Nota de crédito"));
    expect(nc).toMatchObject({ letra: "A", numero: "0001-00000001", neto: -1000, iva: { "21": -210, "10.5": 0 }, totalIva: -210, total: -1210 });
    const fb = r.renglones.find((x: { letra: string }) => x.letra === "B");
    expect(fb).toMatchObject({ razonSocial: "Consumidor Uno", condicionIva: "Consumidor Final", neto: 1000, iva: { "21": 210 }, total: 1210 });
    expect(r.totales).toEqual({ neto: 7000, exento: 0, iva: { "21": 420, "10.5": 525 }, totalIva: 945, total: 7945 });
    // cada renglón cierra: neto + exento + IVA = total
    for (const x of r.renglones) expect(Math.round((x.neto + x.exento + x.totalIva) * 100) / 100).toBe(x.total);
  });

  it("sin período usa el mes en curso; períodos largos agrupan por mes; valida fechas", async () => {
    const { token } = await registrarEmpresa(app);
    const r = (await app.inject({ method: "GET", url: "/api/reportes/ventas", headers: auth(token) })).json();
    expect(r).toMatchObject({ desde: `${hoy().slice(0, 7)}-01`, hasta: hoy(), resumen: { total: 0, facturas: 0, ticketPromedio: 0 }, porCliente: [], porProducto: [] });

    const anual = (await app.inject({ method: "GET", url: "/api/reportes/ventas?desde=2025-01-15&hasta=2025-12-31", headers: auth(token) })).json();
    expect(anual.agrupacion).toBe("mes");
    expect(anual.serie).toHaveLength(12);
    expect(anual.serie[0]).toMatchObject({ clave: "2025-01", etiqueta: "Ene 25" });

    const invertido = await app.inject({ method: "GET", url: "/api/reportes/libro-iva?desde=2025-02-01&hasta=2025-01-01", headers: auth(token) });
    expect(invertido.statusCode).toBe(400);
    expect(invertido.json().details).toHaveProperty("hasta");
    expect((await app.inject({ method: "GET", url: "/api/reportes/ventas?desde=2019-01-01&hasta=2025-01-01", headers: auth(token) })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/reportes/ventas?desde=ayer", headers: auth(token) })).statusCode).toBe(400);
  });

  it("cada empresa ve solo sus ventas y Operaciones no accede", async () => {
    const a = await preparar();
    const b = await registrarEmpresa(app);
    const rb = (await app.inject({ method: "GET", url: `/api/reportes/libro-iva?${periodo}`, headers: auth(b.token) })).json();
    expect(rb.renglones).toEqual([]);
    expect(rb.totales.total).toBe(0);

    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(a.token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/reportes/ventas", headers: auth(ops) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/reportes/libro-iva", headers: auth(ops) })).statusCode).toBe(403);
  });
});
