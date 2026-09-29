import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { cerrarSesion, crearCuenta, cuitValido, elegir, emailUnico, entrarCon, formatear, loginUI, PASSWORD, type Cuenta } from "./helpers";

/** Arma un .xlsx en memoria a partir de filas (la primera es el encabezado) */
function excel(filas: (string | number)[][]): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Hoja1");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
}

async function abrirImportar(page: Page, entidad: "clientes" | "productos") {
  await page.goto("/importar-exportar");
  await page.getByTestId(`tarjeta-${entidad}`).getByRole("button", { name: /^Importar/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

const api = (request: APIRequestContext, cuenta: Cuenta) => ({
  post: (url: string, data: unknown) => request.post(url, { headers: { authorization: `Bearer ${cuenta.token}` }, data }),
});

test.describe("Importar y exportar", () => {
  test("importa clientes de un Excel de otro sistema, con columnas distintas y una fila con error", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    const archivo = excel([
      ["Nombre", "CUIT/CUIL", "IVA", "Mail", "Ciudad", "Columna rara"],
      ["Ferretería El Tornillo S.R.L.", formatear(cuitValido("30")), "RI", "compras@eltornillo.com.ar", "San Martín", "x"],
      ["Almacén Don Pepe", cuitValido("20"), "Monotributo", "", "Quilmes", "y"],
      ["CUIT Equivocado S.A.", "30-11111111-1", "RI", "", "", ""],
    ]);

    await abrirImportar(page, "clientes");
    const d = page.getByRole("dialog");
    await page.getByLabel("Archivo a importar").setInputFiles({ name: "clientes-viejo-sistema.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: archivo });

    const vista = d.getByTestId("vista-previa");
    await expect(vista).toContainText("se ignoran: Columna rara");
    await expect(vista.getByText("Nuevos").locator("..")).toContainText("2");
    await expect(vista.getByText("Con errores").locator("..")).toContainText("1");
    await expect(d.getByTestId("error-fila")).toHaveText(/Fila 4\s*CUIT: El CUIT no es válido/);

    await d.getByRole("button", { name: "Importar 2 registros" }).click();
    await expect(d.getByRole("status")).toContainText("2 nuevos");
    await d.getByRole("button", { name: "Listo" }).click();

    await page.goto("/clientes");
    await expect(page.getByRole("row")).toHaveCount(3);
    await page.getByRole("cell", { name: /Almacén Don Pepe/ }).click();
    await expect(page.getByText("Monotributista")).toBeVisible();
  });

  test("importa productos desde CSV con formato argentino y corrige stock de uno existente", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const creado = await api(request, cuenta).post("/api/productos", { codigo: "TONER", descripcion: "Tóner viejo", precio: 100, alicuotaIva: 21, controlaStock: true, stockInicial: 10, stockMinimo: 0 });
    const tonerId = (await creado.json()).id;
    await entrarCon(page, cuenta);

    const csv = '﻿Código;Descripción;Precio sin IVA;IVA %;Stock\nTONER;Tóner 85A;"24.900,50";21;7\nRESMA;Resma A4 75 g;8950,5;21%;40\n';
    await abrirImportar(page, "productos");
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: /Actualizarlo/ }).click();
    await page.getByLabel("Archivo a importar").setInputFiles({ name: "productos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });

    const vista = d.getByTestId("vista-previa");
    await expect(vista.getByText("Nuevos").locator("..")).toContainText("1");
    await expect(vista.getByText("Se actualizan").locator("..")).toContainText("1");
    await d.getByRole("button", { name: "Importar 2 registros" }).click();
    await expect(d.getByRole("status")).toContainText("1 nuevos · 1 actualizados");
    await d.getByRole("button", { name: "Listo" }).click();

    await page.goto(`/productos/${tonerId}`);
    await expect(page.getByRole("heading", { name: "Tóner 85A" })).toBeVisible();
    await expect(page.getByTestId("precio")).toHaveText("$ 24.900,50");
    await expect(page.getByTestId("stock-actual")).toHaveText("7 u.");
    await expect(page.getByTestId("movimiento").first()).toContainText("Importación: corrección de stock");

    await page.goto("/productos");
    await expect(page.getByRole("row", { name: /Resma A4 75 g/ })).toContainText("40 u.");
    await expect(page.getByRole("row", { name: /Resma A4 75 g/ })).toContainText("$ 8.950,50");
  });

  test("exportar a Excel y volver a importar el mismo archivo no duplica nada", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    for (const nombre of ["Hotel Costa Azul S.A.", "Taller Los Hermanos"]) {
      await api(request, cuenta).post("/api/clientes", { razonSocial: nombre, cuit: cuitValido("30"), condicionIva: "Responsable Inscripto", localidad: "Mar del Plata" });
    }
    await entrarCon(page, cuenta);
    await page.goto("/importar-exportar");
    const tarjeta = page.getByTestId("tarjeta-clientes");
    await expect(tarjeta).toContainText("2 cargados");

    const [descarga] = await Promise.all([page.waitForEvent("download"), tarjeta.getByRole("button", { name: "Exportar a Excel" }).click()]);
    expect(descarga.suggestedFilename()).toMatch(/^clientes-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const ruta = await descarga.path();
    const libro = XLSX.read(readFileSync(ruta));
    const filas = XLSX.utils.sheet_to_json<Record<string, string>>(libro.Sheets[libro.SheetNames[0]!]!);
    expect(filas).toHaveLength(2);
    expect(Object.keys(filas[0]!)).toEqual(expect.arrayContaining(["Razón social", "CUIT", "Condición IVA", "Localidad"]));
    expect(filas.map((f) => f["Razón social"]).sort()).toEqual(["Hotel Costa Azul S.A.", "Taller Los Hermanos"]);

    // Volver a subir lo exportado: todo ya existe
    await tarjeta.getByRole("button", { name: "Importar clientes" }).click();
    await page.getByLabel("Archivo a importar").setInputFiles(ruta);
    const d = page.getByRole("dialog");
    await expect(d.getByTestId("vista-previa").getByText("Ya existen (se omiten)").locator("..")).toContainText("2");
    await expect(d.getByRole("button", { name: "Importar 0 registros" })).toBeDisabled();
  });

  test("CSV exportado: separador punto y coma y acentos correctos para Excel en español", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await api(request, cuenta).post("/api/productos", { codigo: "MON-24", descripcion: "Monitor 24\" Full HD", categoria: "Informática", precio: 245900.5, alicuotaIva: 10.5, controlaStock: true, stockInicial: 3, stockMinimo: 1 });
    await entrarCon(page, cuenta);
    await page.goto("/importar-exportar");
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tarjeta-productos").getByRole("button", { name: "Exportar a CSV" }).click()]);
    const texto = readFileSync(await descarga.path(), "utf8");
    expect(texto.charCodeAt(0)).toBe(0xfeff); // BOM
    const [encabezado, fila] = texto.slice(1).trim().split(/\r?\n/);
    expect(encabezado).toBe("Código;Descripción;Categoría;Unidad;Precio sin IVA;IVA %;Controla stock;Stock;Stock mínimo;Activo");
    expect(fila).toContain("MON-24");
    expect(fila).toContain("Informática");
    expect(fila).toContain(";Sí;3;1;Sí");
  });

  test("cada rol ve solo lo que puede importar o exportar", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    const email = emailUnico("ops");
    await page.goto("/configuracion?tab=usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre y apellido").fill("Valeria Depósito");
    await d.getByLabel("Email").fill(email);
    await elegir(page, "Rol", "Operaciones");
    await d.getByLabel("Contraseña inicial").fill(PASSWORD);
    await d.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByTestId(`usuario-${email}`)).toBeVisible();
    await cerrarSesion(page);

    await loginUI(page, email);
    await page.getByRole("link", { name: "Importar y exportar" }).click();
    await expect(page.getByTestId("tarjeta-productos")).toBeVisible();
    await expect(page.getByTestId("tarjeta-productos").getByRole("button", { name: "Importar productos y stock" })).toBeVisible();
    await expect(page.getByTestId("tarjeta-clientes")).toHaveCount(0);
  });
});
