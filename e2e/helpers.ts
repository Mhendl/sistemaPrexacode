import { expect, type APIRequestContext, type Page } from "@playwright/test";

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
let seq = Math.floor(Math.random() * 50_000_000) + 10_000_000;

/** CUIT válido y único para cada prueba */
export function cuitValido(prefijo = "30"): string {
  for (;;) {
    const base = `${prefijo}${String(seq++ % 100_000_000).padStart(8, "0")}`;
    const resto = 11 - (PESOS.reduce((a, p, i) => a + p * Number(base[i]), 0) % 11);
    if (resto === 10) continue;
    return `${base}${resto === 11 ? 0 : resto}`;
  }
}

export const formatear = (cuit: string) => `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;

let n = 0;
export const emailUnico = (p = "e2e") => `${p}.${Date.now()}.${++n}.${Math.floor(Math.random() * 1e6)}@prueba.com.ar`;

export const PASSWORD = "clave-segura-123";

export interface Cuenta {
  email: string;
  razonSocial: string;
  token: string;
}

/** Crea una empresa por API (rápido) para las pruebas que no prueban el registro */
export async function crearCuenta(request: APIRequestContext, razonSocial = `Empresa E2E ${Date.now()}`): Promise<Cuenta> {
  const email = emailUnico("admin");
  const res = await request.post("/api/auth/registro", {
    data: {
      empresa: { razonSocial, cuit: cuitValido(), condicionIva: "Responsable Inscripto" },
      usuario: { nombre: "Ana Pérez", email, password: PASSWORD },
      aceptaTerminos: true,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { email, razonSocial, token: (await res.json()).token };
}

/** Deja la sesión iniciada en el navegador (una sola vez: si después se cierra sesión, queda cerrada) */
export async function entrarCon(page: Page, cuenta: Cuenta) {
  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("prexacode-token", token), cuenta.token);
}

/** Login por la pantalla */
export async function loginUI(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

/** Elige una opción en un Select de Radix */
export async function elegir(page: Page, label: string | RegExp, opcion: string) {
  await page.getByLabel(label, typeof label === "string" ? { exact: true } : undefined).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

export async function cerrarSesion(page: Page) {
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Administrador del panel de Prexacode (lo crea el servidor con ADMIN_EMAIL / ADMIN_PASSWORD) */
export const ADMIN_PANEL = { email: "admin@prexacode.test", password: "clave-panel-e2e-123" };

/** Entra al panel de administración por su propia pantalla de login */
export async function entrarAlPanel(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_PANEL.email);
  await page.getByLabel("Contraseña").fill(ADMIN_PANEL.password);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.getByTestId("resumen-admin")).toBeVisible();
}
