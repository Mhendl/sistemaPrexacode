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
  const { token } = await registrarEmpresa(app);
  const cliente = async (condicionIva = "Responsable Inscripto") =>
    (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: { razonSocial: `Cliente ${condicionIva}`, cuit: cuitValido("30"), condicionIva } })).json();
  const prod = (await app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: { codigo: "NB", descripcion: "Notebook", precio: 1000000, alicuotaIva: 10.5, controlaStock: true, stockInicial: 10, stockMinimo: 0 } })).json();
  return { token, cliente, prod };
}

const crear = (token: string, body: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/presupuestos", headers: auth(token), payload: body });
const ver = async (token: string, id: string) => (await app.inject({ method: "GET", url: `/api/presupuestos/${id}`, headers: auth(token) })).json();

describe("presupuestos", () => {
  it("crea con numeración propia, totales como la factura y validez de 15 días por defecto", async () => {
    const { token, cliente, prod } = await preparar();
    const ri = await cliente();
    const res = await crear(token, {
      clienteId: ri.id,
      condiciones: "Pago 50 % anticipado. Entrega en 7 días.",
      items: [
        { productoId: prod.id, cantidad: 2, bonificacion: 5 },
        { descripcion: "Instalación", cantidad: 1, precioUnitario: 50000, alicuotaIva: 21 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const p = res.json();
    // 2 × 1.000.000 × 0,95 = 1.900.000 (+10,5 %) + 50.000 (+21 %)
    expect(p).toMatchObject({ numero: 1, estado: "Pendiente", letra: "A", neto: 1950000, totalIva: 210000, total: 2160000, fecha: hoy(), validoHasta: dias(15) });
    const det = await ver(token, p.id);
    expect(det.items.map((i: { descripcion: string; subtotal: number }) => [i.descripcion, i.subtotal])).toEqual([
      ["Notebook", 1900000],
      ["Instalación", 50000],
    ]);
    expect((await crear(token, { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 1 }] })).json().numero).toBe(2);
  });

  it("valida cliente, ítems y fechas", async () => {
    const { token, cliente } = await preparar();
    const ri = await cliente();
    expect((await crear(token, { items: [{ descripcion: "x", cantidad: 1, precioUnitario: 1, alicuotaIva: 21 }] })).json().details.clienteId).toBe("Elegí un cliente");
    expect((await crear(token, { clienteId: ri.id, items: [] })).json().details.items).toMatch(/al menos un ítem/);
    const r = await crear(token, { clienteId: ri.id, fecha: hoy(), validoHasta: dias(-1), items: [{ descripcion: "x", cantidad: 1, precioUnitario: 1, alicuotaIva: 21 }] });
    expect(r.json().details.validoHasta).toBe("Anterior a la fecha");
  });

  it("pasada la validez figura como Vencido; se puede marcar aceptado o rechazado", async () => {
    const { token, cliente } = await preparar();
    const ri = await cliente();
    const p = (await crear(token, { clienteId: ri.id, fecha: dias(-10), validoHasta: dias(-1), items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }] })).json();
    expect(p.estado).toBe("Vencido");
    const lista = (await app.inject({ method: "GET", url: "/api/presupuestos", headers: auth(token) })).json();
    expect(lista[0]).toMatchObject({ estado: "Vencido", clienteRazonSocial: "Cliente Responsable Inscripto" });

    const acep = await app.inject({ method: "POST", url: `/api/presupuestos/${p.id}/estado`, headers: auth(token), payload: { estado: "Aceptado" } });
    expect(acep.json().estado).toBe("Aceptado");
    expect((await app.inject({ method: "POST", url: `/api/presupuestos/${p.id}/estado`, headers: auth(token), payload: { estado: "Facturado" } })).statusCode).toBe(400);
  });

  it("editar recalcula; con una versión vieja avisa que otro lo modificó", async () => {
    const { token, cliente, prod } = await preparar();
    const ri = await cliente();
    const p = (await crear(token, { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 1 }] })).json();
    const put = await app.inject({ method: "PUT", url: `/api/presupuestos/${p.id}`, headers: auth(token), payload: { clienteId: ri.id, version: 1, items: [{ productoId: prod.id, cantidad: 3 }] } });
    expect(put.json()).toMatchObject({ total: 3315000, version: 2 });
    const viejo = await app.inject({ method: "PUT", url: `/api/presupuestos/${p.id}`, headers: auth(token), payload: { clienteId: ri.id, version: 1, items: [{ productoId: prod.id, cantidad: 9 }] } });
    expect(viejo.json().code).toBe("EDICION_CONCURRENTE");
  });

  it("duplicar crea uno nuevo, pendiente y con fecha de hoy", async () => {
    const { token, cliente } = await preparar();
    const ri = await cliente();
    const p = (await crear(token, { clienteId: ri.id, fecha: dias(-5), validoHasta: dias(5), items: [{ descripcion: "Servicio", cantidad: 2, precioUnitario: 100, alicuotaIva: 21 }] })).json();
    await app.inject({ method: "POST", url: `/api/presupuestos/${p.id}/estado`, headers: auth(token), payload: { estado: "Rechazado" } });
    const copia = (await app.inject({ method: "POST", url: `/api/presupuestos/${p.id}/duplicar`, headers: auth(token) })).json();
    expect(copia).toMatchObject({ numero: 2, estado: "Pendiente", fecha: hoy(), validoHasta: dias(10), total: 242 });
    expect((await ver(token, copia.id)).items).toHaveLength(1);
  });
});

