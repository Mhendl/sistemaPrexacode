import { expect, test } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon } from "./helpers";

test.describe("Ficha del cliente: notas y productos que usa", () => {
  test("bitácora de notas: agregar, fijar, editar y borrar", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const c = await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Imprenta Sur", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();
    await entrarCon(page, cuenta);
    await page.goto(`/clientes/${c.id}`);
    const notas = page.getByTestId("notas-cliente");
    await expect(notas).toContainText("Todavía no hay notas");

    await notas.getByLabel("Nueva nota").fill("Prefiere que lo llamen a la tarde");
    await notas.getByRole("button", { name: "Agregar nota" }).click();
    await expect(notas.getByTestId("nota-cliente")).toHaveCount(1);
    await expect(notas.getByTestId("nota-cliente").first()).toContainText("Ana Pérez · hoy");

    await notas.getByLabel("Nueva nota").fill("Paga solo por transferencia");
    await notas.getByRole("button", { name: "Fijar arriba" }).click();
    await notas.getByRole("button", { name: "Agregar nota" }).click();
    await expect(notas.getByTestId("nota-cliente")).toHaveCount(2);
    // La fijada queda primera
    await expect(notas.getByTestId("nota-cliente").first()).toContainText("Paga solo por transferencia");

    // Editar la otra
    const otra = notas.getByTestId("nota-cliente").filter({ hasText: "a la tarde" });
    await otra.getByRole("button", { name: "Editar nota" }).click();
    await notas.getByLabel("Texto de la nota").fill("Prefiere que lo llamen a la mañana");
    await notas.getByRole("button", { name: "Guardar" }).click();
    await expect(notas).toContainText("Prefiere que lo llamen a la mañana");

    // Queda guardado al volver
    await page.reload();
    await expect(page.getByTestId("nota-cliente")).toHaveCount(2);
    await page.getByTestId("nota-cliente").filter({ hasText: "a la mañana" }).getByRole("button", { name: "Borrar nota" }).click();
    await expect(page.getByTestId("nota-cliente")).toHaveCount(1);
  });

  test("productos que usa: asignar con cantidad y frecuencia, y facturarlos o presupuestarlos con un clic", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const c = await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Imprenta Sur", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();
    await request.post("/api/productos", { headers: h, data: { codigo: "TN-85", descripcion: "Tóner HP 85A", precio: 45000, alicuotaIva: 21, controlaStock: true, stockInicial: 1, stockMinimo: 2 } });
    await request.post("/api/productos", { headers: h, data: { codigo: "RES-A4", descripcion: "Resma A4", precio: 8000, alicuotaIva: 21, controlaStock: true, stockInicial: 50 } });
    await entrarCon(page, cuenta);
    await page.goto(`/clientes/${c.id}`);
    const card = page.getByTestId("productos-cliente");
    await expect(card).toContainText("Todavía no le asignaste productos");

    await card.getByRole("button", { name: "Asignar producto" }).click();
    await elegir(page, "Producto", "Tóner HP 85A · TN-85");
    await card.getByLabel("Cantidad habitual").fill("2");
    await elegir(page, "Cada cuánto", "por mes");
    await card.getByLabel("Comentario").fill("Para la impresora de recepción");
    await card.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Producto agregado al cliente")).toBeVisible();
    const toner = card.getByTestId("producto-cliente").filter({ hasText: "Tóner HP 85A" });
    await expect(toner).toContainText("2 u. por mes");
    await expect(toner).toContainText("Para la impresora de recepción");
    await expect(toner).toContainText("Bajo"); // stock 1, mínimo 2

    await card.getByRole("button", { name: "Asignar producto" }).click();
    // El que ya está no se ofrece de nuevo
    await page.getByLabel("Producto").click();
    await expect(page.getByRole("option", { name: /Tóner HP 85A/ })).toHaveCount(0);
    await page.getByRole("option", { name: "Resma A4 · RES-A4" }).click();
    await card.getByRole("button", { name: "Agregar" }).click();
    await expect(card.getByTestId("producto-cliente")).toHaveCount(2);

    // Facturar estos: la factura viene con los dos productos y las cantidades habituales
    await card.getByRole("link", { name: "Facturar estos" }).click();
    await expect(page).toHaveURL(/\/facturacion\/nueva\?cliente=.*&productos=/);
    await expect(page.getByTestId("renglon-factura")).toHaveCount(2);
    await expect(page.getByLabel("Cantidad de Tóner HP 85A")).toHaveValue("2");
    await expect(page.getByLabel("Cantidad de Resma A4")).toHaveValue("1");
    // 2 × 45.000 × 1,21 + 8.000 × 1,21
    await expect(page.getByTestId("total-factura")).toHaveText("$ 118.580,00");

    // Presupuestar
    await page.goto(`/clientes/${c.id}`);
    await page.getByTestId("productos-cliente").getByRole("link", { name: "Presupuestar" }).click();
    await expect(page.getByTestId("renglon-factura")).toHaveCount(2);
    await expect(page.getByTestId("total-presupuesto")).toHaveText("$ 118.580,00");

    // Editar y quitar
    await page.goto(`/clientes/${c.id}`);
    await page.getByRole("button", { name: "Editar Tóner HP 85A" }).click();
    await page.getByTestId("productos-cliente").getByLabel("Cantidad habitual").fill("3");
    await page.getByTestId("productos-cliente").getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("producto-cliente").filter({ hasText: "Tóner" })).toContainText("3 u. por mes");
    await page.getByRole("button", { name: "Quitar Resma A4" }).click();
    await expect(page.getByTestId("producto-cliente")).toHaveCount(1);
  });
});
