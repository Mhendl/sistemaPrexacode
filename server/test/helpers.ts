import { buildApp, type AppOptions } from "../src/app.js";
import type { Cartero, Mensaje, Transporte } from "../src/lib/email/cartero.js";
import { openDatabase } from "../src/db/client.js";
import { digitoVerificador } from "../src/lib/cuit.js";

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

/** App con una base PGlite en memoria, nueva para cada archivo de pruebas */
/** Base nueva para cada archivo: PGlite en memoria, o una base propia en PostgreSQL real si se corre con test:postgres */
async function baseDePrueba() {
  const servidor = process.env.TEST_PG_URL;
  if (!servidor) return openDatabase("memory://");
  const { Client } = await import("pg");
  const nombre = `prueba_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Client({ connectionString: `${servidor}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nombre}`);
  await admin.end();
  const abierta = await openDatabase(`${servidor}/${nombre}`);
  return {
    db: abierta.db,
    close: async () => {
      await abierta.close();
      const a = new Client({ connectionString: `${servidor}/postgres` });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      await a.end();
    },
  };
}

export async function crearApp(opciones: Partial<Omit<AppOptions, "db" | "jwtSecret">> = {}) {
  const { db, close } = await baseDePrueba();
  const app = await buildApp({ db, jwtSecret: "test-secret", limitarIntentos: false, ...opciones });
  return {
    app,
    cerrar: async () => {
      await app.close();
      await close();
    },
  };
}

let secuencia = 10_000_000;

/** Genera un CUIT válido y único (con dígito verificador correcto) */
export function cuitValido(prefijo: "20" | "27" | "30" | "33" = "30"): string {
  for (;;) {
    const base = `${prefijo}${String(secuencia++).padStart(8, "0")}`;
    const dv = digitoVerificador(base);
    // Evitamos los casos en que el cálculo da 10 (ARCA no los asigna con ese prefijo)
    if (11 - (Number([...base].reduce((a, d, i) => a + Number(d) * [5, 4, 3, 2, 7, 6, 5, 4, 3, 2][i], 0)) % 11) === 10) continue;
    return `${base}${dv}`;
  }
}

let emails = 0;
export const emailUnico = (prefijo = "usuario") => `${prefijo}${++emails}.${Date.now()}@prueba.com.ar`;

/** Registra una empresa nueva con su administrador y devuelve el token */
export async function registrarEmpresa(app: TestApp, nombre = "Empresa de Prueba S.A.", condicionIva = "Responsable Inscripto") {
  const email = emailUnico("admin");
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: {
      empresa: { razonSocial: nombre, cuit: cuitValido("30"), condicionIva },
      usuario: { nombre: "Admin Prueba", email, password: "clave-segura-123" },
      aceptaTerminos: true,
    },
  });
  if (res.statusCode !== 201) throw new Error(`Registro falló: ${res.body}`);
  const body = res.json();
  return { token: body.token as string, empresa: body.empresa, empresaId: body.empresa.id as string, usuario: body.usuario, email };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Cartero de prueba: guarda lo que se "envía" y puede simular una falla del servidor */
export function carteroDePrueba() {
  const enviados: { transporte: Transporte; mensaje: Mensaje }[] = [];
  const estado: { falla: (Error & { code?: string }) | null } = { falla: null };
  const cartero: Cartero = {
    async enviar(transporte, mensaje) {
      if (estado.falla) throw estado.falla;
      enviados.push({ transporte, mensaje });
    },
  };
  return { cartero, enviados, estado };
}
