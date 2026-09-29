import { expect, test, type APIRequestContext } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon, type Cuenta } from "./helpers";

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dias = (n: number) => {
  const d = new Date(`${hoy()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function preparar(request: APIRequestContext, cuenta: Cuenta) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cliente = (await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Constructora Del Plata S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" } })).json()) as { id: string };
  /** Factura en cuenta corriente por un servicio: total = neto × 1,21 */
  const factura = async (neto: number, extra: Record<string, unknown> = {}) => {
    const res = await request.post("/api/comprobantes", {
      headers: h,
      data: { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio de mantenimiento", cantidad: 1, precioUnitario: neto, alicuotaIva: 21 }], ...extra },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as { id: string };
  };
  return { h, cliente, factura };
}

test.describe("Cobranzas", () => {
  test("cobro parcial con dos medios desde la factura: queda Parcial con el saldo correcto", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { factura } = await preparar(request, cuenta);
    const f = await factura(1000); // $ 1.210
    await entrarCon(page, cuenta);

    await page.goto(`/facturacion/${f.id}`);
    await expect(page.getByTestId("estado-cobro")).toContainText("Impaga");
    await page.getByRole("link", { name: "Registrar cobro" }).click();

    // La factura viene tildada con todo el saldo; aplicamos solo una parte
    const aplicar = page.getByLabel(/Importe a aplicar a Factura A 0001-00000001/);
    await expect(aplicar).toHaveValue("1.210,00");
    await aplicar.fill("700");
    await expect(page.getByLabel("Importe del medio 1")).toHaveValue("700,00"); // se completa solo
    await page.getByLabel("Importe del medio 1").fill("500");
    await page.getByLabel("Referencia del medio 1").fill("Op. 88123");
    await page.getByRole("button", { name: "Agregar otro medio" }).click();
    await page.getByLabel("Importe del medio 2").fill("200");
    await expect(page.getByTestId("resumen-recibo")).toContainText("Total cobrado$ 700,00");
    await expect(page.getByTestId("resumen-recibo")).toContainText("Queda a favor del cliente$ 0,00");
    await page.getByRole("button", { name: "Registrar recibo" }).click();

    await expect(page.getByTestId("recibo-numero")).toHaveText("0001-00000001");
    await expect(page.getByTestId("recibo-total")).toHaveText("$ 700,00");
    await expect(page.getByText("Transferencia · Op. 88123")).toBeVisible();
    await expect(page.getByRole("row", { name: /Factura A 0001-00000001/ })).toContainText("$ 700,00");

    await page.goto(`/facturacion/${f.id}`);
    await expect(page.getByTestId("estado-cobro")).toContainText("Parcial");
    await expect(page.getByTestId("estado-cobro")).toContainText("Saldo $ 510,00");
  });

  test("una factura de contado cobrada en el momento no queda como deuda", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Constructora Del Plata S.A.");
    await page.getByRole("button", { name: "Ítem libre" }).click();
    await page.getByLabel("Descripción del ítem").fill("Venta mostrador");
    await page.getByLabel("Precio de Venta mostrador").fill("1.000");
    await expect(page.getByRole("checkbox", { name: "Cobrada en el momento" })).toBeChecked();
    await elegir(page, "Medio de cobro", "Mercado Pago");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();

    await expect(page.getByTestId("estado-cobro")).toContainText("Pagada");
    await page.goto("/cobranzas");
    await expect(page.getByText("Ningún cliente te debe plata")).toBeVisible();
    await page.getByRole("tab", { name: "Recibos" }).click();
    await expect(page.getByRole("row", { name: /Constructora Del Plata/ })).toContainText("$ 1.210,00");
  });

  test("resumen con deuda vencida, campanita y cuenta corriente del cliente", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { cliente, factura } = await preparar(request, cuenta);
    await factura(1000); // al día
    await factura(500, { fecha: dias(-5), vencimiento: dias(-2) }); // $ 605 vencida hace 2 días
    await entrarCon(page, cuenta);

    await page.goto("/cobranzas");
    const kpis = page.getByTestId("kpis-cobranzas");
    await expect(kpis).toContainText("Por cobrar$ 1.815,00");
    await expect(kpis).toContainText("1 cliente con deuda");
    await expect(kpis).toContainText("1 factura vencida");
    await expect(page.getByRole("row", { name: /Constructora Del Plata/ })).toContainText("$ 605,00");
    await expect(page.getByRole("row", { name: /Constructora Del Plata/ })).toContainText("Hasta 2 días de atraso");
    await page.getByRole("tab", { name: /Facturas vencidas/ }).click();
    await expect(page.getByRole("row", { name: /Factura A 0001-00000002/ })).toContainText("2 días");

    // Aviso en la campanita
    await page.getByRole("button", { name: /Notificaciones/ }).click();
    await expect(page.getByTestId("notificacion").first()).toContainText("Factura vencida");
    await page.keyboard.press("Escape");

    // Cuenta corriente en la ficha
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByTestId("saldo-cliente")).toHaveText("$ 1.815,00");
    await expect(page.getByTestId("movimiento-cc")).toHaveCount(2);
  });

  test("pago a cuenta sin facturas queda a favor; anular el recibo lo deshace", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { cliente } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);

    await page.goto(`/cobranzas/nuevo?cliente=${cliente.id}`);
    await expect(page.getByText("Este cliente no tiene facturas pendientes")).toBeVisible();
    await page.getByLabel("Importe del medio 1").fill("5.000");
    await expect(page.getByTestId("resumen-recibo")).toContainText("Queda a favor del cliente$ 5.000,00");
    await page.getByRole("button", { name: "Registrar recibo" }).click();
    await expect(page.getByText("A cuenta (saldo a favor)")).toBeVisible();
    const urlRecibo = page.url();

    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByTestId("saldo-cliente")).toHaveText("-$ 5.000,00");

    await page.goto(urlRecibo);
    await page.getByRole("button", { name: "Anular" }).click();
    await page.getByLabel("Motivo").fill("Transferencia devuelta");
    await page.getByRole("dialog").getByRole("button", { name: "Anular recibo" }).click();
    await expect(page.getByText("ANULADO", { exact: true })).toBeVisible();
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByTestId("saldo-cliente")).toHaveText("$ 0,00");
  });
});
