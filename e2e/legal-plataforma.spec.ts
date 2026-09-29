import { expect, test } from "@playwright/test";
import { ADMIN_PANEL, crearCuenta, entrarAlPanel, entrarCon, loginUI } from "./helpers";

test.describe("Legal", () => {
  test("links legales en la primera pantalla; botón de arrepentimiento y de baja sin iniciar sesión", async ({ page }) => {
    await page.goto("/login");
    for (const link of ["Términos y Condiciones", "Privacidad", "Botón de arrepentimiento", "Botón de baja"]) {
      await expect(page.getByRole("navigation", { name: "Información legal" }).getByRole("link", { name: link })).toBeVisible();
    }
    await page.getByRole("link", { name: "Botón de arrepentimiento" }).click();
    await expect(page.getByRole("heading", { name: "Botón de arrepentimiento" })).toBeVisible();
    await page.getByRole("button", { name: "Revocar la contratación" }).click();
    await expect(page.getByText("Indicá tu nombre")).toBeVisible();
    await page.getByLabel("Nombre y apellido").fill("Carla Gómez");
    await page.getByLabel("Email").fill("carla@ejemplo.com");
    await page.getByLabel("Comentario (opcional)").fill("Me equivoqué de plan");
    await page.getByRole("button", { name: "Revocar la contratación" }).click();
    await expect(page.getByTestId("codigo-constancia")).toHaveText(/^ARRE-[A-Z0-9]{8}$/);

    await page.goto("/baja");
    await page.getByLabel("Nombre y apellido").fill("Carla Gómez");
    await page.getByLabel("Email").fill("carla@ejemplo.com");
    await page.getByRole("button", { name: "Pedir la baja" }).click();
    await expect(page.getByTestId("codigo-constancia")).toHaveText(/^BAJA-/);

    await page.goto("/terminos");
    await expect(page.getByRole("heading", { name: "7. Falta de pago" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "15. Limitación de responsabilidad" })).toBeVisible();
    // Mientras falten los datos del proveedor, se avisa
    await expect(page.getByTestId("aviso-borrador-legal")).toBeVisible();
  });

  test("términos nuevos: el administrador tiene que aceptarlos para seguir", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await request.post("/api/legal/pruebas/version-vieja", { headers: { authorization: `Bearer ${cuenta.token}` } });
    await entrarCon(page, cuenta);
    await page.goto("/");
    const d = page.getByTestId("aceptar-terminos");
    await expect(d).toContainText("Actualizamos los Términos y Condiciones");
    // No se puede cerrar sin aceptar
    await page.keyboard.press("Escape");
    await expect(d).toBeVisible();
    await expect(d.getByRole("button", { name: "Aceptar y continuar" })).toBeDisabled();
    await d.getByLabel(/Leí y acepto/).check();
    await d.getByRole("button", { name: "Aceptar y continuar" }).click();
    await expect(page.getByText("Quedó registrada la aceptación")).toBeVisible();
    await expect(d).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("aceptar-terminos")).toHaveCount(0);
  });

  test("dar de baja desde la app deja un código, y se puede anular", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    await page.goto("/configuracion?tab=plan");
    await page.getByRole("button", { name: "Dar de baja la suscripción" }).click();
    await page.getByLabel("Motivo de la baja").fill("Cerramos el local");
    await page.getByRole("button", { name: "Confirmar la baja" }).click();
    await expect(page.getByText(/Baja registrada. Código de constancia: BAJA-/)).toBeVisible();
    await expect(page.getByTestId("baja-solicitada")).toContainText("Podés seguir usando todo hasta el");
    await page.getByRole("button", { name: "Anular la baja" }).click();
    await expect(page.getByText("Baja anulada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dar de baja la suscripción" })).toBeVisible();
  });
});

