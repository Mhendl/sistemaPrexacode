import { expect, test } from "@playwright/test";
import { cuitValido, emailUnico, entrarAlPanel, entrarCon, PASSWORD, type Cuenta } from "./helpers";

test("pago por transferencia: el cliente ve los datos y el importe, avisa, y al confirmarlo en el panel su plan queda pago", async ({ page, request, browser }) => {
  // El panel: datos de la cuenta para transferir
  await entrarAlPanel(page);
  await page.getByRole("link", { name: "Precios y cobros" }).click();
  await expect(page.getByTestId("precios-planes")).toBeVisible();
  const datos = page.getByTestId("datos-transferencia");
  await datos.getByLabel("Titular de la cuenta").fill("Hendl Martín Ezequiel");
  await datos.getByLabel("Banco o billetera").fill("Banco Galicia");
  await datos.getByLabel("Alias").fill("prexacode.pagos");
  await datos.getByRole("button", { name: "Guardar y mostrar a los clientes" }).click();
  await expect(page.getByText("Datos para transferir guardados")).toBeVisible();
  await expect(datos).toContainText("Los clientes la ven");

  // Un cliente
  const email = emailUnico("cliente");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Ferretería Transferencia", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Ana Cliente", email, password: PASSWORD }, aceptaTerminos: true },
  });
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const cliente = await (await browser.newContext()).newPage();
  await entrarCon(cliente, cuenta);
  await cliente.goto("/configuracion?tab=plan");
  await cliente.getByRole("button", { name: "Pagar por transferencia" }).click();
  await expect(cliente.getByTestId("datos-cuenta")).toContainText("prexacode.pagos");
  await expect(cliente.getByTestId("datos-cuenta")).toContainText("Banco Galicia");
  await expect(cliente.getByTestId("importe-transferencia")).toContainText("$");
  await cliente.getByLabel("N° de operación o comprobante (opcional)").fill("Op. 998877");
  await cliente.getByRole("button", { name: "Ya transferí" }).click();
  await expect(cliente.getByText("¡Gracias! Avisamos tu transferencia")).toBeVisible();
  await expect(cliente.getByTestId("transferencia-avisada")).toContainText("Avisaste una transferencia");

  // En el panel aparece para confirmar; llegó la plata: se confirma
  await page.reload();
  const fila = page.getByTestId("transferencia-pendiente").filter({ hasText: "Ferretería Transferencia" });
  await expect(fila).toContainText("Op. 998877");
  await fila.getByRole("button", { name: "Confirmar la transferencia de Ferretería Transferencia" }).click();
  await expect(page.getByText(/Pago confirmado/)).toBeVisible();
  await expect(page.getByTestId("transferencia-pendiente").filter({ hasText: "Ferretería Transferencia" })).toHaveCount(0);

  // El cliente ve su plan pago
  await cliente.reload();
  await expect(cliente.getByTestId("transferencia-avisada")).toHaveCount(0);
  await expect(cliente.getByText("Activa").first()).toBeVisible();

  // Se apaga la opción (para no dejarla prendida en las demás pruebas)
  await datos.getByRole("button", { name: "Apagar" }).click();
  await expect(datos).toContainText("Apagada");
});
