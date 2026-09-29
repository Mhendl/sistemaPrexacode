import { expect, test } from "@playwright/test";
import { crearCuenta, elegir, emailUnico, entrarCon, loginUI, PASSWORD } from "./helpers";

test("el administrador crea un rol a medida con casillas y el usuario ve solo eso", async ({ page, browser, request }) => {
  await entrarCon(page, await crearCuenta(request));

  // Roles y permisos: el de Administrador no se toca
  await page.goto("/configuracion?tab=roles");
  await expect(page.getByTestId("rol-Administrador")).toContainText("No se puede modificar ni borrar");
  await expect(page.getByRole("button", { name: "Editar Administrador" })).toHaveCount(0);

  // Nuevo rol: Cajero, solo cobra
  await page.getByRole("button", { name: "Nuevo rol" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre", { exact: true }).fill("Cajero");
  await d.getByLabel("Descripción (opcional)").fill("Cobra en el mostrador");
  await d.getByRole("checkbox", { name: "Registrar cobros" }).click();
  await d.getByRole("button", { name: "Crear rol" }).click();
  await expect(page.getByText("Rol creado")).toBeVisible();
  // "Ver deudas y cobros" se agregó solo
  await expect(page.getByTestId("rol-Cajero")).toContainText("Ver deudas y cobros");
  await expect(page.getByTestId("rol-Cajero")).toContainText("Registrar cobros");

  // Un usuario con ese rol
  const email = emailUnico("cajero");
  await page.goto("/configuracion?tab=usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nu = page.getByRole("dialog");
  await nu.getByLabel("Nombre y apellido").fill("Carla Caja");
  await nu.getByLabel("Email").fill(email);
  await elegir(page, "Rol", "Cajero");
  await nu.getByLabel("Contraseña inicial").fill(PASSWORD);
  await nu.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByTestId(`usuario-${email}`)).toContainText("Cajero");

  // Entra la cajera (en otra ventana)
  const caja = await browser.newPage();
  await loginUI(caja, email);
  await expect(caja.getByRole("heading", { name: "Hola, Carla" })).toBeVisible();
  const menu = caja.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: "Cobranzas" })).toBeVisible();
  for (const oculto of ["Clientes", "Facturación", "Productos y stock", "Reportes", "Configuración"]) {
    await expect(menu.getByRole("link", { name: oculto, exact: true })).toHaveCount(0);
  }
  await expect(caja.getByRole("link", { name: "Nueva factura" })).toHaveCount(0);
  await caja.goto("/facturacion");
  await expect(caja.getByText("Sin acceso a este módulo")).toBeVisible();
  await expect(caja.getByText("Tu rol (Cajero)")).toBeVisible();
  await caja.goto("/cobranzas");
  await expect(caja.getByRole("link", { name: "Registrar cobro" }).or(caja.getByRole("button", { name: "Registrar cobro" })).first()).toBeVisible();

  // El administrador le suma Reportes: lo ve al recargar, sin volver a entrar
  await page.goto("/configuracion?tab=roles");
  await page.getByRole("button", { name: "Editar Cajero" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Ver reportes y Libro IVA" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Rol actualizado")).toBeVisible();
  await caja.reload();
  await expect(caja.getByRole("navigation").first().getByRole("link", { name: "Reportes" })).toBeVisible();

  // No se puede borrar mientras alguien lo use
  await page.getByRole("button", { name: "Borrar Cajero" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Borrar" }).click();
  await expect(page.getByText("Hay 1 usuario con este rol")).toBeVisible();
  await caja.close();
});

test("siempre queda un administrador: el único no puede quitarse el rol", async ({ page, request }) => {
  const cuenta = await crearCuenta(request);
  await entrarCon(page, cuenta);
  await page.goto("/configuracion?tab=usuarios");
  // Sobre uno mismo no hay menú de acciones
  await expect(page.getByRole("button", { name: /Acciones de Ana/ })).toHaveCount(0);
  const r = await request.patch("/api/usuarios/00000000-0000-0000-0000-000000000000", { headers: { authorization: `Bearer ${cuenta.token}` }, data: { rol: "ventas" } });
  expect(r.status()).toBe(404);
});
