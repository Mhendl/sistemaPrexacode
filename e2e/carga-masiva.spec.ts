import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, entrarCon, type Cuenta } from "./helpers";

const api = (request: APIRequestContext, cuenta: Cuenta) => ({
  post: async (url: string, data: unknown) => (await request.post(url, { headers: { authorization: `Bearer ${cuenta.token}` }, data })).json(),
});

async function catalogo(request: APIRequestContext) {
  const cuenta = await crearCuenta(request, `Librería Masiva ${Date.now()}`);
  const a = api(request, cuenta);
  const ids: Record<string, string> = {};
  for (const [codigo, descripcion, precio, categoria] of [
    ["RESMA", "Resma A4 75 g", 8950.5, "Librería"],
    ["BIROME", "Birome azul", 350, "Librería"],
    ["TONER", "Tóner 85A", 45000, "Insumos"],
  ] as const) {
    ids[codigo] = (await a.post("/api/productos", { codigo, descripcion, precio, categoria, alicuotaIva: 21, controlaStock: true, stockInicial: 10, stockMinimo: 0 })).id;
  }
  return { cuenta, ids };
}

async function subir(page: Page, entidad: "clientes" | "productos", nombre: string, buffer: Buffer) {
  await page.goto("/importar-exportar");
  await page.getByTestId(`tarjeta-${entidad}`).getByRole("button", { name: /^Importar/ }).click();
  await page.getByLabel("Archivo a importar").setInputFiles({ name: nombre, mimeType: "text/csv", buffer });
  return page.getByRole("dialog");
}

