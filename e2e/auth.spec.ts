import { expect, test } from "@playwright/test";
import { cerrarSesion, crearCuenta, cuitValido, elegir, emailUnico, formatear, loginUI, PASSWORD } from "./helpers";

test.describe("Cuenta de empresa y sesión", () => {
  test("registrar una empresa deja la sesión iniciada con sus datos", async ({ page }) => {
    const razonSocial = `Ferretería El Tornillo ${Date.now()}`;
    await page.goto("/registro");
    await page.getByLabel("Razón social").fill(razonSocial);
    await page.getByLabel("CUIT").fill(formatear(cuitValido()));
    await elegir(page, "Condición frente al IVA", "Responsable Inscripto");
    await page.getByLabel("Nombre y apellido").fill("Jorge Albornoz");
    await page.getByLabel("Email").fill(emailUnico());
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Hola, Jorge" })).toBeVisible();
    await expect(page.getByText(razonSocial)).toBeVisible();
    // El administrador ve la configuración
    await expect(page.getByRole("link", { name: "Configuración" })).toBeVisible();
  });

  test("un CUIT inválido muestra el error en el campo y no crea la cuenta", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Razón social").fill("Empresa Mal S.A.");
    await page.getByLabel("CUIT").fill("30-50001091-3");
    await elegir(page, "Condición frente al IVA", "Monotributista");
    await page.getByLabel("Nombre y apellido").fill("Prueba");
    await page.getByLabel("Email").fill(emailUnico());
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText("El CUIT no es válido")).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("cerrar sesión y volver a entrar", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await loginUI(page, cuenta.email);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();

    await cerrarSesion(page);
    // Sin sesión, las rutas internas mandan al login
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/login$/);

    // Después de entrar vuelve a la pantalla que había pedido
    await page.getByLabel("Email").fill(cuenta.email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  });

  test("contraseña incorrecta muestra un mensaje claro", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await loginUI(page, cuenta.email, "otra-clave-mal");
    await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("la sesión sobrevive a recargar la página", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await loginUI(page, cuenta.email);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await expect(page.getByText(cuenta.razonSocial)).toBeVisible();
  });
});

test.describe("Términos y condiciones", () => {
  test("no se puede crear la cuenta sin aceptarlos, y se pueden leer sin iniciar sesión", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Razón social").fill("Empresa Sin Aceptar S.A.");
    await page.getByLabel("CUIT").fill(formatear(cuitValido()));
    await elegir(page, "Condición frente al IVA", "Responsable Inscripto");
    await page.getByLabel("Nombre y apellido").fill("Prueba");
    await page.getByLabel("Email").fill(emailUnico());
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Tenés que aceptar los Términos y Condiciones y la Política de Privacidad")).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);

    // Los enlaces abren las páginas en otra pestaña, sin sesión
    const [terminos] = await Promise.all([page.context().waitForEvent("page"), page.locator("form").getByRole("link", { name: "Términos y Condiciones" }).click()]);
    await expect(terminos.getByRole("heading", { name: "Términos y Condiciones", level: 1 })).toBeVisible();
    await expect(terminos.getByTestId("aviso-borrador-legal")).toContainText("pendiente de completar y de revisión legal");
    await expect(terminos.getByText(/Versión vigente desde el \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

    await page.goto("/privacidad");
    await expect(page.getByText(/Órgano de Control de la Ley N° 25\.326/)).toBeVisible();
  });
});
