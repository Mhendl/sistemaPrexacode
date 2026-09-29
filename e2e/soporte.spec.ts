import { expect, test } from "@playwright/test";
import { crearCuenta, elegir, entrarAlPanel, entrarCon } from "./helpers";

test("el cliente pide ayuda, lo respondo desde el panel y le llega el aviso", async ({ page, browser, request }) => {
  const cuenta = await crearCuenta(request, `Librería Soporte ${Date.now()}`);
  const asunto = `No me imprime el remito ${Date.now()}`;

  // Cliente: Soporte → nuevo pedido
  await entrarCon(page, cuenta);
  await page.goto("/");
  await page.getByRole("link", { name: "Soporte", exact: true }).first().click();
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByText("Contá en pocas palabras qué pasa")).toBeVisible();
  await elegir(page, "Tipo", "Problema");
  await page.getByLabel("Asunto").fill(asunto);
  await page.getByLabel("Contanos qué pasa").fill("Cuando toco Imprimir en el remito 0001-00000003 sale la hoja en blanco.");
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByText(/Pedido #\d+ enviado/)).toBeVisible();
  await expect(page.getByTestId("conversacion")).toContainText("sale la hoja en blanco");

  // Yo, en el panel
  const panel = await browser.newPage();
  await entrarAlPanel(panel);
  await expect(panel.getByTestId("alerta-tickets")).toBeVisible();
  await panel.getByRole("navigation", { name: "Panel de administración" }).getByRole("link", { name: "Soporte" }).click();
  await panel.getByPlaceholder("Buscar por número, asunto o empresa…").fill(asunto);
  const fila = panel.getByRole("row", { name: new RegExp(asunto) });
  await expect(fila).toContainText("Nuevo");
  await expect(fila).toContainText("Abierto");
  await fila.click();
  await expect(panel.getByTestId("conversacion")).toContainText("sale la hoja en blanco");
  await panel.getByLabel("Tu mensaje").fill("Hola! Probá con otro navegador y avisanos. Ya lo estamos revisando.");
  await panel.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(panel.getByText("Respuesta enviada")).toBeVisible();
  await expect(panel.getByTestId("conversacion")).toContainText("Probá con otro navegador");

  // El cliente lo ve en la campanita y en su lista
  await page.goto("/soporte");
  await expect(page.getByTestId("ticket").filter({ hasText: asunto })).toContainText("Nueva respuesta");
  await page.getByRole("button", { name: /Notificaciones/ }).click();
  await page.getByText(/Respondimos tu pedido #\d+/).first().click();
  await expect(page.getByTestId("conversacion")).toContainText("Probá con otro navegador");
  await page.getByLabel("Tu mensaje").fill("Con Chrome anda. Gracias!");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Mensaje enviado")).toBeVisible();
  await page.getByRole("button", { name: "Ya está resuelto" }).click();
  await expect(page.getByText("Pedido cerrado")).toBeVisible();

  // En el panel queda cerrado, con toda la conversación, y en la ficha de la empresa
  await panel.reload();
  await expect(panel.getByTestId("conversacion")).toContainText("Con Chrome anda");
  await expect(panel.getByLabel("Estado del pedido")).toContainText("Cerrado");
  await panel.getByRole("link", { name: cuenta.razonSocial }).click();
  await expect(panel.getByText(new RegExp(asunto))).toBeVisible();
  await panel.close();
});
