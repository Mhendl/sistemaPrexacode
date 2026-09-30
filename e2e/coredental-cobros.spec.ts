import { expect, test, type APIRequestContext } from "@playwright/test";
import { cuitValido, elegir, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

async function consultorio(request: APIRequestContext) {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: `Consultorio Cobros ${Date.now()}`, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const h = { authorization: `Bearer ${cuenta.token}` };
  const get = async (url: string) => (await request.get(`/api${url}`, { headers: h })).json();
  const post = async (url: string, data: object) => {
    const r = await request.post(`/api${url}`, { headers: h, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const put = (url: string, data: object) => request.put(`/api${url}`, { headers: h, data });
  return { cuenta, get, post, put };
}

test("un día de consultorio: precios, presupuesto, tratamiento, cobro con recibo, caja con arqueo, gastos y liquidación", async ({ page, request }) => {
  const c = await consultorio(request);
  const prest = (await c.get("/prestaciones")) as { id: string; codigo: string }[];
  const idP = (codigo: string) => prest.find((p) => p.codigo === codigo)!.id;
  const osde = ((await c.get("/pacientes/obras-sociales")) as { id: string; nombre: string }[]).find((o) => o.nombre === "OSDE")!.id;
  await c.put("/prestaciones/precios", { lista: "particular", precios: [{ prestacionId: idP("01.01"), precioPaciente: 20000 }] });
  const pac = await c.post("/pacientes", { nombre: "María", apellido: "González", dni: "28456789", obraSocialId: osde, numeroAfiliado: "61-123" });
  await c.post(`/pacientes/${pac.id}/odontograma`, { prestacionId: idP("02.08"), piezas: [16], caras: ["O"], estado: "a_realizar" });

  await entrarCon(page, c.cuenta);

  // Precios de OSDE: coseguro y lo que paga la obra social
  await page.goto("/prestaciones");
  await elegir(page, "Lista", "OSDE");
  await page.getByLabel("Paga el paciente de Obturación con resina").fill("10.000");
  await page.getByLabel("Paga la obra social de Obturación con resina").fill("30.000");
  await page.getByRole("button", { name: /^Guardar/ }).click();
  await expect(page.getByText("1 precio guardado")).toBeVisible();

  // Presupuesto con lo pendiente del odontograma + una consulta (sin precio en OSDE: toma el particular)
  await page.goto(`/pacientes/${pac.id}?tab=presupuestos`);
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  await page.getByRole("button", { name: "Traer lo pendiente" }).click();
  await expect(page.getByLabel("Precio del renglón 1")).toHaveValue("10.000");
  await page.getByRole("button", { name: "Agregar prestación" }).click();
  await elegir(page, "Prestación del renglón 2", "01.01 · Consulta y examen");
  await expect(page.getByLabel("Precio del renglón 2")).toHaveValue("20.000");
  await expect(page.getByTestId("total-presupuesto-form")).toHaveText("$ 30.000,00");
  await page.getByRole("button", { name: "Guardar presupuesto" }).click();
  await expect(page.getByRole("heading", { name: /Presupuesto N° 00000001/ })).toBeVisible();
  await expect(page.getByTestId("presupuesto-dental-total")).toHaveText("$ 30.000,00");

  // El paciente acepta; se va haciendo el tratamiento
  await page.getByRole("button", { name: "Aceptado" }).click();
  await expect(page.getByTestId("item-tratamiento")).toHaveCount(2);
  for (const nombre of ["Obturación con resina", "Consulta y examen"]) {
    await page.getByTestId("item-tratamiento").filter({ hasText: nombre }).getByRole("button", { name: "Realizado" }).click();
    await expect(page.getByTestId("item-tratamiento").filter({ hasText: nombre })).toContainText("Realizado");
  }
  await expect(page.getByText("2 de 2 prestaciones realizadas")).toBeVisible();

  // El odontograma quedó en azul
  await page.goto(`/pacientes/${pac.id}?tab=odontograma`);
  await expect(page.getByTestId("pieza-16").locator('polygon[data-cara="O"]')).toHaveAttribute("data-color", "#2563eb");

  // Cuenta: debe 30.000; paga 20.000 en efectivo y queda el recibo
  await page.getByRole("tab", { name: "Cuenta" }).click();
  await expect(page.getByTestId("saldo-paciente")).toHaveText("$ 30.000,00");
  await expect(page.getByTestId("cargo")).toHaveCount(2);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Importe").fill("20.000");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByText(/Pago registrado · recibo N° 00000001/)).toBeVisible();
  await expect(page.getByTestId("saldo-paciente")).toHaveText("$ 10.000,00");
  await page.getByRole("link", { name: "00000001" }).click();
  await expect(page.getByTestId("recibo-paciente-total")).toHaveText("$ 20.000,00");

  // Cobros y deudas: figura debiendo 10.000
  await page.goto("/cobranzas");
  await expect(page.getByTestId("deudor")).toContainText("González, María");
  await expect(page.getByTestId("deudor")).toContainText("$ 10.000,00");

  // Caja: se abre con 1.000; un gasto de 1.500 en efectivo; se cierra contando justo
  await page.goto("/caja");
  await page.getByLabel("Efectivo inicial").fill("1.000");
  await page.getByRole("button", { name: "Abrir caja" }).click();
  await expect(page.getByTestId("estado-caja")).toContainText("Caja abierta");
  await page.getByRole("button", { name: "Gasto" }).click();
  await elegir(page, "Categoría", "Proveedores e insumos");
  await page.getByLabel("Descripción").fill("Guantes y barbijos");
  await page.getByLabel("Importe").fill("1.500");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  // En efectivo: entró 20.000 y salió 1.500 (neto 18.500); con los 1.000 de apertura tiene que haber 19.500
  await expect(page.getByTestId("medio-caja").filter({ hasText: "Efectivo" })).toContainText("$ 18.500,00");
  await expect(page.getByText("$ 19.500,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await page.getByLabel("Efectivo contado").fill("19.500");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.getByTestId("diferencia-caja")).toHaveText(/Cerró justo/);

  // Gastos y resultado del mes
  await page.goto("/gastos");
  await expect(page.getByTestId("total-gastos")).toHaveText("$ 1.500,00");
  await expect(page.getByTestId("resumen-mes")).toContainText("$ 20.000");
  await expect(page.getByTestId("resumen-mes")).toContainText("$ 18.500");

  // Liquidación a OSDE: la obturación, con el afiliado y lo que paga la obra social
  await page.goto("/liquidacion");
  await elegir(page, "Obra social", "OSDE");
  await expect(page.getByTestId("fila-liquidacion")).toHaveCount(1);
  await expect(page.getByTestId("fila-liquidacion")).toContainText("61-123");
  await expect(page.getByTestId("fila-liquidacion")).toContainText("$ 30.000,00");
  await expect(page.getByRole("button", { name: "Exportar a Excel" })).toBeVisible();
});

test("en el celular, las pantallas de cobros entran en el ancho", async ({ page, request }) => {
  const c = await consultorio(request);
  const pac = await c.post("/pacientes", { nombre: "Lucas", apellido: "Fernández" });
  await page.setViewportSize({ width: 375, height: 800 });
  await entrarCon(page, c.cuenta);
  for (const url of ["/prestaciones", "/presupuestos", "/cobranzas", "/caja", "/gastos", "/liquidacion", `/pacientes/${pac.id}?tab=cuenta`, `/pacientes/${pac.id}?tab=presupuestos`]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(ancho, url).toBeLessThanOrEqual(375);
  }
});
