import { expect, test } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon } from "./helpers";

test("Prexacode: caja diaria de un comercio: abre, suma sola las ventas de contado y los cobros, un flete en efectivo y cierra con arqueo", async ({ page, request }) => {
  const cuenta = await crearCuenta(request, `Librería Caja ${Date.now()}`);
  const api = (url: string, data: object) => request.post(`/api${url}`, { headers: { authorization: `Bearer ${cuenta.token}` }, data });
  const cliente = await (await api("/clientes", { razonSocial: "Colegio San Martín", cuit: cuitValido("30"), condicionIva: "Exento" })).json();
  await entrarCon(page, cuenta);

  // Está en el menú de Prexacode
  await page.goto("/");
  await page.getByRole("link", { name: "Caja diaria" }).first().click();
  await expect(page.getByRole("heading", { name: "Caja diaria" })).toBeVisible();
  await page.getByLabel("Efectivo inicial").fill("2.000");
  await page.getByRole("button", { name: "Abrir caja" }).click();
  await expect(page.getByTestId("estado-caja")).toContainText("Caja abierta");

  // Una venta de contado en efectivo y un cobro por transferencia (por la API, como si los hiciera el vendedor)
  const venta = await api("/comprobantes", { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "Resmas A4", cantidad: 2, precioUnitario: 5000, alicuotaIva: 0 }] });
  expect(venta.status(), await venta.text()).toBe(201);
  expect((await api("/recibos", { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe: 7000 }], imputaciones: [] })).status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId("medio-caja").filter({ hasText: "Efectivo" })).toContainText("$ 10.000,00");
  await expect(page.getByTestId("medio-caja").filter({ hasText: "Transferencia" })).toContainText("$ 7.000,00");
  await expect(page.getByText("Cobro a Colegio San Martín").first()).toBeVisible();

  // Un flete pagado de la caja (las categorías y medios son los de un comercio)
  await page.getByRole("button", { name: "Gasto" }).click();
  await page.getByLabel("Categoría").click();
  await expect(page.getByRole("option", { name: "Laboratorio" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await elegir(page, "Categoría", "Fletes y envíos");
  await page.getByLabel("Descripción").fill("Envío a Colegio San Martín");
  await page.getByLabel("Importe").fill("1.500");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  // Efectivo: 2.000 + 10.000 − 1.500 = 10.500
  await expect(page.getByTestId("medio-caja").filter({ hasText: "Efectivo" })).toContainText("$ 8.500,00");
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.getByRole("dialog")).toContainText("Tendría que haber $ 10.500,00");
  await page.getByLabel("Efectivo contado").fill("10.500");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.getByTestId("diferencia-caja")).toHaveText(/Cerró justo/);

  // La guía de la caja también está en Prexacode
  await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
  await expect(page.locator(".driver-popover")).toContainText("🏦 Caja diaria");
});
