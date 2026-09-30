import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hoyAr } from "../src/lib/cuentas.js";
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
/** Una firma de verdad: PNG chico */
const FIRMA = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString("base64")}`;

async function consultorio(nombre = "Consultorio Sonrisas") {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: nombre, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email: emailUnico("dra"), password: CLAVE }, aceptaTerminos: true, producto: "dental" },
  });
  expect(r.statusCode, r.body).toBe(201);
  const api = pedir(r.json().token);
  const miembro = async (rol: "profesional" | "recepcion") => {
    const email = emailUnico(rol);
    expect((await api("POST", "/usuarios", { nombre: `Usuario ${rol}`, email, password: CLAVE, rol })).statusCode).toBe(201);
    return pedir((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: CLAVE } })).json().token);
  };
  const paciente = async () => (await api("POST", "/pacientes", { nombre: "María", apellido: "González", dni: "28456789" })).json() as { id: string };
  return { api, miembro, paciente };
}

describe("laboratorios", () => {
  it("trabajos, recibido, pagos que pasan por gastos y la caja, y el saldo", async () => {
    const { api, paciente, miembro } = await consultorio();
    const p = await paciente();
    const lab = await api("POST", "/laboratorios", { nombre: "Laboratorio Dental Sur", telefono: "11 4000-0000" });
    expect(lab.statusCode, lab.body).toBe(201);
    expect((await api("POST", "/laboratorios", { nombre: "Laboratorio Dental Sur" })).statusCode).toBe(409);
    const id = lab.json().id;

    const corona = (await api("POST", `/laboratorios/${id}/trabajos`, { descripcion: "Corona de porcelana", pacienteId: p.id, pieza: 46, importe: 80000, fechaPrevista: hoyAr() })).json();
    const protesis = (await api("POST", `/laboratorios/${id}/trabajos`, { descripcion: "Prótesis parcial", importe: 50000 })).json();
    expect((await api("POST", `/laboratorios/${id}/trabajos`, { descripcion: "x", importe: 1 })).statusCode).toBe(400);
    expect((await api("POST", `/laboratorios/${id}/trabajos`, { descripcion: "Mal", importe: 1, pieza: 19 })).statusCode).toBe(400);

    // Recibido; y la prótesis se cancela (no cuenta en el saldo)
    expect((await api("POST", `/laboratorios/trabajos/${corona.id}/recibir`)).json()).toMatchObject({ estado: "Recibido", fechaRecibido: hoyAr() });
    expect((await api("POST", `/laboratorios/trabajos/${corona.id}/recibir`)).statusCode).toBe(409);
    await api("POST", `/laboratorios/trabajos/${protesis.id}/cancelar`, { motivo: "El paciente no siguió" });

    // Pago parcial en efectivo: queda como gasto de Laboratorio y sale de la caja
    await api("POST", "/consultorio/caja/abrir", { aperturaEfectivo: 100000 });
    const pago = await api("POST", `/laboratorios/${id}/pagos`, { importe: 30000, medio: "Efectivo", comprobante: "R-0001" });
    expect(pago.statusCode, pago.body).toBe(201);
    expect(pago.json()).toMatchObject({ categoria: "Laboratorio", descripcion: "Pago a Laboratorio Dental Sur" });
    expect((await api("GET", "/consultorio/caja")).json().esperadoEfectivo).toBe(70000);

    const detalle = (await api("GET", `/laboratorios/${id}`)).json();
    expect(detalle).toMatchObject({ totalTrabajos: 80000, pagado: 30000, saldo: 50000 });
    expect(detalle.trabajos.find((t: { descripcion: string }) => t.descripcion === "Corona de porcelana").paciente).toBe("González, María");
    const lista = (await api("GET", "/laboratorios")).json();
    expect(lista[0]).toMatchObject({ saldo: 50000, pendientes: 0 });
    // Si el gasto se anula, vuelve la deuda
    await api("POST", `/consultorio/gastos/${pago.json().id}/anular`, { motivo: "Se cargó mal" });
    expect((await api("GET", `/laboratorios/${id}`)).json().saldo).toBe(80000);
    // Trabajos del paciente
    expect((await api("GET", `/laboratorios/trabajos/paciente/${p.id}`)).json()[0]).toMatchObject({ laboratorio: "Laboratorio Dental Sur", pieza: 46 });

    // El profesional encarga pero no paga (no tiene el permiso de cobros y pagos)
    const prof = await miembro("profesional");
    expect((await prof("POST", `/laboratorios/${id}/trabajos`, { descripcion: "Incrustación", importe: 20000 })).statusCode).toBe(201);
    expect((await prof("POST", `/laboratorios/${id}/pagos`, { importe: 1000, medio: "Transferencia" })).statusCode).toBe(403);
  });
});

describe("consentimientos informados", () => {
  it("se firma con el texto completado, queda inalterable, se puede revocar; la recepción no los ve", async () => {
    const { api, paciente, miembro } = await consultorio();
    const p = await paciente();
    const plantillas = (await api("GET", "/clinica/consentimientos/plantillas")).json() as { id: string; titulo: string }[];
    expect(plantillas.length).toBe(4);
    const ext = plantillas.find((x) => x.titulo.includes("extracción"))!;
    const previa = (await api("GET", `/clinica/pacientes/${p.id}/consentimientos/previa?plantillaId=${ext.id}`)).json();
    expect(previa.texto).toContain("Yo, María González, DNI 28.456.789, autorizo a Dra. Laura Pérez");
    expect(previa.texto).not.toContain("{");

    // Sin firma, o con una firma que no es imagen, no se guarda
    expect((await api("POST", `/clinica/pacientes/${p.id}/consentimientos`, { plantillaId: ext.id })).statusCode).toBe(400);
    expect((await api("POST", `/clinica/pacientes/${p.id}/consentimientos`, { plantillaId: ext.id, firmaPaciente: "data:image/png;base64,AAAA" })).statusCode).toBe(400);
    const c = await api("POST", `/clinica/pacientes/${p.id}/consentimientos`, { plantillaId: ext.id, firmaPaciente: FIRMA, firmaProfesional: FIRMA });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json()).toMatchObject({ titulo: ext.titulo, firmante: "María González", firmanteDni: "28456789", vinculo: "Paciente", profesional: "Dra. Laura Pérez" });
    expect(c.json().firmaPaciente).toBeUndefined();

    // Menor: firma el tutor, con su nombre
    expect((await api("POST", `/clinica/pacientes/${p.id}/consentimientos`, { plantillaId: ext.id, vinculo: "Madre, padre o tutor", firmaPaciente: FIRMA })).json().details).toMatchObject({ firmante: "Obligatorio" });
    const tutor = (await api("POST", `/clinica/pacientes/${p.id}/consentimientos`, { plantillaId: ext.id, vinculo: "Madre, padre o tutor", firmante: "Ana González", firmanteDni: "20.111.222", firmaPaciente: FIRMA })).json();
    expect(tutor).toMatchObject({ firmante: "Ana González", firmanteDni: "20111222" });

    const completo = (await api("GET", `/clinica/pacientes/${p.id}/consentimientos/${c.json().id}`)).json();
    expect(completo.firmaPaciente).toBe(FIRMA);
    expect(completo.texto).toContain("DNI 28.456.789");
    // Si después cambia la plantilla, lo firmado queda como se leyó
    await api("PUT", `/clinica/consentimientos/plantillas/${ext.id}`, { titulo: ext.titulo, texto: "Texto totalmente nuevo de la plantilla de extracción." });
    expect((await api("GET", `/clinica/pacientes/${p.id}/consentimientos/${c.json().id}`)).json().texto).toContain("DNI 28.456.789");

    // Revocar: queda registrado; no se puede dos veces
    expect((await api("POST", `/clinica/pacientes/${p.id}/consentimientos/${c.json().id}/revocar`, { motivo: "Decidió no hacerse la extracción" })).json()).toMatchObject({ revocadoPor: "Dra. Laura Pérez" });
    expect((await api("POST", `/clinica/pacientes/${p.id}/consentimientos/${c.json().id}/revocar`, { motivo: "Otra vez" })).statusCode).toBe(409);
    expect((await api("GET", `/clinica/pacientes/${p.id}/consentimientos`)).json()).toHaveLength(2);

    const recepcion = await miembro("recepcion");
    expect((await recepcion("GET", `/clinica/pacientes/${p.id}/consentimientos`)).statusCode).toBe(403);
    // Otro consultorio no lo ve
    const otro = await consultorio("Otro Consultorio");
    expect((await otro.api("GET", `/clinica/pacientes/${p.id}/consentimientos/${c.json().id}`)).statusCode).toBe(404);
  });
});

describe("periodontograma", () => {
  const pieza = (ps: (number | null)[], sangrado = [false, false, false, false, false, false], mg: (number | null)[] = [0, 0, 0, 0, 0, 0]) => ({ ps, mg, sangrado, placa: [false, false, false, false, false, false], movilidad: 0, furca: 0 });

  it("examen con índices calculados; validaciones; no se modifica, se hace otro para comparar", async () => {
    const { api, paciente } = await consultorio();
    const p = await paciente();
    const r = await api("POST", `/clinica/pacientes/${p.id}/periodontogramas`, {
      fecha: "2026-09-01",
      notas: "Control inicial",
      piezas: {
        "16": pieza([3, 4, 5, 3, 2, 6], [true, true, false, false, false, true], [1, 0, 0, 0, 0, 2]),
        "11": pieza([2, 2, 2, 2, 2, 2]),
        "48": { ...pieza([null, null, null, null, null, null]), ausente: true },
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().indices).toMatchObject({ piezas: 2, sitios: 12, psPromedio: 2.9, sangrado: 25, sitiosPs4: 3, sitiosPs6: 1, nicPromedio: 3.2 });

    const mal = (piezas: object) => api("POST", `/clinica/pacientes/${p.id}/periodontogramas`, { piezas });
    expect((await mal({ "19": pieza([1, 1, 1, 1, 1, 1]) })).statusCode).toBe(400);
    expect((await mal({ "16": pieza([1, 1, 1]) })).statusCode).toBe(400);
    expect((await mal({ "16": pieza([-2, 1, 1, 1, 1, 1]) })).statusCode).toBe(400);
    expect((await mal({ "16": pieza([null, null, null, null, null, null]) })).statusCode).toBe(400);

    await api("POST", `/clinica/pacientes/${p.id}/periodontogramas`, { piezas: { "16": pieza([2, 3, 3, 2, 2, 3]), "11": pieza([2, 2, 2, 2, 2, 2]) } });
    const lista = (await api("GET", `/clinica/pacientes/${p.id}/periodontogramas`)).json();
    expect(lista.map((x: { fecha: string }) => x.fecha)).toEqual(["2026-09-01", hoyAr()]);
    expect(lista[1].indices.sangrado).toBe(0);
    expect((await api("PUT", `/clinica/pacientes/${p.id}/periodontogramas/${lista[0].id}`, {})).statusCode).toBe(404);
  });

  it("una empresa de gestión no tiene nada de esto", async () => {
    const { token } = await registrarEmpresa(app);
    for (const url of ["/laboratorios", "/clinica/consentimientos/plantillas"]) expect((await pedir(token)("GET", url)).statusCode, url).toBe(404);
  });
});
