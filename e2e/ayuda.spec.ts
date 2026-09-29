import { expect, test } from "@playwright/test";
import { ARTICULOS } from "../src/modules/ayuda/articulos";
import { crearCuenta, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

test("el botón ? abre la ayuda de la pantalla, busca en palabras simples y lleva a donde se hace", async ({ page, request }) => {
  await entrarCon(page, await crearCuenta(request));
  await page.goto("/facturacion");
  await page.getByRole("button", { name: "Ayuda" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("En esta pantalla")).toBeVisible();
  await panel.getByRole("button", { name: /Hacer una factura/ }).click();
  await expect(panel.getByTestId("ayuda-detalle")).toContainText("Nueva factura");

  // Buscar como lo escribiría cualquiera: sin tildes, en plural, con palabras de más
  const buscar = panel.getByLabel("Buscar en la ayuda");
  await buscar.fill("como anulo una factura");
  await expect(panel.getByTestId("ayuda-articulo").first()).toContainText("Anular o corregir una factura");
  await buscar.fill("cheques rechazados");
  await expect(panel.getByTestId("ayuda-articulo").first()).toContainText("Anular un recibo");
  await buscar.fill("subir los precios por la inflacion");
  await expect(panel.getByTestId("ayuda-articulo").first()).toContainText("Aumentar los precios por porcentaje");
  await buscar.fill("contraseña");
  await expect(panel.getByTestId("ayuda-articulo").first()).toContainText("contraseña");

  // Sin resultados: ofrece escribirle a soporte
  await buscar.fill("zzzqqq");
  await expect(panel.getByRole("status")).toContainText("No encontramos ayuda");
  await expect(panel.getByRole("link", { name: /Preguntarle al equipo de soporte/ })).toBeVisible();

  // "Ir a" lleva a la pantalla y cierra el panel
  await buscar.fill("deudores");
  await panel.getByRole("button", { name: /Ver quién me debe/ }).click();
  await panel.getByRole("link", { name: "Ir a Cobranzas" }).click();
  await expect(page).toHaveURL(/\/cobranzas$/);
  await expect(page.getByRole("dialog")).toBeHidden();

  // F1 también la abre
  await page.keyboard.press("F1");
  await expect(page.getByRole("dialog").getByText("En esta pantalla")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Registrar un cobro/ })).toBeVisible();
});

test("el Centro de ayuda muestra todo por sección, y cada rol ve solo lo suyo", async ({ page, request }) => {
  const cuenta = await crearCuenta(request);
  await entrarCon(page, cuenta);
  await page.goto("/");
  await page.getByRole("link", { name: "Centro de ayuda" }).first().click();
  await expect(page.getByRole("heading", { name: "Centro de ayuda" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Empleados y sueldos" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Crear un usuario para alguien del equipo/ })).toBeVisible();

  // Un vendedor no ve ayudas de sueldos, usuarios ni del plan
  const email = emailUnico("vend");
  const r = await request.post("/api/usuarios", { headers: { authorization: `Bearer ${cuenta.token}` }, data: { nombre: "Vendedor", email, rol: "ventas", password: PASSWORD } });
  expect(r.ok()).toBe(true);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await loginUI(page, email);
  await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  await page.goto("/ayuda");
  await expect(page.getByRole("heading", { name: "Facturación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Empleados y sueldos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Crear un usuario/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pagar la suscripción/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /No veo una sección o un botón/ })).toBeVisible();
});

test("cada ayuda lleva a una pantalla que existe", async ({ page, request }) => {
  await entrarCon(page, await crearCuenta(request));
  for (const ruta of [...new Set(ARTICULOS.map((a) => a.path))]) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // No la redirige al inicio (ruta inexistente) ni muestra "sin acceso"
    expect(new URL(page.url()).pathname, `la ayuda apunta a ${ruta}`).toBe(ruta.split("?")[0]);
    await expect(page.getByText("Sin acceso a este módulo")).toHaveCount(0);
  }
});
