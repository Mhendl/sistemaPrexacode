import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { cuitValido, elegir, emailUnico, entrarCon, loginUI, PASSWORD, type Cuenta } from "./helpers";

/** PNG de 1×1 (una "radiografía" para la prueba) */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function consultorio(request: APIRequestContext, razonSocial = `Consultorio E2E ${Date.now()}`): Promise<Cuenta> {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial, cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { email, razonSocial, token: (await res.json()).token };
}

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

async function cargarPaciente(page: Page, datos: { nombre: string; apellido: string; dni?: string; alergias?: string; obraNueva?: string }) {
  await page.getByLabel("Nombre", { exact: true }).fill(datos.nombre);
  await page.getByLabel("Apellido").fill(datos.apellido);
  if (datos.dni) await page.getByLabel("DNI").fill(datos.dni);
  if (datos.obraNueva) {
    await page.getByRole("button", { name: "Otra" }).click();
    await page.getByPlaceholder("Nombre de la obra social").fill(datos.obraNueva);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByLabel("Obra social o prepaga")).toContainText(datos.obraNueva);
  }
  if (datos.alergias) await page.getByLabel("Alergias").fill(datos.alergias);
  await page.getByRole("button", { name: "Guardar paciente" }).click();
}

test("un consultorio de punta a punta: paciente, historia clínica, odontograma, radiografía y turnos", async ({ page, request }) => {
  const cuenta = await consultorio(request);
  await entrarCon(page, cuenta);
  await page.goto("/");
  await expect(page.getByTestId("kpis-consultorio")).toBeVisible();
  await expect(page.getByTestId("primeros-pasos")).toContainText("Cargá tu primer paciente");

  // Alta del paciente, con una obra social que no estaba en la lista
  await page.getByRole("navigation").first().getByRole("link", { name: "Pacientes" }).click();
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  await cargarPaciente(page, { nombre: "María", apellido: "González", dni: "28.456.789", alergias: "Penicilina", obraNueva: "Obra Social Docente" });
  await expect(page.getByRole("heading", { name: "González, María" })).toBeVisible();
  await expect(page.getByText("DNI 28.456.789")).toBeVisible();
  await expect(page.getByText("Obra Social Docente")).toBeVisible();
  await expect(page.getByTestId("alerta-alergias")).toContainText("Penicilina");

  // Historia clínica: la evolución queda con autor, y no se edita
  await page.getByRole("tab", { name: "Historia clínica" }).click();
  await page.getByLabel("Nueva evolución").fill("Consulta por dolor en 16. Caries oclusal. Se programa obturación.");
  await page.getByRole("button", { name: "Guardar evolución" }).click();
  await expect(page.getByTestId("evolucion")).toContainText("Caries oclusal");
  await expect(page.getByTestId("evolucion")).toContainText("Dra. Laura Pérez");

  // Odontograma: caries en la oclusal de la 16, a realizar (rojo)
  await page.getByRole("tab", { name: "Odontograma" }).click();
  await page.getByTestId("pieza-16").locator('polygon[data-cara="O"]').click();
  await elegir(page, "Prestación", "CAR · Caries");
  await page.getByRole("button", { name: /^Marcar/ }).click();
  await expect(page.getByText("Caries marcada en la pieza")).toBeVisible();
  await expect(page.getByTestId("pieza-16").locator('polygon[data-cara="O"]')).toHaveAttribute("data-color", "#dc2626");
  await expect(page.getByTestId("odontograma-pendientes")).toHaveText("1 prestación pendiente");
  // Se hizo: pasa a azul
  await page.getByTestId("marca").filter({ hasText: "Caries" }).getByRole("button", { name: "Realizado" }).click();
  await expect(page.getByTestId("pieza-16").locator('polygon[data-cara="O"]')).toHaveAttribute("data-color", "#2563eb");
  // Una extracción en dos piezas a la vez: cruz roja
  await page.getByRole("button", { name: "Pieza 38" }).click();
  await page.getByRole("button", { name: "Pieza 48" }).click();
  await elegir(page, "Prestación", "10.01 · Extracción");
  await page.getByRole("button", { name: "Marcar en 2 piezas" }).click();
  await expect(page.getByTestId("pieza-48").locator('[data-simbolo="cruz"]')).toBeVisible();
  // Cargada por error en la 38: se anula con motivo y desaparece del dibujo, pero queda en el historial
  await page.getByRole("button", { name: "Anular Extracción en 38" }).click();
  await page.getByLabel("Motivo").fill("No corresponde, era solo la 48");
  await page.getByRole("button", { name: "Anular marca" }).click();
  await expect(page.getByTestId("pieza-38").locator('[data-simbolo="cruz"]')).toHaveCount(0);
  await page.getByRole("switch", { name: "Ver anuladas" }).click();
  await expect(page.getByText(/Anulada por Dra\. Laura Pérez: No corresponde/)).toBeVisible();

  // Radiografía
  await page.getByRole("tab", { name: "Imágenes" }).click();
  await page.getByLabel("Descripción").fill("Periapical 16");
  await page.getByTestId("subir-archivo").setInputFiles({ name: "rx-16.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("archivo")).toContainText("Periapical 16");
  await expect(page.getByTestId("archivo").locator("img")).toBeVisible();

  // Turno desde la ficha: la agenda abre con el paciente elegido
  await page.getByRole("link", { name: "Dar turno" }).click();
  await expect(page.getByTestId("paciente-elegido")).toContainText("González, María");
  await page.getByLabel("Desde").fill("10:00");
  await page.getByLabel("Hasta").fill("10:30");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Quedó agendado")).toBeVisible();

  // Un paciente nuevo que llama por teléfono: alta rápida desde el turno
  await page.getByRole("button", { name: /Agendar turno/ }).click();
  await page.getByPlaceholder("Buscar por nombre, DNI o teléfono…").fill("Carlos Rodríguez");
  await page.getByRole("button", { name: "Dar de alta a “Carlos Rodríguez”" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Carlos");
  await expect(page.getByLabel("Apellido")).toHaveValue("Rodríguez");
  await page.getByRole("button", { name: "Guardar paciente" }).click();
  await expect(page.getByTestId("paciente-elegido")).toContainText("Rodríguez, Carlos");
  await expect(page.getByTestId("paciente-elegido")).toContainText("faltan datos");
  await page.getByLabel("Desde").fill("11:00");
  await page.getByLabel("Hasta").fill("11:30");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Quedó agendado")).toBeVisible();

  // El inicio muestra los turnos de hoy
  await page.getByRole("navigation").first().getByRole("link", { name: "Inicio" }).click();
  const turnos = page.getByTestId("turnos-hoy");
  await expect(turnos).toContainText("González, María");
  await expect(turnos).toContainText("Rodríguez, Carlos");
  await expect(turnos).toContainText("Faltan datos");

  // No vino: se marca ausente
  await page.goto(`/agenda?fecha=${hoy()}`);
  await page.getByTestId("evento-agenda").filter({ hasText: "Rodríguez, Carlos" }).click();
  await elegir(page, "Estado", "Ausente");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.goto("/");
  await expect(page.getByTestId("kpis-consultorio")).toContainText("Ausentes este mes1");
});

test("la recepción ve pacientes y turnos, pero no la historia clínica ni las alergias", async ({ page, request }) => {
  const cuenta = await consultorio(request);
  const api = (method: "post" | "get", url: string, data?: object) => request[method](`/api${url}`, { headers: { authorization: `Bearer ${cuenta.token}` }, data });
  const p = await (await api("post", "/pacientes", { nombre: "Ana", apellido: "Martínez", dni: "33444555", alergias: "Látex" })).json();
  await api("post", `/pacientes/${p.id}/evoluciones`, { texto: "Dato clínico reservado" });
  const email = emailUnico("recepcion");
  expect((await api("post", "/usuarios", { nombre: "Sofía Recepción", email, password: PASSWORD, rol: "recepcion" })).ok()).toBe(true);

  await loginUI(page, email);
  await expect(page.getByRole("heading", { name: "Hola, Sofía" })).toBeVisible();
  await page.goto(`/pacientes/${p.id}`);
  await expect(page.getByRole("heading", { name: "Martínez, Ana" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Datos" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Turnos" })).toBeVisible();
  for (const pestana of ["Historia clínica", "Odontograma", "Imágenes"]) await expect(page.getByRole("tab", { name: pestana })).toHaveCount(0);
  await expect(page.getByTestId("alerta-alergias")).toHaveCount(0);
  await expect(page.getByText("Látex")).toHaveCount(0);
  await expect(page.getByText("Dato clínico reservado")).toHaveCount(0);
  // Al editar, no aparecen los antecedentes de salud
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByLabel("Teléfono / WhatsApp")).toBeVisible();
  await expect(page.getByLabel("Alergias")).toHaveCount(0);
});

test("en el celular, las pantallas del consultorio entran en el ancho", async ({ page, request }) => {
  const cuenta = await consultorio(request);
  const r = await request.post("/api/pacientes", { headers: { authorization: `Bearer ${cuenta.token}` }, data: { nombre: "Lucas", apellido: "Fernández" } });
  const p = await r.json();
  await page.setViewportSize({ width: 375, height: 800 });
  await entrarCon(page, cuenta);
  for (const url of ["/", "/pacientes", `/pacientes/${p.id}?tab=historia`, `/pacientes/${p.id}?tab=odontograma`, `/pacientes/${p.id}?tab=datos`, "/agenda"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(ancho, url).toBeLessThanOrEqual(375);
  }
});