describe("de presupuesto a factura", () => {
  it("la factura queda vinculada, el presupuesto pasa a Facturado y ya no se edita ni se borra", async () => {
    const { token, cliente, prod } = await preparar();
    const ri = await cliente();
    const p = (await crear(token, { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 2 }] })).json();
    const f = (await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clienteId: ri.id, presupuestoId: p.id, items: [{ productoId: prod.id, cantidad: 2 }] } })).json();
    expect(f.estado).toBe("Autorizado");
    const det = await ver(token, p.id);
    expect(det).toMatchObject({ estado: "Facturado", comprobanteId: f.id, factura: { id: f.id, numero: 1 } });
    expect((await app.inject({ method: "PUT", url: `/api/presupuestos/${p.id}`, headers: auth(token), payload: { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 1 }] } })).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: `/api/presupuestos/${p.id}`, headers: auth(token) })).statusCode).toBe(409);
  });

  it("no se puede facturar dos veces, y el intento fallido no consume número de ARCA", async () => {
    const { token, cliente, prod } = await preparar();
    const ri = await cliente();
    const p = (await crear(token, { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 1 }] })).json();
    const cuerpo = { clienteId: ri.id, presupuestoId: p.id, items: [{ productoId: prod.id, cantidad: 1 }] };
    expect((await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: cuerpo })).json().numero).toBe(1);
    const otra = await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: cuerpo });
    expect(otra.statusCode).toBe(409);
    expect(otra.json().error).toMatch(/ya fue facturado/);
    // La siguiente factura normal sale con el 2: el intento fallido no gastó número
    const siguiente = (await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clienteId: ri.id, items: [{ productoId: prod.id, cantidad: 1 }] } })).json();
    expect(siguiente.numero).toBe(2);
    expect((await app.inject({ method: "GET", url: `/api/productos/${prod.id}`, headers: auth(token) })).json().stock).toBe(8);
  });

  it("no se puede usar un presupuesto de otro cliente o de otra empresa", async () => {
    const a = await preparar();
    const c1 = await a.cliente();
    const c2 = await a.cliente("Monotributista");
    const p = (await crear(a.token, { clienteId: c1.id, items: [{ productoId: a.prod.id, cantidad: 1 }] })).json();
    const otroCliente = await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(a.token), payload: { clienteId: c2.id, presupuestoId: p.id, items: [{ productoId: a.prod.id, cantidad: 1 }] } });
    expect(otroCliente.json().details.presupuestoId).toBe("Presupuesto inválido");

    const b = await preparar();
    expect((await app.inject({ method: "GET", url: `/api/presupuestos/${p.id}`, headers: auth(b.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/presupuestos", headers: auth(b.token) })).json()).toHaveLength(0);
  });

  it("Operaciones no accede a presupuestos", async () => {
    const { token } = await preparar();
    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    expect((await app.inject({ method: "GET", url: "/api/presupuestos", headers: auth(ops) })).statusCode).toBe(403);
  });
});
