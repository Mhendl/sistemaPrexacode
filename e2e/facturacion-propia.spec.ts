import { expect, test } from "@playwright/test";
import { cuitValido, emailUnico, entrarAlPanel, PASSWORD } from "./helpers";

test("facturación propia: desde el panel se elige quién factura, se corrigen sus datos y se descarga el pedido de certificado", async ({ page, request }) => {
  // La cuenta del dueño (monotributista)
  const cuit = cuitValido("24");
  const r = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Martín Hendl", cuit, condicionIva: "Monotributista" }, usuario: { nombre: "Martín Hendl", email: emailUnico("duenio"), password: PASSWORD }, aceptaTerminos: true },
  });
  expect(r.status(), await r.text()).toBe(201);

  await entrarAlPanel(page);
  await page.getByRole("link", { name: "Facturación propia" }).click();
  await expect(page.getByRole("heading", { name: "Facturación propia" })).toBeVisible();
  // Si ya había una cuenta elegida (otra prueba), se cambia por esta desde la API del panel
  if (await page.getByLabel("CUIT de la cuenta que factura").isVisible().catch(() => false)) {
    await page.getByLabel("CUIT de la cuenta que factura").fill(cuit);
    await page.getByRole("button", { name: "Usar esta cuenta" }).click();
  } else {
    const token = await page.evaluate(() => localStorage.getItem("prexacode-admin-token"));
    await request.post("/api/plataforma/facturacion/emisor", { headers: { authorization: `Bearer ${token}` }, data: { cuit } });
    await page.reload();
  }
  await expect(page.getByTestId("emisor")).toContainText(cuit.slice(2, 10));

  // Nombre como figura en ARCA
  await page.getByLabel("Nombre o razón social (como en ARCA)").fill("HENDL MARTIN");
  await page.getByLabel("Domicilio fiscal").fill("Av. Rivadavia 4227, Piso 6, Dto. 18");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos del emisor guardados")).toBeVisible();

  // Pedido de certificado para ARCA
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar pedido (.csr)" }).click();
  expect((await descarga).suggestedFilename()).toMatch(/\.csr$/);
  await expect(page.getByTestId("arca-propia")).toContainText("Sin conectar");
  // Sin certificado no se puede pasar a producción
  await expect(page.getByRole("button", { name: "Conectar a producción" })).toBeDisabled();
});
