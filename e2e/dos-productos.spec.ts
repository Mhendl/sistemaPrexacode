import { expect, test } from "@playwright/test";
import { cuitValido, elegir, emailUnico, formatear, PASSWORD } from "./helpers";

async function registrarse(page: import("@playwright/test").Page, url: string, razonSocial: string) {
  await page.goto(url);
  await page.getByLabel("Razón social").fill(razonSocial);
  await page.getByLabel("CUIT").fill(formatear(cuitValido("20")));
  await elegir(page, "Condición frente al IVA", "Monotributista");
  await page.getByLabel("Nombre y apellido").fill("Laura Pérez");
  await page.getByLabel("Email").fill(emailUnico("prod"));
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/Leí y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
}

test("CoreDental: desde su dirección se registra un consultorio con su marca, sus colores, su menú y sus términos", async ({ page }) => {
  await page.goto("/registro?producto=dental");
  await expect(page.locator("html")).toHaveAttribute("data-producto", "dental");
  await expect(page.getByText("Tu consultorio odontológico, ordenado y en un solo lugar.")).toBeVisible();

  await registrarse(page, "/registro", "Consultorio Sonrisas");
  const menu = page.getByRole("navigation").first();
  for (const m of ["Pacientes", "Turnos", "Prestaciones y precios", "Caja diaria", "Equipo y sueldos", "Facturación"]) await expect(menu.getByRole("link", { name: m })).toBeVisible();
  for (const m of ["Oportunidades", "Remitos", "Productos y stock"]) await expect(menu.getByRole("link", { name: m })).toHaveCount(0);
  await expect(page.getByTestId("empresa-actual")).toContainText("Plan Clínica");
  await expect(page.getByText("CoreDental").first()).toBeVisible();

  // Lo que todavía se está construyendo aparece como "Próximamente", con lo que va a incluir
  await menu.getByRole("link", { name: "Laboratorios" }).click();
  await expect(page.getByText("Próximamente")).toBeVisible();
  await expect(page.getByText(/Saldo con cada laboratorio/)).toBeVisible();
  // Pacientes ya está construido
  await menu.getByRole("link", { name: "Pacientes" }).click();
  await expect(page.getByText("Todavía no cargaste pacientes")).toBeVisible();

  // Planes con los nombres de CoreDental
  await page.goto("/configuracion?tab=plan");
  await expect(page.getByText("Consultorio").first()).toBeVisible();
  await expect(page.getByText("Centro odontológico").first()).toBeVisible();

  // Términos con las cláusulas de datos de salud
  await page.goto("/terminos");
  await expect(page.getByRole("heading", { name: "8 bis. Datos de salud e historia clínica" })).toBeVisible();
  await expect(page.getByText(/Ley 26\.529/).first()).toBeVisible();
});

test("Prexacode sigue igual: su marca, su menú y sus términos, sin nada de odontología", async ({ page }) => {
  await registrarse(page, "/registro", "Ferretería Prueba");
  await expect(page.locator("html")).toHaveAttribute("data-producto", "gestion");
  const menu = page.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: "Oportunidades" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Pacientes" })).toHaveCount(0);
  await expect(page.getByTestId("empresa-actual")).toContainText("Plan Profesional");
  await page.goto("/terminos");
  await expect(page.getByRole("heading", { name: /Datos de salud/ })).toHaveCount(0);
});
