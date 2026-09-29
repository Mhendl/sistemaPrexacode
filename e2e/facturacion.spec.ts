import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon, type Cuenta } from "./helpers";

async function preparar(request: APIRequestContext, cuenta: Cuenta) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cliente = async (razonSocial: string, condicionIva: string) =>
    (await (await request.post("/api/clientes", { headers: h, data: { razonSocial, cuit: cuitValido("30"), condicionIva, domicilio: "Calle 7 N° 1234", localidad: "La Plata" } })).json()) as { id: string };
  const ri = await cliente("Constructora Del Plata S.A.", "Responsable Inscripto");
  const cf = await cliente("Laura Giménez", "Consumidor Final");
  const notebook = (await (await request.post("/api/productos", { headers: h, data: { codigo: "NB-15", descripcion: "Notebook 15,6 Core i5", precio: 1089000, alicuotaIva: 10.5, controlaStock: true, stockInicial: 5, stockMinimo: 0 } })).json()).id as string;
  return { ri, cf, notebook };
}

async function agregarProducto(page: Page, nombre: RegExp) {
  await page.getByRole("combobox", { name: "Agregar producto" }).click();
  await page.getByRole("option", { name: nombre }).click();
}

test.describe("Facturación", () => {
  test("venta de mostrador a consumidor final sin identificar: Factura B de contado, cobrada, y la devolución con nota de crédito", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/facturacion/nueva");

    await elegir(page, "Cliente", "Consumidor final (sin identificar)");
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura B/);
    await expect(page.getByTestId("aviso-consumidor-final")).toContainText("de contado y cobrada en el momento");
    // Solo de contado y cobrada: no se puede cambiar
    await expect(page.getByLabel("Condición de venta")).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Cobrada en el momento" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Cobrada en el momento" })).toBeDisabled();

    await agregarProducto(page, /Notebook 15,6/);
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura B 0001-00000001/ })).toBeVisible();
    await expect(page.getByText("Consumidor final").first()).toBeVisible();
    const factura = page.url();

    // No aparece en la cartera de clientes
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByText("Consumidor final", { exact: true })).toHaveCount(0);

    // Devolución: la nota de crédito arranca con el mismo consumidor final
    await page.goto(factura);
    await page.getByRole("link", { name: /Nota de crédito/ }).click();
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Nota de crédito B/);
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Nota de crédito B 0001-00000001/ })).toBeVisible();
  });

  test("Factura A con producto e ítem libre: CAE, QR, aviso de prueba y stock descontado", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { notebook } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);

    await page.goto("/facturacion");
    await expect(page.getByTestId("aviso-modo-prueba")).toContainText("Facturación en modo de prueba");
    await page.getByRole("link", { name: /Emitir la primera|Nueva factura/ }).first().click();

    await elegir(page, "Cliente", "Constructora Del Plata S.A.");
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura A/);
    await agregarProducto(page, /Notebook 15,6/);
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("2");
    await page.getByRole("button", { name: "Ítem libre" }).click();
    await page.getByLabel("Descripción del ítem").fill("Envío a obra");
    await page.getByLabel("Precio de Envío a obra").fill("12.500");
    // 2 × 1.089.000 × 1,105 + 12.500 × 1,21
    await expect(page.getByTestId("total-factura")).toHaveText("$ 2.421.815,00");

    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();
    await expect(page.getByTestId("comprobante-cae")).toHaveText(/^\d{14}$/);
    await expect(page.getByTestId("comprobante-total")).toHaveText("$ 2.421.815,00");
    await expect(page.getByTestId("qr-arca")).toBeVisible();
    await expect(page.getByTestId("aviso-sin-validez")).toContainText("sin validez fiscal");

    // Al imprimir sale solo la hoja, con el aviso de prueba
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("link", { name: "Inicio", exact: true })).toBeHidden();
    await expect(page.getByTestId("aviso-sin-validez")).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("3 u.");
    await expect(page.getByTestId("movimiento").first()).toContainText("Factura A 0001-00000001");
  });

  test("el tipo cambia según el cliente: A para inscripto, B para consumidor final", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Constructora Del Plata S.A.");
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura A/);
    await elegir(page, "Cliente", "Laura Giménez");
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura B/);

    await agregarProducto(page, /Notebook 15,6/);
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura B 0001-00000001/ })).toBeVisible();
    await expect(page.getByTestId("comprobante-letra")).toHaveText("B");
    await expect(page.getByText(/IVA contenido/)).toBeVisible();
  });

  test("nota de crédito parcial: devuelve stock y queda asociada a la factura", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { notebook } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Constructora Del Plata S.A.");
    await agregarProducto(page, /Notebook 15,6/);
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("3");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();

    await page.getByRole("link", { name: "Nota de crédito" }).click();
    await expect(page.getByRole("heading", { name: "Nueva nota de crédito" })).toBeVisible();
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Nota de crédito A/);
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("1");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();

    await expect(page.getByRole("heading", { name: /Nota de crédito A 0001-00000001/ })).toBeVisible();
    await expect(page.getByText("Comprobante asociado:")).toBeVisible();
    await expect(page.getByText(/Factura A 0001-00000001/).last()).toBeVisible();
    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("3 u."); // 5 − 3 + 1
  });

  test("sin stock avisa en el renglón; destildando 'Descontar stock' se emite igual", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { notebook } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Constructora Del Plata S.A.");
    await agregarProducto(page, /Notebook 15,6/);
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("9");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByTestId("renglon-factura")).toContainText("Stock insuficiente: hay 5 u.");

    await page.getByRole("checkbox", { name: "Descontar stock" }).uncheck();
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();
    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("5 u.");
  });

  test("puntos de venta: el que se agrega en configuración aparece al facturar y numera aparte", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { ri } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/configuracion?tab=arca");
    await expect(page.getByTestId("modo-arca")).toContainText("Modo de prueba");
    await page.getByLabel("Número").fill("3");
    await page.getByLabel("Nombre").fill("Sucursal Belgrano");
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByTestId("pv-3")).toContainText("Sucursal Belgrano");

    await page.goto(`/facturacion/nueva?cliente=${ri.id}`);
    await elegir(page, "Punto de venta", "0003 · Sucursal Belgrano");
    await agregarProducto(page, /Notebook 15,6/);
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura A 0003-00000001/ })).toBeVisible();

    // Aparece en la ficha del cliente
    await page.goto(`/clientes/${ri.id}`);
    await expect(page.getByRole("link", { name: /Factura A 0003-00000001/ }).first()).toBeVisible();
    await expect(page.getByTestId("cuenta-corriente").getByRole("link", { name: /Factura A 0003-00000001/ })).toBeVisible();
  });
});
