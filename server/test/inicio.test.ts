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
const inicio = async (token: string) => (await app.inject({ method: "GET", url: "/api/inicio", headers: auth(token) })).json();

describe("pantalla de inicio", () => {
  it("una empresa nueva ve los primeros pasos sin completar y todo en cero", async () => {
    const { token } = await registrarEmpresa(app);
    const r = await inicio(token);
    expect(r.primerosPasos).toEqual({ logo: false, clientes: false, productos: false, factura: false, equipo: false });
    expect(r.ventas).toMatchObject({ mes: 0, cantidad: 0 });
    expect(r.ventas.serie).toHaveLength(12);
    expect(r.cobranzas).toMatchObject({ porCobrar: 0, vencido: 0, vencidas: [] });
  });

  it("ventas del mes restan notas de crédito; cobranzas y stock bajo reflejan la realidad", async () => {
    const { token } = await registrarEmpresa(app);
    const cliente = (await app.inject({ method: "POST", url: "/api/clientes", headers: auth(token), payload: { razonSocial: "Cliente Uno", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();
    const prod = (await app.inject({ method: "POST", url: "/api/productos", headers: auth(token), payload: { codigo: "T1", descripcion: "Tóner", precio: 1000, alicuotaIva: 21, controlaStock: true, stockInicial: 5, stockMinimo: 4 } })).json();
    const f = (await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ productoId: prod.id, cantidad: 2 }] } })).json(); // 2420, stock 3
    await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clase: "nota_credito", asociadoId: f.id, clienteId: cliente.id, moverStock: false, items: [{ productoId: prod.id, cantidad: 1 }] } }); // −1210
    await app.inject({ method: "POST", url: "/api/comprobantes", headers: auth(token), payload: { clienteId: cliente.id, fecha: dias(-4), vencimiento: dias(-1), moverStock: false, items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 500, alicuotaIva: 21 }] } }); // 605 vencida

    const r = await inicio(token);
    const esteMes = hoy().slice(5, 7) === dias(-4).slice(5, 7);
    expect(r.ventas.mes).toBe(esteMes ? 1815 : 1210);
    expect(r.ventas.serie[11].total).toBe(r.ventas.mes);
    expect(r.cobranzas).toMatchObject({ porCobrar: 1815, vencido: 605 });
    expect(r.cobranzas.vencidas[0]).toMatchObject({ cliente: "Cliente Uno", saldo: 605, diasVencida: 1 });
    expect(r.stock).toMatchObject({ bajoMinimo: 1, sinStock: 0 });
    expect(r.stock.productos[0]).toMatchObject({ codigo: "T1", stock: 3 });
    // Últimos comprobantes, del más nuevo al más viejo (la NC figura en negativo)
    expect(r.ultimos.map((u: { total: number }) => u.total)).toEqual([605, -1210, 2420]);
    expect(r.primerosPasos).toMatchObject({ clientes: true, productos: true, factura: true });
  });

  it("Operaciones solo recibe stock y remitos (nada de ventas ni cobranzas)", async () => {
    const { token } = await registrarEmpresa(app);
    const email = emailUnico("ops");
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(token), payload: { nombre: "Operaciones", email, rol: "operaciones", password: "clave-segura-123" } });
    const ops = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token;
    const r = await inicio(ops);
    expect(r).toHaveProperty("stock");
    expect(r).toHaveProperty("remitosHoy");
    expect(r).not.toHaveProperty("ventas");
    expect(r).not.toHaveProperty("cobranzas");
    expect((await inicio(token)).primerosPasos.equipo).toBe(true);
  });
});
