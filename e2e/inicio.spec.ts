import { expect, test } from "@playwright/test";
import { crearCuenta, cuitValido, entrarCon } from "./helpers";

test.describe("Inicio", () => {
  test("una empresa nueva ve los primeros pasos y se van tildando a medida que carga datos", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    await page.goto("/");
    const pasos = page.getByTestId("primeros-pasos");
    await expect(pasos).toContainText("0 de 5 listos");
    await expect(page.getByTestId("kpis-inicio")).toContainText("Ventas del mes$ 0,00");

    // Carga un cliente, un producto y factura (por API, para ir rápido)
    const h = { authorization: `Bearer ${cuenta.token}` };
    const cliente = await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Hotel Costa Azul S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json();
    const prod = await (await request.post("/api/productos", { headers: h, data: { codigo: "T1", descripcion: "Tóner 85A", precio: 10000, alicuotaIva: 21, controlaStock: true, stockInicial: 3, stockMinimo: 5 } })).json();
    await request.post("/api/comprobantes", { headers: h, data: { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ productoId: prod.id, cantidad: 1 }] } });

    await page.reload();
    await expect(pasos).toContainText("3 de 5 listos");
    const kpis = page.getByTestId("kpis-inicio");
    await expect(kpis).toContainText("Ventas del mes$ 12.100,00");
    await expect(kpis).toContainText("Por cobrar$ 12.100,00");
    await expect(kpis).toContainText("Stock bajo mínimo1 producto");
    await expect(page.getByRole("link", { name: /Hotel Costa Azul S\.A\..*Factura A 0001-00000001/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tóner 85A/ })).toContainText("2 / mín. 5 u.");

    // Un paso lleva a su pantalla
    await pasos.getByRole("link", { name: /Sumá a tu equipo/ }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=usuarios$/);
  });
});
