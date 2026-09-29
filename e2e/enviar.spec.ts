import { expect, test, type APIRequestContext } from "@playwright/test";
import { crearCuenta, cuitValido, entrarCon, type Cuenta } from "./helpers";

async function facturaConCliente(request: APIRequestContext, cuenta: Cuenta, cliente: object = {}) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const c = await (
    await request.post("/api/clientes", {
      headers: h,
      data: { razonSocial: "Ferretería El Tornillo", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto", email: "compras@eltornillo.com.ar", telefono: "011 15 5555-1234", contacto: "Julia Pérez", ...cliente },
    })
  ).json();
  const f = await (await request.post("/api/comprobantes", { headers: h, data: { clienteId: c.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Tornillos x 1000", cantidad: 2, precioUnitario: 10000, alicuotaIva: 21 }] } })).json();
  return { cliente: c, factura: f, h };
}

test.describe("Enviar documentos al cliente", () => {
  test("factura: link público, WhatsApp listo, email, vistas y anular el link", async ({ page, request, browser }) => {
    const cuenta = await crearCuenta(request);
    const { factura } = await facturaConCliente(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto(`/facturacion/${factura.id}`);

    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Factura A 0001-00000001");
    const link = await dialogo.getByTestId("link-publico").inputValue();
    expect(link).toMatch(/^http:\/\/localhost:5175\/ver\/[A-Za-z0-9_-]{32}$/);
    await expect(dialogo.getByTestId("vistas-link")).toContainText("Todavía no lo abrieron");

    // WhatsApp: abre el chat del cliente con el texto y el link
    const wa = await dialogo.getByTestId("boton-whatsapp").getAttribute("href");
    expect(wa).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=/);
    const texto = decodeURIComponent(wa!.split("text=")[1]!);
    expect(texto).toContain("Hola Julia,");
    expect(texto).toContain("Factura A 0001-00000001 por $ 24.200,00");
    expect(texto).toContain(link);

    // Email: con el servidor de la plataforma sin configurar (pruebas), queda simulado y registrado
    await expect(dialogo.getByLabel("Para", { exact: true })).toHaveValue("compras@eltornillo.com.ar");
    await dialogo.getByLabel("Mensaje (opcional)").fill("Gracias por tu compra.");
    await dialogo.getByRole("button", { name: "Enviar email" }).click();
    await expect(page.getByText("Envío simulado")).toBeVisible();
    await expect(dialogo.getByTestId("historial-envios")).toContainText("compras@eltornillo.com.ar");

    // El cliente abre el link sin usuario
    const cliente = await browser.newPage();
    await cliente.goto(link);
    await expect(cliente.getByTestId("publico-titulo")).toHaveText("Factura A 0001-00000001");
    await expect(cliente.getByTestId("comprobante-total")).toHaveText("$ 24.200,00");
    await expect(cliente.getByTestId("qr-arca")).toBeVisible();
    await expect(cliente.getByRole("button", { name: "Imprimir o guardar PDF" })).toBeVisible();
    // Al imprimir sale solo la hoja
    await cliente.emulateMedia({ media: "print" });
    await expect(cliente.getByRole("button", { name: "Imprimir o guardar PDF" })).toBeHidden();
    await expect(cliente.getByTestId("comprobante-total")).toBeVisible();

    // Se ve que lo abrió
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByRole("dialog").getByTestId("vistas-link")).toContainText("Lo abrieron 1 vez");

    // Anular el link: el viejo deja de andar y hay uno nuevo
    await page.getByRole("dialog").getByRole("button", { name: "Anular link" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, anular" }).click();
    await expect(page.getByRole("dialog").getByTestId("link-publico")).not.toHaveValue(link);
    await cliente.emulateMedia({ media: "screen" });
    await cliente.goto(link);
    await expect(cliente.getByText("Este link no está disponible")).toBeVisible();
    await cliente.close();
  });

  test("presupuesto: el cliente lo ve con su validez", async ({ page, request, browser }) => {
    const cuenta = await crearCuenta(request);
    const { cliente, h } = await facturaConCliente(request, cuenta, { telefono: null });
    const p = await (await request.post("/api/presupuestos", { headers: h, data: { clienteId: cliente.id, validoHasta: "2099-12-31", condiciones: "50 % anticipado", items: [{ descripcion: "Instalación", cantidad: 1, precioUnitario: 50000, alicuotaIva: 21 }] } })).json();
    await entrarCon(page, cuenta);
    await page.goto(`/presupuestos/${p.id}`);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    // Sin teléfono: WhatsApp deja elegir el contacto
    await expect(page.getByTestId("boton-whatsapp")).toContainText("elegís el contacto");
    expect(await page.getByTestId("boton-whatsapp").getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const link = await page.getByTestId("link-publico").inputValue();

    const vista = await browser.newPage();
    await vista.goto(link);
    await expect(vista.getByTestId("publico-titulo")).toHaveText("Presupuesto 00000001");
    await expect(vista.getByTestId("presupuesto-total")).toHaveText("$ 60.500,00");
    await expect(vista.getByText("50 % anticipado")).toBeVisible();
    await expect(vista.getByText("31/12/2099").first()).toBeVisible();
    await vista.close();
  });

  test("configurar la casilla propia: completa con Gmail, guarda y muestra el error de conexión en la prueba", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    await page.goto("/configuracion?tab=email");
    await expect(page.getByText("todavía no está habilitado en esta instalación")).toBeVisible();

    await page.getByRole("radio", { name: /Mi propia casilla/ }).click();
    await page.getByRole("button", { name: "Gmail" }).click();
    await expect(page.getByLabel("Servidor SMTP")).toHaveValue("smtp.gmail.com");
    await expect(page.getByLabel("Puerto")).toHaveValue("587");
    await expect(page.getByText("contraseña de aplicación").first()).toBeVisible();

    // Sin contraseña no guarda
    await page.getByLabel("Usuario", { exact: true }).fill("ventas@miempresa.com.ar");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Obligatoria")).toBeVisible();

    // Un servidor que no responde (sin salir a internet en la prueba)
    await page.getByLabel("Servidor SMTP").fill("127.0.0.1");
    await page.getByLabel("Puerto").fill("1");
    await page.getByLabel("Contraseña", { exact: true }).fill("clave-de-aplicacion");
    await page.getByLabel("Mandar la factura por email al emitirla").click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Configuración de email guardada")).toBeVisible();
    await expect(page.getByText("Sin verificar")).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("placeholder", "••••••••");

    await page.getByRole("button", { name: "Enviarme una prueba" }).click();
    await expect(page.getByTestId("error-email")).toContainText("No se pudo conectar con el servidor de correo");
    await expect(page.getByTestId("historial-emails")).toContainText("Prueba de envío");

    // Quedó guardado al recargar
    await page.reload();
    await expect(page.getByLabel("Mandar la factura por email al emitirla")).toBeChecked();
    await expect(page.getByLabel("Usuario", { exact: true })).toHaveValue("ventas@miempresa.com.ar");
  });
});
