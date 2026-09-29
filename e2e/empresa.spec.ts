import { expect, test } from "@playwright/test";
import { crearCuenta, entrarCon } from "./helpers";

/** PNG real de 1x1 píxel */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe("Datos de la empresa y logo", () => {
  test("el administrador edita los datos y sube el logo, que aparece en la barra lateral", async ({ page, request }) => {
    const cuenta = await crearCuenta(request, "Distribuidora Andina S.A.");
    await entrarCon(page, cuenta);
    await page.goto("/configuracion?tab=empresa");

    // Sin logo: se ven las iniciales
    const chip = page.getByTestId("empresa-actual");
    await expect(chip).toContainText("DA");
    await expect(chip.getByRole("img")).toHaveCount(0);

    await page.getByLabel("Nombre de fantasía").fill("Andina Insumos");
    await page.getByLabel("Ingresos Brutos").fill("901-654321-8");
    await page.getByLabel("Inicio de actividades").fill("2014-03-01");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Datos de la empresa guardados")).toBeVisible();

    await page.getByLabel("Archivo de logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Logo actualizado")).toBeVisible();
    const logo = chip.getByRole("img", { name: "Logo de Distribuidora Andina S.A." });
    await expect(logo).toBeVisible();
    // La imagen realmente carga desde el servidor
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Todo persiste al recargar
    await page.reload();
    await expect(page.getByLabel("Nombre de fantasía")).toHaveValue("Andina Insumos");
    await expect(page.getByLabel("Inicio de actividades")).toHaveValue("2014-03-01");
    await expect(page.getByTestId("empresa-actual").getByRole("img")).toBeVisible();

    // Quitar el logo vuelve a las iniciales
    await page.getByRole("button", { name: "Quitar logo" }).click();
    await expect(page.getByText("Logo quitado")).toBeVisible();
    await expect(page.getByTestId("empresa-actual").getByRole("img")).toHaveCount(0);
  });

  test("un archivo que no es imagen se rechaza con un mensaje", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/configuracion?tab=empresa");
    await page.getByLabel("Archivo de logo").setInputFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
    await expect(page.getByText("El archivo no es una imagen")).toBeVisible();
    await expect(page.getByTestId("empresa-actual").getByRole("img")).toHaveCount(0);
  });
});
