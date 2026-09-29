import { expect, test, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

const columna = (page: Page, etapa: string) => page.locator(`[data-testid="columna-etapa"][data-etapa="${etapa}"]`);
const tarjeta = (page: Page, titulo: string) => page.getByTestId("tarjeta-oportunidad").filter({ hasText: titulo });

async function moverPorMenu(page: Page, titulo: string, etapa: string) {
  await page.getByRole("button", { name: `Mover ${titulo}` }).click();
  await page.getByRole("menuitem", { name: etapa, exact: true }).click();
}

test.describe("Oportunidades", () => {
  test("embudo: alta de un prospecto, moverla por el menú y arrastrando, y perderla con motivo", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    await page.goto("/oportunidades");
    await expect(page.getByTestId("kpi-en-juego")).toContainText("$ 0,00");

    await page.getByRole("button", { name: "Nueva oportunidad" }).click();
    await page.getByLabel("Título").fill("Abono de soporte");
    await elegir(page, "Cliente", "Todavía no es cliente (prospecto)");
    await page.getByLabel("Nombre del prospecto").fill("Estudio Jurídico Paz");
    await page.getByLabel("Contacto").fill("Dra. Paz · 221 555-0101");
    await page.getByLabel("Monto estimado").fill("450.000");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Oportunidad creada")).toBeVisible();

    await expect(tarjeta(page, "Abono de soporte")).toContainText("Estudio Jurídico Paz");
    await expect(tarjeta(page, "Abono de soporte")).toContainText("Prospecto");
    await expect(tarjeta(page, "Abono de soporte")).toContainText("$ 450.000,00");
    await expect(columna(page, "Nuevo")).toContainText("Abono de soporte");
    await expect(page.getByTestId("kpi-en-juego")).toContainText("$ 450.000,00");

    // Por el menú (sirve con teclado y en el celular)
    await moverPorMenu(page, "Abono de soporte", "Contactado");
    await expect(columna(page, "Contactado")).toContainText("Abono de soporte");

    // Arrastrando
    await tarjeta(page, "Abono de soporte").dragTo(columna(page, "Negociación"));
    await expect(columna(page, "Negociación")).toContainText("Abono de soporte");
    await page.reload();
    await expect(columna(page, "Negociación")).toContainText("Abono de soporte"); // quedó guardado

    // Perderla pide el motivo
    await moverPorMenu(page, "Abono de soporte", "Perdida");
    await page.getByLabel("Motivo de la pérdida").fill("Eligió otro proveedor por precio");
    await page.getByRole("button", { name: "Marcar como perdida" }).click();
    await expect(columna(page, "Perdida")).toContainText("Eligió otro proveedor por precio");
    await expect(page.getByTestId("kpi-en-juego")).toContainText("$ 0,00");

    // Buscar
    await page.getByLabel("Buscar oportunidades").fill("paz");
    await expect(page.getByTestId("tarjeta-oportunidad")).toHaveCount(1);
    await page.getByLabel("Buscar oportunidades").fill("no existe");
    await expect(page.getByTestId("tarjeta-oportunidad")).toHaveCount(0);
  });

  test("de la oportunidad al presupuesto y a la factura: termina ganada sola", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const cliente = await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Colegio San Martín", cuit: cuitValido("30"), condicionIva: "Exento" } })).json();
    await entrarCon(page, cuenta);

    // Desde la ficha del cliente
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByTestId("oportunidades-cliente")).toContainText("No hay oportunidades");
    await page.getByTestId("oportunidades-cliente").getByRole("button", { name: "Nueva oportunidad" }).click();
    await page.getByLabel("Título").fill("Proyectores para aulas");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("oportunidades-cliente")).toContainText("Proyectores para aulas");

    // Abrirla y hacer el presupuesto
    await page.getByTestId("oportunidades-cliente").getByRole("button", { name: /Proyectores para aulas/ }).click();
    await page.getByTestId("oportunidad-presupuesto").getByRole("link", { name: "Hacer presupuesto" }).click();
    await expect(page).toHaveURL(/\/presupuestos\/nuevo\?cliente=.*&oportunidad=/);
    await expect(page.getByText("Queda vinculado a la oportunidad")).toBeVisible();
    await page.getByRole("button", { name: "Ítem libre" }).click();
    await page.getByLabel("Descripción del ítem").fill("Proyector 4000 lúmenes");
    await page.getByLabel("Cantidad de Proyector 4000 lúmenes").fill("3");
    await page.getByLabel("Precio de Proyector 4000 lúmenes").fill("800.000");
    await page.getByRole("button", { name: "Guardar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000001/ })).toBeVisible();

    // En el tablero pasó a Propuesta, con el monto del presupuesto
    await page.goto("/oportunidades");
    await expect(columna(page, "Propuesta")).toContainText("Proyectores para aulas");
    await expect(tarjeta(page, "Proyectores para aulas")).toContainText("$ 2.904.000,00");
    await tarjeta(page, "Proyectores para aulas").getByRole("button", { name: /Abrir/ }).click();
    await expect(page.getByTestId("oportunidad-presupuesto")).toContainText("Presupuesto 00000001");
    await page.getByTestId("oportunidad-presupuesto").getByRole("link", { name: /Presupuesto 00000001/ }).click();

    // Se factura el presupuesto
    await page.getByRole("link", { name: "Facturar", exact: true }).click();
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura B 0001-00000001/ })).toBeVisible();

    await page.goto("/oportunidades");
    await expect(columna(page, "Ganada")).toContainText("Proyectores para aulas");
    await expect(page.getByTestId("kpi-ganado-mes")).toContainText("$ 2,9 M");
    await expect(page.getByTestId("kpi-ganado-mes")).toContainText("1 oportunidad");
  });

  test("al vendedor le llega el aviso y la abre desde la campanita", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const email = emailUnico("vendedor");
    await request.post("/api/usuarios", { headers: h, data: { nombre: "Diego Vendedor", email, rol: "ventas", password: PASSWORD } });
    await entrarCon(page, cuenta);

    await page.goto("/oportunidades");
    await page.getByRole("button", { name: "Nueva oportunidad" }).click();
    await page.getByLabel("Título").fill("Licitación hospital");
    await elegir(page, "Cliente", "Todavía no es cliente (prospecto)");
    await page.getByLabel("Nombre del prospecto").fill("Hospital Regional");
    await elegir(page, /^Responsable$/, "Diego Vendedor");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta(page, "Licitación hospital")).toContainText("DV");

    await page.evaluate(() => localStorage.clear());
    await loginUI(page, email);
    await expect(page.getByTestId("notificaciones-contador")).toHaveText("1");
    await page.getByRole("button", { name: /Notificaciones/ }).click();
    await page.getByTestId("notificacion").filter({ hasText: "Te asignaron una oportunidad" }).click();
    await expect(page).toHaveURL(/\/oportunidades/);
    await expect(page.getByLabel("Título")).toHaveValue("Licitación hospital");
    await page.getByRole("button", { name: "Cerrar" }).click();

    // "Solo las mías"
    await elegir(page, "Filtrar por responsable", "Solo las mías");
    await expect(page.getByTestId("tarjeta-oportunidad")).toHaveCount(1);
  });
});
