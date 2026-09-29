import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { cerrarSesion, crearCuenta, cuitValido, elegir, emailUnico, entrarCon, loginUI, PASSWORD, type Cuenta } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function preparar(request: APIRequestContext, cuenta: Cuenta) {
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cliente = await (
    await request.post("/api/clientes", {
      headers: h,
      data: { razonSocial: "Constructora Del Plata S.A.", cuit: cuitValido("30"), condicionIva: "Responsable Inscripto", domicilio: "Calle 7 N° 1234", localidad: "La Plata" },
    })
  ).json();
  const producto = async (data: Record<string, unknown>) => (await (await request.post("/api/productos", { headers: h, data: { precio: 1000, alicuotaIva: 21, stockMinimo: 0, ...data } })).json()).id as string;
  const notebook = await producto({ codigo: "NB-15", descripcion: "Notebook 15,6 Core i5", controlaStock: true, stockInicial: 5 });
  const instalacion = await producto({ codigo: "SRV-INST", descripcion: "Instalación de red", controlaStock: false });
  return { cliente, notebook, instalacion };
}

async function agregarProducto(page: Page, nombre: RegExp) {
  await page.getByRole("combobox", { name: "Agregar producto" }).click();
  await page.getByRole("option", { name: nombre }).click();
}

async function armarRemito(page: Page, cantidadNotebook: string) {
  await page.goto("/remitos/nuevo");
  await elegir(page, "Cliente", "Constructora Del Plata S.A.");
  await expect(page.getByLabel("Domicilio de entrega")).toHaveValue("Calle 7 N° 1234, La Plata");
  await agregarProducto(page, /Notebook 15,6/);
  await agregarProducto(page, /Instalación de red/);
  await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill(cantidadNotebook);
  await page.getByLabel("Observaciones").fill("Entregar por la tarde");
}

test.describe("Remitos", () => {
  test("emitir descuenta stock, se ve para imprimir, y anular lo devuelve", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { notebook } = await preparar(request, cuenta);
    await entrarCon(page, cuenta);

    await page.goto("/remitos");
    await expect(page.getByText("Todavía no hay remitos")).toBeVisible();

    await armarRemito(page, "3");
    await expect(page.getByTestId("renglon-remito")).toHaveCount(2);
    await page.getByRole("button", { name: "Emitir remito" }).click();

    await expect(page.getByRole("heading", { name: /Remito 0001-00000001/ })).toBeVisible();
    await expect(page.getByTestId("remito-numero")).toHaveText("0001-00000001");
    await expect(page.getByText("Documento no válido como factura")).toBeVisible();
    await expect(page.getByText("Calle 7 N° 1234, La Plata")).toBeVisible();
    await expect(page.getByText("Entregar por la tarde")).toBeVisible();
    await expect(page.getByRole("row", { name: /Notebook 15,6 Core i5/ })).toContainText("3");
    await expect(page.getByRole("row", { name: /Instalación de red/ })).toContainText("1");
    const urlRemito = page.url();

    // Al imprimir solo sale la hoja (el menú queda oculto)
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("link", { name: "Inicio", exact: true })).toBeHidden();
    await expect(page.getByTestId("remito-numero")).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    // El stock bajó y el movimiento dice de qué remito vino
    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("2 u.");
    await expect(page.getByTestId("movimiento").first()).toContainText("Remito 0001-00000001 · Constructora Del Plata S.A.");

    // Anular
    await page.goto(urlRemito);
    await page.getByRole("button", { name: "Anular" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Anular remito" }).click();
    await expect(page.getByRole("dialog").getByText(/Indicá el motivo/)).toBeVisible();
    await page.getByLabel("Motivo").fill("El cliente rechazó la entrega");
    await page.getByRole("dialog").getByRole("button", { name: "Anular remito" }).click();
    await expect(page.getByText("ANULADO", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anular" })).toHaveCount(0);

    await page.goto(`/productos/${notebook}`);
    await expect(page.getByTestId("stock-actual")).toHaveText("5 u.");

    // En el listado y en la ficha del cliente
    await page.goto("/remitos");
    await expect(page.getByRole("row", { name: /0001-00000001/ })).toContainText("Anulado");
  });

  test("sin stock suficiente no se emite y marca el renglón", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    await armarRemito(page, "9");
    await page.getByRole("button", { name: "Emitir remito" }).click();
    await expect(page.getByTestId("renglon-remito").first()).toContainText("Stock insuficiente: hay 5 u.");
    await expect(page).toHaveURL(/\/remitos\/nuevo$/);

    // Corrigiendo la cantidad sale bien
    await page.getByLabel("Cantidad de Notebook 15,6 Core i5").fill("5");
    await page.getByRole("button", { name: "Emitir remito" }).click();
    await expect(page.getByTestId("remito-numero")).toHaveText("0001-00000001");
  });

  test("el remito lleva el logo de la empresa y se puede emitir desde la ficha del cliente", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const { cliente } = await preparar(request, cuenta);
    await request.put("/api/empresa/logo", { headers: { authorization: `Bearer ${cuenta.token}` }, data: { datos: PNG.toString("base64") } });
    await entrarCon(page, cuenta);

    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByText("Todavía no tiene remitos")).toBeVisible();
    await page.getByRole("link", { name: "Nuevo remito" }).click();
    await expect(page.getByLabel("Domicilio de entrega")).toHaveValue("Calle 7 N° 1234, La Plata");
    await agregarProducto(page, /Instalación de red/);
    await page.getByRole("button", { name: "Emitir remito" }).click();

    const logo = page.locator(".hoja img");
    await expect(logo).toHaveCount(1);
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByRole("link", { name: /0001-00000001/ })).toBeVisible();
  });

  test("Operaciones emite y anula; Ventas emite pero no anula", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await preparar(request, cuenta);
    await entrarCon(page, cuenta);
    const crear = async (nombre: string, rol: string) => {
      const email = emailUnico(rol.toLowerCase());
      await page.goto("/configuracion?tab=usuarios");
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre y apellido").fill(nombre);
      await d.getByLabel("Email").fill(email);
      await elegir(page, "Rol", rol);
      await d.getByLabel("Contraseña inicial").fill(PASSWORD);
      await d.getByRole("button", { name: "Crear usuario" }).click();
      await expect(page.getByTestId(`usuario-${email}`)).toBeVisible();
      return email;
    };
    const ops = await crear("Valeria Depósito", "Operaciones");
    const ventas = await crear("Diego Ventas", "Ventas");

    await cerrarSesion(page);
    await loginUI(page, ops);
    await page.getByRole("link", { name: "Remitos", exact: true }).click();
    await armarRemito(page, "1");
    await page.getByRole("button", { name: "Emitir remito" }).click();
    await expect(page.getByTestId("remito-numero")).toHaveText("0001-00000001");
    await expect(page.getByRole("button", { name: "Anular" })).toBeVisible();
    // Operaciones no ve la ficha del cliente: el nombre no es un enlace
    await expect(page.getByRole("link", { name: "Constructora Del Plata S.A." })).toHaveCount(0);

    await cerrarSesion(page);
    await loginUI(page, ventas);
    await page.getByRole("link", { name: "Remitos", exact: true }).click();
    await page.getByRole("row", { name: /0001-00000001/ }).click();
    await expect(page.getByTestId("remito-numero")).toHaveText("0001-00000001");
    await expect(page.getByRole("button", { name: "Anular" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Imprimir/ })).toBeVisible();
  });
});
