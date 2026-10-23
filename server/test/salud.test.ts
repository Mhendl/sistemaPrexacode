import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configArca, plataformaConfig, prospeccionCampanas, prospeccionConfig, prospectos } from "../src/db/schema.js";
import { controlDiario, revisarSalud } from "../src/lib/salud.js";
import { auth, carteroDePrueba, crearApp, registrarEmpresa, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
const smtp = { falla: null as Error | null };
const disco = { libre: 0.6 };
const espacioLibre = async () => disco.libre;
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
let copias = "";
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({
    cartero: {
      ...correo.cartero,
      verificarPlataforma: async () => {
        if (smtp.falla) throw smtp.falla;
      },
    },
    adminInicial: ADMIN,
  }));
  copias = await mkdtemp(join(tmpdir(), "copias-"));
});
afterAll(() => cerrar());

/** Miércoles 28/10/2026 a las 15 de Argentina */
const MIERCOLES_15 = new Date("2026-10-28T18:00:00Z");
const copia = async (nombre: string, horasAtras: number) => {
  const f = join(copias, nombre);
  await writeFile(f, "x");
  const t = new Date(MIERCOLES_15.getTime() - horasAtras * 3600_000);
  await utimes(f, t, t);
};
const ques = async () => (await revisarSalud(app, { carpetaCopias: copias, ahora: MIERCOLES_15, espacioLibre })).map((p) => p.que);

describe("control diario de producción", () => {
  it("avisa lo que anda mal: copias, casillas pausadas o que no mandan, certificado de ARCA por vencer y correo caído", async () => {
    // Sin copias de seguridad
    expect(await ques()).toContain("No hay copias de seguridad de la base");
    await copia("prexacode-20261026-1229.dump", 50);
    expect(await ques()).toContain("No se hizo la copia de seguridad de hoy");
    await copia("prexacode-20261028-1229.dump", 3);
    expect(await ques()).toEqual([]);

    // Una casilla pausada por un error
    await app.inject({ method: "GET", url: "/api/plataforma/prospeccion/config", headers: auth((await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token) });
    await app.db.update(prospeccionConfig).set({ remitenteEmail: "sistema@prexacode.com", activa: false, ultimoError: "No se pudo leer la casilla: getaddrinfo EAI_AGAIN" }).where(eq(prospeccionConfig.id, 1));
    expect(await ques()).toEqual(["La casilla de prospección sistema@prexacode.com está pausada"]);

    // Activa, con contactos esperando, y a las 15 de un día hábil no mandó nada
    await app.db.update(prospeccionConfig).set({ activa: true, ultimoError: null }).where(eq(prospeccionConfig.id, 1));
    const [c] = await app.db.insert(prospeccionCampanas).values({ nombre: "PyMEs", producto: "gestion", pasos: [{ dias: 0, asunto: "Hola", cuerpo: "Hola" }] }).returning();
    await app.db.insert(prospectos).values({ campanaId: c!.id, email: "alguien@pyme.com", token: "tok-salud-1", proximoEnvio: new Date("2026-10-28T12:00:00Z") });
    expect(await ques()).toEqual(["La casilla sistema@prexacode.com no mandó ningún email hoy"]);
    // (un sábado no es problema)
    expect(await revisarSalud(app, { carpetaCopias: copias, ahora: new Date("2026-10-31T18:00:00Z"), espacioLibre }).then((r) => r.map((p) => p.que))).not.toContain("La casilla sistema@prexacode.com no mandó ningún email hoy");
    await app.db.update(prospectos).set({ estado: "Terminado" });

    // El certificado de ARCA de la facturación de la plataforma
    const { empresa } = await registrarEmpresa(app);
    await app.db.update(plataformaConfig).set({ emisorEmpresaId: empresa.id });
    await app.db.insert(configArca).values({ empresaId: empresa.id, modo: "produccion", certificadoVence: new Date("2026-11-07T00:00:00Z") }).onConflictDoUpdate({ target: configArca.empresaId, set: { modo: "produccion", certificadoVence: new Date("2026-11-07T00:00:00Z") } });
    expect(await ques()).toEqual(["El certificado de ARCA de tu facturación vence en 9 días"]);
    await app.db.update(configArca).set({ certificadoVence: new Date("2028-09-30T00:00:00Z") }).where(eq(configArca.empresaId, empresa.id));

    // El correo del sistema
    smtp.falla = new Error("Connection timeout");
    expect(await ques()).toEqual(["No funciona el correo del sistema"]);
    smtp.falla = null;
    expect(await ques()).toEqual([]);

    // El disco casi lleno
    disco.libre = 0.04;
    expect(await ques()).toEqual(["Al disco del servidor le queda poco lugar"]);
    disco.libre = 0.6;
  });

  it("una vez por día, desde las 8: si hay algo, les escribe a los administradores de la plataforma; y se ve en el panel", async () => {
    await app.db.update(prospeccionConfig).set({ activa: false, ultimoError: "La casilla rechazó el usuario o la contraseña" }).where(eq(prospeccionConfig.id, 1));
    // A las 7 todavía no
    expect(await controlDiario(app, { carpetaCopias: copias, espacioLibre, ahora: new Date("2026-10-29T10:00:00Z") })).toBeNull();
    const antes = correo.enviados.length;
    const r = await controlDiario(app, { carpetaCopias: copias, espacioLibre, ahora: new Date("2026-10-29T11:30:00Z") });
    expect(r?.map((p) => p.que)).toEqual(["La casilla de prospección sistema@prexacode.com está pausada"]);
    const aviso = correo.enviados.slice(antes);
    expect(aviso).toHaveLength(1);
    expect(aviso[0]!.mensaje).toMatchObject({ para: ADMIN.email, asunto: "Prexacode: La casilla de prospección sistema@prexacode.com está pausada" });
    expect(aviso[0]!.mensaje.texto).toContain("La casilla rechazó el usuario o la contraseña");
    // El mismo día no lo repite; al otro día, sí
    expect(await controlDiario(app, { carpetaCopias: copias, espacioLibre, ahora: new Date("2026-10-29T20:00:00Z") })).toBeNull();
    expect((await controlDiario(app, { carpetaCopias: copias, espacioLibre, ahora: new Date("2026-10-30T11:30:00Z") }))?.map((p) => p.que)).toContain("La casilla de prospección sistema@prexacode.com está pausada");

    // En el panel (solo para la plataforma)
    expect((await app.inject({ method: "GET", url: "/api/plataforma/salud" })).statusCode).toBe(401);
    const panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN })).json().token;
    const salud = (await app.inject({ method: "GET", url: "/api/plataforma/salud", headers: auth(panel) })).json();
    expect(salud.problemas.map((p: { que: string }) => p.que)).toContain("La casilla de prospección sistema@prexacode.com está pausada");
  });
});
