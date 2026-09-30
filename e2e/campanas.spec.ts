import { expect, test } from "@playwright/test";
import { cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

const haceUnAnio = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("campañas: control por email a los que no vienen, y por WhatsApp con un toque", async ({ page, request }) => {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const h = { authorization: `Bearer ${cuenta.token}` };
  const post = async (url: string, data: object) => {
    const r = await request.post(`/api${url}`, { headers: h, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const prest = (await (await request.get("/api/prestaciones", { headers: h })).json()) as { id: string; codigo: string }[];
  const consulta = prest.find((x) => x.codigo === "01.01")!.id;
  // Dos pacientes que vinieron hace un año: María tiene email y celular; Juan, solo celular
  const maria = await post("/pacientes", { nombre: "María", apellido: "González", email: "maria@ejemplo.com", telefono: "11 5555-1234" });
  const juan = await post("/pacientes", { nombre: "Juan", apellido: "Pérez", telefono: "11 4444-5555" });
  for (const p of [maria, juan]) await post(`/pacientes/${p.id}/cargos`, { prestacionId: consulta, importePaciente: 10000, fecha: haceUnAnio() });

  await entrarCon(page, cuenta);
  await page.goto("/");
  await page.getByRole("navigation").first().getByRole("link", { name: "Campañas" }).click();
  await page.getByRole("link", { name: "Nueva campaña" }).click();

  // Control a los que no vienen hace 6 meses, por email: le llega a María (Juan no tiene email)
  await expect(page.getByTestId("previa-campana")).toContainText("1 paciente");
  await expect(page.getByTestId("previa-campana")).toContainText("1 del grupo no tiene email cargado");
  await expect(page.getByTestId("ejemplo-mensaje")).toContainText("Hola María,");
  await page.getByRole("button", { name: "Mandar a 1 paciente" }).click();
  await page.getByRole("button", { name: "Sí, mandar" }).click();
  await expect(page.getByRole("heading", { name: "Control" })).toBeVisible();
  await expect(page.getByTestId("resumen-campana")).toContainText("1 de 1 enviados");
  await expect(page.getByTestId("envio-campana")).toContainText("González, María");

  // La misma campaña por WhatsApp: le llega a los dos, y se manda con un toque cada uno
  await page.context().route("https://wa.me/**", (r) => r.fulfill({ body: "WhatsApp" }));
  await page.goto("/campanas/nueva");
  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await expect(page.getByTestId("previa-campana")).toContainText("2 pacientes");
  await page.getByLabel("Nombre de la campaña (para vos)").fill("Control por WhatsApp");
  await page.getByRole("button", { name: "Mandar a 2 pacientes" }).click();
  await page.getByRole("button", { name: "Sí, mandar" }).click();
  await expect(page.getByRole("heading", { name: "Control por WhatsApp" })).toBeVisible();
  await expect(page.getByTestId("envio-campana")).toHaveCount(2);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "WhatsApp a González, María" }).click();
  const chat = await popup;
  await expect(chat).toHaveURL(/wa\.me\/5491155551234\?text=Hola%20Mar%C3%ADa!/);
  await chat.close();
  await expect(page.getByTestId("envio-campana").filter({ hasText: "González, María" })).toContainText("Mandado");
  await expect(page.getByTestId("resumen-campana")).toContainText("1 de 2 mandados");

  // En la lista quedan las dos
  await page.getByRole("link", { name: "Campañas" }).first().click();
  await expect(page.getByTestId("campana")).toHaveCount(2);

  // En el celular la pantalla entra en el ancho
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/campanas/nueva");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Un link de baja inválido avisa
  await page.goto("/baja-campanas/token-que-no-existe-123456");
  await expect(page.getByText("El link no es válido")).toBeVisible();
});
