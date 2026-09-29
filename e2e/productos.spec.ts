import { expect, test, type Page } from "@playwright/test";
import { cerrarSesion, crearCuenta, elegir, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

async function cargarProducto(page: Page, p: { codigo: string; descripcion: string; precio: string; stockInicial?: string; minimo?: string; servicio?: boolean }) {
  await page.getByRole("button", { name: /Nuevo producto|Cargar el primero/ }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Código").fill(p.codigo);
  await d.getByLabel("Descripción").fill(p.descripcion);
  await d.getByLabel("Precio sin IVA").fill(p.precio);
  if (p.servicio) await d.getByLabel("Controlar stock").click();
  if (p.stockInicial) await d.getByLabel("Stock inicial").fill(p.stockInicial);
  if (p.minimo) await d.getByLabel("Stock mínimo").fill(p.minimo);
  await d.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("heading", { name: p.descripcion })).toBeVisible();
}

async function movimiento(page: Page, tipo: "Ingreso" | "Egreso" | "Ajuste", cantidad: string, motivo?: string) {
  await page.getByRole("button", { name: "Movimiento de stock" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("radio", { name: tipo }).click();
  await d.getByLabel(tipo === "Ajuste" ? "Stock contado" : "Cantidad").fill(cantidad);
  if (motivo) await d.getByLabel("Motivo").fill(motivo);
  await d.getByRole("button", { name: "Registrar" }).click();
}

test.describe("Productos y stock", () => {
  test("alta con stock inicial, movimientos, alerta de stock bajo y control de faltante", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await expect(page.getByText("Todavía no hay productos")).toBeVisible();

    await cargarProducto(page, { codigo: "RESMA-A4", descripcion: "Resma A4 75 g", precio: "8.950,50", stockInicial: "12", minimo: "10" });
    await expect(page.getByTestId("precio")).toHaveText("$ 8.950,50");
    await expect(page.getByTestId("stock-actual")).toHaveText("12 u.");

    await movimiento(page, "Ingreso", "3", "Compra a Papelera del Sur");
    await expect(page.getByTestId("stock-actual")).toHaveText("15 u.");

    await movimiento(page, "Egreso", "6");
    await expect(page.getByTestId("stock-actual")).toHaveText("9 u.");
    await expect(page.getByText("Bajo", { exact: true })).toBeVisible(); // quedó por debajo del mínimo (10)

    // No deja sacar más de lo que hay y no cambia el stock
    await movimiento(page, "Egreso", "20");
    await expect(page.getByRole("dialog").getByText("Supera el stock disponible")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("stock-actual")).toHaveText("9 u.");

    // Ajuste por inventario con decimales en formato argentino
    await movimiento(page, "Ajuste", "8,5", "Conteo del viernes");
    await expect(page.getByTestId("stock-actual")).toHaveText("8,5 u.");

    // Historial: inicial + ingreso + egreso + ajuste
    await expect(page.getByTestId("movimiento")).toHaveCount(4);
    await expect(page.getByTestId("movimiento").first()).toContainText("Conteo del viernes");
    await expect(page.getByTestId("movimiento").first()).toContainText("-0,5");

    // En el listado aparece resaltado como bajo mínimo y persiste al recargar
    await page.getByRole("link", { name: "Productos y stock" }).click();
    await page.reload();
    const fila = page.getByRole("row", { name: /Resma A4/ });
    await expect(fila).toContainText("8,5 u.");
    await expect(fila).toContainText("Bajo");
  });

  test("un servicio no lleva stock", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await cargarProducto(page, { codigo: "SRV-HORA", descripcion: "Hora de soporte técnico", precio: "32000", servicio: true });
    await expect(page.getByTestId("stock-actual")).toHaveText("No controla stock");
    await expect(page.getByRole("button", { name: "Movimiento de stock" })).toHaveCount(0);
  });

  test("la pantalla de movimientos muestra todo el historial", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await cargarProducto(page, { codigo: "TONER", descripcion: "Tóner 85A", precio: "24900", stockInicial: "5" });
    await movimiento(page, "Egreso", "2", "Entrega a cliente");
    await expect(page.getByTestId("stock-actual")).toHaveText("3 u.");

    await page.getByRole("link", { name: "Movimientos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Movimientos de stock" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Entrega a cliente/ })).toContainText("-2 u.");
    await expect(page.getByRole("row", { name: /Stock inicial/ })).toContainText("+5 u.");
  });

  test("no se puede eliminar un producto con movimientos; sí uno sin movimientos", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await cargarProducto(page, { codigo: "CON-MOV", descripcion: "Con movimientos", precio: "100", stockInicial: "1" });
    await page.getByRole("button", { name: "Eliminar producto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Desactivalo en lugar de eliminarlo")).toBeVisible();

    await page.getByRole("link", { name: "Productos y stock" }).click();
    await cargarProducto(page, { codigo: "SIN-MOV", descripcion: "Sin movimientos", precio: "100" });
    await page.getByRole("button", { name: "Eliminar producto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page).toHaveURL(/\/productos$/);
    await expect(page.getByRole("row", { name: /Sin movimientos/ })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /Con movimientos/ })).toBeVisible();
  });

  test("Ventas ve precios y stock pero no puede modificarlos", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await cargarProducto(page, { codigo: "MON-24", descripcion: "Monitor 24 pulgadas", precio: "245900", stockInicial: "4" });

    const email = emailUnico("ventas");
    await page.goto("/configuracion?tab=usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre y apellido").fill("Diego Ventas");
    await d.getByLabel("Email").fill(email);
    await elegir(page, "Rol", "Ventas");
    await d.getByLabel("Contraseña inicial").fill(PASSWORD);
    await d.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByTestId(`usuario-${email}`)).toBeVisible();

    await cerrarSesion(page);
    await loginUI(page, email);
    await page.getByRole("link", { name: "Productos y stock" }).click();
    await expect(page.getByRole("row", { name: /Monitor 24 pulgadas/ })).toContainText("$ 245.900,00");
    await expect(page.getByRole("button", { name: "Nuevo producto" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Movimientos", exact: true })).toHaveCount(0);
    await page.getByRole("row", { name: /Monitor 24 pulgadas/ }).click();
    await expect(page.getByTestId("stock-actual")).toHaveText("4 u.");
    await expect(page.getByRole("button", { name: "Movimiento de stock" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  });
});
