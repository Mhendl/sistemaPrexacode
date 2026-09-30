import { expect, test, type APIRequestContext } from "@playwright/test";
import { cuitValido, elegir, emailUnico, entrarCon, formatear, PASSWORD, type Cuenta } from "./helpers";

async function consultorio(request: APIRequestContext) {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const h = { authorization: `Bearer ${cuenta.token}` };
  const get = async (url: string) => (await request.get(`/api${url}`, { headers: h })).json();
  const post = async (url: string, data: object = {}) => {
    const r = await request.post(`/api${url}`, { headers: h, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  return { cuenta, get, post };
}

const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

test("recordatorios: se activan en la configuración, el WhatsApp sale armado, y el paciente confirma o cancela desde su link", async ({ page, request, context }) => {
  const c = await consultorio(request);
  const pac = await c.post("/pacientes", { nombre: "María", apellido: "González", email: emailUnico("pac"), telefono: "11 5555-1234" });
  const cfg = await c.get("/agenda/config");
  const turno = await c.post("/agenda/eventos", { recursoId: cfg.recursos[0].id, pacienteId: pac.id, fecha: enDias(1), inicio: "10:00", fin: "10:30", tipo: "Control" });
  // WhatsApp no se abre de verdad (la prueba no depende de internet): se queda con el link
  await context.route("https://wa.me/**", (r) => r.fulfill({ body: "WhatsApp" }));
  await entrarCon(page, c.cuenta);

  // Configuración → Agenda: avisos a los pacientes
  await page.goto("/configuracion?tab=agenda");
  await page.getByRole("switch", { name: "Recordatorio automático por email" }).click();
  await page.getByRole("switch", { name: "Avisar al paciente cuando se le da un turno" }).click();
  await page.getByRole("button", { name: "Guardar avisos" }).click();
  await expect(page.getByText("Avisos a los pacientes guardados")).toBeVisible();
  expect(await c.get("/agenda/config")).toMatchObject({ recordatorioEmail: true, avisoAlAgendar: true, recordatorioHoras: 24 });

  // Turnos → Recordatorios de mañana → WhatsApp con el mensaje y el link
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Recordatorios" }).click();
  await expect(page.getByTestId("recordatorio")).toContainText("González, María");
  const [chat] = await Promise.all([context.waitForEvent("page"), page.getByTestId("recordatorio").getByRole("button", { name: "WhatsApp" }).click()]);
  await expect.poll(() => chat.url()).toMatch(/wa\.me\/5491155551234\?text=/);
  const mensaje = decodeURIComponent(new URL(chat.url()).searchParams.get("text") ?? "");
  expect(mensaje).toContain("a las 10:00 con Dra. Laura Pérez");
  const link = mensaje.match(/\/turno\/[\w-]+/)![0];
  await chat.close();

  // El paciente abre su link (sin usuario), confirma y después cancela
  const paciente = await context.browser()!.newPage();
  await paciente.goto(link);
  await expect(paciente.getByTestId("turno-cuando")).toContainText("a las 10:00");
  await paciente.getByRole("button", { name: "Confirmo que voy" }).click();
  await expect(paciente.getByTestId("turno-estado")).toContainText("Tu turno está confirmado");
  await paciente.getByRole("button", { name: /No puedo ir/ }).click();
  await paciente.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(paciente.getByTestId("turno-estado")).toContainText("El turno está cancelado");
  await paciente.close();
  expect((await c.get(`/agenda/eventos/${turno.id}`)).estado).toBe("Cancelado");

  // A la profesional le llegó el aviso
  await page.goto("/");
  await page.getByRole("button", { name: /Notificaciones/ }).click();
  await expect(page.getByText("Un paciente canceló su turno")).toBeVisible();
});

test("factura electrónica de un pago, a nombre del paciente y con su DNI", async ({ page, request }) => {
  const c = await consultorio(request);
  const pac = await c.post("/pacientes", { nombre: "María", apellido: "González", dni: "28456789" });
  await c.post(`/pacientes/${pac.id}/pagos`, { importe: 20000, medio: "Transferencia" });
  await entrarCon(page, c.cuenta);
  await page.goto(`/pacientes/${pac.id}?tab=cuenta`);
  await page.getByTestId("pago").getByRole("button", { name: "Facturar" }).click();
  await expect(page.getByText("Factura C 0001-00000001 emitida")).toBeVisible();
  await page.getByTestId("pago").getByRole("link", { name: "Ver factura" }).click();
  await expect(page.getByRole("heading", { name: /Factura C 0001-00000001/ })).toBeVisible();
  await expect(page.getByText("González, María").first()).toBeVisible();
  await expect(page.getByText("28.456.789").first()).toBeVisible();
});

test("recomendá y ganá: el link lleva al registro y la empresa queda como referida", async ({ page, request, browser }) => {
  const c = await consultorio(request);
  await entrarCon(page, c.cuenta);
  await page.goto("/configuracion?tab=plan");
  const link = await page.getByLabel("Tu link para recomendar").inputValue();
  expect(link).toMatch(/\/registro\?ref=[2-9A-Z]{7}$/);
  await expect(page.getByTestId("referidos")).toContainText("Todavía nadie se sumó con tu link.");

  // Un colega abre el link en su compu y se registra
  const colega = await (await browser.newContext()).newPage();
  await colega.goto(new URL(link).pathname + new URL(link).search);
  await colega.getByLabel("Razón social").fill("Consultorio del Colega");
  await colega.getByLabel("CUIT").fill(formatear(cuitValido("27")));
  await elegir(colega, "Condición frente al IVA", "Monotributista");
  await colega.getByLabel("Nombre y apellido").fill("Dr. Colega");
  await colega.getByLabel("Email").fill(emailUnico("colega"));
  await colega.getByLabel("Contraseña").fill(PASSWORD);
  await colega.getByLabel(/Leí y acepto/).check();
  await colega.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(colega.getByRole("heading", { name: /^Hola, / })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("referidos")).toContainText("Consultorio del Colega");
  await expect(page.getByTestId("referidos")).toContainText("En prueba");
});
