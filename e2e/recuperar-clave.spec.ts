import { expect, test } from "@playwright/test";
import { crearCuenta, entrarCon, loginUI } from "./helpers";

test("me olvidé la contraseña: pido el link, elijo una nueva y entro con ella", async ({ page, request }) => {
  const cuenta = await crearCuenta(request);
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByLabel("Email").fill(cuenta.email);
  await page.getByRole("button", { name: "Mandarme el link" }).click();
  await expect(page.getByTestId("olvide-listo")).toContainText(cuenta.email);

  // Las pruebas no leen el correo: el servidor de pruebas da el último link
  const { link } = await (await request.get(`/api/auth/pruebas/ultimo-link?email=${encodeURIComponent(cuenta.email)}`)).json();
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel("Contraseña nueva").fill("mi-clave-nueva-2026");
  await page.getByLabel("Repetila").fill("otra-distinta-123");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("alert")).toContainText("no coinciden");
  await page.getByLabel("Repetila").fill("mi-clave-nueva-2026");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("ya podés entrar con tu contraseña nueva")).toBeVisible();

  await loginUI(page, cuenta.email, "mi-clave-nueva-2026");
  await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();

  // El mismo link no sirve dos veces
  const otra = await page.context().browser()!.newPage();
  await otra.goto(new URL(link).pathname + new URL(link).search);
  await otra.getByLabel("Contraseña nueva").fill("otra-clave-9999");
  await otra.getByLabel("Repetila").fill("otra-clave-9999");
  await otra.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(otra.getByRole("alert")).toContainText("venció o ya se usó");
  await expect(otra.getByRole("link", { name: "Pedir otro link" })).toBeVisible();
  await otra.close();
});

test("la empresa activa los recordatorios de facturas desde Configuración → Email", async ({ page, request }) => {
  await entrarCon(page, await crearCuenta(request));
  await page.goto("/configuracion?tab=email");
  const sw = page.getByRole("switch", { name: "Recordar las facturas por vencer y vencidas" });
  await expect(sw).not.toBeChecked();
  await sw.click();
  await page.getByRole("button", { name: /Guardar/ }).first().click();
  await expect(page.getByText("Configuración de email guardada")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Recordar las facturas por vencer y vencidas" })).toBeChecked();
});
