import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
import { sumarDias } from "../src/lib/suscripcion.js";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

const CLAVE = "clave-segura-123";
type Metodo = "GET" | "POST" | "PUT" | "DELETE";
const pedir = (token: string) => (method: Metodo, url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
type Api = ReturnType<typeof pedir>;

async function consultorio(nombre = "Consultorio Sonrisas") {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: nombre, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email: emailUnico("dra"), password: CLAVE }, aceptaTerminos: true, producto: "dental" },
  });
  expect(r.statusCode, r.body).toBe(201);
  const api = pedir(r.json().token);
  const prest = (await api("GET", "/prestaciones")).json() as { id: string; codigo: string }[];
  const obras = (await api("GET", "/pacientes/obras-sociales")).json() as { id: string; nombre: string }[];
  const idP = (codigo: string) => prest.find((p) => p.codigo === codigo)!.id;
  const osde = obras.find((o) => o.nombre === "OSDE")!.id;
  const galeno = obras.find((o) => o.nombre === "Galeno")!.id;
  // Listas: particular, y OSDE (coseguro + lo que paga la obra social)
  await api("PUT", "/prestaciones/precios", {
    lista: "particular",
    precios: [
      { prestacionId: idP("01.01"), precioPaciente: 20000 },
      { prestacionId: idP("02.08"), precioPaciente: 45000 },
      { prestacionId: idP("10.01"), precioPaciente: 60000 },
      { prestacionId: idP("CAR"), precioPaciente: 0 },
    ],
  });
  await api("PUT", "/prestaciones/precios", {
    lista: osde,
    precios: [
      { prestacionId: idP("01.01"), precioPaciente: 5000, precioObraSocial: 15000 },
      { prestacionId: idP("02.08"), precioPaciente: 10000, precioObraSocial: 30000 },
    ],
  });
  const miembro = async (rol: "profesional" | "recepcion", n: string) => {
    const email = emailUnico(rol);
    expect((await api("POST", "/usuarios", { nombre: n, email, password: CLAVE, rol })).statusCode).toBe(201);
    return pedir((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: CLAVE } })).json().token);
  };
  const paciente = async (datos: object = {}) => (await api("POST", "/pacientes", { nombre: "María", apellido: "González", ...datos })).json() as { id: string };
  return { api, idP, osde, galeno, miembro, paciente };
}

const cuenta = async (api: Api, id: string) => (await api("GET", `/pacientes/${id}/cuenta`)).json() as { saldo: number; cargos: { importePaciente: number; importeObraSocial: number; anuladoEn: string | null; obraSocial: string | null; prestacion: string }[]; pagos: { numero: number }[] };

describe("listas de precios", () => {
  it("particular y por obra social; aumento por porcentaje con redondeo; validaciones", async () => {
    const { api, idP, osde } = await consultorio();
    const lista = (await api("GET", `/prestaciones/precios?lista=${osde}`)).json() as { codigo: string; precioPaciente: number | null; precioObraSocial: number | null }[];
    expect(lista.find((p) => p.codigo === "02.08")).toMatchObject({ precioPaciente: 10000, precioObraSocial: 30000 });
    expect(lista.find((p) => p.codigo === "10.01")).toMatchObject({ precioPaciente: null });
    // +8 %, redondeado a $ 100
    expect((await api("POST", "/prestaciones/precios/aumento", { lista: "particular", porcentaje: 8, redondeo: 100 })).json()).toEqual({ actualizados: 4 });
    const part = (await api("GET", "/prestaciones/precios?lista=particular")).json() as { codigo: string; precioPaciente: number }[];
    expect(part.find((p) => p.codigo === "01.01")!.precioPaciente).toBe(21600);
    expect(part.find((p) => p.codigo === "02.08")!.precioPaciente).toBe(48600);
    // null quita el precio; negativo no se acepta
    await api("PUT", "/prestaciones/precios", { lista: "particular", precios: [{ prestacionId: idP("10.01"), precioPaciente: null }] });
    expect(((await api("GET", "/prestaciones/precios?lista=particular")).json() as { codigo: string; precioPaciente: number | null }[]).find((p) => p.codigo === "10.01")!.precioPaciente).toBeNull();
    expect((await api("PUT", "/prestaciones/precios", { lista: "particular", precios: [{ prestacionId: idP("10.01"), precioPaciente: -5 }] })).statusCode).toBe(400);
  });
});

