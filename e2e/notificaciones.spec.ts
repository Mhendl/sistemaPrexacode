import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { crearCuenta, entrarCon, type Cuenta } from "./helpers";

let n = 0;
async function productoPorApi(request: APIRequestContext, cuenta: Cuenta, stockInicial: number, stockMinimo: number, descripcion = "Tóner 85A") {
  const res = await request.post("/api/productos", {
    headers: { authorization: `Bearer ${cuenta.token}` },
    data: { codigo: `NT-${Date.now()}-${++n}`, descripcion, precio: 24900, alicuotaIva: 21, controlaStock: true, stockInicial, stockMinimo },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id as string;
}

async function corregirStock(page: Page, cantidad: string) {
  await page.getByRole("button", { name: "Corregir stock" }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("radio", { name: "Ajuste" })).toHaveAttribute("aria-checked", "true");
  await d.getByLabel("Stock contado").fill(cantidad);
  await d.getByRole("button", { name: "Registrar" }).click();
}

test.describe("Notificaciones", () => {
  test("al quedar bajo el mínimo aparece el aviso en la campanita y lleva al producto", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const id = await productoPorApi(request, cuenta, 5, 5);
    await entrarCon(page, cuenta);
    await page.goto(`/productos/${id}`);
    await expect(page.getByTestId("notificaciones-contador")).toHaveCount(0);

    // "Corregir stock" abre directamente el ajuste
    await corregirStock(page, "3");
    await expect(page.getByTestId("stock-actual")).toHaveText("3 u.");
    await expect(page.getByTestId("notificaciones-contador")).toHaveText("1");

    await page.goto("/clientes");
    await page.getByRole("button", { name: /Notificaciones/ }).click();
    const aviso = page.getByTestId("notificacion").first();
    await expect(aviso).toContainText("Stock bajo el mínimo");
    await expect(aviso).toContainText("quedan 3 u.");
    await aviso.click();

    await expect(page).toHaveURL(new RegExp(`/productos/${id}$`));
    await expect(page.getByTestId("notificaciones-contador")).toHaveCount(0); // quedó leída
  });

  test("si el usuario desactiva un aviso, deja de recibirlo", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const id = await productoPorApi(request, cuenta, 5, 5);
    await entrarCon(page, cuenta);

    await page.goto("/");
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Mis notificaciones" }).click();
    await expect(page.getByRole("heading", { name: "Mis notificaciones" })).toBeVisible();
    // El aviso de vencimientos ya está disponible
    await expect(page.getByRole("switch", { name: "Vencimiento de facturas" })).toBeEnabled();
    await page.getByRole("switch", { name: "Stock bajo el mínimo" }).click();
    await expect(page.getByText("Aviso desactivado")).toBeVisible();

    await page.goto(`/productos/${id}`);
    await corregirStock(page, "2");
    await expect(page.getByTestId("stock-actual")).toHaveText("2 u.");
    await page.reload();
    await expect(page.getByTestId("stock-actual")).toHaveText("2 u.");
    await expect(page.getByTestId("notificaciones-contador")).toHaveCount(0);

    // "Sin stock" sigue activo
    await corregirStock(page, "0");
    await expect(page.getByTestId("notificaciones-contador")).toHaveText("1");
  });
});

test.describe("Dos personas editando lo mismo", () => {
  test("el segundo que guarda recibe un aviso y ve los datos actualizados", async ({ browser, request }) => {
    const cuenta = await crearCuenta(request);
    const id = await productoPorApi(request, cuenta, 10, 0, "Monitor 24 pulgadas");

    const ana = await browser.newPage();
    const beto = await browser.newPage();
    await entrarCon(ana, cuenta);
    await entrarCon(beto, cuenta);
    await ana.goto(`/productos/${id}`);
    await beto.goto(`/productos/${id}`);

    // Los dos abren "Editar" al mismo tiempo
    await ana.getByRole("button", { name: "Editar" }).click();
    await beto.getByRole("button", { name: "Editar" }).click();

    await ana.getByRole("dialog").getByLabel("Precio sin IVA").fill("250000");
    await ana.getByRole("dialog").getByRole("button", { name: "Guardar producto" }).click();
    await expect(ana.getByTestId("precio")).toHaveText("$ 250.000,00");

    await beto.getByRole("dialog").getByLabel("Precio sin IVA").fill("199999");
    await beto.getByRole("dialog").getByRole("button", { name: "Guardar producto" }).click();
    await expect(beto.getByText(/Otro usuario modificó este producto mientras lo editabas/)).toBeVisible();
    // Se cerró el formulario y Beto ve el precio que guardó Ana (no se pisó)
    await expect(beto.getByRole("dialog")).toHaveCount(0);
    await expect(beto.getByTestId("precio")).toHaveText("$ 250.000,00");

    // Ahora Beto puede editar sobre la versión nueva
    await beto.getByRole("button", { name: "Editar" }).click();
    await beto.getByRole("dialog").getByLabel("Precio sin IVA").fill("199999");
    await beto.getByRole("dialog").getByRole("button", { name: "Guardar producto" }).click();
    await expect(beto.getByTestId("precio")).toHaveText("$ 199.999,00");
  });
});
