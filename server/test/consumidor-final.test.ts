import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientes } from "../src/db/schema.js";
import type { ConectorArca, SolicitudCae } from "../src/lib/arca/cliente.js";
import { TOPE_CONSUMIDOR_SIN_IDENTIFICAR } from "../src/lib/arca/codigos.js";
import { crearSimulador } from "../src/lib/arca/simulador.js";
import { auth, crearApp, cuitValido, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
/** Lo que se le mandó a ARCA, para ver cómo va identificado el comprador */
const enviadas: SolicitudCae[] = [];

beforeAll(async () => {
  ({ app, cerrar } = await crearApp({
    conectorArca: (empresa) => {
      const sim = crearSimulador(empresa.cuit);
      const conector: ConectorArca = {
        modo: "simulado",
        ultimoAutorizado: (pv, t) => sim.ultimoAutorizado(pv, t),
        solicitarCae: async (s) => {
          enviadas.push(s);
          return sim.solicitarCae(s);
        },
      };
      return conector;
    },
  }));
});
afterAll(() => cerrar());

const pedir = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });

const renglon = (precio: number) => [{ descripcion: "Venta mostrador", cantidad: 1, precioUnitario: precio, alicuotaIva: 21 }];
const venta = (precio: number, extra: object = {}) => ({ consumidorFinal: true, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: renglon(precio), ...extra });

describe("venta de mostrador a un consumidor final sin identificar", () => {
  it("Factura B sin CUIT: a ARCA va como 'sin identificar', se cobra en el momento y el QR lo dice", async () => {
    const { token } = await registrarEmpresa(app, "Ferretería Mostrador S.R.L.");
    const res = await pedir("POST", "/comprobantes", token, venta(1000));
    expect(res.statusCode).toBe(201);
    const f = res.json();
    expect(f).toMatchObject({ tipo: "Factura B", estado: "Autorizado", total: 1210, receptor: { razonSocial: "Consumidor final", cuit: "", condicionIva: "Consumidor Final" } });
    expect(enviadas.at(-1)).toMatchObject({ docTipo: 99, docNro: "0", condicionIvaReceptor: 5 });

    const det = (await pedir("GET", `/comprobantes/${f.id}`, token)).json();
    const qr = JSON.parse(Buffer.from(det.qr.split("?p=")[1], "base64").toString());
    expect(qr).toMatchObject({ tipoDocRec: 99, nroDocRec: 0 });
    // Quedó cobrada: no le debe nada a nadie
    expect(det.saldo ?? 0).toBe(0);
    const recibos = (await pedir("GET", "/recibos", token)).json();
    expect(recibos).toHaveLength(1);
  });

  it("un monotributista hace Factura C", async () => {
    const { token } = await registrarEmpresa(app, "Kiosco Mono", "Monotributista");
    const f = (await pedir("POST", "/comprobantes", token, venta(500))).json();
    expect(f).toMatchObject({ tipo: "Factura C", estado: "Autorizado" });
  });

  it("siempre es el mismo 'Consumidor final' (aun con ventas al mismo tiempo), no aparece en la cartera y no se puede editar ni borrar", async () => {
    const { token, empresaId } = await registrarEmpresa(app);
    const ventas = await Promise.all([1, 2, 3, 4, 5].map((i) => pedir("POST", "/comprobantes", token, venta(100 * i))));
    expect(ventas.map((v) => v.statusCode)).toEqual([201, 201, 201, 201, 201]);
    const anonimos = await app.db.select().from(clientes).where(and(eq(clientes.empresaId, empresaId), eq(clientes.sinIdentificar, true)));
    expect(anonimos).toHaveLength(1);
    expect(new Set(ventas.map((v) => v.json().clienteId))).toEqual(new Set([anonimos[0]!.id]));

    expect((await pedir("GET", "/clientes", token)).json()).toHaveLength(0);
    const id = anonimos[0]!.id;
    const editar = await pedir("PUT", `/clientes/${id}`, token, { razonSocial: "Otro", cuit: cuitValido(), condicionIva: "Responsable Inscripto" });
    expect(editar.statusCode).toBe(400);
    expect(editar.json().error).toContain("no se modifica");
    expect((await pedir("DELETE", `/clientes/${id}`, token)).statusCode).toBe(400);
    expect((await pedir("POST", "/clientes/masivo", token, { ids: [id], cambios: { estado: "Inactivo" } })).json()).toEqual({ actualizados: 0 });
    // Pero su ficha se ve (desde la factura)
    expect((await pedir("GET", `/clientes/${id}`, token)).json()).toMatchObject({ razonSocial: "Consumidor final", sinIdentificar: true });
  });

  it("no se le vende en cuenta corriente ni sin cobrar, y desde el tope de ARCA hay que identificarlo", async () => {
    const { token } = await registrarEmpresa(app);
    const cc = await pedir("POST", "/comprobantes", token, venta(1000, { condicionVenta: "Cuenta corriente", cobro: undefined }));
    expect(cc.statusCode).toBe(400);
    expect(cc.json().error).toContain("de contado y cobrada en el momento");
    expect((await pedir("POST", "/comprobantes", token, venta(1000, { cobro: undefined }))).statusCode).toBe(400);

    // Justo debajo del tope pasa; en el tope, no
    const debajo = await pedir("POST", "/comprobantes", token, venta((TOPE_CONSUMIDOR_SIN_IDENTIFICAR - 1) / 1.21));
    expect(debajo.statusCode).toBe(201);
    const tope = await pedir("POST", "/comprobantes", token, venta(TOPE_CONSUMIDOR_SIN_IDENTIFICAR / 1.21));
    expect(tope.statusCode).toBe(400);
    expect(tope.json().error).toContain("ARCA pide identificar al comprador");
    // Nada de esto emitió un comprobante de más
    expect((await pedir("GET", "/comprobantes", token)).json()).toHaveLength(1);
  });

  it("una devolución: nota de crédito a la misma venta anónima", async () => {
    const { token } = await registrarEmpresa(app);
    const f = (await pedir("POST", "/comprobantes", token, venta(2000))).json();
    const nc = await pedir("POST", "/comprobantes", token, { clase: "nota_credito", asociadoId: f.id, consumidorFinal: true, items: renglon(2000) });
    expect(nc.statusCode).toBe(201);
    expect(nc.json()).toMatchObject({ tipo: "Nota de crédito B", estado: "Autorizado", receptor: { cuit: "" } });
    expect(enviadas.at(-1)).toMatchObject({ docTipo: 99, asociado: { numero: f.numero } });
  });

  it("sin cliente ni consumidor final, pide elegir uno", async () => {
    const { token } = await registrarEmpresa(app);
    const r = await pedir("POST", "/comprobantes", token, { condicionVenta: "Contado", items: renglon(100) });
    expect(r.statusCode).toBe(400);
    expect(r.json().details).toMatchObject({ clienteId: "Elegí un cliente" });
  });
});