describe("prestaciones realizadas y cuenta del paciente", () => {
  it("lo realizado en el odontograma se carga con el precio de su obra social (o el particular), y al anular la marca se anula", async () => {
    const { api, idP, osde, galeno, paciente } = await consultorio();
    const conOsde = await paciente({ obraSocialId: osde, numeroAfiliado: "61-123" });
    const r = await api("POST", `/pacientes/${conOsde.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [16, 26], caras: ["O"], estado: "realizado" });
    expect(r.statusCode, r.body).toBe(201);
    let c = await cuenta(api, conOsde.id);
    expect(c.cargos).toHaveLength(2);
    expect(c.cargos[0]).toMatchObject({ importePaciente: 10000, importeObraSocial: 30000, obraSocial: "OSDE" });
    expect(c.saldo).toBe(20000);
    // Lo "existente" no se cobra (ya venía hecho)
    await api("POST", `/pacientes/${conOsde.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [36], caras: ["O"], estado: "existente" });
    expect((await cuenta(api, conOsde.id)).cargos).toHaveLength(2);
    // Anular la marca anula lo cobrado
    await api("POST", `/pacientes/${conOsde.id}/odontograma/${r.json()[1].id}/anular`, { motivo: "Era otra pieza" });
    c = await cuenta(api, conOsde.id);
    expect(c.saldo).toBe(10000);
    expect(c.cargos.filter((x) => x.anuladoEn)).toHaveLength(1);

    // Galeno no tiene lista: paga el precio particular y la obra social no liquida nada
    const conGaleno = await paciente({ nombre: "Pedro", obraSocialId: galeno });
    await api("POST", `/pacientes/${conGaleno.id}/cargos`, { prestacionId: idP("01.01") });
    expect((await cuenta(api, conGaleno.id)).cargos[0]).toMatchObject({ importePaciente: 20000, importeObraSocial: 0, obraSocial: "Galeno" });
    // Particular, con importe distinto a mano
    const particular = await paciente({ nombre: "Lucía" });
    await api("POST", `/pacientes/${particular.id}/cargos`, { prestacionId: idP("01.01"), importePaciente: 15000 });
    expect((await cuenta(api, particular.id)).saldo).toBe(15000);
  });

  it("pagos con recibo numerado; la recepción cobra pero no anula", async () => {
    const { api, idP, miembro, paciente } = await consultorio();
    const recepcion = await miembro("recepcion", "Ana Recepción");
    const p = await paciente();
    await api("POST", `/pacientes/${p.id}/cargos`, { prestacionId: idP("02.08") });
    const pago1 = await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 30000, medio: "Efectivo" });
    expect(pago1.statusCode, pago1.body).toBe(201);
    expect(pago1.json()).toMatchObject({ numero: 1, saldo: 15000, cobradoPor: "Ana Recepción" });
    const pago2 = (await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 20000, medio: "Transferencia", referencia: "Op 123" })).json();
    expect(pago2).toMatchObject({ numero: 2, saldo: -5000 }); // queda a favor
    expect((await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 0, medio: "Efectivo" })).statusCode).toBe(400);
    expect((await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 10, medio: "Cheque de otro" })).statusCode).toBe(400);
    expect((await recepcion("POST", `/pacientes/${p.id}/pagos/${pago2.id}/anular`, { motivo: "Error" })).statusCode).toBe(403);
    expect((await api("POST", `/pacientes/${p.id}/pagos/${pago2.id}/anular`, { motivo: "La transferencia rebotó" })).statusCode).toBe(200);
    expect((await cuenta(api, p.id)).saldo).toBe(15000);
    // Recibo
    const recibo = (await recepcion("GET", `/pacientes/${p.id}/pagos/${pago1.json().id}`)).json();
    expect(recibo).toMatchObject({ numero: 1, importe: 30000, paciente: { apellido: "González" } });
    // Deudores
    const cobros = (await api("GET", "/consultorio/cobros")).json();
    expect(cobros.deudores[0]).toMatchObject({ apellido: "González", saldo: 15000 });
    expect(cobros.totalAdeudado).toBe(15000);
  });
});

