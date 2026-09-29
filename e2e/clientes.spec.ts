import { expect, test, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, entrarCon, formatear } from "./helpers";

async function cargarCliente(page: Page, datos: { razonSocial: string; cuit: string; condicion?: string; contacto?: string }) {
  await page.getByRole("button", { name: /Nuevo cliente|Cargar el primero/ }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Razón social / Nombre").fill(datos.razonSocial);
  await dialogo.getByLabel("CUIT / CUIL").fill(datos.cuit);
  await elegir(page, "Condición frente al IVA", datos.condicion ?? "Responsable Inscripto");
  if (datos.contacto) await dialogo.getByLabel("Contacto").fill(datos.contacto);
  await dialogo.getByRole("button", { name: "Guardar cliente" }).click();
}

test.describe("Clientes", () => {
  test("alta, búsqueda, edición y baja de un cliente", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/clientes");
    await expect(page.getByText("Todavía no cargaste clientes")).toBeVisible();

    // Alta: lleva a la ficha
    const cuit = cuitValido("30");
    await cargarCliente(page, { razonSocial: "Hotel Costa Azul S.A.", cuit: formatear(cuit), contacto: "Marcela Duarte" });
    await expect(page.getByRole("heading", { name: "Hotel Costa Azul S.A." })).toBeVisible();
    await expect(page.getByText(`CUIT ${formatear(cuit)}`)).toBeVisible();

    // Aparece en el listado y se encuentra por CUIT
    await page.getByRole("link", { name: "Clientes", exact: true }).first().click();
    await cargarCliente(page, { razonSocial: "Taller Los Hermanos", cuit: cuitValido("20"), condicion: "Monotributista" });
    await page.getByRole("link", { name: "Clientes", exact: true }).first().click();
    await expect(page.getByRole("row")).toHaveCount(3); // encabezado + 2
    const buscador = page.getByPlaceholder("Buscar por nombre, CUIT, contacto…");
    await buscador.fill(formatear(cuit));
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("cell", { name: /Hotel Costa Azul/ })).toBeVisible();
    await buscador.fill("hermanos");
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("cell", { name: /Taller Los Hermanos/ })).toBeVisible();
    await buscador.fill("");

    // Edición
    await page.getByRole("cell", { name: /Hotel Costa Azul/ }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("dialog").getByLabel("Razón social / Nombre").fill("Hotel Costa Azul Resort S.A.");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByRole("heading", { name: "Hotel Costa Azul Resort S.A." })).toBeVisible();

    // El cambio quedó guardado en el servidor
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hotel Costa Azul Resort S.A." })).toBeVisible();

    // Baja con confirmación
    await page.getByRole("button", { name: "Eliminar cliente" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("cell", { name: /Hotel Costa Azul/ })).toHaveCount(0);
  });

  test("muestra los errores de validación en cada campo", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("CUIT / CUIL").fill("20-1234");
    await dialogo.getByLabel("Email para enviar comprobantes").fill("no-es-un-email");
    await dialogo.getByRole("button", { name: "Guardar cliente" }).click();

    await expect(dialogo.getByText("La razón social es obligatoria")).toBeVisible();
    await expect(dialogo.getByText("El CUIT no es válido")).toBeVisible();
    await expect(dialogo.getByText("Condición de IVA inválida")).toBeVisible();
    await expect(dialogo.getByText("Email inválido")).toBeVisible();
  });

  test("no deja cargar dos veces el mismo CUIT", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/clientes");
    const cuit = formatear(cuitValido("30"));
    await cargarCliente(page, { razonSocial: "Primero S.A.", cuit });
    await page.getByRole("link", { name: "Clientes", exact: true }).first().click();
    await cargarCliente(page, { razonSocial: "Segundo S.A.", cuit });
    await expect(page.getByRole("dialog").getByText("Ya existe")).toBeVisible();
  });

  test("una empresa no ve los clientes de otra", async ({ browser, request }) => {
    const a = await browser.newPage();
    await entrarCon(a, await crearCuenta(request, "Empresa A"));
    await a.goto("/clientes");
    await cargarCliente(a, { razonSocial: "Cliente Secreto de A", cuit: formatear(cuitValido("30")) });
    await expect(a.getByRole("heading", { name: "Cliente Secreto de A" })).toBeVisible();
    const urlFicha = a.url();

    const b = await browser.newPage();
    await entrarCon(b, await crearCuenta(request, "Empresa B"));
    await b.goto("/clientes");
    await expect(b.getByText("Todavía no cargaste clientes")).toBeVisible();
    // Ni entrando directo con la URL de la ficha
    await b.goto(new URL(urlFicha).pathname);
    await expect(b.getByText("Cliente no encontrado")).toBeVisible();
  });
});
