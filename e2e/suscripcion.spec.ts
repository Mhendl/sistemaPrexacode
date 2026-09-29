import { expect, test } from "@playwright/test";
import { crearCuenta, emailUnico, entrarCon, PASSWORD } from "./helpers";

test.describe("Suscripción", () => {
  test("prueba gratis, cambio de plan, límite de usuarios, adicionales y pago", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await entrarCon(page, cuenta);
    await page.goto("/");
    await expect(page.getByTestId("aviso-suscripcion")).toContainText("Te quedan 14 días de prueba gratis");
    await page.getByTestId("aviso-suscripcion").getByRole("link", { name: "Elegí tu plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);
    await expect(page.getByTestId("estado-suscripcion")).toContainText("14 días de prueba gratis");
    await expect(page.getByTestId("uso-usuarios")).toContainText("1 de 5");
    await expect(page.getByTestId("precio-mensual")).toHaveText("USD 75 / mes");

    // Bajar a Básico
    await page.getByTestId("plan-basico").getByRole("button", { name: "Cambiar a Básico" }).click();
    await expect(page.getByText("Plan actualizado")).toBeVisible();
    await expect(page.getByTestId("plan-basico").getByRole("button", { name: "Tu plan" })).toBeVisible();
    await expect(page.getByTestId("uso-usuarios")).toContainText("1 de 2");
    await expect(page.getByTestId("uso-puntos-venta")).toContainText("de 1");

    // Usuarios: el segundo entra, el tercero no
    const crear = async (nombre: string) => {
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre y apellido").fill(nombre);
      await d.getByLabel("Email").fill(emailUnico("u"));
      await d.getByLabel("Contraseña inicial").fill(PASSWORD);
      await d.getByRole("button", { name: "Crear usuario" }).click();
    };
    await page.goto("/configuracion?tab=usuarios");
    await crear("Diego Vendedor");
    await expect(page.getByText("Usuario creado")).toBeVisible();
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    await expect(page.getByTestId("aviso-limite-usuarios")).toContainText("Ya usás los 2 usuarios de tu plan");
    await page.keyboard.press("Escape");
    await crear("Valeria Tercera");
    await expect(page.getByText("permite 2 usuarios activos")).toBeVisible();
    await page.keyboard.press("Escape");

    // Sumar un adicional y ahí sí
    await page.goto("/configuracion?tab=plan");
    await page.getByRole("button", { name: "Sumar un usuario adicional" }).click();
    await expect(page.getByTestId("cantidad-adicionales")).toHaveText("1");
    await page.getByRole("button", { name: /Guardar \(\+USD 12\/mes\)/ }).click();
    await expect(page.getByTestId("uso-usuarios")).toContainText("2 de 3");
    await expect(page.getByTestId("precio-mensual")).toHaveText("USD 47 / mes");
    await page.goto("/configuracion?tab=usuarios");
    await crear("Valeria Tercera");
    await expect(page.getByText("Usuario creado")).toBeVisible();

    // Pagar un mes (pago de prueba): en pesos al dólar del día
    await page.goto("/configuracion?tab=plan");
    await page.getByRole("button", { name: "Pagar 1 mes" }).click();
    await expect(page).toHaveURL(/\/suscripcion\/pago\/PXC-/);
    await expect(page.getByTestId("pago-simulado")).toContainText("Plan Básico + 1 usuario · 1 mes");
    await expect(page.getByTestId("importe-pago")).toHaveText("$ 47.000,00");
    await page.getByRole("button", { name: "Aprobar pago de prueba" }).click();
    await expect(page.getByText("Pago de prueba aprobado")).toBeVisible();
    await expect(page).toHaveURL(/tab=plan/);
    await expect(page.getByTestId("estado-suscripcion")).toContainText("Pago hasta el");
    await expect(page.getByTestId("pagos-suscripcion")).toContainText("Aprobado");
    await expect(page.getByTestId("pagos-suscripcion")).toContainText("$ 47.000,00");
    // Con más de una semana por delante, ya no hay aviso
    await expect(page.getByTestId("aviso-suscripcion")).toHaveCount(0);
  });

  test("con el mes pago: sumar un usuario cobra lo proporcional y bajar de plan queda para la renovación", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const dia = (n: number) => new Date(Date.now() - 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
    await request.put("/api/suscripcion", { headers: h, data: { plan: "basico", usuariosAdicionales: 0 } });
    await request.post("/api/usuarios", { headers: h, data: { nombre: "Diego Vendedor", email: emailUnico("u"), rol: "ventas", password: PASSWORD } });
    // Pagó y le quedan 20 días (hoy incluido)
    await request.post("/api/suscripcion/pruebas/fechas", { headers: h, data: { pruebaHasta: dia(-40), pagoHasta: dia(19) } });
    await entrarCon(page, cuenta);

    await page.goto("/configuracion?tab=usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const aviso = page.getByTestId("aviso-limite-usuarios");
    await expect(aviso).toContainText("Ya usás los 2 usuarios de tu plan");
    await aviso.getByRole("button", { name: /Sumar 1 usuario/ }).click();
    // USD 12 × 20/30 = USD 8 → $ 8.000 al dólar de prueba
    await expect(page).toHaveURL(/\/suscripcion\/pago\/PXC-/);
    await expect(page.getByTestId("pago-simulado")).toContainText("Diferencia proporcional");
    await expect(page.getByTestId("importe-pago")).toHaveText("$ 8.000,00");
    await page.getByRole("button", { name: "Aprobar pago de prueba" }).click();
    await expect(page.getByText("El cambio ya está aplicado")).toBeVisible();
    await expect(page.getByTestId("uso-usuarios")).toContainText("2 de 3");
    await expect(page.getByTestId("estado-suscripcion")).toContainText(`Pago hasta el ${dia(19).split("-").reverse().join("/")}`); // el vencimiento no se mueve
    await expect(page.getByTestId("pagos-suscripcion")).toContainText("cambio (proporcional)");

    // Ahora sí entra el tercero
    await page.goto("/configuracion?tab=usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByTestId("aviso-limite-usuarios")).toHaveCount(0);
    await d.getByLabel("Nombre y apellido").fill("Valeria Tercera");
    await d.getByLabel("Email").fill(emailUnico("u"));
    await d.getByLabel("Contraseña inicial").fill(PASSWORD);
    await d.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText("Usuario creado")).toBeVisible();

    // Bajar el adicional con el mes pago: no se pierde lo pagado, queda para la renovación... pero hay 3 activos y no entran en 2
    await page.goto("/configuracion?tab=plan");
    await page.getByRole("button", { name: "Quitar un usuario adicional" }).click();
    await page.getByRole("button", { name: /Guardar \(-?USD/ }).click();
    await expect(page.getByText("Tenés 3 usuarios activos")).toBeVisible();

    // Subir a Profesional también es proporcional; lo rechaza el medio de pago y no cambia nada
    await page.getByTestId("plan-profesional").getByRole("button", { name: "Cambiar a Profesional" }).click();
    await expect(page).toHaveURL(/\/suscripcion\/pago\/PXC-/);
    await page.getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByTestId("plan-basico").getByRole("button", { name: "Tu plan" })).toBeVisible();

    // Pasar a Empresa (sube): se paga y queda; bajar a Profesional queda programado
    await page.getByTestId("plan-empresa").getByRole("button", { name: "Cambiar a Empresa" }).click();
    await page.getByRole("button", { name: "Aprobar pago de prueba" }).click();
    await expect(page.getByTestId("plan-empresa").getByRole("button", { name: "Tu plan" })).toBeVisible();
    await page.getByTestId("plan-profesional").getByRole("button", { name: "Cambiar a Profesional" }).click();
    await expect(page.getByText("Cambio programado")).toBeVisible();
    await expect(page.getByTestId("cambio-programado")).toContainText("Desde la próxima renovación pasás a Profesional");
    await expect(page.getByTestId("plan-empresa").getByRole("button", { name: "Tu plan" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar el cambio" }).click();
    await expect(page.getByTestId("cambio-programado")).toHaveCount(0);
  });

  test("vencida: solo lectura (se ve todo, no se carga nada) hasta que se paga", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    await request.post("/api/clientes", { headers: h, data: { razonSocial: "Cliente Anterior", cuit: "30500010912", condicionIva: "Responsable Inscripto" } });
    await request.post("/api/suscripcion/pruebas/fechas", { headers: h, data: { pruebaHasta: "2020-01-01" } });
    await entrarCon(page, cuenta);

    await page.goto("/clientes");
    await expect(page.getByTestId("aviso-suscripcion")).toContainText("podés ver y exportar tus datos, pero no cargar ni modificar");
    await expect(page.getByRole("cell", { name: /Cliente Anterior/ })).toBeVisible();
    await page.getByRole("button", { name: /Nuevo cliente/ }).first().click();
    await page.getByLabel("Razón social").fill("Cliente Nuevo");
    await page.getByLabel("CUIT").fill("20-12345678-6");
    await page.getByRole("button", { name: /Guardar|Crear cliente/ }).click();
    await expect(page.getByText("La suscripción está vencida").first()).toBeVisible();

    // Renovar
    await page.goto("/configuracion?tab=plan");
    await expect(page.getByTestId("estado-suscripcion")).toContainText("Podés ver y exportar todos tus datos");
    await page.getByRole("button", { name: "Pagar 1 mes" }).click();
    await page.getByRole("button", { name: "Aprobar pago de prueba" }).click();
    await expect(page.getByText("Pago de prueba aprobado")).toBeVisible();
    await expect(page.getByTestId("aviso-suscripcion")).toHaveCount(0);

    const r = await request.post("/api/clientes", { headers: h, data: { razonSocial: "Cliente Nuevo", cuit: "20123456786", condicionIva: "Consumidor Final" } });
    expect(r.status()).toBe(201);
  });

  test("un vendedor ve el aviso pero no puede pagar: se lo pide al administrador", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const email = emailUnico("vend");
    await request.post("/api/usuarios", { headers: h, data: { nombre: "Diego Vendedor", email, rol: "ventas", password: PASSWORD } });
    const login = await (await request.post("/api/auth/login", { data: { email, password: PASSWORD } })).json();
    await entrarCon(page, { ...cuenta, email, token: login.token });
    await page.goto("/");
    await expect(page.getByTestId("aviso-suscripcion")).toContainText("Avisale a un administrador");
    await expect(page.getByTestId("aviso-suscripcion").getByRole("link")).toHaveCount(0);
  });
});