describe("presupuestos odontológicos", () => {
  it("se arma con lo pendiente del odontograma, se acepta y cada renglón realizado se cobra al precio acordado", async () => {
    const { api, idP, osde, miembro, paciente } = await consultorio();
    const recepcion = await miembro("recepcion", "Ana Recepción");
    const p = await paciente({ obraSocialId: osde });
    const pendientes = (await api("POST", `/pacientes/${p.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [16, 26], caras: ["O", "M"], estado: "a_realizar" })).json() as { id: string; pieza: number }[];

    const crear = await api("POST", "/presupuestos-dentales", {
      pacienteId: p.id,
      items: [
        { prestacionId: idP("02.08"), pieza: 16, caras: ["O", "M"], odontogramaId: pendientes[0]!.id },
        { prestacionId: idP("02.08"), pieza: 26, caras: ["O", "M"], odontogramaId: pendientes[1]!.id, descuento: 50 },
        { prestacionId: idP("10.01"), pieza: 48, importePaciente: 55000 },
        { prestacionId: idP("01.01") },
      ],
    });
    expect(crear.statusCode, crear.body).toBe(201);
    const pres = crear.json();
    // 10.000 + 5.000 (50 % off) + 55.000 (a mano) + 5.000 (consulta OSDE)
    expect(pres).toMatchObject({ numero: 1, estado: "Pendiente", obraSocial: "OSDE", total: 75000, validoHasta: sumarDias(hoyAr(), 30) });
    expect(pres.items[3]).toMatchObject({ pieza: null, importeObraSocial: 15000 });
    // Validaciones de renglones
    expect((await api("POST", "/presupuestos-dentales", { pacienteId: p.id, items: [{ prestacionId: idP("10.01") }] })).json().details).toMatchObject({ "items.0.pieza": "Indicá la pieza" });
    expect((await api("POST", "/presupuestos-dentales", { pacienteId: p.id, items: [] })).statusCode).toBe(400);

    // No se realiza lo que el paciente no aceptó
    const item = (i: number) => pres.items[i].id;
    expect((await api("POST", `/presupuestos-dentales/${pres.id}/items/${item(0)}/realizar`, {})).statusCode).toBe(409);
    expect((await api("POST", `/presupuestos-dentales/${pres.id}/estado`, { estado: "Aceptado" })).statusCode).toBe(200);
    // Suben los precios de la lista: lo acordado se respeta
    await api("POST", "/prestaciones/precios/aumento", { lista: osde, porcentaje: 20 });

    // La recepción no realiza prestaciones
    expect((await recepcion("POST", `/presupuestos-dentales/${pres.id}/items/${item(0)}/realizar`, {})).statusCode).toBe(403);
    const r0 = await api("POST", `/presupuestos-dentales/${pres.id}/items/${item(0)}/realizar`, {});
    expect(r0.statusCode, r0.body).toBe(200);
    expect(r0.json().realizados).toBe(1);
    expect((await api("POST", `/presupuestos-dentales/${pres.id}/items/${item(0)}/realizar`, {})).statusCode).toBe(409);
    // Marcarlo en el odontograma también toma el precio del presupuesto
    await api("POST", `/pacientes/${p.id}/odontograma/${pendientes[1]!.id}/realizar`, {});
    // La extracción de la 48 no estaba en el odontograma: se marca sola como realizada
    await api("POST", `/presupuestos-dentales/${pres.id}/items/${item(2)}/realizar`, {});
    await api("POST", `/presupuestos-dentales/${pres.id}/items/${item(3)}/realizar`, {});

    const detalle = (await api("GET", `/presupuestos-dentales/${pres.id}`)).json();
    expect(detalle.realizados).toBe(4);
    const c = await cuenta(api, p.id);
    expect(c.cargos.map((x) => x.importePaciente).sort((a, b) => a - b)).toEqual([5000, 5000, 10000, 55000]);
    expect(c.saldo).toBe(75000);
    const odo = (await api("GET", `/pacientes/${p.id}/odontograma`)).json() as { pieza: number; estado: string }[];
    expect(odo.find((m) => m.pieza === 48)!.estado).toBe("realizado");
    expect(odo.filter((m) => m.estado === "a_realizar")).toHaveLength(0);

    // Con prestaciones realizadas no se rechaza ni se borra
    expect((await api("POST", `/presupuestos-dentales/${pres.id}/estado`, { estado: "Rechazado" })).statusCode).toBe(409);
    expect((await api("DELETE", `/presupuestos-dentales/${pres.id}`)).statusCode).toBe(409);
  });

  it("si ya se había realizado en el odontograma antes de aceptar, no se cobra dos veces", async () => {
    const { api, idP, paciente } = await consultorio();
    const p = await paciente();
    const [m] = (await api("POST", `/pacientes/${p.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [11], caras: ["V"], estado: "a_realizar" })).json() as { id: string }[];
    const pres = (await api("POST", "/presupuestos-dentales", { pacienteId: p.id, items: [{ prestacionId: idP("02.08"), pieza: 11, caras: ["V"], odontogramaId: m!.id }] })).json();
    await api("POST", `/pacientes/${p.id}/odontograma/${m!.id}/realizar`, {}); // todavía pendiente: precio de lista
    await api("POST", `/presupuestos-dentales/${pres.id}/estado`, { estado: "Aceptado" });
    expect((await api("POST", `/presupuestos-dentales/${pres.id}/items/${pres.items[0].id}/realizar`, {})).json().realizados).toBe(1);
    expect((await cuenta(api, p.id)).cargos.filter((x) => !x.anuladoEn)).toHaveLength(1);
  });

  it("pendiente se edita; rechazado se puede borrar; otro consultorio no lo ve", async () => {
    const { api, idP, paciente } = await consultorio();
    const p = await paciente();
    const pres = (await api("POST", "/presupuestos-dentales", { pacienteId: p.id, items: [{ prestacionId: idP("01.01") }] })).json();
    const ed = await api("PUT", `/presupuestos-dentales/${pres.id}`, { items: [{ prestacionId: idP("01.01") }, { prestacionId: idP("02.08"), pieza: 21, caras: ["V"] }], observaciones: "Incluye control" });
    expect(ed.json()).toMatchObject({ total: 65000, observaciones: "Incluye control" });
    await api("POST", `/presupuestos-dentales/${pres.id}/estado`, { estado: "Rechazado" });
    expect((await api("PUT", `/presupuestos-dentales/${pres.id}`, { items: [{ prestacionId: idP("01.01") }] })).statusCode).toBe(409);
    const otro = await consultorio("Otro consultorio");
    expect((await otro.api("GET", `/presupuestos-dentales/${pres.id}`)).statusCode).toBe(404);
    expect((await api("DELETE", `/presupuestos-dentales/${pres.id}`)).statusCode).toBe(204);
  });
});

