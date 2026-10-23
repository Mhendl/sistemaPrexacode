import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { auth, crearApp, cuitValido, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

describe("caja diaria de Prexacode", () => {
  it("se abre, suma sola los cobros (recibos y facturas de contado), los gastos y otros ingresos, y cierra con arqueo", async () => {
    const { token } = await registrarEmpresa(app);
    const api = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
    const cliente = (await api("POST", "/clientes", { razonSocial: "Ferretería El Tornillo", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" })).json();

    expect((await api("GET", "/consultorio/caja")).json()).toMatchObject({ caja: null, totalIngresos: 0 });
    expect((await api("POST", "/consultorio/caja/abrir", { aperturaEfectivo: 5000 })).statusCode).toBe(201);

    // Una venta de contado cobrada en efectivo (genera el recibo sola) y un cobro por transferencia y retención
    const venta = await api("POST", "/comprobantes", { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "Tornillos", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] });
    expect(venta.statusCode, venta.body).toBe(201);
    const cobro = await api("POST", "/recibos", {
      clienteId: cliente.id,
      medios: [
        { medio: "Transferencia", importe: 3000, referencia: "Op. 1234" },
        { medio: "Retención", importe: 200 },
      ],
      imputaciones: [],
    });
    expect(cobro.statusCode, cobro.body).toBe(201);
    // Otro ingreso, un gasto en efectivo y uno con cheque
    expect((await api("POST", "/consultorio/ingresos", { concepto: "Venta de cartón", importe: 300, medio: "Efectivo" })).statusCode).toBe(201);
    expect((await api("POST", "/consultorio/gastos", { categoria: "Fletes y envíos", descripcion: "Flete a Quilmes", importe: 800, medio: "Efectivo" })).statusCode).toBe(201);
    expect((await api("POST", "/consultorio/gastos", { categoria: "Proveedores e insumos", descripcion: "Bulones", importe: 2000, medio: "Cheque" })).statusCode).toBe(201);

    const c = (await api("GET", "/consultorio/caja")).json();
    // Efectivo: 5000 de apertura + 1210 de la venta + 300 − 800 = 5710
    expect(c.esperadoEfectivo).toBe(5710);
    expect(c.porMedio).toEqual([
      { medio: "Efectivo", ingresos: 1510, egresos: 800 },
      { medio: "Cheque", ingresos: 0, egresos: 2000 },
      { medio: "Transferencia", ingresos: 3000, egresos: 0 },
    ]);
    // La retención no es plata que entra a la caja
    expect(c.totalIngresos).toBe(4510);
    const cobros = c.pagos.map((p: { quien: string; medio: string; importe: number; origen: string; link: string }) => `${p.quien} ${p.medio} ${p.importe} ${p.origen}`).sort();
    expect(cobros).toEqual(["Ferretería El Tornillo Efectivo 1210 recibo", "Ferretería El Tornillo Transferencia 3000 recibo"]);
    expect(c.pagos[0].link).toMatch(/^\/cobranzas\/recibos\//);

    // Cierre con arqueo: faltan $ 10
    const cierre = await api("POST", "/consultorio/caja/cerrar", { contadoEfectivo: 5700, notas: "Faltan $ 10" });
    expect(cierre.statusCode, cierre.body).toBe(200);
    expect(cierre.json().caja).toMatchObject({ esperadoEfectivo: 5710, contadoEfectivo: 5700, diferencia: -10 });

    // Con la caja cerrada no se mueve efectivo de ese día (ni cobrando ni anulando); con otros medios, sí
    const otraVenta = await api("POST", "/comprobantes", { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "Clavos", cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }] });
    expect(otraVenta.statusCode).toBe(409);
    expect(otraVenta.json().error).toMatch(/caja .* ya está cerrada/);
    expect((await api("POST", "/recibos", { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe: 100 }], imputaciones: [] })).statusCode).toBe(201);
    const recibos = (await api("GET", "/recibos")).json() as { id: string; total: number }[];
    const delEfectivo = recibos.find((r) => r.total === 1210)!;
    expect((await api("POST", `/recibos/${delEfectivo.id}/anular`, { motivo: "Error de carga" })).statusCode).toBe(409);
    expect(hoyAr()).toBe(c.fecha);
  });

  it("sin abrir la caja se puede cobrar igual (la caja es opcional), y lo propio del consultorio no está", async () => {
    const { token } = await registrarEmpresa(app);
    const api = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
    const cliente = (await api("POST", "/clientes", { razonSocial: "Kiosco Luz", cuit: cuitValido("20"), condicionIva: "Monotributista" })).json();
    const venta = await api("POST", "/comprobantes", { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "Pilas", cantidad: 1, precioUnitario: 500, alicuotaIva: 21 }] });
    expect(venta.statusCode, venta.body).toBe(201);
    expect((await api("GET", "/consultorio/caja")).json()).toMatchObject({ caja: null, esperadoEfectivo: venta.json().total });
    expect((await api("GET", "/consultorio/liquidacion")).statusCode).toBe(404);
  });
});
