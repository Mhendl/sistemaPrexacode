import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

async function consultorio(request: APIRequestContext) {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const post = async (url: string, data: object = {}) => {
    const r = await request.post(`/api${url}`, { headers: { authorization: `Bearer ${cuenta.token}` }, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  return { cuenta, post };
}

/** Dibuja una firma con el mouse en el recuadro */
async function firmar(page: Page, testid: string) {
  const caja = (await page.getByTestId(testid).boundingBox())!;
  await page.mouse.move(caja.x + 30, caja.y + 80);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(caja.x + 30 + i * 25, caja.y + 80 + (i % 2 ? -25 : 25));
  await page.mouse.up();
}

test("consentimiento firmado en pantalla, periodontograma con índices, y un trabajo de laboratorio de punta a punta", async ({ page, request }) => {
  const c = await consultorio(request);
  const pac = await c.post("/pacientes", { nombre: "María", apellido: "González", dni: "28456789" });
  await entrarCon(page, c.cuenta);

  // Consentimiento: se elige el modelo, el texto sale con sus datos, firma y queda guardado
  await page.goto(`/pacientes/${pac.id}?tab=consentimientos`);
  await page.getByRole("button", { name: "Firmar consentimiento" }).click();
  await page.getByLabel("Consentimiento", { exact: true }).click();
  await page.getByRole("option", { name: /extracción/ }).click();
  await expect(page.getByTestId("texto-consentimiento")).toContainText("Yo, María González, DNI 28.456.789");
  await expect(page.getByRole("button", { name: "Guardar firmado" })).toBeDisabled();
  await firmar(page, "firma-paciente");
  await page.getByRole("button", { name: "Guardar firmado" }).click();
  await expect(page.getByText("Consentimiento firmado y guardado")).toBeVisible();
  await page.getByTestId("consentimiento").first().click();
  await expect(page.getByTestId("consentimiento-firmado")).toContainText("DNI 28.456.789");
  await expect(page.getByTestId("consentimiento-firmado").getByRole("img", { name: "Firma" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Periodontograma: se cargan algunas piezas y se calculan los índices
  await page.getByRole("tab", { name: "Periodontograma" }).click();
  await page.getByRole("button", { name: "Nuevo examen" }).click();
  const ps = async (pieza: number, valores: number[]) => {
    for (const [i, v] of valores.entries()) await page.getByLabel(`Profundidad ${pieza} sitio ${i + 1}`, { exact: true }).fill(String(v));
  };
  await ps(16, [3, 4, 5, 3, 2, 6]);
  await ps(11, [2, 2, 2, 2, 2, 2]);
  await page.getByLabel("Sangrado 16 sitio 1", { exact: true }).click();
  await page.getByLabel("Sangrado 16 sitio 6", { exact: true }).click();
  await page.getByLabel("Pieza 48 ausente").check();
  await page.getByRole("button", { name: "Guardar examen" }).click();
  await expect(page.getByText("Examen periodontal guardado")).toBeVisible();
  await expect(page.getByTestId("indices-perio")).toContainText("2,9 mm");
  await expect(page.getByTestId("indices-perio")).toContainText("16,7 %");

  // Laboratorio: se carga, se encarga una corona para la paciente, se recibe y se paga una parte
  await page.goto("/laboratorios");
  await page.getByRole("button", { name: "Nuevo laboratorio" }).click();
  await page.getByLabel("Nombre").fill("Laboratorio Dental Sur");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Laboratorio Dental Sur" })).toBeVisible();
  await page.getByRole("button", { name: "Encargar trabajo" }).click();
  await page.getByLabel("Trabajo", { exact: true }).fill("Corona de porcelana");
  await page.getByPlaceholder("Buscar por nombre, DNI o teléfono…").fill("gonz");
  await page.getByRole("option", { name: /González, María/ }).click();
  await page.getByLabel("Pieza").fill("46");
  await page.getByLabel("Importe").fill("80.000");
  await page.getByRole("button", { name: "Encargar", exact: true }).click();
  await expect(page.getByTestId("trabajo")).toContainText("González, María");
  await page.getByTestId("trabajo").getByRole("button", { name: "Recibido" }).click();
  await expect(page.getByTestId("trabajo")).toContainText(/Recibido \d{2}\/\d{2}\/\d{4}/);
  await page.getByRole("button", { name: "Pagar" }).click();
  await page.getByLabel("Importe").fill("30.000");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByTestId("saldo-laboratorio")).toContainText("$ 50.000,00");

  // El pago quedó en Gastos
  await page.goto("/gastos");
  await expect(page.getByTestId("gasto")).toContainText("Pago a Laboratorio Dental Sur");
});
