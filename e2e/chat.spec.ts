import { expect, test } from "@playwright/test";
import { entrarAlPanel } from "./helpers";

test("chat de las páginas: el visitante pregunta, lo típico se responde solo, y lo demás lo respondo desde el panel y él lo ve", async ({ page, browser }) => {
  // El globito (el mismo archivo que cargan las páginas)
  await page.goto("/login");
  await page.addScriptTag({ url: "/chat-widget.js" });
  await page.getByRole("button", { name: "Abrir el chat" }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await expect(chat).toContainText("¿En qué te ayudo?");

  // Una pregunta típica: respuesta al instante con los precios
  await chat.getByRole("button", { name: "¿Cuánto sale?" }).click();
  await expect(chat).toContainText("USD 45 a USD 169 por mes");

  // Una consulta que necesita una persona
  const consulta = `¿Tienen integración con Tango? (${Date.now()})`;
  await chat.getByLabel("Tu consulta").fill(consulta);
  await chat.getByRole("button", { name: "Enviar" }).click();
  await expect(chat).toContainText("dejanos tu email");
  await chat.getByLabel("Tu email").fill("compras@ferreteria-chat.com");
  await chat.getByRole("button", { name: "Guardar" }).click();
  await expect(chat).toContainText("te respondemos también a compras@ferreteria-chat.com");

  // En el panel: aparece esperando respuesta, y la respondo
  const panel = await (await browser.newContext()).newPage();
  await entrarAlPanel(panel);
  await expect(panel.getByTestId("chat-pendientes")).toBeVisible({ timeout: 35_000 });
  await panel.getByRole("link", { name: /Chat/ }).click();
  const conv = panel.getByTestId("chat-conversacion").filter({ hasText: consulta });
  await expect(conv).toContainText("Espera respuesta");
  await conv.click();
  const hilo = panel.getByTestId("chat-hilo");
  await expect(hilo).toContainText("compras@ferreteria-chat.com");
  await expect(hilo).toContainText("Respuesta automática");
  await hilo.getByLabel("Tu respuesta").fill("¡Hola! Por ahora no, pero importás todo desde Excel. Cualquier cosa escribime.");
  await hilo.getByRole("button", { name: "Responder" }).click();
  await expect(panel.getByText(/^Respuesta enviada/)).toBeVisible(); // (el servidor de pruebas no manda emails de verdad)
  await expect(conv).not.toContainText("Espera respuesta");

  // El visitante la ve en su chat sin hacer nada
  await expect(chat).toContainText("importás todo desde Excel", { timeout: 15_000 });

  // Si vuelve a entrar a la página, la conversación sigue ahí
  await page.reload();
  await page.addScriptTag({ url: "/chat-widget.js" });
  await page.getByRole("button", { name: "Abrir el chat" }).click();
  await expect(page.getByRole("dialog", { name: "Chat" })).toContainText(consulta);
});