test.describe("Panel de administración", () => {
  test("tiene su propio login: sin sesión o con la sesión de una empresa no se entra", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel("Email").fill(ADMIN_PANEL.email);
    await page.getByLabel("Contraseña").fill("no-es-la-clave");
    await page.getByRole("button", { name: "Entrar al panel" }).click();
    await expect(page.getByRole("alert")).toContainText("Email o contraseña incorrectos");

    // Con la sesión de una empresa tampoco: son cuentas separadas
    const cliente = await crearCuenta(request);
    await entrarCon(page, cliente);
    await page.goto("/admin/empresas");
    await expect(page).toHaveURL(/\/admin\/login$/);
    // Y el token de una empresa no sirve contra la API del panel
    const r = await request.get("/api/plataforma/resumen", { headers: { authorization: `Bearer ${cliente.token}` } });
    expect(r.status()).toBe(401);
    // Del lado de la empresa ya no existe el acceso viejo
    await page.goto("/");
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await expect(page.getByRole("menuitem", { name: /plataforma/i })).toHaveCount(0);
  });

  test("ver empresas, extender, registrar un pago, suspender y reactivar; resolver pedidos; auditoría", async ({ page, request }) => {
    const cliente = await crearCuenta(request, `Ferretería Controlada ${Date.now()}`);
    const pide = `Pedro Pide Baja ${Date.now()}`;
    await request.post("/api/legal/solicitud", { data: { tipo: "baja", nombre: pide, email: "pedro@x.com" } });

    await entrarAlPanel(page);
    await expect(page.getByTestId("admin-nombre")).toContainText(ADMIN_PANEL.email);
    await expect(page.getByTestId("kpi-empresas")).toContainText("Empresas");
    const nav = page.getByRole("navigation", { name: "Panel de administración" });
    await nav.getByRole("link", { name: "Empresas" }).click();

    await page.getByPlaceholder("Buscar por nombre, CUIT o email…").fill(cliente.razonSocial);
    await page.getByRole("cell", { name: new RegExp(cliente.razonSocial) }).click();
    await expect(page.getByRole("heading", { name: new RegExp(cliente.razonSocial) })).toContainText("Prueba gratis");
    await expect(page.getByTestId("kpi-usuarios-empresa")).toContainText("1 / 5");

    // Extender 16 días: la prueba pasa a 30
    await page.getByLabel("Extender (días)").fill("16");
    await page.getByRole("button", { name: "Extender" }).click();
    await expect(page.getByText("Se extendió 16 días")).toBeVisible();
    await expect(page.getByTestId("suscripcion-empresa")).toContainText("(30 días)");

    // Pago por transferencia
    await page.getByLabel("Importe recibido").fill("55.000");
    await page.getByLabel("Nota del pago").fill("Transferencia Banco Nación");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText("Pago registrado")).toBeVisible();
    await expect(page.getByTestId("pago-empresa").first()).toContainText("Manual");
    await expect(page.getByRole("heading", { name: new RegExp(cliente.razonSocial) })).toContainText("Activa");

    // Suspender: la empresa no puede entrar
    await page.getByLabel("Motivo de la suspensión").fill("Uso indebido de la facturación");
    await page.getByRole("button", { name: "Suspender" }).click();
    await expect(page.getByText("Empresa suspendida")).toBeVisible();
    await expect(page.getByTestId("auditoria-empresa")).toContainText("Suspendió la empresa");
    await expect(page.getByTestId("auditoria-empresa")).toContainText("Registró un pago");
    await expect(page.getByTestId("auditoria-empresa")).toContainText("Extendió el plazo");

    const otra = await page.context().browser()!.newPage();
    await loginUI(otra, cliente.email);
    await expect(otra.getByRole("alert")).toContainText("suspendida");
    await otra.close();

    await page.getByRole("button", { name: "Reactivar empresa" }).click();
    await expect(page.getByText("Empresa reactivada")).toBeVisible();

    // El pago aparece en la lista general
    await nav.getByRole("link", { name: "Pagos" }).click();
    await page.getByPlaceholder("Buscar por empresa o referencia…").fill(cliente.razonSocial);
    await expect(page.getByRole("row", { name: new RegExp(cliente.razonSocial) })).toContainText("$ 55.000,00");

    // Pedidos de baja y arrepentimiento
    await nav.getByRole("link", { name: "Baja y arrepentimiento" }).click();
    const pedido = page.getByTestId("solicitud-legal").filter({ hasText: pide });
    await expect(pedido).toContainText("Pendiente");
    await pedido.getByRole("textbox").fill("Baja procesada, se le avisó por email");
    await pedido.getByRole("button", { name: "Resolver" }).click();
    await expect(pedido).toContainText("Baja procesada");
    await expect(pedido).toContainText("Resuelta");

    // Todo quedó en la auditoría
    await nav.getByRole("link", { name: "Auditoría" }).click();
    await page.getByPlaceholder("Buscar por empresa, persona o acción…").fill(cliente.razonSocial);
    await expect(page.getByRole("row", { name: /Reactivó la empresa/ })).toBeVisible();

    // Salir: vuelve al login y la sesión ya no sirve
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/pagos");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("sumar otro administrador, que entre con su clave, y quitarle el acceso", async ({ page, browser }) => {
    const email = `socio.${Date.now()}@prexacode.test`;
    await entrarAlPanel(page);
    await page.getByRole("navigation", { name: "Panel de administración" }).getByRole("link", { name: "Administradores" }).click();
    await page.getByLabel("Nombre").fill("Socio");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña inicial").fill("clave-del-socio-1");
    await page.getByRole("button", { name: "Crear administrador" }).click();
    await expect(page.getByText("Administrador creado")).toBeVisible();
    // A uno mismo no se le puede quitar el acceso
    await expect(page.getByRole("switch", { name: `Acceso de ${ADMIN_PANEL.email}` })).toBeDisabled();

    const socio = await browser.newPage();
    await socio.goto("/admin/login");
    await socio.getByLabel("Email").fill(email);
    await socio.getByLabel("Contraseña").fill("clave-del-socio-1");
    await socio.getByRole("button", { name: "Entrar al panel" }).click();
    await expect(socio.getByTestId("resumen-admin")).toBeVisible();

    // Se le quita el acceso: su sesión deja de valer
    await page.getByRole("switch", { name: `Acceso de ${email}` }).click();
    await expect(page.getByText("Acceso quitado")).toBeVisible();
    await socio.reload();
    await expect(socio).toHaveURL(/\/admin\/login$/);
    await socio.getByLabel("Email").fill(email);
    await socio.getByLabel("Contraseña").fill("clave-del-socio-1");
    await socio.getByRole("button", { name: "Entrar al panel" }).click();
    await expect(socio.getByRole("alert")).toBeVisible();
    await socio.close();
  });
});
