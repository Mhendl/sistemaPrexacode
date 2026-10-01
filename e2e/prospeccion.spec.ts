import { expect, test } from "@playwright/test";
import { emailUnico, entrarAlPanel } from "./helpers";

test("prospección: se configura la casilla, se arma la campaña con la secuencia sugerida y se importa la lista", async ({ page }) => {
  await entrarAlPanel(page);
  await page.getByRole("link", { name: "Prospección" }).click();

  // Casilla (sin probarla: en las pruebas no se sale a internet)
  const casilla = page.getByTestId("casilla-prospeccion");
  await casilla.getByLabel("Alias desde el que salen (ej.: martin@prexacode.com)").fill("martin@prexacode.com");
  await casilla.getByLabel("Tu nombre (firma y remitente)").fill("Martín de Prexacode");
  await casilla.getByLabel("Contraseña de la casilla").fill("clave-casilla");
  await casilla.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Casilla guardada")).toBeVisible();
  await expect(casilla.getByLabel("Contraseña de la casilla")).toHaveAttribute("placeholder", /Guardada/);
  await expect(casilla).toContainText("hoy 0 de 10");

  // Campaña con los emails sugeridos para consultorios
  const nombre = `Consultorios de Rosario ${Date.now()}`;
  await page.getByRole("button", { name: "Nueva campaña" }).click();
  await page.getByLabel("Nombre (para vos)").fill(nombre);
  await expect(page.getByLabel("Asunto del email 1")).toHaveValue("Turnos online para {empresa}");
  await expect(page.getByLabel("Texto del email 3")).toHaveValue(/este es mi último email/);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Campaña creada: ahora importá la lista")).toBeVisible();

  // Al editar y cambiar de producto, se cargan los emails de ese producto (y al volver, los de antes)
  const editar = page.getByTestId("campana-prospeccion").filter({ hasText: nombre });
  await editar.getByRole("button", { name: "Editar emails" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Prexacode" }).click();
  await expect(page.getByLabel("Asunto del email 1")).toHaveValue("Facturación y stock de {empresa}");
  await expect(page.getByLabel("Texto del email 1")).toHaveValue(/Prexacode/);
  await page.getByRole("dialog").getByRole("button", { name: "CoreDental" }).click();
  await expect(page.getByLabel("Asunto del email 1")).toHaveValue("Turnos online para {empresa}");
  await page.keyboard.press("Escape");

  // Lista en CSV con columnas como las escribiría cualquiera
  const a = emailUnico("consultorio");
  const b = emailUnico("clinica");
  const csv = `Correo;Nombre y apellido;Consultorio;Localidad\n${a};Ana López;Consultorio Sonrisas;Rosario\n${b};;Clínica Norte;Rosario\n${a};Repetida;;\nno-es-email;;;\n`;
  const campana = page.getByTestId("campana-prospeccion").filter({ hasText: nombre });
  await campana.getByLabel(`Importar lista a ${nombre}`).setInputFiles({ name: "consultorios.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
  await expect(campana.getByTestId("previa-importacion")).toContainText("Se agregan 2 contactos nuevos.");
  await expect(campana.getByTestId("previa-importacion")).toContainText("1 con email inválido");
  await campana.getByRole("button", { name: "Agregar 2" }).click();
  await expect(page.getByText(`2 contactos agregados a «${nombre}»`)).toBeVisible();
  await expect(campana).toContainText("2 contactos");
  await campana.getByRole("button", { name: "Ver contactos" }).click();
  await expect(campana.getByText("Consultorio Sonrisas")).toBeVisible();
  await expect(campana.getByText("Clínica Norte")).toBeVisible();

  // Uno respondió por teléfono: se marca a mano y sale de la secuencia
  const fila = campana.locator("div").filter({ hasText: "Clínica Norte" }).filter({ has: page.getByRole("button", { name: "Respondió" }) }).last();
  await fila.getByRole("button", { name: "Respondió" }).click();
  await expect(campana.getByText("Respondieron").locator("..")).toContainText("1");

  // El link de baja de un email funciona sin usuario (uno inválido avisa)
  await page.goto("/baja-prospecto/token-que-no-existe");
  await expect(page.getByText("El link no es válido")).toBeVisible();
});
