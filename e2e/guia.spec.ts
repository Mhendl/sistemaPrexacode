import { expect, test, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

const cartel = (page: Page) => page.locator(".driver-popover");
const siguiente = (page: Page) => cartel(page).getByRole("button", { name: "Siguiente →" });

test.describe("Guía de cada pantalla", () => {
  test("Prexacode: el botón Guía recorre la pantalla resaltando cada parte, y se cierra con Esc", async ({ page, request }) => {
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Hola, Ana/ })).toBeVisible();
    // En las pruebas no arranca sola (taparía la pantalla)
    await expect(cartel(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await expect(cartel(page)).toContainText("👋 Bienvenido a Prexacode");
    await expect(cartel(page)).toContainText(/1 de \d+/);
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("📚 El menú");
    // Resalta la parte de la pantalla de la que habla
    await expect(page.locator('[data-guia="menu"].driver-active-element')).toBeVisible();
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("🔎 El buscador");
    await page.keyboard.press("Escape");
    await expect(cartel(page)).toHaveCount(0);

    // Cada pantalla tiene la suya
    await page.goto("/facturacion/nueva");
    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await expect(cartel(page)).toContainText("1️⃣ Los datos");
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("2️⃣ Qué le vendés");
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("👀 Así queda");
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("3️⃣ Emitir");
    await cartel(page).getByRole("button", { name: "Listo" }).click();
    await expect(cartel(page)).toHaveCount(0);

    // Al cambiar de pantalla, la guía abierta se cierra; donde no hay guía, no está el botón
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await expect(cartel(page)).toContainText("👥 Clientes");
    await page.goto("/reportes");
    await expect(cartel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guía de esta pantalla" })).toHaveCount(0);
  });

  test("la primera vez que se entra a una pantalla, la guía arranca sola (una sola vez)", async ({ page, request }) => {
    // Como un navegador común (no uno de pruebas automáticas)
    await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    await entrarCon(page, await crearCuenta(request));
    await page.goto("/productos");
    await expect(cartel(page)).toContainText("📦 Productos y stock", { timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Productos y stock" })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(cartel(page)).toHaveCount(0);
  });

  test("CoreDental: guías propias (turnos, ficha del paciente) y en el celular el menú se señala con su botón", async ({ page, request }) => {
    const email = emailUnico("guia");
    const res = await request.post("/api/auth/registro", {
      data: { empresa: { razonSocial: `Consultorio Guía ${Date.now()}`, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
    });
    const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
    await entrarCon(page, cuenta);

    await page.goto("/agenda");
    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await expect(cartel(page)).toContainText("📅 La agenda");
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("🧭 Moverse por la agenda");
    await page.keyboard.press("Escape");

    await page.goto("/");
    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await expect(cartel(page)).toContainText("👋 Bienvenido a CoreDental");
    await page.keyboard.press("Escape");

    // En el celular
    await page.setViewportSize({ width: 375, height: 760 });
    await page.reload();
    await page.getByRole("button", { name: "Guía de esta pantalla" }).click();
    await siguiente(page).click();
    await expect(cartel(page)).toContainText("📚 El menú");
    await expect(page.getByRole("button", { name: "Abrir menú" })).toHaveClass(/driver-active-element/);
    // El cartel entra en la pantalla
    const caja = await cartel(page).boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(375);
  });
});
