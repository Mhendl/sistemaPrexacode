import { expect, test } from "@playwright/test";
import { crearCuenta, elegir, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

test("cargar un empleado, darle un adelanto, pagarle el sueldo con extras y ver el comprobante", async ({ page, request }) => {
  await entrarCon(page, await crearCuenta(request));
  await page.goto("/");
  await page.getByRole("link", { name: "Empleados y sueldos" }).first().click();
  await page.getByRole("button", { name: "Nuevo empleado" }).click();
  const d = page.getByRole("dialog");
  // Sin datos no deja
  await d.getByRole("button", { name: "Cargar empleado" }).click();
  await expect(d.getByText("Poné el sueldo (solo números)")).toBeVisible();
  await d.getByLabel("Nombre", { exact: true }).fill("Lucía");
  await d.getByLabel("Apellido").fill("Gómez");
  await d.getByLabel("CUIL").fill("27-30111222-3");
  await d.getByLabel("Puesto").fill("Cajera");
  await d.getByLabel("Fecha de ingreso").fill("2021-04-01");
  await d.getByLabel("Sueldo básico").fill("900.000");
  await d.getByRole("button", { name: "Cargar empleado" }).click();
  // CUIL mal escrito: lo avisa en el campo
  await expect(d.getByText("El CUIL no es válido")).toBeVisible();
  await d.getByLabel("CUIL").fill("");
  await d.getByRole("button", { name: "Cargar empleado" }).click();
  await expect(page.getByRole("heading", { name: /Lucía Gómez/ })).toBeVisible();
  await expect(page.getByTestId("vacaciones")).toContainText("21Le corresponden"); // más de 5 años al 31/12

  // Adelanto
  await page.getByRole("button", { name: "Adelanto" }).click();
  await page.getByRole("dialog").getByLabel("Importe 1").fill("200.000");
  await page.getByRole("dialog").getByRole("button", { name: /Registrar \$ 200\.000,00/ }).click();
  await expect(page.getByText("Adelanto registrado")).toBeVisible();
  await expect(page.getByTestId("pago-total")).toHaveText("$ 200.000,00");
  await page.getByRole("link", { name: "Lucía Gómez" }).click();

  // Sueldo: básico precargado + horas extra − faltante; el adelanto se descuenta solo
  await page.getByRole("button", { name: "Pagar sueldo" }).click();
  const s = page.getByRole("dialog");
  await expect(s.getByLabel("Importe 1")).toHaveValue("900000");
  await expect(s.getByTestId("descuento-adelantos")).toContainText("− $ 200.000,00");
  await s.getByRole("button", { name: "Agregar concepto" }).click();
  await s.getByLabel("Concepto 2").fill("Horas extra");
  await s.getByLabel("Importe 2").fill("45.000");
  await s.getByRole("button", { name: "Agregar concepto" }).click();
  await s.getByLabel("Concepto 3").fill("Faltante de caja");
  await s.getByLabel("Importe 3").fill("-12.500");
  await expect(s.getByTestId("total-pago")).toHaveText("$ 732.500,00");
  await s.getByRole("button", { name: /Registrar \$ 732\.500,00/ }).click();
  await expect(page.getByText("Sueldo registrado")).toBeVisible();
  await expect(page.getByTestId("pago-total")).toHaveText("$ 732.500,00");
  await expect(page.locator(".hoja")).toContainText("Adelantos del mes");
  await expect(page.locator(".hoja")).toContainText("No reemplaza el recibo de haberes");

  // En la lista: sueldo pagado este mes
  await page.goto("/empleados");
  await expect(page.getByRole("row", { name: /Gómez, Lucía/ })).toContainText("Pagado");
  await expect(page.getByTestId("kpis-empleados")).toContainText("Sueldos por pagar");
});

test("vacaciones: se registran, no se superponen, y un vendedor no ve sueldos", async ({ page, browser, request }) => {
  const cuenta = await crearCuenta(request);
  const h = { authorization: `Bearer ${cuenta.token}` };
  const emp = await (await request.post("/api/empleados", { headers: h, data: { nombre: "Tomás", apellido: "Ruiz", fechaIngreso: "2015-01-10", sueldo: 1000000, modalidad: "Mensual" } })).json();
  await entrarCon(page, cuenta);
  await page.goto(`/empleados/${emp.id}`);
  await expect(page.getByTestId("vacaciones")).toContainText("28Le corresponden"); // más de 10 años

  const anio = new Date().getFullYear();
  await page.getByRole("button", { name: "Vacaciones o licencia" }).click();
  await page.getByRole("dialog").getByLabel("Desde").fill(`${anio}-01-02`);
  await page.getByRole("dialog").getByLabel("Hasta").fill(`${anio}-01-15`);
  await page.getByRole("dialog").getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Novedad registrada")).toBeVisible();
  await expect(page.getByTestId("novedades")).toContainText("14 días");
  await page.getByRole("button", { name: "Vacaciones o licencia" }).click();
  await elegir(page, "Tipo", "Enfermedad");
  await page.getByRole("dialog").getByLabel("Desde").fill(`${anio}-01-10`);
  await page.getByRole("dialog").getByLabel("Hasta").fill(`${anio}-01-11`);
  await page.getByRole("dialog").getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText(/Se superpone con vacaciones/)).toBeVisible();

  // Un vendedor no ve el módulo
  const email = emailUnico("vend");
  await request.post("/api/usuarios", { headers: h, data: { nombre: "Vero Vende", email, rol: "ventas", password: PASSWORD } });
  const otra = await browser.newPage();
  await loginUI(otra, email);
  await expect(otra.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  await expect(otra.getByRole("link", { name: "Empleados y sueldos" })).toHaveCount(0);
  await otra.goto("/empleados");
  await expect(otra.getByText("Sin acceso a este módulo")).toBeVisible();
  await otra.close();
});
