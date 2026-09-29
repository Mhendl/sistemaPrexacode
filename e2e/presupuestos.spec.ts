import { expect, test, type APIRequestContext } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon, type Cuenta } from "./helpers";

async function preparar(request: APIRequestContext, cuenta: Cuenta) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cliente = (await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Estudio Contable Ríos", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json()) as { id: string };
  const notebook = (await (await request.post("/api/productos", { headers: h, data: { codigo: "NB-15", descripcion: "Notebook 15,6 Core i5", precio: 1089000, alicuotaIva: 10.5, controlaStock: true, stockInicial: 5, stockMinimo: 0 } })).json()).id as string;
  return { h, cliente, notebook };
}

test.describe("Presupuestos", () => {
  test("se arma, el cliente lo acepta y se factura con un clic", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { cliente, notebook } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);

    await page.goto("/presupuestos");
    await expect(page.getByText("Todavía no hiciste presupuestos")).toBeVisible();
    await page.getByRole("link", { name: "Hacer el primero" }).click();

    await elegir(page, "Cliente", "Estudio Contable Ríos");
    await page.getByRole("combobox", { name: "Agregar producto" }).click();
    await page.getByRole("option", { name: /Notebook 15,6/ }).click();
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("2");
    await page.getByRole("button", { name: "Ítem libre" }).click();
    await page.getByLabel("Descripción del ítem").fill("Instalación y configuración");
    await page.getByLabel("Precio de Instalación y configuración").fill("50.000");
    await page.getByLabel("Condiciones").fill("50 % anticipado, saldo contra entrega");
    // 2 × 1.089.000 × 1,105 + 50.000 × 1,21
    await expect(page.getByTestId("total-presupuesto")).toHaveText("$ 2.467.190,00");
    await expect(page.getByTestId("presupuesto-total")).toHaveText("$ 2.467.190,00");

    await page.getByRole("button", { name: "Guardar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000001/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000001/ })).toContainText("Pendiente");
    await expect(page.getByText("50 % anticipado, saldo contra entrega")).toBeVisible();

    // Editar: se baja a 1 notebook
    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Cantidad de Notebook 15,6 Core i5")).toHaveValue("2");
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("1");
    await expect(page.getByTestId("total-presupuesto")).toHaveText("$ 1.263.845,00");
    await page.getByRole("button", { name: "Guardar presupuesto" }).click();
    await expect(page.getByText("Presupuesto actualizado")).toBeVisible();
    await expect(page.getByTestId("presupuesto-total")).toHaveText("$ 1.263.845,00");

    await page.getByRole("button", { name: "Aceptado" }).click();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000001/ })).toContainText("Aceptado");

    // Facturar: la factura viene precargada con cliente, ítems y referencia
    await page.getByRole("link", { name: "Facturar", exact: true }).click();
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura A/);
    await expect(page.getByTestId("renglon-factura")).toHaveCount(2);
    await expect(page.getByTestId("total-factura")).toHaveText("$ 1.263.845,00");
    await expect(page.getByLabel("Observaciones")).toHaveValue(/Según presupuesto N° 00000001/);
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();

    // El presupuesto queda facturado, con link a la factura y sin poder editarse
    await page.goto("/presupuestos");
    await page.getByRole("cell", { name: "00000001" }).click();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000001/ })).toContainText("Facturado");
    await expect(page.getByRole("link", { name: "Factura A 0001-00000001" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Facturar", exact: true })).toHaveCount(0);

    // La factura descontó el stock (el presupuesto no)
    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("4 u.");

    // Aparece en la ficha del cliente
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByTestId("presupuestos-cliente")).toContainText("00000001");
    await expect(page.getByTestId("presupuestos-cliente")).toContainText("Facturado");
  });

  test("vencido, duplicado y eliminado", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { h, cliente } = await preparar(request, cuenta);
    const res = await request.post("/api/presupuestos", {
      headers: h,
      data: { clienteId: cliente.id, fecha: "2025-01-10", validoHasta: "2025-01-25", items: [{ descripcion: "Mantenimiento mensual", cantidad: 1, precioUnitario: 80000, alicuotaIva: 21 }] },
    });
    expect(res.status()).toBe(201);
    await entrarCon(page, cuenta);

    await page.goto("/presupuestos");
    await expect(page.getByRole("row", { name: /00000001/ })).toContainText("Vencido");
    await page.getByRole("cell", { name: "00000001" }).click();

    // Duplicar crea uno nuevo, pendiente, con los mismos ítems y validez renovada
    await page.getByRole("button", { name: "Duplicar" }).click();
    await expect(page.getByRole("heading", { name: /Presupuesto 00000002/ })).toContainText("Pendiente");
    await expect(page.getByText("Mantenimiento mensual")).toBeVisible();
    await expect(page.getByTestId("presupuesto-total")).toHaveText("$ 96.800,00");

    await page.getByRole("button", { name: "Eliminar presupuesto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page).toHaveURL(/\/presupuestos$/);
    await expect(page.getByRole("row", { name: /00000002/ })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /00000001/ })).toBeVisible();
  });

  test("valida cliente e ítems antes de guardar", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/presupuestos/nuevo");
    await page.getByRole("button", { name: "Guardar presupuesto" }).click();
    await expect(page.getByText("Elegí un cliente").first()).toBeVisible();
    await expect(page).toHaveURL(/\/presupuestos\/nuevo$/);
  });
});