test.describe("Carga masiva", () => {
  test("CSV guardado por Excel en Windows (ANSI): los acentos y la ñ llegan bien", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    const cuit = cuitValido();
    // Excel en español guarda "CSV (delimitado por comas)" en Windows-1252, con punto y coma
    const csv = `Razón social;CUIT;Condición IVA;Localidad\r\nFerretería Ñandú S.R.L.;${cuit};RI;Morón\r\n`;
    const d = await subir(page, "clientes", "clientes-excel.csv", Buffer.from(csv, "latin1"));
    await expect(d.getByTestId("vista-previa")).toContainText("columnas reconocidas: Razón social, CUIT, Condición IVA, Localidad");
    await d.getByRole("button", { name: "Importar 1 registro" }).click();
    await d.getByRole("button", { name: "Listo" }).click();
    await page.goto("/clientes");
    await expect(page.getByRole("cell", { name: /Ferretería Ñandú S\.R\.L\./ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Ñandú/ })).toContainText("Morón");
  });

  test("inventario con solo Código y Stock: se detecta como planilla parcial y corrige el stock", async ({ page, request }) => {
    const { cuenta, ids } = await catalogo(request);
    await entrarCon(page, cuenta);
    const d = await subir(page, "productos", "conteo.csv", Buffer.from("Código;Stock\nRESMA;37\nBIROME;120\n", "utf8"));
    await expect(d.getByTestId("planilla-parcial")).toBeVisible();
    await expect(d.getByRole("radio", { name: /Actualizarlo/ })).toHaveAttribute("aria-checked", "true");
    await expect(d.getByTestId("vista-previa").getByText("Se actualizan", { exact: true }).locator("..")).toContainText("2");
    await d.getByRole("button", { name: "Importar 2 registros" }).click();
    await expect(d.getByRole("status")).toContainText("2 actualizados");
    await d.getByRole("button", { name: "Listo" }).click();

    await page.goto(`/productos/${ids.RESMA}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("37 u.");
    await expect(page.getByTestId("precio")).toHaveText("$ 8.950,50"); // el precio no se tocó
    await expect(page.getByTestId("movimiento").first()).toContainText("Importación: corrección de stock");
  });

  test("aumento de precios por porcentaje: vista previa y después aplica, por categoría", async ({ page, request }) => {
    const { cuenta } = await catalogo(request);
    await entrarCon(page, cuenta);
    await page.goto("/productos");
    await page.getByRole("button", { name: "Actualizar precios" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Porcentaje").fill("10");
    await d.getByLabel("Redondear a").click();
    await page.getByRole("option", { name: "De a $ 10", exact: true }).click();
    await d.getByLabel("Productos").click();
    await page.getByRole("option", { name: "Categoría: Librería" }).click();
    await d.getByRole("button", { name: "Ver cómo quedan" }).click();
    await expect(d.getByTestId("vista-precios")).toContainText("Cambian 2 de 2 productos");
    await expect(d.getByTestId("vista-precios")).toContainText("$ 8.950,50 → $ 9.850,00");
    await d.getByRole("button", { name: "Aplicar a 2 productos" }).click();
    await expect(page.getByText("Precios actualizados: 2 productos")).toBeVisible();
    await expect(page.getByRole("row", { name: /Resma A4/ })).toContainText("$ 9.850,00");
    await expect(page.getByRole("row", { name: /Birome/ })).toContainText("$ 390,00");
    await expect(page.getByRole("row", { name: /Tóner/ })).toContainText("$ 45.000,00");
  });

  test("tildar varios productos y cambiarles la categoría y el precio de una vez", async ({ page, request }) => {
    const { cuenta } = await catalogo(request);
    await entrarCon(page, cuenta);
    await page.goto("/productos");
    await page.getByRole("row", { name: /Resma A4/ }).getByRole("checkbox", { name: "Elegir" }).click();
    await page.getByRole("row", { name: /Tóner/ }).getByRole("checkbox", { name: "Elegir" }).click();
    const barra = page.getByTestId("barra-seleccion");
    await expect(barra).toContainText("2 elegidos");

    await barra.getByRole("button", { name: "Editar datos" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("switch", { name: "Cambiar la categoría" }).click();
    await d.getByLabel("Categoría", { exact: true }).fill("Oficina");
    await d.getByRole("button", { name: "Aplicar a 2" }).click();
    await expect(page.getByText("2 productos actualizados")).toBeVisible();
    await expect(barra).toHaveCount(0); // se limpia la selección

    // Elegir todos los filtrados: los de Oficina
    await page.getByPlaceholder("Buscar por código o descripción…").fill("Oficina");
    await page.getByRole("checkbox", { name: "Elegir todos los de la lista" }).click();
    await expect(page.getByTestId("barra-seleccion")).toContainText("2 elegidos");
    await page.getByTestId("barra-seleccion").getByRole("button", { name: "Cambiar precios" }).click();
    await page.getByRole("dialog").getByLabel("Porcentaje").fill("-5");
    await page.getByRole("dialog").getByRole("button", { name: "Ver cómo quedan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Aplicar a 2 productos" }).click();
    await expect(page.getByRole("row", { name: /Tóner/ })).toContainText("$ 42.750,00");
    await page.getByPlaceholder("Buscar por código o descripción…").fill("");
    await expect(page.getByRole("row", { name: /Birome/ })).toContainText("$ 350,00"); // no estaba elegida
  });

  test("tildar clientes y pasarlos a inactivos, con su localidad", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const a = api(request, cuenta);
    for (const nombre of ["Cliente Norte", "Cliente Sur", "Cliente Este"]) await a.post("/api/clientes", { razonSocial: nombre, cuit: cuitValido(), condicionIva: "Responsable Inscripto" });
    await entrarCon(page, cuenta);
    await page.goto("/clientes");
    await page.getByRole("row", { name: /Cliente Norte/ }).getByRole("checkbox", { name: "Elegir" }).click();
    await page.getByRole("row", { name: /Cliente Sur/ }).getByRole("checkbox", { name: "Elegir" }).click();
    await page.getByTestId("barra-seleccion").getByRole("button", { name: "Editar datos" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Localidad").fill("Mar del Plata");
    await d.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Inactivos" }).click();
    await d.getByRole("button", { name: "Aplicar a 2" }).click();
    await expect(page.getByText("2 clientes actualizados")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cliente Norte/ })).toContainText("Inactivo");
    await expect(page.getByRole("row", { name: /Cliente Este/ })).toContainText("Activo");
  });
});
