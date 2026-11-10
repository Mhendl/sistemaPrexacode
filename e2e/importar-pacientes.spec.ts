import { expect, test } from "@playwright/test";
import { cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

test("CoreDental: un consultorio sube su planilla de pacientes (como venga) y los ve cargados, con obra social y fecha de nacimiento", async ({ page, request }) => {
  const email = emailUnico("importa");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: `Consultorio Importa ${Date.now()}`, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  await entrarCon(page, cuenta);

  // Está en el menú y muestra solo pacientes (no clientes ni productos)
  await page.goto("/");
  await page.getByRole("link", { name: "Importar y exportar" }).first().click();
  await expect(page.getByTestId("tarjeta-pacientes")).toContainText("0 cargados");
  await expect(page.getByTestId("tarjeta-clientes")).toHaveCount(0);

  // Una planilla como la que exporta cualquier programa viejo: nombre junto, fecha con barras, columnas con otros nombres
  const csv = ["Paciente;Documento;Fecha Nac;Celular;Cobertura;Nro Afiliado", "Pérez, Juan Carlos;30.123.456;15/03/1985;11 5555-1234;OSDE;61-123", "Gómez, María;;7/8/92;;Particular;", "López, Ana;12;;;;"].join("\n");
  await page.getByTestId("tarjeta-pacientes").getByRole("button", { name: /^Importar/ }).click();
  const d = page.getByRole("dialog");
  await expect(d).toContainText("Alcanza con apellido y nombre");
  await page.getByLabel("Archivo a importar").setInputFiles({ name: "pacientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  const vista = d.getByTestId("vista-previa");
  await expect(vista.getByText("Nuevos").locator("..")).toContainText("2");
  await expect(vista.getByText("Con errores").locator("..")).toContainText("1");
  await expect(d.getByTestId("error-fila")).toHaveText(/Fila 4\s*DNI: El DNI tiene que tener 7 u 8 números/);
  await d.getByRole("button", { name: "Importar 2 registros" }).click();
  await expect(d.getByRole("status")).toContainText("2 nuevos");
  await d.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByTestId("tarjeta-pacientes")).toContainText("2 cargados");

  // Quedaron en Pacientes, con sus datos
  await page.goto("/pacientes");
  await expect(page.getByText("Pérez, Juan Carlos")).toBeVisible();
  await page.getByText("Pérez, Juan Carlos").click();
  await expect(page.getByRole("main")).toContainText("OSDE");
  await expect(page.getByRole("main")).toContainText("30.123.456");
  await page.goto("/pacientes");
  await page.getByText("Gómez, María").click();
  await expect(page.getByRole("main")).toContainText(/3\d años/); // nació el 7/8/92
});
