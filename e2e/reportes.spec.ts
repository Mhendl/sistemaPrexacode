import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import * as XLSX from "xlsx";
import { crearCuenta, cuitValido, elegir, entrarCon, loginUI, PASSWORD, type Cuenta } from "./helpers";

/** FA 2 tóner (2.420), FA soporte al 10,5 % (5.525), FB 1 tóner (1.210) y NC A por 1 tóner (−1.210) */
async function preparar(request: APIRequestContext, cuenta: Cuenta) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const post = async (url: string, data: object) => (await request.post(url, { headers: h, data })).json();
  const ri = await post("/api/clientes", { razonSocial: "Inscripto S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" });
  const cf = await post("/api/clientes", { razonSocial: "Consumidor Uno", cuit: cuitValido("20"), condicionIva: "Consumidor Final" });
  const toner = await post("/api/productos", { codigo: "T1", descripcion: "Tóner", precio: 1000, alicuotaIva: 21, controlaStock: false });
  const fa = await post("/api/comprobantes", { clienteId: ri.id, items: [{ productoId: toner.id, cantidad: 2 }] });
  await post("/api/comprobantes", { clienteId: ri.id, items: [{ descripcion: "Soporte técnico", cantidad: 1, precioUnitario: 5000, alicuotaIva: 10.5 }] });
  await post("/api/comprobantes", { clienteId: cf.id, items: [{ productoId: toner.id, cantidad: 1 }] });
  await post("/api/comprobantes", { clase: "nota_credito", asociadoId: fa.id, clienteId: ri.id, moverStock: false, items: [{ productoId: toner.id, cantidad: 1 }] });
}

test.describe("Reportes", () => {
  test("ventas del mes, Libro IVA y exportación a Excel", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/");
    await page.getByRole("link", { name: "Reportes", exact: true }).click();
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 7.945,00");
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 7.000,00 sin IVA");
    await expect(page.getByRole("row", { name: /Inscripto S\.A\./ })).toContainText("$ 6.735,00");
    await expect(page.getByRole("row", { name: /Soporte técnico/ })).toContainText("$ 5.000,00");
    await expect(page.getByRole("row", { name: /Tóner/ })).toContainText("2 u.");

    await page.getByRole("tab", { name: "Libro IVA Ventas" }).click();
    await expect(page.getByTestId("aviso-libro-prueba")).toBeVisible();
    await expect(page.getByTestId("renglon-libro")).toHaveCount(4);
    await expect(page.getByTestId("renglon-libro").filter({ hasText: "Nota de crédito" })).toContainText("-$ 1.210,00");
    await expect(page.getByRole("columnheader", { name: "IVA 10,5 %" })).toBeVisible();
    await expect(page.getByTestId("libro-totales")).toContainText("$ 7.945,00");
    await expect(page.getByTestId("libro-totales")).toContainText("$ 525,00");

    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar a Excel" }).click()]);
    expect(descarga.suggestedFilename()).toMatch(/^reporte-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const libro = XLSX.read(readFileSync((await descarga.path())!));
    expect(libro.SheetNames).toEqual(["Resumen", "Por cliente", "Por producto", "Libro IVA Ventas"]);
    const iva = XLSX.utils.sheet_to_json<(string | number)[]>(libro.Sheets["Libro IVA Ventas"]!, { header: 1 });
    expect(iva[0]).toEqual(["Fecha", "Tipo", "Número", "Cliente", "CUIT", "Condición IVA", "Neto gravado", "Exento", "IVA 21 %", "IVA 10,5 %", "Total"]);
    expect(iva).toHaveLength(6);
    expect(iva[5]).toEqual(["Totales", "", "", "", "", "", 7000, 0, 420, 525, 7945]);

    // Otro período: vacío
    await elegir(page, "Período", "Año anterior");
    await expect(page.getByText("No hay comprobantes autorizados en el período")).toBeVisible();
    await page.getByRole("tab", { name: "Ventas", exact: true }).click();
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 0,00");
  });

  test("Operaciones no ve Reportes", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const email = `ops.${Date.now()}@prueba.com.ar`;
    await request.post("/api/usuarios", { headers: h, data: { nombre: "Operaciones", email, rol: "operaciones", password: PASSWORD } });
    await loginUI(page, email);
    await expect(page.getByRole("link", { name: "Productos y stock", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reportes", exact: true })).toHaveCount(0);
  });
});
