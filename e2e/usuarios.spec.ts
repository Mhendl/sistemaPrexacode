import { expect, test, type Page } from "@playwright/test";
import { cerrarSesion, crearCuenta, elegir, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

async function crearUsuario(page: Page, nombre: string, email: string, rol: string) {
  await page.goto("/configuracion?tab=usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre y apellido").fill(nombre);
  await d.getByLabel("Email").fill(email);
  await elegir(page, "Rol", rol);
  await d.getByLabel("Contraseña inicial").fill(PASSWORD);
  await d.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByTestId(`usuario-${email}`)).toBeVisible();
}

test.describe("Usuarios y permisos", () => {
  test("el administrador crea un vendedor que entra y ve solo lo suyo", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    const email = emailUnico("ventas");
    await crearUsuario(page, "Diego Ferreyra", email, "Ventas");
    await expect(page.getByTestId(`usuario-${email}`)).toContainText("Ventas");

    await cerrarSesion(page);
    await loginUI(page, email);
    await expect(page.getByRole("heading", { name: "Hola, Diego" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(0);

    // Entrando directo a configuración ve "Sin acceso"
    await page.goto("/configuracion");
    await expect(page.getByText("Sin acceso a este módulo")).toBeVisible();
  });

  test("un usuario de Operaciones no accede a Clientes", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    const email = emailUnico("ops");
    await crearUsuario(page, "Valeria Núñez", email, "Operaciones");
    await cerrarSesion(page);
    await page.evaluate(() => localStorage.clear());

    await loginUI(page, email);
    await expect(page.getByRole("heading", { name: "Hola, Valeria" })).toBeVisible();
    // En "Primeros pasos" solo ve lo que puede hacer: productos sí, clientes y facturas no
    await expect(page.getByTestId("primeros-pasos")).toContainText("Cargá tus productos");
    await expect(page.getByTestId("primeros-pasos")).not.toContainText("clientes");
    await expect(page.getByTestId("primeros-pasos")).not.toContainText("factura");
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page.getByText("Sin acceso a este módulo")).toBeVisible();
  });

  test("un usuario suspendido no puede entrar y reactivado sí", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    const email = emailUnico("susp");
    await crearUsuario(page, "Tomás Acuña", email, "Ventas");

    const fila = page.getByTestId(`usuario-${email}`);
    await fila.getByRole("button", { name: "Acciones de Tomás Acuña" }).click();
    await page.getByRole("menuitem", { name: "Suspender" }).click();
    await expect(fila).toContainText("Suspendido");

    // Otra ventana sin sesión intenta entrar como el suspendido
    const otra = await page.context().browser()!.newPage();
    await loginUI(otra, email);
    await expect(otra.getByRole("alert")).toContainText("suspendido");

    await fila.getByRole("button", { name: "Acciones de Tomás Acuña" }).click();
    await page.getByRole("menuitem", { name: "Reactivar" }).click();
    await expect(fila).toContainText("Activo");

    await loginUI(otra, email);
    await expect(otra.getByRole("heading", { name: "Hola, Tomás" })).toBeVisible();
  });

  test("el mismo usuario en dos computadoras: la primera se cierra y avisa por qué", async ({ page, browser, request }) => {
    const cuenta = await crearCuenta(request);
    await loginUI(page, cuenta.email);
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();

    const otra = await browser.newContext();
    const pagina2 = await otra.newPage();
    await loginUI(pagina2, cuenta.email);
    await expect(pagina2.getByRole("heading", { name: /^Hola, / })).toBeVisible();

    // En la primera, al seguir trabajando, se cierra la sesión con el motivo
    await page.goto("/clientes");
    await expect(page.getByTestId("aviso-sesion")).toContainText("Se abrió tu usuario en otro dispositivo");
    // La segunda sigue bien
    await pagina2.goto("/clientes");
    await expect(pagina2.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await otra.close();
  });
});
