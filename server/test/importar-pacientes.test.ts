import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
beforeAll(async () => {
  ({ app, cerrar } = await crearApp());
});
afterAll(() => cerrar());

async function consultorio() {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura", email: emailUnico("laura"), password: "clave-segura-123" }, aceptaTerminos: true, producto: "dental" },
  });
  expect(r.statusCode, r.body).toBe(201);
  const token = r.json().token;
  return (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
}

describe("importar pacientes desde una planilla", () => {
  it("vista previa, alta con obras sociales nuevas, nombres juntos en una columna y errores por fila", async () => {
    const api = await consultorio();
    const filas = [
      { apellido: "Pérez", nombre: "Juan Carlos", dni: "30.123.456", fechaNacimiento: "1985-03-15", sexo: "M", telefono: "11 5555-1234", obraSocial: "OSDE", plan: "210", numeroAfiliado: "61-1" },
      { nombreCompleto: "Gómez, María Laura", obraSocial: "osde", alergias: "Penicilina" },
      { nombreCompleto: "RODRIGUEZ ANA", obraSocial: "Particular" },
      { apellido: "López", nombre: "Pedro", obraSocial: "Obra Social Inventada", email: "no-es-un-email" },
      { apellido: "Sosa", nombre: "Lucía", dni: "123" },
      { apellido: "Pérez", nombre: "Otro", dni: "30123456" },
      { nombre: "Sin apellido" },
    ];
    // Primero muestra qué va a pasar, sin guardar
    const previa = (await api("POST", "/importar/pacientes", { filas, siExiste: "omitir", simular: true })).json();
    expect(previa).toMatchObject({ total: 7, crear: 3, actualizar: 0, omitir: 0, aplicado: false });
    expect(previa.errores.map((e: { fila: number }) => e.fila)).toEqual([5, 6, 7, 8]);
    expect(previa.errores[0].errores).toHaveProperty("email");
    expect(previa.errores[1].errores.dni).toMatch(/7 u 8 números/);
    expect(previa.errores[2].errores.dni).toMatch(/Repetido en el archivo \(ya está en la fila 2\)/);
    expect(previa.errores[3].errores).toHaveProperty("apellido");
    expect((await api("GET", "/pacientes")).json()).toHaveLength(0);

    const r = (await api("POST", "/importar/pacientes", { filas, siExiste: "omitir", simular: false })).json();
    expect(r).toMatchObject({ crear: 3, aplicado: true });
    const lista = (await api("GET", "/pacientes/exportar")).json() as { apellido: string; nombre: string; dni: string | null; obraSocial: string | null; plan: string | null; numeroAfiliado: string | null }[];
    expect(lista.map((p) => `${p.apellido}, ${p.nombre}`)).toEqual(["Gómez, María Laura", "Pérez, Juan Carlos", "RODRIGUEZ, ANA"]);
    expect(lista.find((p) => p.apellido === "Pérez")).toMatchObject({ dni: "30123456", obraSocial: "OSDE", plan: "210", numeroAfiliado: "61-1" });
    // "osde" y "OSDE" son la misma (no se duplica); "Particular" no es una obra social
    expect(lista.find((p) => p.apellido === "Gómez")!.obraSocial).toBe("OSDE");
    expect(lista.find((p) => p.apellido === "RODRIGUEZ")!.obraSocial).toBeNull();
    const obras = (await api("GET", "/pacientes/obras-sociales")).json().map((o: { nombre: string }) => o.nombre) as string[];
    expect(obras.filter((n) => /^osde$/i.test(n))).toHaveLength(1);
    expect(obras).not.toContain("Particular");
    expect(obras).not.toContain("Obra Social Inventada"); // la de la fila con error no se creó
    // Sin DNI queda marcado para completar; las alergias quedaron en la ficha
    const fichas = (await api("GET", "/pacientes")).json() as { id: string; apellido: string; datosPendientes: boolean }[];
    const gomez = fichas.find((p) => p.apellido === "Gómez")!;
    expect(gomez.datosPendientes).toBe(true);
    expect((await api("GET", `/pacientes/${gomez.id}`)).json().alergias).toBe("Penicilina");
  });

  it("volver a importar no duplica: se omiten o se actualizan (por DNI, o por apellido y nombre)", async () => {
    const api = await consultorio();
    await api("POST", "/importar/pacientes", { filas: [{ apellido: "Pérez", nombre: "Juan", dni: "30123456", telefono: "11 1111-1111", obraSocial: "OSDE" }, { apellido: "Gómez", nombre: "María" }], siExiste: "omitir", simular: false });
    const otra = [
      { apellido: "Perez", nombre: "Juan", dni: "30123456", telefono: "11 2222-2222" }, // mismo DNI
      { apellido: "GOMEZ", nombre: "maría", dni: "28999888" }, // misma persona (sin DNI cargado): se le completa
      { apellido: "Nuevo", nombre: "Paciente" },
    ];
    expect((await api("POST", "/importar/pacientes", { filas: otra, siExiste: "omitir", simular: false })).json()).toMatchObject({ crear: 1, omitir: 2, actualizar: 0 });
    expect((await api("POST", "/importar/pacientes", { filas: otra, siExiste: "actualizar", simular: false })).json()).toMatchObject({ crear: 0, actualizar: 3 });
    const lista = (await api("GET", "/pacientes/exportar")).json() as { apellido: string; dni: string | null; telefono: string | null; obraSocial: string | null }[];
    expect(lista).toHaveLength(3);
    // Se actualizó el teléfono y la obra social que tenía no se tocó (la planilla no la traía)
    expect(lista.find((p) => p.dni === "30123456")).toMatchObject({ telefono: "11 2222-2222", obraSocial: "OSDE" });
    expect(lista.find((p) => p.dni === "28999888")).toBeTruthy();
  });

  it("es de CoreDental y pide permiso para editar pacientes", async () => {
    const { token } = await registrarEmpresa(app);
    const r = await app.inject({ method: "POST", url: "/api/importar/pacientes", headers: auth(token), payload: { filas: [{ apellido: "A", nombre: "B" }], siExiste: "omitir", simular: true } });
    expect(r.statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/importar/pacientes", payload: { filas: [] } })).statusCode).toBe(401);
  });
});