describe("caja diaria, gastos y liquidación", () => {
  it("apertura, movimientos por medio, arqueo al cierre, y con la caja cerrada no se mueve efectivo de ese día", async () => {
    const { api, paciente, miembro } = await consultorio();
    const recepcion = await miembro("recepcion", "Ana Recepción");
    const p = await paciente();
    expect((await recepcion("POST", "/consultorio/caja/abrir", { aperturaEfectivo: 1000 })).statusCode).toBe(201);
    expect((await recepcion("POST", "/consultorio/caja/abrir", { aperturaEfectivo: 1000 })).statusCode).toBe(409);
    await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 5000, medio: "Efectivo" });
    await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 3000, medio: "Transferencia" });
    await recepcion("POST", "/consultorio/ingresos", { concepto: "Cambio", importe: 200, medio: "Efectivo" });
    const gasto = (await recepcion("POST", "/consultorio/gastos", { categoria: "Proveedores e insumos", descripcion: "Guantes", importe: 1500, medio: "Efectivo", proveedor: "Dental Sur" })).json();
    expect((await recepcion("POST", "/consultorio/gastos", { categoria: "Cualquiera", descripcion: "x", importe: 1, medio: "Efectivo" })).statusCode).toBe(400);

    const caja = (await recepcion("GET", "/consultorio/caja")).json();
    expect(caja).toMatchObject({ esperadoEfectivo: 4700, totalIngresos: 8200, totalEgresos: 1500 });
    expect(caja.porMedio[0]).toMatchObject({ medio: "Efectivo", ingresos: 5200, egresos: 1500 });

    const cierre = (await recepcion("POST", "/consultorio/caja/cerrar", { contadoEfectivo: 4650, notas: "Faltan $ 50" })).json();
    expect(cierre.caja).toMatchObject({ esperadoEfectivo: 4700, contadoEfectivo: 4650, diferencia: -50, cerradaPor: "Ana Recepción" });
    expect((await recepcion("POST", "/consultorio/caja/cerrar", { contadoEfectivo: 1 })).statusCode).toBe(409);
    // Cerrada: efectivo no; transferencia sí
    expect((await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 100, medio: "Efectivo" })).statusCode).toBe(409);
    expect((await recepcion("POST", `/pacientes/${p.id}/pagos`, { importe: 100, medio: "Transferencia" })).statusCode).toBe(201);
    expect((await api("POST", `/consultorio/gastos/${gasto.id}/anular`, { motivo: "Error" })).statusCode).toBe(409);
    // Un día anterior sin caja: se puede cargar
    expect((await recepcion("POST", "/consultorio/gastos", { fecha: sumarDias(hoyAr(), -3), categoria: "Servicios", descripcion: "Luz", importe: 20000, medio: "Transferencia" })).statusCode).toBe(201);
    // Solo el administrador reabre
    expect((await recepcion("POST", "/consultorio/caja/reabrir", { fecha: hoyAr() })).statusCode).toBe(403);
    expect((await api("POST", "/consultorio/caja/reabrir", { fecha: hoyAr() })).json().caja.cerradaEn).toBeNull();
    expect((await api("POST", `/consultorio/gastos/${gasto.id}/anular`, { motivo: "Se cargó dos veces" })).statusCode).toBe(200);

    const mes = { desde: sumarDias(hoyAr(), -10), hasta: hoyAr() };
    const g = (await api("GET", `/consultorio/gastos?desde=${mes.desde}&hasta=${mes.hasta}`)).json();
    expect(g).toMatchObject({ total: 20000, porCategoria: [{ categoria: "Servicios", total: 20000 }] });
    const res = (await api("GET", `/consultorio/resumen?desde=${mes.desde}&hasta=${mes.hasta}`)).json();
    expect(res).toMatchObject({ cobradoPacientes: 8100, otrosIngresos: 200, gastos: 20000, resultado: -11700 });
  });

  it("liquidación a una obra social: solo sus prestaciones, sin anuladas, con afiliado y total", async () => {
    const { api, idP, osde, galeno, paciente } = await consultorio();
    const a = await paciente({ nombre: "Ana", dni: "30111222", obraSocialId: osde, numeroAfiliado: "61-1", plan: "310" });
    const b = await paciente({ nombre: "Beto", dni: "30111223", obraSocialId: osde, numeroAfiliado: "61-2" });
    const c = await paciente({ nombre: "Caro", obraSocialId: galeno });
    await api("POST", `/pacientes/${a.id}/cargos`, { prestacionId: idP("01.01") });
    const marcas = (await api("POST", `/pacientes/${b.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [16, 17], caras: ["O"], estado: "realizado" })).json();
    await api("POST", `/pacientes/${b.id}/odontograma/${marcas[1].id}/anular`, { motivo: "Duplicada" });
    await api("POST", `/pacientes/${c.id}/cargos`, { prestacionId: idP("01.01") });
    // Si el paciente cambia de obra social, lo ya hecho sigue siendo de OSDE
    await api("PUT", `/pacientes/${a.id}`, { nombre: "Ana", apellido: "González", dni: "30111222", obraSocialId: galeno });

    const hoy = hoyAr();
    const liq = await api("GET", `/consultorio/liquidacion?obraSocialId=${osde}&desde=${sumarDias(hoy, -30)}&hasta=${hoy}`);
    expect(liq.statusCode, liq.body).toBe(200);
    expect(liq.json()).toMatchObject({ obraSocial: "OSDE", total: 45000, pacientes: 2 });
    expect(liq.json().prestaciones.map((x: { numeroAfiliado: string; codigo: string }) => `${x.numeroAfiliado} ${x.codigo}`).sort()).toEqual(["61-1 01.01", "61-2 02.08"]);
  });

  it("una empresa de gestión no tiene caja de consultorio", async () => {
    const { token } = await registrarEmpresa(app);
    expect((await pedir(token)("GET", "/consultorio/caja")).statusCode).toBe(404);
    expect((await pedir(token)("GET", "/presupuestos-dentales")).statusCode).toBe(404);
  });
});
